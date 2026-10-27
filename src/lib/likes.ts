import 'server-only'; // 标记此文件只有服务端组件可以引用
import { prisma } from './prisma';

// 换存储层没动任何一个调用方：getLikeCount  / incrementLike
// 三个函数签名和返回结构跟 JSON 版本一模一样，所以 blog/page.tsx、
// like-box.tsx、actions.ts 一行都不用改。
// 这就是「把存储细节关进一个模块」的收益。

export async function getLikeCount(slug: string): Promise<number> {
  const row = await prisma.post.findUnique({
    where: { slug },
    select: { likeCount: true },
  });
  return row?.likeCount ?? 0; // 没这行数据 = 还没人点过
}


export async function incrementLike(slug: string): Promise<number> {
  // 这里故意不用 prisma.post.update，原因只有一个：
  // Post.updatedAt 挂的是 @updatedAt，Prisma 会在每次 update 时把它刷成当前时间。
  // 而列表页现在按 updatedAt desc 排 —— 点赞就会把文章顶到最前面。
  // 点赞不是「编辑」，不该动最后修改时间，所以绕开 Prisma 的参数注入，
  // 用原生 SQL 只改 likeCount；RETURNING 让它在同一条语句里把新值带回来，
  // 不用再发第二条 SELECT（并发下也不会读到别人刚改过的值）。
  const rows = await prisma.$queryRaw<{ likeCount: number }[]>`
    UPDATE "Post"
       SET "likeCount" = "likeCount" + 1
     WHERE "slug" = ${slug}
    RETURNING "likeCount"
  `;

  // 原来 update 未命中会抛 P2025；原生 SQL 只会安静地返回空数组，得自己判。
  if (rows.length === 0) throw new Error('文章不存在，无法点赞');

  return rows[0].likeCount;
}
