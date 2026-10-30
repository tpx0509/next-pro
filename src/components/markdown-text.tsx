"use client";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * 渲染模型输出的 markdown。
 *
 * 为什么不用「转成 HTML 字符串 + dangerouslySetInnerHTML」：模型吐什么内容
 * 我们控制不了，那个做法等于把任意 HTML/脚本注进页面。react-markdown 是把
 * markdown 解析成 React 元素，默认不渲染原始 HTML，天然躲开这一类问题。
 */
export function MarkdownText({ children }: { children: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        ul: ({ children }) => (
          <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
        ),
        li: ({ children }) => <li className="leading-6">{children}</li>,
        h1: ({ children }) => (
          <h3 className="mb-2 mt-3 text-base font-semibold first:mt-0">{children}</h3>
        ),
        h2: ({ children }) => (
          <h3 className="mb-2 mt-3 text-sm font-semibold first:mt-0">{children}</h3>
        ),
        h3: ({ children }) => (
          <h4 className="mb-1.5 mt-3 text-sm font-semibold first:mt-0">{children}</h4>
        ),
        // 行内代码。代码块里的 code 会被下面 pre 的样式覆盖掉背景。
        code: ({ children }) => (
          <code className="rounded bg-zinc-200/70 px-1 py-0.5 font-mono text-[0.85em] dark:bg-zinc-700/60">
            {children}
          </code>
        ),
        pre: ({ children }) => (
          <pre className="mb-2 overflow-x-auto rounded-lg bg-zinc-900 p-3 font-mono text-xs leading-5 text-zinc-100 last:mb-0 dark:bg-zinc-800 [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-inherit">
            {children}
          </pre>
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4"
          >
            {children}
          </a>
        ),
        blockquote: ({ children }) => (
          <blockquote className="mb-2 border-l-2 border-zinc-300 pl-3 text-zinc-500 last:mb-0 dark:border-zinc-600 dark:text-zinc-400">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="my-3 border-zinc-200 dark:border-zinc-700" />,
        table: ({ children }) => (
          <div className="mb-2 overflow-x-auto last:mb-0">
            <table className="w-full border-collapse text-xs">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border border-zinc-200 px-2 py-1 text-left font-medium dark:border-zinc-700">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border border-zinc-200 px-2 py-1 dark:border-zinc-700">{children}</td>
        ),
      }}
    >
      {children}
    </Markdown>
  );
}
