'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE, SESSION_VALUE } from '@/lib/auth'

// 演示密码。真实项目：查库校验密码哈希，再签发 session。
const DEMO_PASSWORD = 'demo1234'

// 防开放重定向：只接受站内路径
function safeFrom(raw: unknown): string {
  const value = typeof raw === 'string' ? raw : ''
  return value.startsWith('/') && !value.startsWith('//') ? value : '/blog'
}

export async function login(formData: FormData) {
  const password = String(formData.get('password') ?? '')
  const from = safeFrom(formData.get('from'))

  if (password !== DEMO_PASSWORD) {
    redirect(`/login?error=1&from=${encodeURIComponent(from)}`)
  }

  // .set() 只能在 Server Action / Route Handler 里调用
  // （Server Component 渲染期间是只读的，文档明确写了不支持）
  const store = await cookies()
  store.set(SESSION_COOKIE, SESSION_VALUE, {
    httpOnly: true, // 禁止 JS 读取，防 XSS 偷 session
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })

  redirect(from)
}

export async function logout() {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
  redirect('/login')
}
