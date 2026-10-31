import type { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { CHAT_MODEL, llmConfigError } from '@/lib/llm'
import {
  buildDocumentContext,
  buildSystemPrompt,
  findOwnConversation,
  getLastAssistantMessage,
  loadHistory,
  restartMessage,
} from '@/lib/chat'
import { isRunning } from '@/lib/running'
import { parseId } from '@/lib/ids'
import { createAnswerStream, SSE_HEADERS } from '@/lib/stream-answer'

// 「不动用户的问题，只重做那条回答」。
//
// 两种用法共用一套逻辑，差别只有 message 列表怎么拼：
//
//   retry    → 把上一条回答清空重写。messages 末尾是用户那句问题，
//              模型从头再答一遍，用来救「报错了」「答得不好」。
//
//   continue → 接着半截往下写。messages 末尾挂上那条半截回答，
//              模型天然会续写（它就是被训练成「补全 assistant 之后的内容」）。
//              用来救「点了停止，但还想让它把话说完」。

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const configError = llmConfigError()
  if (configError) return Response.json({ error: configError }, { status: 500 })

  let body: { conversationId?: unknown; mode?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: '请求体不是合法 JSON' }, { status: 400 })
  }

  const conversationId = parseId(body.conversationId)
  if (conversationId === null) {
    return Response.json({ error: 'conversationId 不合法' }, { status: 400 })
  }

  const mode = body.mode
  if (mode !== 'retry' && mode !== 'continue') {
    return Response.json({ error: "mode 只能是 retry 或 continue" }, { status: 400 })
  }

  const own = await findOwnConversation(user.id, conversationId)
  if (!own) return Response.json({ error: '会话不存在' }, { status: 404 })

  // 同一个会话同时跑两个生成，两个都会往不同的消息里写，但会互相抢 SQLite 写锁，
  // 而且前端也分不清收到的是哪一次的字。直接拒绝，让用户先停。
  if (isRunning(conversationId)) {
    return Response.json({ error: '这个会话正在生成，先停止再试' }, { status: 409 })
  }

  const last = await getLastAssistantMessage(conversationId)
  if (!last) {
    return Response.json({ error: '这个会话里还没有回答可以重做' }, { status: 400 })
  }

  if (mode === 'continue') {
    // 只有「写完的」（含用户点停止那一下）才能接着写。
    // 正在生成的不行 —— 上面那句 isRunning 已经挡了，这里挡的是空回答。
    if (last.status !== 'done' || !last.content.trim()) {
      return Response.json({ error: '这条回答没有可以接着写的内容' }, { status: 400 })
    }
  }

  const [ctx, history] = await Promise.all([
    buildDocumentContext(user.id),
    // 把「要被重写的那条」摘出去。不摘的话 continue 会把它拼两遍，
    // retry 则会拿到一条空的 assistant 垫在历史末尾。
    loadHistory(conversationId, last.id),
  ])

  const messages = [
    { role: 'system' as const, content: buildSystemPrompt(ctx) },
    ...history,
    // 只给 continue 补这一条：让模型知道「我说到这儿了」，它就会往下接
    ...(mode === 'continue'
      ? [{ role: 'assistant' as const, content: last.content }]
      : []),
  ]

  // 清空要在建流之前做完，否则前端一进来先看到的还是上一轮的旧内容
  if (mode === 'retry') await restartMessage(last.id)

  const stream = createAnswerStream({
    conversationId,
    assistantId: last.id,
    messages,
    prefix: mode === 'continue' ? last.content : '',
    meta: {
      conversationId,
      messageId: last.id,
      mode,
      model: CHAT_MODEL,
      sources: ctx.titles,
      truncated: ctx.truncated,
      truncatedTitles: ctx.truncatedTitles,
    },
  })

  return new Response(stream, { headers: SSE_HEADERS })
}
