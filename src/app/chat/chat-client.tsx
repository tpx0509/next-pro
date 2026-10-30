"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MarkdownText } from "@/components/markdown-text";

type UIMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** 还在往这条消息上追加文字（决定要不要显示光标） */
  pending?: boolean;
};

type Meta = {
  model?: string;
  sources?: string[];
  truncated?: boolean;
  truncatedTitles?: string[];
};

const uid = () => Math.random().toString(36).slice(2, 10);

/** 一条 SSE 帧：可能有多行 data，这里只取 event 名和拼好的 payload。 */
function parseFrame(raw: string): { event: string; data: string } {
  let event = "message";
  let data = "";
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  return { event, data };
}

function patchLast(list: UIMessage[], fn: (m: UIMessage) => UIMessage): UIMessage[] {
  if (list.length === 0) return list;
  const next = list.slice();
  next[next.length - 1] = fn(next[next.length - 1]);
  return next;
}

const EXAMPLES = [
  "帮我总结知识库里所有文档的要点",
  "团队规范里对代码评审有什么要求？",
  "最近一次会议定了哪些事？",
];

/**
 * 对话页。
 *
 * 这里是「放弃 RSC、自己读流」的现场：
 * fetch 拿到的是原始 HTTP 响应体（一个字节流），要自己按空行切帧、
 * 自己拼字符串、自己 setState。React 只负责把拼好的字符串画出来，
 * 完全不知道「流式」这回事。
 */
export function ChatClient() {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta>({});
  const [conversationId, setConversationId] = useState<number | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // 用户往上翻看历史时不要强行拽回底部
  const stickToBottom = useRef(true);

  useEffect(() => {
    const el = listRef.current;
    if (!el || !stickToBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function send(raw: string) {
    const content = raw.trim();
    if (!content || busy) return;

    setMessages((prev) => [
      ...prev,
      { id: uid(), role: "user", content },
      { id: uid(), role: "assistant", content: "", pending: true },
    ]);
    setInput("");
    setError(null);
    setBusy(true);
    stickToBottom.current = true;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, content }),
        signal: controller.signal,
      });

      // 走到这里说明响应头已经到了。所有「能返回 4xx」的检查都在服务端
      // 返回 Response 之前做完，所以这里的 !res.ok 只会是鉴权/参数错误，
      // 不会出现「聊到一半突然变成 500」。
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.error ?? `请求失败（HTTP ${res.status}）`);
      }
      if (!res.body) throw new Error("响应里没有流");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      // 一次 read() 里可能带回来好几段 delta。先攒着，
      // 等这一批处理完再一次性 setState —— 每 token 渲染一次太浪费。
      let pendingText = "";

      const flush = () => {
        if (!pendingText) return;
        const chunk = pendingText;
        pendingText = "";
        setMessages((prev) =>
          patchLast(prev, (m) => ({ ...m, content: m.content + chunk })),
        );
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, "\n");

        let cut = buffer.indexOf("\n\n");
        while (cut !== -1) {
          const raw = buffer.slice(0, cut).toString();
          buffer = buffer.slice(cut + 2);
          cut = buffer.indexOf("\n\n");

          const { event, data } = parseFrame(raw);
          if (!data) continue;

          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(data);
          } catch {
            continue;
          }

          if (event === "delta" && typeof payload.text === "string") {
            pendingText += payload.text;
          } else if (event === "meta") {
            setMeta({
              model: typeof payload.model === "string" ? payload.model : undefined,
              sources: Array.isArray(payload.sources) ? (payload.sources as string[]) : [],
              truncated: payload.truncated === true,
              truncatedTitles: Array.isArray(payload.truncatedTitles)
                ? (payload.truncatedTitles as string[])
                : [],
            });
            if (typeof payload.conversationId === "number") {
              setConversationId(payload.conversationId);
            }
          } else if (event === "error") {
            setError(typeof payload.message === "string" ? payload.message : "生成失败");
          } else if (event === "done") {
            if (typeof payload.conversationId === "number") {
              setConversationId(payload.conversationId);
            }
            if (payload.stopped === true) setError("已停止生成");
          }
        }

        flush();
      }

      flush();
    } catch (e) {
      // 用户点「停止」时 fetch 会 abort，read() 抛出 AbortError。
      // 这不是错误：已经吐出来的字要留在页面上。
      if (e instanceof DOMException && e.name === "AbortError") {
        setError("已停止生成");
      } else {
        setError(e instanceof Error ? e.message : "请求失败");
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
      setMessages((prev) => patchLast(prev, (m) => ({ ...m, pending: false })));
    }
  }

  return (
    <div className="space-y-4">
      {/* 顶栏：显示这次用的是哪个模型、参考了几篇文档 */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400 dark:text-zinc-500">
        <span className="font-mono">
          {meta.model ?? "—"}
          {typeof meta.sources?.length === "number" && meta.sources.length > 0 ? (
            <span className="ml-2">
              参考 {meta.sources.length} 篇文档
              {meta.truncatedTitles && meta.truncatedTitles.length > 0
                ? `（${meta.truncatedTitles.join("、")} 太长，只取了一部分）`
                : ""}
            </span>
          ) : null}
        </span>
        <Link
          href="/conversations"
          className="rounded-full border border-zinc-200 px-3 py-1 transition-colors hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900"
        >
          历史会话
        </Link>
      </div>

      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64;
        }}
        className="max-h-[58vh] min-h-[38vh] space-y-4 overflow-y-auto rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
      >
        {messages.length === 0 ? (
          <div className="flex h-full min-h-[30vh] flex-col items-center justify-center gap-4 text-center">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              基于知识库里的文档回答。先从下面挑一个试试：
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {EXAMPLES.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => send(q)}
                  className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => <Bubble key={m.id} message={m} />)
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50/50 px-3 py-2 text-xs text-red-600 dark:border-red-900/70 dark:bg-red-950/20 dark:text-red-400">
          {error}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // isComposing：中文输入法敲回车是「确认候选词」，不是「发送」。
            // 少了这个判断，用拼音打字的人选词时消息就飞出去了。
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send(input);
            }
          }}
          rows={2}
          placeholder="问点什么…（Enter 发送，Shift + Enter 换行）"
          className="w-full resize-none bg-transparent text-sm leading-6 outline-none placeholder:text-zinc-400"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-zinc-400 dark:text-zinc-600">
            {conversationId ? `会话 #${conversationId}` : "新会话"}
          </span>
          {busy ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              停止
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              发送
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function Bubble({ message }: { message: UIMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-zinc-900 px-4 py-2.5 text-sm leading-6 text-white dark:bg-zinc-100 dark:text-zinc-900">
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] rounded-2xl rounded-bl-sm bg-zinc-100 px-4 py-2.5 text-sm leading-6 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
        {message.content ? (
          message.pending ? (
            // 流式过程中用纯文本：光标能精确贴在最后一个字后面，
            // 也不用每来一个 token 就把整段 markdown 重新解析一遍
            <p className="whitespace-pre-wrap break-words">
              {message.content}
              <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-zinc-400 align-middle dark:bg-zinc-500" />
            </p>
          ) : (
            // 写完了再排版，观感上就是「回答结束、自动整理格式」
            <div className="break-words">
              <MarkdownText>{message.content}</MarkdownText>
            </div>
          )
        ) : message.pending ? (
          <span className="text-zinc-400">思考中…</span>
        ) : (
          <span className="text-zinc-400">（这次没有内容）</span>
        )}
      </div>
    </div>
  );
}
