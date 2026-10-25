import 'server-only'; // 标记此文件只有服务端组件可以引用
import { prisma } from './prisma';

// 换存储层没动任何一个调用方：getLikeCount / getAllLikes / incrementLike
// 三个函数签名和返回结构跟 JSON 版本一模一样，所以 blog/page.tsx、
// like-box.tsx、actions.ts 一行都不用改。
// 这就是「把存储细节关进一个模块」的收益。

export async function getLikeCount(slug: string): Promise<number> {
  const row = await prisma.like.findUnique({
    where: { slug },
    select: { count: true },
  });
  return row?.count ?? 0; // 没这行数据 = 还没人点过
}

// 批量读取：列表页一次拿走所有文章的点赞数，避免 N 次查询
export async function getAllLikes(): Promise<Record<string, number>> {
  const rows = await prisma.like.findMany({
    select: { slug: true, count: true },
  });
  return Object.fromEntries(rows.map((r) => [r.slug, r.count]));
}

export async function incrementLike(slug: string): Promise<number> {
  // upsert：有这行就 +1，没有就插入 count=1。
  // update 里的 count: { increment: 1 } 会落成 SQL 的 count = count + 1，
  // 在数据库里完成自增 —— 比「先读出来、加一、再写回」少一次竞态窗口。
  const row = await prisma.like.upsert({
    where: { slug },
    create: { slug, count: 1 },
    update: { count: { increment: 1 } },
    select: { count: true },
  });
  return row.count;
}
