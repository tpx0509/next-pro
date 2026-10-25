import { NextResponse, type NextRequest } from 'next/server'

// Next 16 起 middleware.ts 改名为 proxy.ts，导出的函数叫 proxy，默认跑在 Node.js runtime。
// 注意：这里不能 import @/lib/auth —— 那个文件依赖 next/headers 的 cookies()，
// 那是「请求渲染上下文」里的 API，proxy 里只有 request.cookies。所以常量在这里重复一份。
const SESSION_COOKIE = 'session'
const SESSION_VALUE = 'ok'

export function proxy(request: NextRequest) {
  const loggedIn = request.cookies.get(SESSION_COOKIE)?.value === SESSION_VALUE
  const { pathname, search } = request.nextUrl

  // 1) 已登录还跑去登录页 → 送回首页，省一次渲染。
  //    只拦 GET：logout 是 POST 到 /login 的 Server Action。
  //    如果连 POST 一起拦，退出登录会永远执行不到（action 被重定向截断）。
  if (loggedIn && pathname === '/login' && request.method === 'GET') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // 2) 已登录的其他请求 → 放行
  if (loggedIn) return NextResponse.next()

  // 3) 未登录访问登录页 → 必须放行。
  //    少了这一行，会掉到第 4 步被重定向到 /login 自己，浏览器报 ERR_TOO_MANY_REDIRECTS。
  if (pathname === '/login') return NextResponse.next()

  // 4) 未登录访问受保护页面 → 去登录，并带上原路径
  const url = new URL('/login', request.url)
  url.searchParams.set('from', pathname + search)
  return NextResponse.redirect(url)
}

export const config = {
  // matcher 必须是常量字面量，构建期要静态分析。
  // '/login' 必须列进来，否则上面第 1 步永远不会执行 —— proxy 根本不会被调用。
  matcher: ['/about', '/blog', '/blog/:path*', '/login'],
}
