'use server'

import { revalidatePath } from 'next/cache'
import { incrementLike } from '@/lib/likes'

// 这个文件里所有 export 的函数都会变成客户端可调用的 Server Action
// 函数体只在服务端执行，浏览器只能拿到一个引用 id
export async function likeAction(slug: string): Promise<number> {
  const next = await incrementLike(slug)

  // 这一行现在是给「客户端」用的，不是给服务端用的：
  // 服务端每次请求都会重新读文件（数据本来就新鲜），
  // 但浏览器后退时 Next 会复用 Router Cache 里的旧 RSC payload，不发请求。
  // revalidatePath 会让 action 响应带上「/blog 已失效」，客户端据此清掉那条缓存，
  // 后退时才会重新请求，看到新数字。
  revalidatePath('/blog')

  return next
}
