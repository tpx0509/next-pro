import { posts,getPost } from '../posts';
import { LikeButton } from './like-button'

import { notFound } from "next/navigation"

// ① 配置导出：告诉 Next 这个变量能取哪些值
export function generateStaticParams() {
  // TODO: 返回 [{ slug: "..." }, ...] 形状的数组
  return posts
}


// ② 页面本体：必须是 default export，且因为要 await 所以是 async
export default async function Page({ params }: PageProps<"/blog/[slug]">) {
  // TODO 1: 从 params 取出 slug（params 是 Promise，必须 await）
  // TODO 2: 用 getPost(slug) 查，查不到就调 notFound()
  // TODO 3: return 一段 JSX，把 post.title 和 post.body 显示出来

  const { slug } = await params
  const post = getPost(slug)
  if(!post) notFound()

  return (
    <div>
      <div>{ post.title }<LikeButton slug={slug} /> </div>
      <div>{ post.body }</div>
    </div>
    
  )
}