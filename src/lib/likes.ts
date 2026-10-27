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
  const row = await prisma.post.update({
    where: { slug },
    data: { likeCount: { increment: 1 } },
    select: { likeCount: true },
  });
  return row.likeCount;
}
