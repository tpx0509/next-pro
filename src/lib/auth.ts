import 'server-only'
import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { prisma } from './prisma'
import { SESSION_COOKIE } from './auth-constants'

// cookie 名字沿用原来的 'session'，但值不再是那个固定字符串 'ok'，
// 而是一串 32 字节随机数的十六进制。
// 常量本体在 auth-constants.ts（proxy 要引用，那个文件不能有依赖）。
export { SESSION_COOKIE }

/** 会话有效期。cookie 和数据库里的 expiresAt 必须一致，否则会出现
 *  「浏览器还带着 cookie，但库里已经判过期」或者反过来的错位。 */
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** 登录成功后调用：建一条会话，返回 token。 */
export async function createSession(userId: number): Promise<string> {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)

  await prisma.session.create({ data: { token, userId, expiresAt } })

  const store = await cookies()
  // .set() 只能在 Server Action / Route Handler 里调用。
  // Server Component 渲染期间 cookie 是只读的，Next 会直接报错。
  store.set(SESSION_COOKIE, token, {
    httpOnly: true, // JS 读不到，XSS 偷不走
    sameSite: 'lax', // 跨站 POST 不带 cookie，挡住大部分 CSRF
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  })

  return token
}

/** 退出登录：删库里的那一行 + 删 cookie。 */
export async function destroySession(): Promise<void> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value

  // 删库失败也要继续删 cookie，否则用户会卡在「点退出没反应」。
  if (token) {
    await prisma.session.deleteMany({ where: { token } }).catch(() => {})
  }
  store.delete(SESSION_COOKIE)
}

export type CurrentUser = { id: number; email: string; name: string | null }

/**
 * 从 cookie 里拿 token → 查会话 → 连带查出用户。
 *
 * 这一步才是「真正的鉴权判定」。proxy.ts 只检查 cookie 在不在，
 * 它拿不到数据库（也不该在中间件里查库），所以任何人都能塞一个
 * 假 cookie 混过 proxy —— 但混不过这里：假 token 在 Session 表里查不到。
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  // 必须先声明「从这里开始是请求时刻」。
  // 下面判过期要用 Date.now()，而它属于 Next 眼里「每次渲染都可能不一样」的值：
  // 预渲染（PPR 的壳）跑到这里会直接报 unstable value Date.now()。
  // 和 LikeBox / PostDetail 里的写法是同一个理由。
  await connection()

  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null

  const session = await prisma.session.findUnique({
    where: { token },
    select: {
      expiresAt: true,
      user: { select: { id: true, email: true, name: true } },
    },
  })
  console.log('session',session)
  if (!session) return null

  // 过期就顺手删掉（惰性清理）。HTTP 里没有定时任务，
  // 每次读的时候顺手收拾是最省事、也最不会忘的做法。
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.deleteMany({ where: { token } }).catch(() => {})
    return null
  }

  return session.user
}

/** 需要登录的页面用这个：没登录直接跳登录页，顺便记住原地址。 */
export async function requireUser(from = '/documents'): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) redirect(`/login?from=${encodeURIComponent(from)}`)
  return user
}

/** 老接口保留：只关心「有没有人登录」的地方（导航栏、博客 action）不用改。 */
export async function isLoggedIn(): Promise<boolean> {
  return (await getCurrentUser()) !== null
}
