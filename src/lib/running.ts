import 'server-only'

/**
 * 「哪个会话正在生成」的注册表。
 *
 * 为什么必须存在内存里：
 * 生成过程跑在一个 HTTP 请求的闭包里，浏览器一刷新那个请求就没了。
 * 以前是靠 request.signal 把上游也一起掐掉，所以刷新 = 回答永久残缺。
 * 现在改成生成不跟着请求生死，但「用户点停止」还得能停 —— 那就需要一个
 * 请求之外的地方记着「这次生成的控制柄在哪」，也就是这个 Map。
 *
 * 为什么不进数据库：这个映射的有效期就是「进程活着」这段时间。
 * 进程一重启，正在生成的全都断了，留在库里反而是要清理的脏数据。
 *
 * 代价（写在这里免得以后踩）：多实例部署时请求可能落到另一台机器，
 * 在 A 机器点停止打不到 B 机器上正在跑的那次生成。真上多实例要换成
 * Redis 里的一个 key 加订阅，或者干脆把生成挪进队列。
 */
const running = new Map<number, AbortController>()

export function register(conversationId: number, ctrl: AbortController): void {
  running.set(conversationId, ctrl)
}

/**
 * 注销时只删自己那一个。
 *
 * 同一个会话可能连着来两次生成（比如用户点了重试，老的还没收尾），
 * 老的那次结束时如果无脑 delete，就会把新的 controller 一起抹掉，
 * 于是新那次再也停不下来。
 */
export function unregister(conversationId: number, ctrl: AbortController): void {
  if (running.get(conversationId) === ctrl) running.delete(conversationId)
}

/** 用户点停止。返回 false 表示这个会话当前没在生成（可能刚结束）。 */
export function stop(conversationId: number): boolean {
  const ctrl = running.get(conversationId)
  if (!ctrl) return false
  ctrl.abort()
  running.delete(conversationId)
  return true
}

/** 进程内这个会话是不是正在生成。用来识别「库里还写着 streaming 但早死了」的僵尸。 */
export function isRunning(conversationId: number): boolean {
  return running.has(conversationId)
}
