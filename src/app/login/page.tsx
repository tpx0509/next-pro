import { Suspense } from "react";
import Link from "next/link";
import { isLoggedIn } from "@/lib/auth";
import { login, logout } from "./actions";

export const metadata = {
  title: "登录",
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <div className="mx-auto max-w-sm">
      {/* 读 cookies() 和 searchParams 都必须在 Suspense 里，
          否则这个路由会被判成「无法预渲染」 */}
      <Suspense fallback={<LoginSkeleton />}>
        <LoginContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function LoginSkeleton() {
  return (
    <div className="h-64 animate-pulse rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50" />
  );
}

async function LoginContent({
  searchParams,
}: {
  searchParams: PageProps<"/login">["searchParams"];
}) {
  const sp = await searchParams;
  const error = sp.error === "1";
  const from = typeof sp.from === "string" ? sp.from : "/blog";
  const logged = await isLoggedIn();

  if (logged) {
    return (
      <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-6 dark:border-teal-900/70 dark:bg-teal-950/20">
        <div className="flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-teal-500" />
          <span className="text-xs font-medium text-teal-700 dark:text-teal-300">
            已登录
          </span>
        </div>

        <h1 className="mt-3 text-xl font-semibold tracking-tight">
          你已经进来了
        </h1>
        <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
          这一页读了 cookies()，所以它一定是动态渲染的——和博客页的静态壳正好相反。
        </p>

        <div className="mt-6 flex items-center gap-3">
          <Link
            href="/blog"
            className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            去看博客
          </Link>
          <form action={logout}>
            <button className="rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900">
              退出登录
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
      <h1 className="text-xl font-semibold tracking-tight">登录</h1>
      <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
        /blog 和 /about 被 <code className="font-mono text-xs">proxy.ts</code>{" "}
        挡住了，先过这一关。
      </p>

      <form action={login} className="mt-6 space-y-4">
        <input type="hidden" name="from" value={from} />

        <div className="space-y-1.5">
          <label
            htmlFor="password"
            className="block text-xs font-medium text-zinc-500 dark:text-zinc-400"
          >
            密码
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="demo1234"
            required
            className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none transition-colors focus:border-teal-500 dark:border-zinc-700 dark:focus:border-teal-500"
          />
        </div>

        {error && (
          <p className="text-xs text-red-500">
            密码不对，再试一次（提示：demo1234）
          </p>
        )}

        <button className="w-full rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300">
          进入
        </button>
      </form>

      <p className="mt-4 font-mono text-[11px] text-zinc-400 dark:text-zinc-500">
        演示密码 demo1234
      </p>
    </div>
  );
}
