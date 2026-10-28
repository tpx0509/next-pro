"use client";

import { useRef, useState } from "react";

const ACCEPT = ".txt,.md,.markdown,.pdf,.docx";
const MAX_SIZE = 10 * 1024 * 1024;

/**
 * 上传表单 —— 注意它是个普通的 HTML 表单，不是 Server Action。
 *
 * <form action="/api/documents" method="post" encType="multipart/form-data">
 * 浏览器自己就会把文件打包成 multipart 请求发过去，不经过 RSC 协议。
 * 这个组件用 'use client' 只是为了两件事：
 *   1. 选完文件立刻做一次本地校验（类型/大小），不用等上传完才报错；
 *   2. 提交后把按钮置灰，防止手快点两下传两份。
 * 这两件事都不是必须的：把 JS 关掉，这个表单照样能传。
 */
export function UploadForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function check(f: File | null): string | null {
    if (!f) return null;
    if (f.size === 0) return "文件是空的";
    if (f.size > MAX_SIZE) return "文件超过 10MB";
    const dot = f.name.lastIndexOf(".");
    const ext = dot === -1 ? "" : f.name.slice(dot).toLowerCase();
    if (!ACCEPT.split(",").includes(ext)) return `暂不支持 ${ext || "无扩展名"} 的文件`;
    return null;
  }

  return (
    <form
      ref={formRef}
      action="/api/documents"
      method="post"
      encType="multipart/form-data"
      onSubmit={(e) => {
        const local = check(file);
        if (local) {
          e.preventDefault();
          setError(local);
          return;
        }
        if (!file) {
          e.preventDefault();
          setError("先选一个文件");
          return;
        }
        setError(null);
        // 这里不 preventDefault：让浏览器正常提交并整页跳转。
        // 服务端处理完会 303 回 /documents，列表就是最新的。
        setSubmitting(true);
      }}
      className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <div className="flex flex-wrap items-center gap-3">
        <label
          className="cursor-pointer rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          htmlFor="file"
        >
          选择文件
        </label>
        {/* 真正的 file input 藏起来：原生控件在不同浏览器里长得完全不一样，
            样式改不动，用 label 包一层当按钮是通行做法。 */}
        <input
          id="file"
          name="file"
          type="file"
          accept={ACCEPT}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);
            setError(check(f));
          }}
        />

        <span className="min-w-0 flex-1 truncate text-sm text-zinc-500 dark:text-zinc-400">
          {file ? (
            <>
              {file.name}
              <span className="ml-2 font-mono text-xs text-zinc-400">
                {(file.size / 1024).toFixed(0)} KB
              </span>
            </>
          ) : (
            ".txt / .md / .pdf / .docx，最大 10MB"
          )}
        </span>

        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {submitting ? "上传中…" : "上传"}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </form>
  );
}
