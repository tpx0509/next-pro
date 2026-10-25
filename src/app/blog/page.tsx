import { Suspense, cache } from 'react';
import { posts } from './posts';
import Link from "next/link";
import { getAllLikes } from '@/lib/likes';

export const metadata = {
  title: "博客1",
};

// 同一次请求内只读一次盘：三个 <LikeCount> 并发读取时共用这一次结果
// cache() 是「请求级去重」，和 "use cache"（跨请求缓存）完全是两件事
const getAllLikesOnce = cache(getAllLikes);

// 没有 "use cache" → 每次请求都真的去读文件
// await 本身就是挂起点，Suspense 边界接住它，于是这里成了一个「动态洞」
async function LikeCount({ slug }: { slug: string }) {
  const counts = await getAllLikesOnce();
  return <span>点赞 {counts[slug] ?? 0}</span>;
}


// 页面本体是同步的 —— 没有任何 await，所以这一整层壳可以构建期就生成好
export default function BlogPage() {
  return (
    <div className="space-y-5">
      <ul>
        {posts.map((post) => (
          <li key={post.slug}>
            <Link href={`/blog/${post.slug}`}>
              {post.title}
            </Link>
            <span className="ml-3 text-sm text-zinc-500">
              <Suspense fallback={<span className="text-zinc-400">点赞 …</span>}>
                <LikeCount slug={post.slug} />
              </Suspense>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

