import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { listConversations } from "@/lib/chat";

export const metadata = {
  title: "历史会话",
};

const timeFmt = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Shanghai",
  dateStyle: "short",
  timeStyle: "short",
});

export default function ConversationsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">历史会话</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
          存在 <code className="font-mono text-xs">Conversation</code> /{" "}
          <code className="font-mono text-xs">Message</code> 两张表里，服务端直接查库渲染。
        </p>
      </header>

      <Suspense fallback={<ListSkeleton />}>
        <List />
      </Suspense>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-16 animate-pulse rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50"
        />
      ))}
    </div>
  );
}

async function List() {
  const user = await requireUser("/conversations");
  const conversations = await listConversations(user.id);
  console.log('conversations',conversations)
  if (conversations.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 px-6 py-12 text-center dark:border-zinc-700">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          还没有会话。
          <Link href="/chat" className="ml-1 underline underline-offset-4">
            去问第一个问题
          </Link>
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {conversations.map((c) => (
        <li key={c.id}>
          <Link
            href={`/chat/${c.id}`}
            className="block rounded-xl border border-zinc-200 p-4 transition-colors hover:border-zinc-300 hover:bg-zinc-50/70 dark:border-zinc-800 dark:hover:border-zinc-700 dark:hover:bg-zinc-900/40"
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="min-w-0 flex-1 truncate font-medium tracking-tight">
                {c.title ?? "未命名会话"}
              </h2>
              <span className="shrink-0 font-mono text-xs text-zinc-400 dark:text-zinc-500">
                {c._count.messages} 条
              </span>
            </div>
            <p className="mt-2 font-mono text-[11px] text-zinc-400 dark:text-zinc-600">
              #{c.id} · {timeFmt.format(c.updatedAt)}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
