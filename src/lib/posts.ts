import 'server-only'; // 只有服务端组件能引用它，浏览器包不会误打进来
import { prisma } from './prisma';
import type { Prisma } from '@/generated/prisma/client';

// 类型从 schema 推导，不手写。
// 哪天给 Post 加了一列并加进下面的 select，这个类型会自动跟着变，
// 手写 type 则会悄悄和数据库漂移。
export type Post = Prisma.PostGetPayload<{
  select: { slug: true; title: true; body: true };
}>;

// 三个页面都按这个字段清单取，保持一致
const postSelect = { slug: true, title: true, body: true } as const;

/// 列表页用。按 position 排，不按 createdAt —— 因为批量导入的时间戳会重复。
export async function getPosts(): Promise<Post[]> {
  return prisma.post.findMany({
    orderBy: { position: 'asc' },
    select: postSelect,
  });
}

/// 详情页用。没这篇文章就返回 null，由调用方决定是 404 还是别的。
export async function getPost(slug: string): Promise<Post | null> {
  return prisma.post.findUnique({
    where: { slug },
    select: postSelect,
  });
}

/// 只取 slug，给 generateStaticParams / sitemap 这类只需要地址的场景用。
/// 单独写一个是为了不把 body 那几百字一起读出来。
export async function getAllPostSlugs(): Promise<string[]> {
  const rows = await prisma.post.findMany({
    orderBy: { position: 'asc' },
    select: { slug: true },
  });
  return rows.map((r) => r.slug);
}
