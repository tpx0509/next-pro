'use server'

import { revalidatePath } from 'next/cache'
import { isLoggedIn } from '@/lib/auth'
import { createPost } from '@/lib/posts'

// 表单提交后的状态。三个字段够用：现在是什么状态、给人看的一句话。
export type CreatePostState = {
  status: 'idle' | 'ok' | 'error'
  message?: string
}

// 注意第一个参数：useActionState 会把上一次的返回值塞进来。
// 这个函数本身不需要它，但签名必须留着。
export async function createPostAction(
  _prev: CreatePostState,
  formData: FormData,
): Promise<CreatePostState> {
  // 这层检查是「第二道闸」，不是唯一防线 —— 下面这段是实测出来的，别照着直觉改。
  // proxy.ts 的 matcher 里有 '/blog'，而 Server Action 的 POST 也发到 '/blog'，
  // 所以未登录时请求在 proxy 那一步就被 307 到 /login 了，根本走不到这里。
  // 浏览器侧看到的是「An unexpected response was received from the server」，
  // 因为 action 期待 RSC 响应，拿到的却是登录页 HTML，随后被 error boundary 接管。
  // 那为什么还留着：matcher 哪天被改窄、或者这个函数将来被别的页面/脚本调用，
  // 权限检查写在离数据最近的地方才可靠。它的成本只有一次 cookie 读取。
  if (!(await isLoggedIn())) {
    return { status: 'error', message: '登录已失效，刷新页面重新登录' }
  }

  try {
    const post = await createPost({
      title: String(formData.get('title') ?? ''),
      body: String(formData.get('body') ?? ''),
    })

    // 列表页的客户端路由缓存里还存着旧的那份 payload，
    // 不标失效的话，点「返回列表」会看到没有新文章的旧快照。
    revalidatePath('/blog')

    return { status: 'ok', message: `已发布 /blog/${post.slug}` }
  } catch (e) {
    // 并发下两个人同时发同名标题，uniqueSlug 的检查会同时通过，
    // 最后一步写库时主键撞车，Prisma 抛 P2002。重试一次就够，这里先如实报出来。
    if (typeof e === 'object' && e !== null && 'code' in e && e.code === 'P2002') {
      return { status: 'error', message: '这个标题刚被别人用掉了，换个标题再发' }
    }
    return {
      status: 'error',
      message: e instanceof Error ? e.message : '发布失败',
    }
  }
}
