import { Suspense } from 'react'
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
    <div>
      <div>
        { post.title }
        <Suspense fallback={<span>…</span>}>
          <LikeBox slug={slug} />
        </Suspense>
      </div>
      <div>{ post.body }</div>
    </div>

  )
}
