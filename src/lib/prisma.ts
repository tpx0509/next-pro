import 'server-only';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '@/generated/prisma/client';

// Prisma 7 通过 driver adapter 连库：SQLite 走 better-sqlite3。
// 生成目录里的 client 是纯 TS 源码，由 Turbopack 和业务代码一起编译。
// PRISMA_LOG_SQL=1 时把 Prisma 真正发给 SQLite 的语句、参数、耗时打到终端。
// 默认关闭：query 事件有开销，生产环境不该开。
const logSql = process.env.PRISMA_LOG_SQL === '1';

function createPrisma() {
  const adapter = new PrismaBetterSqlite3({
    // 和 prisma7.config.ts 用同一个 DATABASE_URL，避免 CLI 和运行时连到两个不同的库
    url: process.env.DATABASE_URL ?? 'file:./prisma/dev.db',
  });

  if (!logSql) return new PrismaClient({ adapter });

  const client = new PrismaClient({
    adapter,
    log: [{ emit: 'event', level: 'query' }],
  });
  client.$on('query', (e) => {
    console.log(`\n\x1b[36m[SQL]\x1b[0m  ${e.query}`);
    console.log(`\x1b[90m[参数]\x1b[0m ${e.params}   \x1b[90m[耗时]\x1b[0m ${e.duration}ms`);
  });
  return client;
}

// dev 下组件热更新会反复执行模块顶层代码，每次都 new PrismaClient()
// 会不断堆积连接，最终报 "too many clients"。
// 把实例挂到 globalThis 上，热更新时复用同一个（生产环境只初始化一次，不需要）。
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
