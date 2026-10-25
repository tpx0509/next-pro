export default function BlogLayout(props: LayoutProps<"/blog">) {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-teal-500" />
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-400">
            blog · layout
          </span>
        </div>
        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          子页面切换时这一行不重新渲染
        </span>
      </div>
      {props.children}
    </div>
  );
}
