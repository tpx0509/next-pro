import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-start gap-5 rounded-xl border border-dashed border-zinc-300 p-10 dark:border-zinc-700">
      <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-400">
        404
      </span>
      <div className="space-y-1.5">
        <h2 className="text-lg font-medium tracking-tight">这篇文章不存在</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          链接可能拼错了，或者文章还没写。
        </p>
      </div>
      <Link
        href="/blog"
        className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        返回列表
      </Link>
    </div>
  );
}
