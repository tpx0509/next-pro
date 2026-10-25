import { Suspense } from "react";
import { io } from "next/cache";

export const metadata = {
  title: "关于",
};

// A. 构建时刻：use cache 让这个值只算一次，之后永远返回那个值
async function BuildTime() {
  "use cache";
  return (
    <p className="mt-3 font-mono text-lg tracking-tight text-teal-700 dark:text-teal-400">
      {new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}
    </p>
  );
}

// B. 请求时刻：io() 在预渲染时挂起，这段代码被排除出静态壳
async function RequestTime() {
  await io();
  return (
    <p className="mt-3 font-mono text-lg tracking-tight text-orange-700 dark:text-orange-400">
      {new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}
    </p>
  );
}

export default function AboutPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">关于</h1>
        <p className="text-sm leading-6 text-zinc-500 dark:text-zinc-400">
          同一个页面里，两个时间戳走的是完全不同的渲染路径。
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-teal-200 bg-teal-50/40 p-5 dark:border-teal-900/70 dark:bg-teal-950/20">
          <div className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-teal-500" />
            <h2 className="text-sm font-medium text-teal-700 dark:text-teal-400">
              A · 构建时刻
            </h2>
          </div>
          <code className="mt-3 inline-block rounded bg-teal-100/70 px-1.5 py-0.5 font-mono text-[11px] text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
            use cache
          </code>
          <BuildTime />
          <p className="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            构建时算一次，之后冻结。刷新多少次都是这个值。
          </p>
        </section>

        <section className="rounded-xl border border-orange-200 bg-orange-50/40 p-5 dark:border-orange-900/70 dark:bg-orange-950/20">
          <div className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-orange-500" />
            <h2 className="text-sm font-medium text-orange-700 dark:text-orange-400">
              B · 请求时刻
            </h2>
          </div>
          <code className="mt-3 inline-block rounded bg-orange-100/70 px-1.5 py-0.5 font-mono text-[11px] text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
            await io()
          </code>
          <Suspense
            fallback={
              <p className="mt-3 font-mono text-lg tracking-tight text-zinc-300 dark:text-zinc-600">
                ＿＿＿＿＿＿
              </p>
            }
          >
            <RequestTime />
          </Suspense>
          <p className="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            每次请求重新求值。刷新一次就变一次。
          </p>
        </section>
      </div>

      <p className="rounded-lg bg-zinc-50 px-4 py-3 text-xs leading-5 text-zinc-500 dark:bg-zinc-900/60 dark:text-zinc-400">
        注意：开发环境下两个都会变，因为 dev 不做静态预渲染。要看区别必须 build + start。
      </p>
    </div>
  );
}
