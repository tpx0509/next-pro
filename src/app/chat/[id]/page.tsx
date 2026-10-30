import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getConversationWithMessages } from "@/lib/chat";
import { MarkdownText } from "@/components/markdown-text";

const timeFmt = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Shanghai",
  dateStyle: "short",
  timeStyle: "short",
});

// 这条路由的参数是会话 id，build 时一个都不知道，没法生成静态壳：
// 壳里能放的东西（标题、导航）全靠 id 查出来，id 不确定就什么都渲染不了。
// instant = false 就是明说「这条路由允许阻塞」，别为它预渲染空壳 ——
// 否则 Next 会去预渲染一次，然后撞上 usePathname() 和 cookies() 而报错。
export const instant = false;

/**
 * 单个会话的历史记录 —— 纯服务端渲染。
 *
 * 这一页和对话页是两种完全不同的思路：这里是 RSC，一次请求把所有消息
 * 查出来拼成 HTML 发过去，没有流、没有客户端状态。因为历史记录不需要
 * 「边到边显示」，一次性给完反而更快。
 */
export default async function ConversationPage({ params }: PageProps<"/chat/[id]">) {
  const user = await requireUser("/conversations");
  const { id } = await params;

  const conversationId = Number(id);
  // 路径里的 id 可能是任何字符串，先挡掉 NaN，否则会给 Prisma 一个非法参数
  if (!Number.isInteger(conversationId)) notFound();

  const conversation = await getConversationWithMessages(user.id, conversationId);
  // 别人的会话和不存在一样处理 —— 不告诉外面「这个 id 存在但不是你的」
  if (!conversation) notFound();

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href="/conversations"
          className="font-mono text-xs text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
        >
          ← 全部会话
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          {conversation.title ?? "未命名会话"}
        </h1>
        <p className="font-mono text-xs text-zinc-400 dark:text-zinc-500">
          #{conversation.id} · {conversation.messages.length} 条消息 · 起于{" "}
          {timeFmt.format(conversation.createdAt)}
        </p>
      </header>

      <ol className="space-y-4">
        {conversation.messages.map((m) => (
          <li key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                m.role === "user"
                  ? "max-w-[85%] rounded-2xl rounded-br-sm bg-zinc-900 px-4 py-2.5 text-sm leading-6 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "max-w-[90%] rounded-2xl rounded-bl-sm bg-zinc-100 px-4 py-2.5 text-sm leading-6 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
              }
            >
              <div className="break-words">
                <MarkdownText>{m.content}</MarkdownText>
              </div>
              <p
                className={
                  m.role === "user"
                    ? "mt-1.5 font-mono text-[10px] text-zinc-400 dark:text-zinc-500"
                    : "mt-1.5 font-mono text-[10px] text-zinc-400 dark:text-zinc-500"
                }
              >
                {m.role === "user" ? "你" : "助手"} · {timeFmt.format(m.createdAt)}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <Link
        href="/chat"
        className="inline-flex rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        开个新会话
      </Link>
    </div>
  );
}
