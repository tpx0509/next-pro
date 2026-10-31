/**
 * 把 query / JSON body 里来的 id 解析成正整数，不合法返回 null。
 *
 * 为什么不能直接 `Number(x)`：
 * `Number(null)`、`Number('')`、`Number('  ')` 全都是 0，而 0 是整数，
 * 能顺利混过 `Number.isInteger` 那一关。结果就是「参数没传」和
 * 「这个会话不存在」报同一个 404 —— 排查的时候会怀疑半天权限，
 * 实际上是 URL 里少拼了一个变量。
 *
 * （`/api/chat/history` 那个 `before=` 空串踩的也是同一个坑，
 * 只是它把空串当「缺省」而不是「非法」，所以单独处理。）
 */
export function parseId(v: unknown): number | null {
  if (typeof v === 'number') {
    return Number.isInteger(v) && v > 0 ? v : null
  }
  if (typeof v === 'string') {
    const s = v.trim()
    if (!s) return null
    const n = Number(s)
    return Number.isInteger(n) && n > 0 ? n : null
  }
  return null
}
