import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { listDocuments } from "@/lib/documents";
import { UploadForm } from "./upload-form";

export const metadata = {
  title: "知识库",
};

// sv-SE 的短日期格式就是 2026-10-28 这种 ISO 形状，比中文的「年月日」
// 更紧凑，也不会因为字体缺字变成方块。时区显式钉在 Asia/Shanghai：
// 服务器时区可能是 UTC，不钉死会出现「刚上传的文件显示成明天」。
const timeFmt = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Shanghai",
  dateStyle: "short",
  timeStyle: "short",
});

export default function DocumentsPage({ searchParams }: PageProps<"/documents">) {
  return (
    <div className="space-y-6">
      {/* 这一圈是静态壳：标题和上传表单都是纯静态的，只有下面那坨列表
          要读 cookie 和数据库，所以把它单独放进 Suspense 洞。 */}
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">知识库</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
          上传的文档会被抽成纯文本存进 <code className="font-mono text-xs">Document</code> 表，
          下一步（A 阶段）拿来切块做检索。
        </p>
      </header>

      <UploadForm />

      <Suspense fallback={<ListSkeleton />}>
        <DocList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="h-24 animate-pulse rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50"
        />
      ))}
    </div>
  );
}

async function DocList({
  searchParams,
}: {
  searchParams: PageProps<"/documents">["searchParams"];
}) {
  // 读 cookie → 查 Session 表 → 拿不到人就跳登录页。
  // proxy 只保证「有 cookie」，这里才是真的判定。
  const user = await requireUser("/documents");
  const [sp, docs] = await Promise.all([searchParams, listDocuments(user.id)]);

  const added = typeof sp.added === "string" ? sp.added : undefined;
  const error = typeof sp.error === "string" ? sp.error : undefined;

  return (
    <div className="space-y-4">
      {/* 上传结果走 URL 参数传回来（Route Handler 用 303 跳转，没法直接返回 JSON 给表单）。
          刷新会重复看到提示，这是这种「表单 POST → 重定向」模式的固有代价；
          想去掉就得改成 fetch 上传 + 客户端状态，那是另一套写法。 */}
      {added && (
        <p className="rounded-lg border border-teal-200 bg-teal-50/50 px-3 py-2 text-sm text-teal-700 dark:border-teal-900/70 dark:bg-teal-950/20 dark:text-teal-300">
          已入库：{added}
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50/50 px-3 py-2 text-sm text-red-600 dark:border-red-900/70 dark:bg-red-950/20 dark:text-red-400">
          {error}
        </p>
      )}

      {docs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 px-6 py-12 text-center dark:border-zinc-700">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            还没有文档。传一份 .txt / .md / .pdf / .docx 试试。
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            共 {docs.length} 篇 · {docs.reduce((n, d) => n + d.content.length, 0).toLocaleString("zh-CN")} 字
          </p>
          <ul className="space-y-3">
            {docs.map((doc) => (
              <li
                key={doc.id}
                className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <div className="flex items-start justify-between gap-4">
                  <h2 className="font-medium tracking-tight">{doc.title}</h2>
                  <span className="shrink-0 font-mono text-xs text-zinc-400 dark:text-zinc-500">
                    {doc.content.length.toLocaleString("zh-CN")} 字
                  </span>
                </div>
                {/* 只显示一段预览。正文可能有几十万字，全塞进 HTML 是浪费带宽，
                    也拖慢首屏 —— 详情页再按需读。 */}
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                  {doc.content.slice(0, 160).replace(/\s+/g, " ")}
                  {doc.content.length > 160 ? "…" : ""}
                </p>
                <p className="mt-2 font-mono text-[11px] text-zinc-400 dark:text-zinc-600">
                  {timeFmt.format(doc.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
