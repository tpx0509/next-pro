import type { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { findOwnConversation, getLastMessageState } from '@/lib/chat'
import { parseId } from '@/lib/ids'

// 轮询用：会话最后一条消息现在写到哪了。
//
// 为什么单独开一个接口而不是复用 /api/chat/history：
// history 一次返回 30 条带正文的消息，轮询场景只需要最后一条，
// 每 1.5 秒拉 30 条正文纯属浪费。
//
// 前端只在「最后一条还是 streaming」的时候调它，正常看完一轮对话不会再打。
export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const id = parseId(request.nextUrl.searchParams.get('conversationId'))
  if (id === null) {
    return Response.json({ error: 'conversationId 不合法' }, { status: 400 })
  }

  const own = await findOwnConversation(user.id, id)
  if (!own) return Response.json({ error: '会话不存在' }, { status: 404 })

  const msg = await getLastMessageState(id)
  if (!msg) return Response.json({ message: null })

  // 只把前端用得上的字段吐出去。createdAt 也去掉 —— 它只是个 Date，
  // 序列化之后前端还得再解析，而轮询这边根本不需要。
  return Response.json({
    message: {
      id: msg.id,
      role: msg.role,
      content: msg.content,
      status: msg.status,
    },
  })
}
