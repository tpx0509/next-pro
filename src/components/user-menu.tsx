import { logout } from '@/app/login/actions'
import { isLoggedIn } from '@/lib/auth'

/**
 * 导航栏里的登录态区。
 *
 * 这是一个 **async 服务端组件**，内部 await cookies()，所以它必须被
 * <Suspense> 包住（在 app/layout.tsx 里）。这样整页依然是静态壳，
 * 只有这一小块是「动态洞」—— 即 PPR 的形态。
 *
 * 未登录时返回 null：静态壳里什么都没有，也不会闪。
 */
export async function UserMenu() {
  if (!(await isLoggedIn())) return null

  return (
    // 左侧竖线把它和「首页/关于/博客」区分开：那三个是导航，这个是操作
    <form
      action={logout}
      className="ml-2 border-l border-zinc-200 pl-2 dark:border-zinc-800"
    >
      <button
        type="submit"
        className="rounded-full px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-zinc-500 dark:hover:bg-red-950/40 dark:hover:text-red-400"
      >
        退出
      </button>
    </form>
  )
}
