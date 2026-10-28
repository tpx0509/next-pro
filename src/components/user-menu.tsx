import { logout } from '@/app/login/actions'
import { getCurrentUser } from '@/lib/auth'

/**
 * 导航栏里的登录态区。
 *
 * 这是一个 **async 服务端组件**，内部 await cookies() 又查了 Session 表，
 * 所以它必须被 <Suspense> 包住（在 app/layout.tsx 里）。这样整页依然是静态壳，
 * 只有这一小块是「动态洞」—— 即 PPR 的形态。
 *
 * 未登录时返回 null：静态壳里什么都没有，也不会闪。
 */
export async function UserMenu() {
  const user = await getCurrentUser()
  if (!user) return null

  return (
    // 左侧竖线把它和「首页/关于/博客/知识库」区分开：那几个是导航，这个是操作
    <div className="ml-2 flex items-center gap-2 border-l border-zinc-200 pl-2 dark:border-zinc-800">
      <span
        className="max-w-32 truncate text-xs text-zinc-400 dark:text-zinc-500"
        title={user.email}
      >
        {user.name || user.email}
      </span>
      <form action={logout}>
        <button
          type="submit"
          className="rounded-full px-2 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-zinc-500 dark:hover:bg-red-950/40 dark:hover:text-red-400"
        >
          退出
        </button>
      </form>
    </div>
  )
}
