import { Suspense } from 'react'
import Link from 'next/link'
import { connection } from 'next/server'
import { getPost, getAllPostSlugs } from '@/lib/posts'
import { LikeBox } from './like-box'

import { notFound } from "next/navigation"

// ① 配置导出：列出这个路由要预渲染哪些 slug。
//    原来是 `return posts`（硬编码数组，同步）。数据进库后它变成 async，
//    必须真的查一次库 —— 这是全文唯一在 build 阶段碰 SQLite 的地方。
//
//    曾经想过干脆删掉它，结果 build 立刻报错：
//      Route "/blog/[slug]": Next.js encountered URL data `usePathname()`
//      in a Client Component outside of `<Suspense>`
//      at src/components/site-nav.tsx:12
//    原因：pathname 和 params 一样是「URL data」。没有 slug 清单时，
//    预渲染器不知道这个路由对应哪个具体地址，根布局里的 usePathname()
//    就永远拿不到值 —— 于是连壳都生成不出来。
//    反过来说：这个函数存在的意义，是让「壳」知道要为什么地址生成。
export async function generateStaticParams() {
  const slugs = await getAllPostSlugs()
  return slugs.map((slug) => ({ slug }))
}

// ⚠️ 这里本来想写 export const dynamicParams = false，让未知 slug 在路由层就 404。
//    实测被 Next 拒绝：
//      Error: Route segment config "dynamicParams" is not compatible with
//             nextConfig.cacheComponents. Please remove it.
//    也就是说 Cache Components（PPR）开启时这个开关不存在。
//    结论：拆成「壳 + Suspense 洞」之后，notFound() 只能在洞里抛，
//    而那时 200 状态已经随壳发出了 —— 未知 slug 会变成「软 404」：状态码 200，
//    但响应里带 <meta name="next-error" content="not-found"> 和 robots:noindex。
//    这是本拆法的固有代价，不是配置错误。


// ② 外壳（App Shell）：这个函数里没有任何 await params，
//    所以它的输出与 URL 无关，可以进入「所有指向本路由的链接共用一份」的预取。
export default function Page({ params }: PageProps<"/blog/[slug]">) {
  return (
    <article className="space-y-8">
      <Link
        href="/blog"
        className="inline-flex items-center gap-1.5 font-mono text-xs text-zinc-400 transition-colors hover:text-zinc-700 dark:hover:text-zinc-200"
      >
        ← 返回列表
      </Link>

      <Suspense fallback={<PostSkeleton />}>
        {/* 关键：把 params 这个 Promise 本身传下去，不要在这里 await 再传值。
            await 一旦发生在外层，壳就绑死在某一个 slug 上，预取无法复用。 */}
        <PostDetail params={params} />
      </Suspense>
    </article>
  )
}


// ③ 真正读 URL data + 查数据库的地方
//    只收 params —— PageProps 里 searchParams 也是必填，传下去没意义
type PostDetailProps = Pick<PageProps<"/blog/[slug]">, "params">

async function PostDetail({ params }: PostDetailProps) {
  // 闸要放在最前面：一旦下面开始查库，build 阶段的预渲染就真的会打开 SQLite。
  // 注意 await params 虽然也是挂起点，但它拦不住「build 时按参数逐个预渲染」。
  await connection()

  const { slug } = await params
  const post = await getPost(slug)
  // 查库查不到 → null，比原来 posts.find() 返回 undefined 更明确
  if (!post) notFound()

  return (
    <>
      <header className="space-y-5">
        <span className="block font-mono text-xs text-zinc-300 dark:text-zinc-600">
          /blog/{slug}
        </span>

        <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          {post.title}
        </h1>

        <Suspense
          fallback={<span className="text-sm text-zinc-400">读取点赞中…</span>}
        >
          <LikeBox slug={slug} />
        </Suspense>
      </header>

      <div className="mt-8 border-t border-zinc-200 pt-8 dark:border-zinc-800">
        <p className="text-[17px] leading-8 text-zinc-700 dark:text-zinc-300">
          {post.body}
        </p>
      </div>
    </>
  )
}


// ④ 骨架：形状与正文对齐，避免内容到达时页面跳动
function PostSkeleton() {
  return (
    <div className="animate-pulse space-y-5" aria-hidden>
      <div className="h-3 w-32 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-9 w-3/4 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-4 w-24 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="mt-8 space-y-3 border-t border-zinc-200 pt-8 dark:border-zinc-800">
        <div className="h-4 w-full rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-4 w-11/12 rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-4 w-4/5 rounded bg-zinc-200 dark:bg-zinc-800" />
      </div>
    </div>
  )
}
