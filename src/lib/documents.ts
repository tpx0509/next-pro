import 'server-only'
import { prisma } from './prisma'
import type { Prisma } from '@/generated/prisma/client'

// 列表不需要 content（可能是几十万字），所以单独定一个 select。
// 类型照样从 schema 推导，不手写。
export type DocumentSummary = Prisma.DocumentGetPayload<{
  select: { id: true; title: true; content: true; createdAt: true }
}>

/// 只取当前用户的文档。ownerId 一定要进 where —— 这是多租户隔离的底线，
/// 少了它任何人都能按 id 翻别人的知识库。
export async function listDocuments(ownerId: number): Promise<DocumentSummary[]> {
  return prisma.document.findMany({
    where: { ownerId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, content: true, createdAt: true },
  })
}

export async function countDocuments(ownerId: number): Promise<number> {
  return prisma.document.count({ where: { ownerId } })
}

export async function createDocument(input: {
  ownerId: number
  title: string
  content: string
}): Promise<{ id: number; title: string }> {
  const title = input.title.trim()
  const content = input.content.trim()

  if (!title) throw new Error('标题不能为空')
  if (!content) throw new Error('内容不能为空')
  if (title.length > 120) throw new Error('标题最多 120 个字')

  return prisma.document.create({
    data: { ownerId: input.ownerId, title, content },
    select: { id: true, title: true },
  })
}

/// 文档详情（A 阶段问答要拿全文）。显式带 ownerId，防止猜 id 读到别人的。
export async function getDocument(ownerId: number, id: number) {
  return prisma.document.findFirst({
    where: { id, ownerId },
    select: { id: true, title: true, content: true, createdAt: true },
  })
}
