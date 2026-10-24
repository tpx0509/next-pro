// 唯一的数据源。两个页面都从这里读，保证它们看到的是同一批文章。
// 注意：这个文件不叫 page.tsx，所以它不会变成路由，只是普通模块。

export type Post = {
  slug: string;
  title: string;
  body: string;
};

export const posts: Post[] = [
  {
    slug: "what-is-next",
    title: "第一篇：Next.js 到底是什么",
    body: "React 只负责把数据变成 DOM，剩下的路由、渲染、打包、后端接口都由 Next.js 补齐。",
  },
  {
    slug: "file-routing",
    title: "第二篇：目录即路由",
    body: "没有路由表。app 目录下的文件夹结构，就是 URL 的结构。只有 page.tsx 会对外暴露地址。",
  },
  {
    slug: "server-component",
    title: "第三篇：服务端组件是默认值",
    body: "在 app 目录里写的组件默认跑在服务端，不能写 useState 和 onClick。要交互才加 use client。",
  },
];

export function getPost(slug: string): Post | undefined {
  return posts.find((p) => p.slug === slug);
}
