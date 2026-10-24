import { posts } from './posts';
import Link from "next/link";

export const metadata = {
  title: "博客",
};


function renderPost() {
  return (
    <ul>
      { posts.map((post) => (
        <li key={post.slug}>
          <Link  href={`/blog/${post.slug}`}>
            { post.title }
          </Link>
        </li>
      )) }
    </ul>
  )
}

export default async function BlogPage() {
  await new Promise(r => setTimeout(r,1000))
  // throw new Error("测试错误")
  return (
    <div className="space-y-5">
        { renderPost() }
    </div>
  );
}
