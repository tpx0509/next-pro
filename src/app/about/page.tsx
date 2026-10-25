import { Suspense } from "react";
import { io } from "next/cache";

export const metadata = {
  title: "关于",
};

// A. 构建时刻：use cache 让这个值只算一次，之后永远返回那个值
async function BuildTime() {
  "use cache";
  return (
    <p className="mt-1 font-mono text-base text-teal-700 dark:text-teal-400">
      {new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}
    </p>
  );
}

// B. 请求时刻：io() 在预渲染时挂起，这段代码被排除出静态壳
async function RequestTime() {
  await io();
  return (
    <p className="mt-1 font-mono text-base text-orange-700 dark:text-orange-400">
      {new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}
    </p>
  );
}

export default function AboutPage() {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">关于</h1>

      <p className="text-zinc-600 dark:text-zinc-400">
        下面两个时间戳在同一个页面里，走的是完全不同的渲染路径。(生产环境才生效😮)
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-teal-200 p-4 text-sm dark:border-teal-900">
          <p className="font-medium text-teal-700 dark:text-teal-400">
            A · 构建时刻（use cache）
          </p>
          <BuildTime />
          <p className="mt-3 text-zinc-500">
            构建时算一次，之后冻结。刷新多少次都是这个值。
          </p>
        </div>

        <div className="rounded-lg border border-orange-200 p-4 text-sm dark:border-orange-900">
          <p className="font-medium text-orange-700 dark:text-orange-400">
            B · 请求时刻（io）
          </p>
          <Suspense
            fallback={
              <p className="mt-1 font-mono text-base text-zinc-400">读取中…</p>
            }
          >
            <RequestTime />
          </Suspense>
          <p className="mt-3 text-zinc-500">
            每次请求重新求值。刷新一次就变一次。
          </p>
        </div>
      </div>
    </div>
  );
}
