import { Suspense } from 'react';
import { connection } from 'next/server';
import Link from 'next/link';
import { getPosts } from '@/lib/posts';
import { HeartIcon } from '@/components/heart-icon';
import { NewPostDialog } from './new-post-dialog';

export const metadata = {
  title: '博客1',
};

// 页面本体是同步的 —— 不碰数据库、没有 await，所以这一整层壳
// （标题 + 骨架）在构建期就能生成好，首屏立刻到达。
// 对比改造前：posts 是硬编码数组，连文章列表都能进壳，
// 现在列表在数据库里，只能进洞里 —— 这是「数据进库」的必然代价。
export default function BlogPage() {
  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">全部文章</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            文章与点赞数都来自数据库，每次请求重新读
          </p>
        </div>

        {/* 按钮 + 弹框都是客户端组件（要响应点击），但弹框里的表单提交后
            仍然由服务端的 action 落库。这个小组件不读 URL data，
            所以照样能进静态壳，跟标题一起在构建期生成好。 */}
        <NewPostDialog />
      </header>

      <Suspense fallback={<PostListSkeleton />}>
        <PostList />
      </Suspense>
    </div>
  );
}

// 唯一的动态洞：文章和点赞数在这里读。
// connection() 是第一道闸 —— build 的静态预渲染走到这里就停住交给 fallback，
// 根本不会打开 SQLite（否则构建 worker 会一直持有库文件句柄，60 秒后被判超时）。
async function PostList() {
  await connection();

  const posts= await getPosts()

  if (posts.length === 0) {
    return (
      <p className="py-10 text-sm text-zinc-500 dark:text-zinc-400">
        还没有文章。往 Post 表插一条就能看到。
      </p>
    );
  }

  return (
    <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
      {posts.map((post) => (
        <li
          key={post.slug}
          className="group flex items-start justify-between gap-6 py-5"
        >
          <Link href={`/blog/${post.slug}`} className="min-w-0 flex-1 space-y-1.5">
            <h2 className="font-medium tracking-tight transition-colors group-hover:text-teal-600 dark:group-hover:text-teal-400">
              {post.title}
            </h2>
            <p className="line-clamp-1 text-sm text-zinc-500 dark:text-zinc-400">
              {post.body}
            </p>
          </Link>

          <span className="mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-zinc-200 px-2.5 py-1 text-xs font-medium tabular-nums text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <HeartIcon className="size-3.5" />
            {post.likeCount}
          </span>
        </li>
      ))}
    </ul>
  );
}

// 骨架形状对齐真实行高，避免内容到达时页面跳动
function PostListSkeleton() {
  return (
    <div className="divide-y divide-zinc-200 dark:divide-zinc-800" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-start justify-between gap-6 py-5">
          <div className="min-w-0 flex-1 animate-pulse space-y-2">
            <div className="h-4 w-1/2 rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-3.5 w-11/12 rounded bg-zinc-100 dark:bg-zinc-900" />
          </div>
          <div className="mt-1 h-6 w-14 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-900" />
        </div>
      ))}
    </div>
  );
}
