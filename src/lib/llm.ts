import 'server-only'

// 上游是 OpenAI 兼容端点。配置直接用系统里现成的 OPENAI_*，
// 想换供应商只改环境变量，这里的代码一行都不用动。
const BASE_URL = (process.env.LLM_BASE_URL ?? process.env.OPENAI_BASE_URL ?? '').replace(/\/+$/, '')
const API_KEY = process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY ?? ''

/** 模型名单独拿出来，是为了让页面能显示「问的是谁」。 */
export const CHAT_MODEL = process.env.CHAT_MODEL ?? 'gpt-6.1-sol'

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * 上游吐出来的东西只有两种有用事件：
 * - delta：一段新文本，拿去往页面上追加
 * - usage：这次调用花了多少 token（在最后一个 choices 为空的块里）
 */
export type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'usage'; promptTokens: number; completionTokens: number }

/** 配置缺失时给一句人话，不要等到 fetch 报个看不懂的错。 */
export function llmConfigError(): string | null {
  if (!BASE_URL) return '没有配置 LLM_BASE_URL / OPENAI_BASE_URL'
  if (!API_KEY) return '没有配置 LLM_API_KEY / OPENAI_API_KEY'
  return null
}

/**
 * 把上游的 SSE 字节流切成一条条 `data:` 后面的载荷。
 *
 * 这里是整个流式链路最容易写错的地方，两个坑：
 * 1. **一个 chunk 不等于一个事件**。网络层给的 Uint8Array 可能切在半个汉字、
 *    半行 JSON 上，所以必须自己攒 buffer，攒够了再切。
 * 2. **换行可能是 \r\n**。有些网关会补 \r，只认 \n\n 会解析失败。
 *    这里统一把 buffer 里的 \r\n 压成 \n，跨 chunk 悬空的 \r 会在下一次拼接后处理掉。
 */
/** 调试开关：LLM_DEBUG=1 时打印每一块原始字节，排查流式问题用。 */
const DEBUG = process.env.LLM_DEBUG === '1'

async function* ssePayloads(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (DEBUG) console.log('[llm] read', done ? 'done' : `${value.length}B`, 'buffer', buffer.length)
      if (done) break
      
      // stream: true —— 告诉解码器「后面还有」，别把半个多字节字符当坏数据丢掉
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n')
      console.log('[llm] buffer',buffer)
      let cut = buffer.indexOf('\n\n')
      while (cut !== -1) {
        const frame = buffer.slice(0, cut)
        buffer = buffer.slice(cut + 2)
        for (const line of frame.split('\n')) {
          if (line.startsWith('data:')) yield line.slice(5).trim()
        }
        cut = buffer.indexOf('\n\n')
      }
    }

    // 收尾：最后一个事件可能没有结尾空行就被掐断了
    if (buffer.trim()) {
      for (const line of buffer.split('\n')) {
        if (line.startsWith('data:')) yield line.slice(5).trim()
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * 调上游，逐段吐出来。
 *
 * 没有用 openai 官方 SDK：这里的整个教学目的就是看清楚「流」长什么样，
 * SDK 会把 SSE 解析包起来，反而看不见断行、[DONE]、空 choices 这些细节。
 */
export async function* streamCompletion(
  messages: ChatMessage[],
  options: { signal?: AbortSignal; temperature?: number } = {},
): AsyncGenerator<StreamEvent> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      stream: true,
      temperature: options.temperature ?? 0.3,
      messages,
    }),
    // 浏览器那头点了「停止」/ 关掉页面时，这个 signal 会 abort，
    // fetch 跟着取消上游请求 —— 不然模型继续算，token 照样扣。
    signal: options.signal,
  })

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '')
    throw new Error(`上游返回 ${res.status}：${detail.slice(0, 200) || res.statusText}`)
  }

  for await (const payload of ssePayloads(res.body)) {
    if (DEBUG) console.log('[llm] payload', payload.slice(0, 160))
    if (payload === '[DONE]') return

    let chunk: {
      choices?: { delta?: { content?: string | null } }[]
      usage?: { prompt_tokens: number; completion_tokens: number }
    }
    try {
      chunk = JSON.parse(payload)
    } catch {
      // 心跳、注释行、代理塞的杂项，跳过就行，不该让整条流挂掉
      if (DEBUG) console.log('[llm] 解析失败，跳过')
      continue
    }

    const text = chunk.choices?.[0]?.delta?.content
    if (text) yield { type: 'delta', text }

    // 带 usage 的那一块 choices 是空数组，所以上面取不到 content 是正常的
    if (chunk.usage) {
      yield {
        type: 'usage',
        promptTokens: chunk.usage.prompt_tokens,
        completionTokens: chunk.usage.completion_tokens,
      }
    }
  }
}
