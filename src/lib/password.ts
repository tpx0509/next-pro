import 'server-only'
import bcrypt from 'bcryptjs'

/**
 * 为什么用 bcryptjs 而不是 bcrypt / argon2：
 * bcrypt 和 argon2 是原生扩展，在 Windows 上装它要么碰 ABI 版本，要么需要
 * Visual Studio 编译工具链 —— 这个项目已经被 better-sqlite3 坑过一次。
 * bcryptjs 是纯 JS 实现，同样的算法、同样的哈希串格式，代价是慢一点（几十毫秒）。
 *
 * cost = 10 是通行折中：单次校验约 50~100ms。
 * 太低了容易被离线爆破，太高了每次登录都把服务器 CPU 占住不放。
 */
const COST = 10

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST)
}

/** 校验密码。bcrypt 的 salt 和 cost 都存在哈希串里，所以不需要额外传参。 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}
