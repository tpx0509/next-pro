import type { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { CHAT_MODEL, llmConfigError } from '@/lib/llm'
import {
  appendMessage,
  buildDocumentContext,
  buildSystemPrompt,
  createAssistantMessage,
  createConversation,
  findOwnConversation,
  loadHistory,
} from '@/lib/chat'
import { createAnswerStream, SSE_HEADERS } from '@/lib/stream-answer'
import { parseId } from '@/lib/ids'

// 这个路由负责「接一句话，把它变成一次生成」。
// 生成过程本身（调模型、往外推、往库存）在 lib/stream-answer.ts，
// 重新生成接口也走同一份实现，别在这儿再写一遍。
//
// 为什么不能用 Server Action：Action 的返回值必须是可序列化的值（要拼进 RSC
// payload 回给 React 渲染），ReadableStream 传不进去。而且 Action 的响应是
// 一次性生成的，没法「先发一部分、等会儿再发一部分」。

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
    const id = parseId(body.conversationId)
    if (id === null) return Response.json({ error: 'conversationId 不合法' }, { status: 400 })
    const own = await findOwnConversation(user.id, id)
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
  const messages = [
    { role: 'system' as const, content: buildSystemPrompt(ctx) },
    ...history,
  ]

  // 先把空回答建出来，再开始生成。这个顺序是「刷新能看到进度」的前提：
  // 生成过程中每隔几百毫秒往这条消息里 UPDATE，前端随时能读到最新长度。
  const assistantId = await createAssistantMessage(conversationId)

  const stream = createAnswerStream({
    conversationId,
    assistantId,
    messages,
    meta: {
      conversationId,
      messageId: assistantId,
      model: CHAT_MODEL,
      sources: ctx.titles,
      truncated: ctx.truncated,
      truncatedTitles: ctx.truncatedTitles,
    },
  })

  return new Response(stream, { headers: SSE_HEADERS })
}
