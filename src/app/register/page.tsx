import { Suspense } from "react";
import Link from "next/link";
import { register } from "./actions";

export const metadata = {
  title: "注册",
};

const errors: Record<string, string> = {
  email: "邮箱格式不对",
  short: "密码至少要 8 位",
  mismatch: "两次输入的密码不一样",
  exists: "这个邮箱已经注册过了，直接登录吧",
};

export default function RegisterPage({ searchParams }: PageProps<"/register">) {
  return (
    <div className="mx-auto max-w-sm">
      <Suspense fallback={<Skeleton />}>
        <RegisterContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="h-80 animate-pulse rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50" />
  );
}

async function RegisterContent({
  searchParams,
}: {
  searchParams: PageProps<"/register">["searchParams"];
}) {
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? errors[sp.error] : undefined;
  // 出错时把填过的内容带回来，不用重打一遍。
  // 注意密码永远不回填 —— 回填密码意味着密码出现在 URL 和 HTML 里。
  const email = typeof sp.email === "string" ? sp.email : "";
  const name = typeof sp.name === "string" ? sp.name : "";

  return (
    <div className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
      <h1 className="text-xl font-semibold tracking-tight">注册</h1>
      <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
        密码不会明文存库，落库的是 bcrypt 哈希（自带 salt）。
      </p>

      <form action={register} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <label
            htmlFor="email"
            className="block text-xs font-medium text-zinc-500 dark:text-zinc-400"
          >
            邮箱
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={email}
            required
            className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none transition-colors focus:border-teal-500 dark:border-zinc-700 dark:focus:border-teal-500"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="name"
            className="block text-xs font-medium text-zinc-500 dark:text-zinc-400"
          >
            昵称（可选）
          </label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="nickname"
            defaultValue={name}
            className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none transition-colors focus:border-teal-500 dark:border-zinc-700 dark:focus:border-teal-500"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="password"
            className="block text-xs font-medium text-zinc-500 dark:text-zinc-400"
          >
            密码（至少 8 位）
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none transition-colors focus:border-teal-500 dark:border-zinc-700 dark:focus:border-teal-500"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="confirm"
            className="block text-xs font-medium text-zinc-500 dark:text-zinc-400"
          >
            再输一次
          </label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none transition-colors focus:border-teal-500 dark:border-zinc-700 dark:focus:border-teal-500"
          />
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <button className="w-full rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300">
          注册并登录
        </button>
      </form>

      <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
        已经有账号？
        <Link
          href="/login"
          className="ml-1 font-medium text-teal-600 hover:underline dark:text-teal-400"
        >
          去登录
        </Link>
      </p>
    </div>
  );
}
