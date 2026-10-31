import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getConversationPage } from "@/lib/chat";
import { ChatClient } from "../chat-client";

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
 * 单个会话 —— 可以接着聊，也可以往回翻。
 *
 * 以前这一页是纯 RSC 只读的，一次把所有消息查出来拼成 HTML。
 * 现在改成「首屏给最近一页，剩下的滚到顶再要」：会话长了以后
 * 一次性渲染几百条，光是 markdown 解析就够卡一会儿的。
 *
 * 首屏仍然服务端渲染 —— 打开页面就有内容，不用等客户端再发一次请求。
 * 只有翻页走接口。所以聊天记录的 HTML 源码里还是能看到消息。
 */
export default async function ConversationPage({ params }: PageProps<"/chat/[id]">) {
  const user = await requireUser("/conversations");
  const { id } = await params;

  const conversationId = Number(id);
  // 路径里的 id 可能是任何字符串，先挡掉 NaN，否则会给 Prisma 一个非法参数
  if (!Number.isInteger(conversationId)) notFound();

  const page = await getConversationPage(user.id, conversationId);
  // 别人的会话和不存在一样处理 —— 不告诉外面「这个 id 存在但不是你的」
  if (!page) notFound();

  // status 必须带上。刷新那一刻如果服务端还在生成，库里的 status 是 streaming，
  // 客户端靠它决定「要不要接上轮询」。以前这里只传了 id/role/content，
  // 结果就是：库里明明写着 streaming，前端拿到的却是 undefined，
  // 启动条件永远不成立，页面停在刷新时那半截再也不动。
  const initialMessages = page.messages.map((m) => {
    const status: "streaming" | "done" | "failed" =
      m.status === "streaming" || m.status === "failed" ? m.status : "done";
    return {
      // React 的 key 要字符串，加 db- 前缀避免和客户端 uid() 生成的值撞上
      id: `db-${m.id}`,
      dbId: m.id,
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.content,
      status,
      pending: status === "streaming",
    };
  });

  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <Link
          href="/conversations"
          className="font-mono text-xs text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
        >
          ← 全部会话
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          {page.conversation.title ?? "未命名会话"}
        </h1>
        <p className="font-mono text-xs text-zinc-400 dark:text-zinc-500">
          {/* 这里显示数据库里的真实总条数，不是首屏拿到的那一页 */}
          #{page.conversation.id} · {page.conversation.messageCount} 条消息 · 起于{" "}
          {timeFmt.format(page.conversation.createdAt)}
        </p>
      </header>

      <ChatClient
        initialMessages={initialMessages}
        initialConversationId={page.conversation.id}
        initialHasMore={page.hasMore}
        initialCursor={page.nextCursor}
      />
    </div>
  );
}
