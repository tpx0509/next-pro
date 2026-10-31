import 'server-only'
import { streamCompletion, type ChatMessage } from './llm'
import { finishMessage, updateMessageContent } from './chat'
import { register, unregister } from './running'

const encoder = new TextEncoder()

/** SSE 的一帧：event 名字 + 一行 JSON + 一个空行结尾。 */
function frame(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

/**
 * 流式响应的公共头。三个调用方共用一份，别各写各的。
 *
 * no-store    → 别缓存
 * no-transform → 别让中间层压缩或重新分包，那会把逐字效果毁掉
 * X-Accel-Buffering → nginx 默认攒够一块再发，这个头让它立刻往外出
 */
export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-store, no-transform',
  'X-Accel-Buffering': 'no',
} as const

/** 每写这么多毫秒往库里存一次。太勤会跟别的写抢 SQLite 的写锁，太懒刷新回来看到的内容会落后太多。 */
const FLUSH_INTERVAL_MS = 400

export type AnswerStreamOptions = {
  conversationId: number
  /** 要往里写的 assistant 消息 id，必须是刚建好、状态 streaming 的那条 */
  assistantId: number
  /** 拼好的完整 messages（system + 历史 + 这一问） */
  messages: ChatMessage[]
  /** 继续写时已经存在的半截内容；普通生成传空串 */
  prefix?: string
  /** meta 帧的内容，各调用方自己拼 */
  meta: Record<string, unknown>
}

/**
 * 一次「调模型 + 往外推 + 往库存」的完整过程。
 *
 * 三件事必须一起看，它们的先后顺序是这个设计的全部：
 *
 * 1. **生成的生命周期不再跟着 HTTP 请求走**。cancel() 里只记一个
 *    clientGone，绝不 abort 上游。刷新页面、关标签页，模型照常写完，
 *    边写边落库，用户回来能看到完整回答。
 *
 * 2. **谁来叫停**：只有 running.ts 里的 register 拿到的那个 controller
 *    被 abort（也就是 /api/chat/stop 被调用）时才算真的停。
 *
 * 3. **边生成边落库**，不是最后才写。这样刷新回来看到的是「已经写到第 N 个字」，
 *    而不是一片空白；进程意外退出时也留下能看出「曾经生成过」的记录。
 */
export function createAnswerStream({
  conversationId,
  assistantId,
  messages,
  prefix = '',
  meta,
}: AnswerStreamOptions): ReadableStream<Uint8Array> {
  const abort = new AbortController()
  // 先注册再返回。调用方在这一步之后创建的 streaming 消息，
  // 才不会被 getLastMessageState 的僵尸检测误判。
  register(conversationId, abort)

  // 浏览器走了。注意这只是「别往外推了」，跟「停止生成」是两件事。
  let clientGone = false
  let lastFlush = 0
  let flushing = false

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let answer = prefix
      let usage: { promptTokens: number; completionTokens: number } | null = null
      let failed = false

      const send = (event: string, data: unknown) => {
        if (clientGone) return
        try {
          controller.enqueue(frame(event, data))
        } catch {
          // 客户端刚断开那一下，enqueue 会抛。记下来，后面都别再试了。
          clientGone = true
        }
      }

      send('meta', meta)

      try {
        for await (const ev of streamCompletion(messages, { signal: abort.signal })) {
          if (ev.type === 'delta') {
            answer += ev.text
            send('delta', { text: ev.text })

            // 节流落库。不等它完成，避免数据库忙的时候把整个流卡住；
            // 传的是当时的完整快照，就算两次写乱序，后一次也会把内容纠正过来。
            const now = Date.now()
            if (!flushing && now - lastFlush >= FLUSH_INTERVAL_MS) {
              lastFlush = now
              flushing = true
              void updateMessageContent(assistantId, answer).finally(() => {
                flushing = false
              })
            }
          } else {
            usage = ev
          }
        }
      } catch (e) {
        failed = !abort.signal.aborted
        if (failed) {
          send('error', {
            message: e instanceof Error ? e.message : '生成失败',
          })
        }
      } finally {
        unregister(conversationId, abort)

        // 用户点停止时 abort.signal.aborted 为真 —— 已经写出来的字都算数，
        // 状态记 done（它是有效的半截，不是错误）。
        // 真出错才记 failed，前端据此显示「重试」。
        try {
          await finishMessage(assistantId, answer, failed ? 'failed' : 'done')
        } catch (e) {
          console.error('[chat] 收尾落库失败', e)
        }

        send('done', {
          conversationId,
          messageId: assistantId,
          usage,
          stopped: abort.signal.aborted,
          failed,
        })

        try {
          controller.close()
        } catch {
          // 已经关了，正常
        }
      }
    },

    cancel() {
      // 这里**故意不 abort**。用户刷新页面、切走标签、关掉浏览器，
      // 都会走到这里；生成继续跑完并落库，回来就能看到完整答案。
      // 想真的停下来请走 /api/chat/stop。
      clientGone = true
    },
  })
}
