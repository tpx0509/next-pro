"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "首页" },
  { href: "/about", label: "关于" },
  { href: "/blog", label: "博客" },
  { href: "/documents", label: "知识库" },
  { href: "/chat", label: "问答" },
];

export function SiteNav({ children }: { children?: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1">
      {items.map((item) => {
        // 子页面也算激活：/blog/what-is-next 点亮「博客」
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "rounded-full bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "rounded-full px-3 py-1.5 text-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            }
          >
            {item.label}
          </Link>
        );
      })}
      {/* 服务端组件通过 children 从 layout 传进来。
          客户端组件不能直接 import 服务端组件，但可以把已经渲染好的元素当 children 接收。 */}
      {children}
    </nav>
  );
}
