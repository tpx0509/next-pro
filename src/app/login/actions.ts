'use server'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { verifyPassword } from '@/lib/password'
import { createSession, destroySession } from '@/lib/auth'

// 防开放重定向：只接受站内路径。
// 少了这个判断，别人可以做 /login?from=https://evil.com 的钓鱼链接，
// 用户输完密码就被带到外站。
function safeFrom(raw: unknown): string {
  const value = typeof raw === 'string' ? raw : ''
  return value.startsWith('/') && !value.startsWith('//') ? value : '/blog'
}

// 用户不存在时也要跑一次 bcrypt 比对，否则「查无此人」会立刻返回、
// 「密码错」要卡 80ms，攻击者靠响应时间就能枚举出哪些邮箱注册过。
// 这个哈希是固定值，只用来消耗同样的 CPU 时间。
const DUMMY_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'

export async function login(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  const from = safeFrom(formData.get('from'))

  if (!email || !password) {
    redirect(`/login?error=empty&from=${encodeURIComponent(from)}`)
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true },
  })

  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH)

  // 故意不区分「邮箱没注册」和「密码不对」：分开提示等于免费送一个账号探测器。
  if (!user || !ok) {
    redirect(`/login?error=1&from=${encodeURIComponent(from)}`)
  }

  await createSession(user.id)
  redirect(from)
}

export async function logout() {
  await destroySession()
  redirect('/login')
}
