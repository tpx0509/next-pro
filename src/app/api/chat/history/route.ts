import type { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getMessagePage } from '@/lib/chat'
import { parseId } from '@/lib/ids'

// 历史消息翻页。跟 /api/chat 一样是 Route Handler，但它不返回流 ——
// 一次给一页 JSON，前端拿到就 setState 拼到列表头上。
//
// GET 而不是 POST：纯读取，参数全在 query 里，刷新、调试、看 Network
// 都能直接复现。要写东西才用 POST。

export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const params = request.nextUrl.searchParams

  const conversationId = parseId(params.get('conversationId'))
  if (conversationId === null) {
    return Response.json({ error: 'conversationId 不合法' }, { status: 400 })
  }

  // before 缺省表示「首页」，也就是最新的那一页。
  // 空字符串也当缺省：`?before=` 是拼参数时最常见的产物，
  // 而 Number('') 是 0、能通过 isInteger，会被当成 id < 0 查出一个空页 —— 静默错。
  const beforeRaw = params.get('before')
  const beforeId = beforeRaw === null || beforeRaw.trim() === '' ? null : Number(beforeRaw)
  if (beforeId !== null && !Number.isInteger(beforeId)) {
    return Response.json({ error: 'before 不合法' }, { status: 400 })
  }

  // 归属校验在 getMessagePage 里做：不是自己的会话返回 null，和不存在一样处理
  const page = await getMessagePage(user.id, conversationId, beforeId)
  if (!page) return Response.json({ error: '会话不存在' }, { status: 404 })

  // 这份数据一分钟后就过期了 —— 用户随时可能接着聊，缓存住就会少显示消息
  return Response.json(page, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
