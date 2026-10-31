import type { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { findOwnConversation } from '@/lib/chat'
import { parseId } from '@/lib/ids'
import { stop } from '@/lib/running'

// 为什么需要这个接口，而不是继续用 AbortController：
//
// 用户点「停止」和用户刷新页面，在 HTTP 层长得一模一样 —— 都是浏览器
// 把这个请求掐了。以前 route.ts 里监听 request.signal 然后 abort 上游，
// 好处是点停止立刻生效，坏处是刷新一下回答就永久残缺。
//
// 现在生成不跟着请求生死，靠这个显式的停止接口来区分：
//   点停止 → 前端先打这个接口 → 服务端找到控制柄 abort
//   刷新/关页面 → 什么都不打 → 服务端继续写完
export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  let body: { conversationId?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: '请求体不是合法 JSON' }, { status: 400 })
  }

  const id = parseId(body.conversationId)
  if (id === null) {
    return Response.json({ error: 'conversationId 不合法' }, { status: 400 })
  }

  // 归属校验不能省：不然猜个 id 就能把别人的生成打断
  const own = await findOwnConversation(user.id, id)
  if (!own) return Response.json({ error: '会话不存在' }, { status: 404 })

  // stopped=false 表示「叫的时候它已经停了」，是正常情况，不当错误
  return Response.json({ stopped: stop(id) })
}
