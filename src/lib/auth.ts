import 'server-only'
import { cookies } from 'next/headers'

// 演示用。真实项目这里应该是签名过的 session token（HMAC/JWT），
// 而不是一个固定字符串——否则任何人手写一个同名 cookie 就能伪造登录。
export const SESSION_COOKIE = 'session'
export const SESSION_VALUE = 'ok'

export async function isLoggedIn(): Promise<boolean> {
  const store = await cookies()
  return store.get(SESSION_COOKIE)?.value === SESSION_VALUE
}
