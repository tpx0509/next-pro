import { NextResponse, type NextRequest } from 'next/server'

// Next 16 起 middleware.ts 改名为 proxy.ts，导出的函数叫 proxy，默认跑在 Node.js runtime。
//
// 这里能做的只有「cookie 在不在」——因为不该在 proxy 里查数据库（每次请求都会多一跳，
// 而且 proxy 拿不到 Prisma 的连接池）。所以它只是一道粗筛：
// 真正的判定是 lib/auth.ts 的 getCurrentUser()：拿 token 去 Session 表里查，
// 查不到、或者过期了，都算没登录。伪造一个随便什么值的 cookie 能过这一关，
// 但过不了那一关 —— 页面和 Route Handler 都会再问一次。
import { SESSION_COOKIE } from '@/lib/auth-constants'

// 不需要登录就能看的路径。'/register' 如果不列进来，
// 未登录用户点「注册」会被立刻弹回 /login，永远注册不了。
const PUBLIC_PATHS = ['/login', '/register']

export function proxy(request: NextRequest) {
  const loggedIn = Boolean(request.cookies.get(SESSION_COOKIE)?.value)
  const { pathname, search } = request.nextUrl

  const isPublic = PUBLIC_PATHS.includes(pathname)

  // 1) 已登录还跑去登录/注册页 → 送回首页，省一次渲染。
  //    只拦 GET：logout 是 POST 到 /login 的 Server Action，
  //    如果连 POST 一起拦，退出登录会永远执行不到（action 被重定向截断）。
  // if (loggedIn && isPublic && request.method === 'GET') {
  //   return NextResponse.redirect(new URL('/', request.url))
  // }

  // 2) 已登录的其他请求 → 放行
  if (loggedIn) return NextResponse.next()

  // 3) 未登录访问公开页面 → 必须放行。
  //    少了这一行，会掉到第 4 步被重定向到 /login 自己，浏览器报 ERR_TOO_MANY_REDIRECTS。
  if (isPublic) return NextResponse.next()

  // 4) 未登录访问受保护页面 → 去登录，并带上原路径
  const url = new URL('/login', request.url)
  url.searchParams.set('from', pathname + search)
  return NextResponse.redirect(url)
}

export const config = {
  // matcher 必须是常量字面量，构建期要静态分析。
  // '/login' 必须列进来，否则上面第 1 步永远不会执行 —— proxy 根本不会被调用。
  // 注意这里没有列 '/api'：接口的鉴权靠 Route Handler 自己做（见 api/documents/route.ts）。
  matcher: ['/about', '/blog', '/blog/:path*', '/documents', '/login', '/register'],
}
