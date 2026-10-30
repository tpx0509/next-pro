import 'server-only'
import { prisma } from './prisma'
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

/** 往回带的历史条数。太多既费 token，也会把最早的废话一直拖着。 */
const HISTORY_LIMIT = 20

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
 * 取最近 N 条历史给上游。
 *
 * 必须倒序取再反转：正序 take 20 拿到的是最早那 20 条，
 * 长会话里模型会看着十天前的开场白回答刚问的问题。
 */
export async function loadHistory(conversationId: number): Promise<ChatMessage[]> {
  const rows = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { id: 'desc' },
    take: HISTORY_LIMIT,
    select: { role: true, content: true },
  })

  return rows.reverse().map((m) => ({
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

export async function getConversationWithMessages(ownerId: number, id: number) {
  return prisma.conversation.findFirst({
    where: { id, ownerId },
    select: {
      id: true,
      title: true,
      createdAt: true,
      messages: {
        orderBy: { id: 'asc' },
        select: { id: true, role: true, content: true, createdAt: true },
      },
    },
  })
}
