"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { MarkdownText } from "@/components/markdown-text";

/** 一条回答写到哪一步。和数据库里 Message.status 的取值一一对应。 */
type MessageStatus = "streaming" | "done" | "failed";

type UIMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** 数据库里的 id。翻页游标要用它 —— 上面那个 id 只是给 React 做 key 的 */
  dbId?: number;
  /** 还在往这条消息上追加文字（决定要不要显示光标） */
  pending?: boolean;
  status?: MessageStatus;
  /** 这条回答是「用户点停止」留下来的半截，可以接着写。
   *  只有本次会话内知道 —— 刷新之后这个信息就没了，所以刷新回来不显示「继续写」按钮。 */
  stopped?: boolean;
};

/** 服务端首屏和分页接口给过来的消息形状 */
type StoredMessage = {
  id: number;
  role: string;
  content: string;
  status?: string;
};

type ChatClientProps = {
  initialMessages?: UIMessage[];
  initialConversationId?: number | null;
  initialHasMore?: boolean;
  initialCursor?: number | null;
};

function normalizeStatus(s: string | undefined): MessageStatus {
  return s === "streaming" || s === "failed" ? s : "done";
}

function toUIMessage(m: StoredMessage): UIMessage {
  const status = normalizeStatus(m.status);
  return {
    id: `db-${m.id}`,
    dbId: m.id,
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
    status,
    // 库里写着 streaming 说明服务端那次生成还没收尾（或者进程重启留下了僵尸，
    // 那种情况轮询的第一次请求就会把它判死并返回 failed）
    pending: status === "streaming",
  };
}

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

/**
 * 按数据库 id 找那条消息改。
 *
 * 轮询拿到的是 dbId，不是 React key —— 而且轮询回来时列表可能已经变了
 * （用户在等待期间发了新消息），所以不能简单地"改最后一条"。
 */
function patchByDbId(
  list: UIMessage[],
  dbId: number,
  fn: (m: UIMessage) => UIMessage,
): UIMessage[] {
  const i = list.findIndex((m) => m.dbId === dbId);
  if (i === -1) return list;
  const next = list.slice();
  next[i] = fn(next[i]);
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
export function ChatClient({
  initialMessages,
  initialConversationId = null,
  initialHasMore = false,
  initialCursor = null,
}: ChatClientProps) {
  const [messages, setMessages] = useState<UIMessage[]>(initialMessages ?? []);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 用户主动点了停止。和 error 分开：停止不是错误，该给的是「继续写」而不是「重试」。 */
  const [stopped, setStopped] = useState(false);
  const [meta, setMeta] = useState<Meta>({});
  const [conversationId, setConversationId] = useState<number | null>(initialConversationId);

  /** 还有没有更早的消息。每翻完一页由接口返回值决定 */
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // 用户往上翻看历史时不要强行拽回底部
  const stickToBottom = useRef(true);
  // 游标放 ref 不放 state：它只给下一次请求用，改了不需要重渲染
  const cursorRef = useRef<number | null>(initialCursor);
  // 防重入。滚动事件一秒能触发几十次，而 setLoadingMore 是异步的挡不住
  const loadingMoreRef = useRef(false);
  // 加载更早消息之前的「距底部距离」，插完消息靠它把滚动位置摆回去
  const restoreRef = useRef<number | null>(null);
  // 首屏内容撑不满容器时滚动事件永远不触发，用这个标记只补一次
  const filledOnce = useRef(false);
  // 轮询循环是不是已经在跑了。和 loadingMoreRef 同一个理由：state 挡不住重入
  const pollingRef = useRef(false);

  /** 往上翻一页。游标用 cursorRef 里那个「本页最老一条的 id」。 */
  const loadMore = useCallback(async () => {
    const cursor = cursorRef.current;
    if (!hasMore || loadingMoreRef.current || conversationId === null || cursor === null) {
      return;
    }

    loadingMoreRef.current = true;
    setLoadingMore(true);

    const el = listRef.current;
    // 插消息会让总高度变高。记下当前的「距底部距离」，
    // 等 React 把新消息挂上去之后用它把视觉位置还原。
    const distanceFromBottom = el ? el.scrollHeight - el.scrollTop : 0;

    try {
      const res = await fetch(
        `/api/chat/history?conversationId=${conversationId}&before=${cursor}`,
      );
      if (!res.ok) {
        // 401 / 404 都可能。别弹错误打断阅读，静默到底就行
        setHasMore(false);
        return;
      }

      const page = (await res.json()) as {
        messages: StoredMessage[];
        hasMore: boolean;
        nextCursor: number | null;
      };

      if (page.messages.length === 0) {
        setHasMore(false);
        return;
      }

      restoreRef.current = distanceFromBottom;
      setMessages((prev) => [...page.messages.map(toUIMessage), ...prev]);
      setHasMore(page.hasMore);
      cursorRef.current = page.nextCursor;
    } catch {
      // 网络断了。下次滚到顶会再试一次，不用惊动用户
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [conversationId, hasMore]);

  // 用 useLayoutEffect 而不是 useEffect：要在浏览器绘制之前就把滚动位置摆好，
  // 否则会先看到列表跳到顶部、下一帧才归位，闪一下。
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;

    if (restoreRef.current !== null) {
      // 让「距底部的距离」保持不变：总高度涨了多少，scrollTop 就跟着涨多少，
      // 视觉上就是内容没动、只是上面凭空多了几屏
      el.scrollTop = el.scrollHeight - restoreRef.current;
      restoreRef.current = null;
      return;
    }

    if (stickToBottom.current) el.scrollTop = el.scrollHeight;

    // 首屏一页没撑满容器时，滚动事件永远不会触发（没得滚），
    // 用户就永远看不到更早的消息。这里主动补一页。
    if (!filledOnce.current) {
      filledOnce.current = true;
      if (hasMore && el.scrollHeight <= el.clientHeight + 8) void loadMore();
    }
  }, [messages, hasMore, loadMore]);

  /** 停掉轮询。重试/继续写之前必须调，否则两路数据会互相覆盖同一张气泡。 */
  const stopPolling = () => {
    pollingRef.current = false;
  };

  /**
   * 轮询「最后一条消息写到哪了」。
   *
   * 什么时候用：刷新页面回来，发现最后一条还停在 streaming —— 说明服务端
   * 那次生成没跟着请求一起死，还在往库里写。这时候得定期去问它写到哪了。
   *
   * 什么时候停：status 不再是 streaming 就退出。进程重启留下的僵尸
   * （库里写着 streaming 但内存里没有对应的生成任务）会被 /api/chat/state
   * 判成 failed 一并返回，所以不会一直转圈。
   *
   * 为什么 1.5 秒：再快就是白烧数据库连接，再慢用户会觉得画面卡住了。
   */
  const startPolling = useCallback(async (cid: number) => {
    if (pollingRef.current) return;
    pollingRef.current = true;
    try {
      while (pollingRef.current) {
        await new Promise((r) => setTimeout(r, 1500));
        if (!pollingRef.current) break;

        const res = await fetch(`/api/chat/state?conversationId=${cid}`);
        if (!res.ok) break;

        const payload = (await res.json()) as {
          message: { id: number; role: string; content: string; status: string } | null;
        };
        const msg = payload.message;
        if (!msg) break;

        const status = normalizeStatus(msg.status);
        setMessages((prev) =>
          patchByDbId(prev, msg.id, (m) => ({
            ...m,
            content: msg.content,
            status,
            pending: status === "streaming",
          })),
        );
        if (status !== "streaming") break;
      }
    } catch {
      // 网络抖一下。这次不追了，用户下次进页面再试
    } finally {
      pollingRef.current = false;
    }
  }, []);

  // 首屏挂载时判断一次：最后一条还停在 streaming 就接上轮询。
  //
  // 只看 initialMessages 而不是 messages：后者每次流式更新都会变，
  // 依赖它会跟正在进行的流打架。挂载之后的变化由 send / regenerate 自己管。
  useEffect(() => {
    const cid = conversationId;
    if (cid === null) return;
    const last = initialMessages?.[initialMessages.length - 1];
    if (last?.role !== "assistant" || last.status !== "streaming") return;
    // 丢到下一轮宏任务再启动。effect 里同步触发更新会级联渲染，
    // 而首屏这会儿正忙着布局，晚一拍启动没有坏处。
    const timer = setTimeout(() => void startPolling(cid), 0);
    return () => clearTimeout(timer);
  }, [conversationId, initialMessages, startPolling]);

  /**
   * 读一条 SSE 响应，把 delta 拼到「最后一条 assistant 消息」上。
   *
   * 抽出来是因为三个入口都要走它：新提问、重试、继续写。
   * 它们的差别只在「请求打到哪个接口」和「进来之前气泡里有没有旧内容」。
   */
  async function pipeStream(res: Response) {
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
      setMessages((prev) => patchLast(prev, (m) => ({ ...m, content: m.content + chunk })));
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, "\n");

      let cut = buffer.indexOf("\n\n");
      while (cut !== -1) {
        const rawFrame = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 2);
        cut = buffer.indexOf("\n\n");

        const { event, data } = parseFrame(rawFrame);
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
          // 服务端在开流之前就把空回答建好了，把它的库 id 记到气泡上。
          // 轮询、继续写都要靠它找到「是哪一条」。
          if (typeof payload.messageId === "number") {
            const dbId = payload.messageId;
            setMessages((prev) => patchLast(prev, (m) => ({ ...m, dbId })));
          }
        } else if (event === "error") {
          setError(typeof payload.message === "string" ? payload.message : "生成失败");
          setMessages((prev) => patchLast(prev, (m) => ({ ...m, status: "failed" })));
        } else if (event === "done") {
          if (typeof payload.conversationId === "number") {
            setConversationId(payload.conversationId);
          }
          const wasStopped = payload.stopped === true;
          setMessages((prev) =>
            patchLast(prev, (m) => ({
              ...m,
              status: payload.failed === true ? "failed" : "done",
              stopped: wasStopped,
            })),
          );
          if (wasStopped) setStopped(true);
        }
      }

      flush();
    }

    flush();
  }

  const markLastStopped = () => {
    setStopped(true);
    setMessages((prev) =>
      patchLast(prev, (m) => ({ ...m, pending: false, status: "done", stopped: true })),
    );
  };

  const markLastFailed = () => {
    setMessages((prev) => patchLast(prev, (m) => ({ ...m, pending: false, status: "failed" })));
  };

  /**
   * 点停止。
   *
   * 必须两头都做：先打 /api/chat/stop 让服务端真的把上游掐掉，
   * 再 abort 本地 fetch 让页面立刻不再收字。只 abort 本地的话，
   * 服务端会当成「用户刷新了」，继续算完 —— token 照扣，用户却以为停了。
   *
   * 边角情况：第一次提问时 meta 帧还没回来，conversationId 还是 null，
   * 这时候停不了服务端（不知道该停哪个会话）。窗口极短，接受。
   */
  function stopGeneration() {
    const cid = conversationId;
    if (cid !== null) {
      void fetch("/api/chat/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: cid }),
      }).catch(() => {});
    }
    abortRef.current?.abort();
  }

  /**
   * 重做最后一条回答。不动用户的问题，只重跑那一次生成。
   *
   * retry    → 清空重写（报错了、答得不行）
   * continue → 接着半截往下写（点了停止，但话还没说完）
   */
  async function regenerate(mode: "retry" | "continue") {
    if (busy || conversationId === null) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;

    stopPolling();
    setError(null);
    setStopped(false);
    setBusy(true);
    stickToBottom.current = true;
    setMessages((prev) =>
      patchLast(prev, (m) => ({
        ...m,
        content: mode === "retry" ? "" : m.content,
        pending: true,
        status: "streaming",
        stopped: false,
      })),
    );

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, mode }),
        signal: controller.signal,
      });
      await pipeStream(res);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        markLastStopped();
      } else {
        setError(e instanceof Error ? e.message : "请求失败");
        markLastFailed();
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
      setMessages((prev) => patchLast(prev, (m) => ({ ...m, pending: false })));
    }
  }

  async function send(raw: string) {
    const content = raw.trim();
    if (!content || busy) return;

    stopPolling();
    setMessages((prev) => [
      ...prev,
      { id: uid(), role: "user", content },
      { id: uid(), role: "assistant", content: "", pending: true, status: "streaming" },
    ]);
    setInput("");
    setError(null);
    setStopped(false);
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
      // 读流的活儿全在 pipeStream 里，重试和继续写走的是同一段代码
      await pipeStream(res);
    } catch (e) {
      // 用户点「停止」时本地 fetch 会被 abort，read() 抛出 AbortError。
      // 这不是错误：已经吐出来的字要留在页面上，服务端那边由 /stop 负责停。
      if (e instanceof DOMException && e.name === "AbortError") {
        markLastStopped();
      } else {
        setError(e instanceof Error ? e.message : "请求失败");
        markLastFailed();
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
      setMessages((prev) => patchLast(prev, (m) => ({ ...m, pending: false })));
    }
  }

  // 「重做最后一条」这类操作的前提：确实有一条库里的 assistant 回答可以重做，
  // 而且当前没在生成。刚发出去还没拿到 dbId 的那条不算 —— 服务端还没建好它。
  const lastMessage = messages[messages.length - 1];
  const canRedo =
    !busy &&
    conversationId !== null &&
    lastMessage?.role === "assistant" &&
    typeof lastMessage.dbId === "number";
  const canContinue = canRedo && stopped && Boolean(lastMessage?.content.trim());

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
          // 贴到顶就去要更早的一页。给 80px 余量，手指还没完全滑到底就开始加载
          if (el.scrollTop < 80) void loadMore();
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
          <>
            {/* 列表头上的状态条。三种状态都要说清楚，不然用户不知道
                为什么往上滑没反应 */}
            <div className="py-1 text-center font-mono text-[11px] text-zinc-400 dark:text-zinc-600">
              {loadingMore
                ? "正在加载更早的消息…"
                : hasMore
                  ? "往上滑加载更早的消息"
                  : "已经到最早了"}
            </div>
            {messages.map((m) => (
              <Bubble key={m.id} message={m} />
            ))}
          </>
        )}
      </div>

      {(error || stopped) && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50/50 px-3 py-2 text-xs text-red-600 dark:border-red-900/70 dark:bg-red-950/20 dark:text-red-400">
          <span className="flex-1">{error ?? "已停止生成"}</span>
          {canRedo && (
            <button
              type="button"
              onClick={() => void regenerate("retry")}
              className="rounded-full border border-red-300 px-2.5 py-0.5 transition-colors hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900/40"
            >
              重试
            </button>
          )}
          {canContinue && (
            <button
              type="button"
              onClick={() => void regenerate("continue")}
              className="rounded-full border border-red-300 px-2.5 py-0.5 transition-colors hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900/40"
            >
              继续写
            </button>
          )}
        </div>
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
              onClick={stopGeneration}
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
        ) : message.status === "failed" ? (
          <span className="text-red-500">（生成失败，可以点上面的重试）</span>
        ) : (
          <span className="text-zinc-400">（这次没有内容）</span>
        )}
      </div>
    </div>
  );
}
