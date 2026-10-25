import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // better-sqlite3 是原生模块（.node 二进制），不能被打进 server bundle。
  // 不加这行时 build 会在「Generating static pages」阶段卡住：
  //   Failed to build /blog/[slug]/page: ... took more than 60 seconds
  // 因为 Prisma 通过 adapter 调它时，打包后的 require 拿不到 .node 文件而挂起。
  serverExternalPackages: ['better-sqlite3', '@prisma/adapter-better-sqlite3'],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
