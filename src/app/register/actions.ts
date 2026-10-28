'use server'

import { redirect } from 'next/navigation'
import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/password'
import { createSession } from '@/lib/auth'

// 故意宽松：只挡明显不是邮箱的输入。
// 严格的邮箱正则会写出一堆误杀（比如 + 号、中文域名），而真正验证
// 「这个邮箱是不是他的」只能靠发确认信，不是正则能解决的。
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function register(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const name = String(formData.get('name') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const confirm = String(formData.get('confirm') ?? '')

  const back = (error: string) =>
    `/register?error=${error}&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`

  if (!EMAIL_RE.test(email)) redirect(back('email'))
  if (password.length < 8) redirect(back('short'))
  if (password !== confirm) redirect(back('mismatch'))

  try {
    const user = await prisma.user.create({
      data: {
        email,
        name: name || null,
        // 落库的是 bcrypt 哈希，不是明文。即使是自己搭的 demo 库也一样——
        // 「先明文存着以后再说」的项目，最后基本都会带着明文上生产。
        passwordHash: await hashPassword(password),
      },
      select: { id: true },
    })

    // 注册完直接登录，不让用户再手输一次密码。
    await createSession(user.id)
  } catch (e) {
    // email 是 @unique，重复注册会撞 P2002。这里明确告诉用户「已注册」，
    // 和登录接口的「模糊处理」相反 —— 注册页本来就无法隐藏邮箱是否被占用。
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      redirect(back('exists'))
    }
    throw e
  }

  redirect('/documents')
}
