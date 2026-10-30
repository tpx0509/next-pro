import Link from "next/link";

const entries = [
  {
    href: "/chat",
    title: "问答",
    desc: "Route Handler + ReadableStream 做 SSE，fetch 读流逐 token 渲染",
  },
  {
    href: "/documents",
    title: "知识库",
    desc: "Route Handler 收 multipart 文件、PDF / Word 抽文本、Session 鉴权",
  },
  {
    href: "/blog",
    title: "博客",
    desc: "动态路由、generateStaticParams、点赞数作为 PPR 动态洞",
  },
  {
    href: "/about",
    title: "关于",
    desc: "构建时刻 vs 请求时刻，同一个页面上的两条渲染路径",
  },
];

const done = [
  "App Router · 目录即路由",
  "服务端组件 / 客户端组件边界",
  "Server Action 写入数据",
  "'use cache' + cacheTag 缓存与失效",
  "PPR：静态壳 + Suspense 动态洞",
  "io() 区分构建时刻与请求时刻",
  "真实认证：bcrypt 哈希 + Session 表",
  "Route Handler + multipart 文件上传",
  "SSE 流式问答：ReadableStream + 手写分帧",
  "会话落库：Conversation / Message",
];

export default function Home() {
  return (
    <div className="space-y-14">
      <section className="space-y-5 pt-4">
        <span className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-300">
          <span className="size-1.5 rounded-full bg-teal-500" />
          3 天速成 · Day 2
        </span>

        <h1 className="text-4xl font-semibold leading-[1.15] tracking-tight sm:text-5xl">
          用真实项目
          <br />
          理解 Next.js 16
        </h1>

        <p className="max-w-xl text-base leading-7 text-zinc-500 dark:text-zinc-400">
          不按教程顺序学。直接做「AI 知识库问答 Agent」的上传页、对话页和历史记录页，
          缺什么补什么。
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {entries.map((entry) => (
          <Link
            key={entry.href}
            href={entry.href}
            className="group rounded-xl border border-zinc-200 p-5 transition-colors hover:border-zinc-300 hover:bg-zinc-50/70 dark:border-zinc-800 dark:hover:border-zinc-700 dark:hover:bg-zinc-900/40"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-medium tracking-tight">{entry.title}</h2>
              <span className="font-mono text-zinc-300 transition-transform group-hover:translate-x-0.5 dark:text-zinc-600">
                →
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
              {entry.desc}
            </p>
          </Link>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-500">
          已跑通
        </h2>
        <ul className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
          {done.map((item) => (
            <li
              key={item}
              className="flex items-start gap-2.5 text-sm text-zinc-600 dark:text-zinc-400"
            >
              <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-teal-500" />
              {item}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
