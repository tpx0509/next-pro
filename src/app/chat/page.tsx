import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { ChatClient } from "./chat-client";

export const metadata = {
  title: "问答",
};

export default function ChatPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">问答</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
          回答来自知识库里已上传的文档。这一页用的是{" "}
          <code className="font-mono text-xs">fetch</code> +{" "}
          <code className="font-mono text-xs">ReadableStream</code>，不是 RSC 数据流 ——
          模型的每个 token 都是自己拼到页面上的。
        </p>
      </header>

      {/* 只把「查人」放进洞里，标题和对话组件本身留在静态壳里。
          没登录的话洞里的 requireUser 会 redirect，壳已经 flush 出去了。 */}
      <Suspense fallback={null}>
        <LoginGate />
      </Suspense>

      <ChatClient />
    </div>
  );
}

async function LoginGate() {
  await requireUser("/chat");
  return null;
}
