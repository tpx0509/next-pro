/**
 * 只放常量，不放任何 import —— 这样 proxy.ts 可以安全引用它。
 *
 * proxy 跑在每个请求的最前面，不能碰 next/headers 的 cookies()、
 * 也不该引 Prisma。原先是把 'session' 这个字符串在 proxy 和 lib/auth 里
 * 各写一份，靠注释提醒「记得同步」；拆出这个文件后就不存在漂移了。
 */
export const SESSION_COOKIE = 'session'
