import { Suspense } from 'react'
import Link from 'next/link'
import { posts, getPost } from '../posts';
import { LikeBox } from './like-box';

import { notFound } from "next/navigation"

// ① 配置导出：告诉 Next 这个变量能取哪些值
export function generateStaticParams() {
  return posts
}


// ② 页面本体：必须是 default export，且因为要 await 所以是 async
export default async function Page({ params }: PageProps<"/blog/[slug]">) {
  const { slug } = await params
  const post = getPost(slug)
  if(!post) notFound()

  return (
    <article className="space-y-8">
      <header className="space-y-5">
        <div className="flex items-center justify-between">
          <Link
            href="/blog"
            className="inline-flex items-center gap-1.5 font-mono text-xs text-zinc-400 transition-colors hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            ← 返回列表
          </Link>
          <span className="font-mono text-xs text-zinc-300 dark:text-zinc-600">
            /blog/{slug}
          </span>
        </div>

        <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          {post.title}
        </h1>

        <Suspense
          fallback={<span className="text-sm text-zinc-400">读取点赞中…</span>}
        >
          <LikeBox slug={slug} />
        </Suspense>
      </header>

      <div className="border-t border-zinc-200 pt-8 dark:border-zinc-800">
        <p className="text-[17px] leading-8 text-zinc-700 dark:text-zinc-300">
          {post.body}
        </p>
      </div>
    </article>
  )
}
