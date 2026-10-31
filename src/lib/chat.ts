import 'server-only'
import { prisma } from './prisma'
import { isRunning } from './running'
import type { ChatMessage } from './llm'

/**
 * 塞进 system prompt 的文档总字数上限。
 *
 * 这是「不做检索」的代价：文档一多，要么超上下文窗口，要么账单爆炸。
 * 真要做 RAG，就是把这里的「拼全文」换成「查最像的几段」，函数签名都不用变。
 */
const MAX_CONTEXT_CHARS = 24_000

/**
 * 单篇文档最多占多少。
 *
 * 第一版是「按顺序塞，塞满为止」，结果被一篇 14000 字的闲聊记录吃光了预算，
 * 排在后头的《团队规范》（201 字）一个字都没进去 —— 用户问规范里的代码评审
 * 要求，模型只能回答「文档里没有相关内容」。分配额就是为了避免这种
 * 「大文件饿死小文件」。
 */
const MAX_PER_DOC_CHARS = 12_000

/**
 * 往回带的历史最多占多少字。
 *
 * 第一版是按条数（20 条）裁的，这个指标不靠谱：一条 4000 字的粘贴消息
 * 能顶三十条短消息，20 条的上限完全挡不住。按字数算才和真实的
 * token 成本对得上。
 */
const MAX_HISTORY_CHARS = 12_000

/**
 * 一次最多扫多少条来凑预算。
 *
 * 纯粹是防御：正常对话到不了这个量，但万一某个会话被脚本灌了十万条，
 * 也不能整表读进内存再裁。
 */
const HISTORY_SCAN_LIMIT = 200

/** 历史页一次翻多少条。30 条大概两屏，再小翻得太勤。 */
const PAGE_SIZE = 20

export type DocumentContext = {
  text: string
  titles: string[]
  /** 有文档因为预算被截断了（整体层面） */
  truncated: boolean
  /** 具体哪几篇被截断了，页面上能提示用户 */
  truncatedTitles: string[]
}

/** 把当前用户的文档拼成一段上下文。按上传时间倒序，新的优先。 */
export async function buildDocumentContext(ownerId: number): Promise<DocumentContext> {
  const docs = await prisma.document.findMany({
    where: { ownerId },
    orderBy: { createdAt: 'desc' },
    select: { title: true, content: true },
  })

  if (docs.length === 0) {
    return { text: '', titles: [], truncated: false, truncatedTitles: [] }
  }

  // 第一轮：每篇先拿一份「平均配额」，保证小文档不会因为排在大文档后面被整篇挤掉
  const base = Math.floor(MAX_CONTEXT_CHARS / docs.length)
  const quota = docs.map((d) => Math.min(base, MAX_PER_DOC_CHARS, d.content.length))

  // 第二轮：还有余量就补给被截断的文档，直到单篇上限或预算用完
  let remaining = MAX_CONTEXT_CHARS - quota.reduce((sum, n) => sum + n, 0)
  for (let i = 0; i < docs.length && remaining > 0; i++) {
    const room = Math.min(MAX_PER_DOC_CHARS, docs[i].content.length) - quota[i]
    if (room <= 0) continue
    const add = Math.min(room, remaining)
    quota[i] += add
    remaining -= add
  }

  const truncatedTitles: string[] = []
  const parts = docs.map((doc, i) => {
    if (doc.content.length > quota[i]) {
      truncatedTitles.push(doc.title)
      return `## ${doc.title}\n${doc.content.slice(0, quota[i])}\n…（本篇后面截断了）\n`
    }
    return `## ${doc.title}\n${doc.content}\n`
  })

  return {
    text: parts.join('\n'),
    titles: docs.map((d) => d.title),
    truncated: truncatedTitles.length > 0,
    truncatedTitles,
  }
}

/** 系统提示词：把「只依据文档」这条规则钉死，不然模型会拿训练数据编。 */
export function buildSystemPrompt(ctx: DocumentContext): string {
  const rules = [
    '你是一个知识库问答助手。',
    '回答必须依据下面提供的文档；文档里没有的信息，直接说「文档里没有相关内容」，不要靠常识补充。',
    '引用具体内容时，在句末用（文档标题）标注来源。',
    '用中文回答，简洁直接，不要重复问题本身。',
  ].join('\n')

  if (!ctx.text) {
    return `${rules}\n\n当前知识库里还没有任何文档。请告诉用户先到「知识库」页上传，不要凭空回答。`
  }

  const tail =
    ctx.truncatedTitles.length > 0
      ? `\n\n（注意：《${ctx.truncatedTitles.join('》《')}》内容较长，上面只包含了前面一部分。` +
        `如果问题涉及这些文档的后半段，请如实说「这部分内容没在当前上下文中」。）`
      : ''

  return `${rules}\n\n以下是用户上传的文档：\n\n${ctx.text}${tail}`
}

/** 会话标题取第一句的前 30 个字，够列表里认出来就行。 */
function titleFrom(content: string): string {
  const one = content.replace(/\s+/g, ' ').trim()
  return one.length > 30 ? `${one.slice(0, 30)}…` : one || '新对话'
}

export async function createConversation(ownerId: number, firstContent: string) {
  return prisma.conversation.create({
    data: { ownerId, title: titleFrom(firstContent) },
    select: { id: true, title: true },
  })
}

/**
 * 校验会话归属。会话 id 是自增的，被人猜中就能读别人对话，所以每次都要过这一关。
 *
 * ownerId 必须进 where，不能只在 JS 里取出来比一下：
 * - 进了 where，归属判断由数据库完成，查出 null 就是「不存在或不是你的」，
 *   调用方拿不到任何信息，也顺便避免了「先查再判」这两步之间被删掉的竞态。
 * - 只在 JS 里比，等于把别人的整条会话读进内存再丢掉，逻辑上是对的但多绕一圈，
 *   而且很容易写着写着就忘了写那个 if。
 */
export async function findOwnConversation(ownerId: number, id: number) {
  return prisma.conversation.findFirst({
    where: { id, ownerId },
    select: { id: true, title: true },
  })
}

export async function appendMessage(
  conversationId: number,
  role: 'user' | 'assistant',
  content: string,
) {
  const message = await prisma.message.create({
    data: { conversationId, role, content },
    select: { id: true, createdAt: true },
  })

  // 顺手碰一下会话，让 updatedAt 跟着走 —— 列表按它排序，
  // 不碰的话刚聊完的会话会沉在下面。这里没有「点赞不许改时间」的需求，
  // 用普通 update 就对了。
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
    select: { id: true },
  })

  return message
}

/**
 * 一条 assistant 回答写到哪一步。和 schema 里 Message.status 的注释对应。
 *
 * streaming → 服务端还在往里写，刷新页面能接着看
 * done      → 正常写完，或用户主动停止（已有的字都算数）
 * failed    → 上游报错、超时，或者进程被杀留下的僵尸
 */
export type MessageStatus = 'streaming' | 'done' | 'failed'

/**
 * 先建一条空回答，再慢慢往里灌。
 *
 * 顺序和以前反过来了：以前是「生成完 → create」，一次 INSERT 搞定；
 * 现在是「create 空壳 → 边生成边 UPDATE」。只有这样才能做到刷新页面
 * 看到进度，也顺便让「生成到一半崩了」在库里留下痕迹，
 * 而不是整条回答凭空消失、用户以为自己的问题没发出去。
 */
export async function createAssistantMessage(conversationId: number): Promise<number> {
  const msg = await prisma.message.create({
    data: { conversationId, role: 'assistant', content: '', status: 'streaming' },
    select: { id: true },
  })
  return msg.id
}

/**
 * 生成途中把已写的内容落库。
 *
 * 失败不抛异常：SQLite 同一时刻只能有一个写事务，正好赶上别人在写就是
 * SQLITE_BUSY。丢这一次并不要紧 —— 下一次更新会带着更长的内容覆盖上来，
 * 最后 finishMessage 还会再兜一次底。为了一次中途落库失败把整条回答废掉
 * 才是真的亏。
 */
export async function updateMessageContent(id: number, content: string): Promise<void> {
  try {
    await prisma.message.update({
      where: { id },
      data: { content },
      select: { id: true },
    })
  } catch (e) {
    console.error('[chat] 中途落库失败（下一次会覆盖，不影响结果）', e)
  }
}

/** 收尾：内容和最终状态一起定下来。这个失败了才真的算事故，让它抛。 */
export async function finishMessage(
  id: number,
  content: string,
  status: Exclude<MessageStatus, 'streaming'>,
): Promise<void> {
  await prisma.message.update({
    where: { id },
    data: { content, status },
    select: { id: true },
  })
}

/** 会话里最后一条 assistant 消息。重试和继续写都从它身上取。 */
export async function getLastAssistantMessage(conversationId: number) {
  return prisma.message.findFirst({
    where: { conversationId, role: 'assistant' },
    orderBy: { id: 'desc' },
    select: { id: true, content: true, status: true },
  })
}

/**
 * 重试前把旧回答清空、重新标成 streaming。
 *
 * 为什么不删掉重建：删了 id 就变了，前端那条气泡得整个换一个 key 重新挂载，
 * 滚动位置会跳。看起来是同一句回答在重写，那就该是同一条记录。
 */
export async function restartMessage(id: number): Promise<void> {
  await prisma.message.update({
    where: { id },
    data: { content: '', status: 'streaming' },
    select: { id: true },
  })
}

/** 僵尸判定的宽限期：消息刚建出来那几秒，可能还没走完 register，别急着判死。 */
const ZOMBIE_GRACE_MS = 30_000

/**
 * 轮询用：会话最后一条消息现在长什么样、写到哪了。
 *
 * 顺手做一件重要的事 —— 僵尸清理。库里写着 streaming 但内存里根本没有
 * 对应的生成任务，只有一种可能：进程重启过，那次生成早就没了。
 * 不处理的话前端会永远轮询下去，页面上永远显示「正在生成」。
 *
 * 这和 Session 过期是同一个思路：没有定时任务，就在读的时候顺手收拾。
 */
export async function getLastMessageState(conversationId: number) {
  const msg = await prisma.message.findFirst({
    where: { conversationId },
    orderBy: { id: 'desc' },
    select: { id: true, role: true, content: true, status: true, createdAt: true },
  })
  if (!msg) return null

  const looksDead =
    msg.status === 'streaming' &&
    !isRunning(conversationId) &&
    Date.now() - msg.createdAt.getTime() > ZOMBIE_GRACE_MS

  if (looksDead) {
    await prisma.message
      .update({ where: { id: msg.id }, data: { status: 'failed' }, select: { id: true } })
      .catch(() => {})
    return { ...msg, status: 'failed' }
  }

  return msg
}

/**
 * 拼给上游的历史。
 *
 * 从最新往回累加，到字数预算就停 —— 不是按条数，理由见 MAX_HISTORY_CHARS。
 * 必须倒序取再反转：正序拿到的永远是最早那批，长会话里模型会看着
 * 十天前的开场白回答刚问的问题。
 *
 * excludeId：重新生成时要把「正在被重写的那条回答」摘出去，
 * 否则模型会看到历史末尾挂着一个空的 assistant，以为自己上一句什么都没说。
 */
export async function loadHistory(
  conversationId: number,
  excludeId?: number,
): Promise<ChatMessage[]> {
  const rows = await prisma.message.findMany({
    where: {
      conversationId,
      // 还没写完的回答不算历史。半截话和空壳都会带偏模型，
      // 让它在别人没说完的地方接着编。
      status: { not: 'streaming' },
      ...(excludeId === undefined ? {} : { id: { not: excludeId } }),
    },
    orderBy: { id: 'desc' },
    take: HISTORY_SCAN_LIMIT,
    select: { role: true, content: true },
  })

  const picked: typeof rows = []
  let used = 0
  for (const row of rows) {
    // 第一条无条件收下：那是用户刚问的这句，丢了就没得答
    if (picked.length > 0 && used + row.content.length > MAX_HISTORY_CHARS) break
    picked.push(row)
    used += row.content.length
  }

  return picked.reverse().map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }))
}

export async function listConversations(ownerId: number) {
  return prisma.conversation.findMany({
    where: { ownerId },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      updatedAt: true,
      _count: { select: { messages: true } },
    },
  })
}

/** 从库里读出来的一条消息。走 JSON 时 createdAt 会变成字符串，页面目前不用它。 */
export type StoredMessage = {
  id: number
  role: string
  content: string
  /** 前端要靠它判断「这条还在生成」，进而决定要不要接上轮询 */
  status: string
  createdAt: Date
}

export type MessagePage = {
  messages: StoredMessage[]
  hasMore: boolean
  /** 下一页的游标：本页最老那条的 id。滚到顶时原样带回去。 */
  nextCursor: number | null
}

/**
 * 游标分页读消息。
 *
 * 为什么不用 offset：聊天记录一直在末尾追加，翻页的间隙来了新消息，
 * 第 2 页就会和上一页重复。游标钉在「上一页最老那条的 id」上，
 * 后面追加多少条都不影响已翻过的部分。
 */
async function fetchMessagePage(
  conversationId: number,
  beforeId: number | null,
  limit: number,
): Promise<MessagePage> {
  const rows = await prisma.message.findMany({
    where: {
      conversationId,
      ...(beforeId !== null ? { id: { lt: beforeId } } : {}),
    },
    orderBy: { id: 'desc' },
    // 多取一条，只用来判断「还有没有更早的」，不返回给调用方
    take: limit + 1,
    select: { id: true, role: true, content: true, status: true, createdAt: true },
  })

  const hasMore = rows.length > limit
  const slice = hasMore ? rows.slice(0, limit) : rows
  // 游标必须在反转之前取：反转后 slice[0] 变成最老的那条了
  const nextCursor = hasMore ? slice[slice.length - 1].id : null

  return { messages: slice.reverse(), hasMore, nextCursor }
}

/** 滚动加载用：带归属校验，别人的会话一律当不存在。 */
export async function getMessagePage(
  ownerId: number,
  conversationId: number,
  beforeId: number | null,
  limit = PAGE_SIZE,
): Promise<MessagePage | null> {
  const owned = await findOwnConversation(ownerId, conversationId)
  if (!owned) return null
  return fetchMessagePage(conversationId, beforeId, limit)
}

/** 首屏用：连会话本身（标题、真实总条数）一起给，省一次往返。 */
export async function getConversationPage(ownerId: number, id: number, limit = PAGE_SIZE) {
  const conversation = await prisma.conversation.findFirst({
    where: { id, ownerId },
    select: {
      id: true,
      title: true,
      createdAt: true,
      _count: { select: { messages: true } },
    },
  })
  if (!conversation) return null

  const page = await fetchMessagePage(id, null, limit)

  return {
    conversation: {
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt,
      // 分页只给了最近 30 条，页头要显示真实总数，所以单独 count
      messageCount: conversation._count.messages,
    },
    ...page,
  }
}
