import type { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { CHAT_MODEL, llmConfigError, streamCompletion, type ChatMessage } from '@/lib/llm'
import {
  appendMessage,
  buildDocumentContext,
  buildSystemPrompt,
  createConversation,
  findOwnConversation,
  loadHistory,
} from '@/lib/chat'

// 这是整个项目里唯一一个「响应体是流」的接口。
//
// 为什么不能用 Server Action：Action 的返回值必须是可序列化的值（要拼进 RSC
// payload 回给 React 渲染），ReadableStream 传不进去。而且 Action 的响应是
// 一次性生成的，没法「先发一部分、等会儿再发一部分」。
//
// 这条链路和 RSC 完全无关：浏览器 fetch 拿到的是原始 HTTP 流，
// 里面装的是我们自己定义的 SSE 文本帧，React 不参与解析。

const encoder = new TextEncoder()

/** SSE 的一帧：event 名字 + 一行 JSON + 一个空行结尾。 */
function frame(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

export async function POST(request: NextRequest) {
  // ------- 下面这一整段都发生在「响应还没开始」之前 -------
  // 顺序很重要：任何可能失败的检查都必须放在这里，因为一旦 return 了
  // Response，状态码就定死 200 了，后面再出事只能靠流里的 error 事件通知。
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const configError = llmConfigError()
  if (configError) return Response.json({ error: configError }, { status: 500 })

  let body: { conversationId?: unknown; content?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: '请求体不是合法 JSON' }, { status: 400 })
  }

  const content = typeof body.content === 'string' ? body.content.trim() : ''
  if (!content) return Response.json({ error: '消息不能为空' }, { status: 400 })
  if (content.length > 4000) return Response.json({ error: '单条消息最多 4000 字' }, { status: 400 })

  // 会话：带了 id 就必须属于当前用户（id 是自增的，猜中就能读别人的对话）
  let conversationId: number
  if (body.conversationId != null) {
    const id = Number(body.conversationId)
    const own = Number.isInteger(id) ? await findOwnConversation(user.id, id) : null
    if (!own) return Response.json({ error: '会话不存在' }, { status: 404 })
    conversationId = own.id
  } else {
    conversationId = (await createConversation(user.id, content)).id
  }

  // 用户这句话先落库。哪怕下面模型挂了，「他问过什么」也是既成事实，
  // 不该因为调用失败一起丢掉。
  await appendMessage(conversationId, 'user', content)

  const [ctx, history] = await Promise.all([
    buildDocumentContext(user.id),
    loadHistory(conversationId),
  ])

  // history 里已经包含刚存进去的这条 user 消息，不要再 push 一次
  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(ctx) },
    ...history,
  ]

  // 客户端断开 / 点停止 → request.signal abort → 转发给上游 fetch。
  // 不转发的话模型会继续把整段算完，token 白扣。
  const abort = new AbortController()
  request.signal.addEventListener('abort', () => abort.abort())

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let answer = ''
      let usage: { promptTokens: number; completionTokens: number } | null = null

      try {
        // 第一轮对话时前端还不知道会话 id，先发一条 meta。
        // 顺带把「这次参考了哪几篇文档」告诉它，页面上能显示来源。
        controller.enqueue(
          frame('meta', {
            conversationId,
            model: CHAT_MODEL,
            sources: ctx.titles,
            truncated: ctx.truncated,
            truncatedTitles: ctx.truncatedTitles,
          }),
        )

        for await (const ev of streamCompletion(messages, { signal: abort.signal })) {
          if (ev.type === 'delta') {
            answer += ev.text
            controller.enqueue(frame('delta', { text: ev.text }))
          } else {
            usage = ev
          }
        }
      } catch (e) {
        const message = abort.signal.aborted
          ? '已停止生成'
          : e instanceof Error
            ? e.message
            : '生成失败'
        try {
          controller.enqueue(frame('error', { message }))
        } catch {
          // 客户端已经走了，发不出去很正常，不用管
        }
      } finally {
        // 不管是正常结束、上游报错，还是用户中途关掉页面，只要吐过字就落库。
        // 注意这一步不依赖 controller 还能用：断开之后 enqueue 会抛
        // TypeError，但写数据库不受影响 —— 两者是两条独立的信道。
        let messageId: number | null = null
        if (answer.trim()) {
          try {
            const saved = await appendMessage(conversationId, 'assistant', answer)
            messageId = saved.id
          } catch (e) {
            console.error('[chat] 回答落库失败', e)
          }
        }

        try {
          controller.enqueue(
            frame('done', {
              conversationId,
              messageId,
              usage,
              stopped: abort.signal.aborted,
            }),
          )
          controller.close()
        } catch {
          // 同上
        }
      }
    },
    cancel() {
      // 前端 reader.cancel() 会走到这里
      abort.abort()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      // no-store：别缓存
      // no-transform：别让中间层压缩或重新分包，那会把逐字效果毁掉
      'Cache-Control': 'no-store, no-transform',
      // nginx 默认攒够一块再发，这个头让它立刻往外出
      'X-Accel-Buffering': 'no',
    },
  })
}
