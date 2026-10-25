import { Suspense, cache } from 'react';
import { posts } from './posts';
import Link from "next/link";
import { getAllLikes } from '@/lib/likes';
import { HeartIcon } from '@/components/heart-icon';

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
  return <>{counts[slug] ?? 0}</>;
}


// 页面本体是同步的 —— 没有任何 await，所以这一整层壳可以构建期就生成好
export default function BlogPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">全部文章</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          点赞数没有缓存，每次请求都重新读一遍
        </p>
      </header>

      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
      {posts.map((post) => (
        <li
          key={post.slug}
          className="group flex items-start justify-between gap-6 py-5"
        >
          <Link
            href={`/blog/${post.slug}`}
            className="min-w-0 flex-1 space-y-1.5"
          >
            <h2 className="font-medium tracking-tight transition-colors group-hover:text-teal-600 dark:group-hover:text-teal-400">
              {post.title}
            </h2>
            <p className="line-clamp-1 text-sm text-zinc-500 dark:text-zinc-400">
              {post.body}
            </p>
          </Link>

          <span className="mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-zinc-200 px-2.5 py-1 text-xs font-medium tabular-nums text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <HeartIcon className="size-3.5" />
            <Suspense
              fallback={<span className="text-zinc-300 dark:text-zinc-600">…</span>}
            >
              <LikeCount slug={post.slug} />
            </Suspense>
          </span>
        </li>
      ))}
      </ul>
    </div>
  );
}
