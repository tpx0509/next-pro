import { NextResponse, type NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import { createDocument, listDocuments } from '@/lib/documents'
import { extractText, titleFromFilename } from '@/lib/extract'

// Route Handler：和 Server Action 的分工
// ------------------------------------------------------------------
// Server Action 适合「表单字段 → 写库」，数据是普通字符串，走 RSC 协议。
// 但文件上传不一样：Server Action 的请求体有默认 1MB 上限，而且它期待
// 拿回一段 RSC payload（客户端要能接着渲染）。传二进制文件更合适的是
// 老老实实的 multipart/form-data —— 浏览器原生表单就能发，
// 前端不写一行 JS 也能用。这就是要有一个 Route Handler 的原因。

/** 表单提交后统一回列表页。303 而不是 307：307 会把 POST 原样重放，
 *  浏览器跟着跳到 /documents 又发一次 POST，变成「刷新就问你要不要重发」。 */
function backTo(request: NextRequest, query: Record<string, string>) {
  const url = new URL('/documents', request.url)
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  return NextResponse.redirect(url, 303)
}

export async function POST(request: NextRequest) {
  // Route Handler 不在 proxy 的 matcher 里（matcher 只列了页面路径），
  // 所以这里必须自己判身份 —— 而且判的是「Session 表里有没有这一行」。
  const user = await getCurrentUser()
  if (!user) return backTo(request, { error: '登录已失效，请重新登录' })

  const form = await request.formData()
  const file = form.get('file')

  // form.get 返回 FormDataEntryValue（string | File）。
  // 用户在没选文件的情况下提交，拿到的是空字符串，不是 File。
  if (!(file instanceof File)) {
    return backTo(request, { error: '没有选择文件' })
  }

  const extracted = await extractText(file)
  if (!extracted.ok) return backTo(request, { error: extracted.error })

  try {
    const doc = await createDocument({
      ownerId: user.id,
      title: titleFromFilename(file.name),
      content: extracted.text,
    })

    // 列表页是 RSC 渲染的，这一趟跳转虽然会重新请求，
    // 但客户端路由缓存里可能还留着旧的一份，标记失效更稳。
    revalidatePath('/documents')

    return backTo(request, { added: doc.title })
  } catch (e) {
    console.error('[upload]', e)
    return backTo(request, { error: e instanceof Error ? e.message : '保存失败' })
  }
}

/** GET 用来给外部（A 阶段的对答流程、以后接的 Agent、curl）读文档列表。
 *  页面用 RSC 直接查库，不需要绕这一圈；这个接口存在的意义是「给非页面消费者」。 */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const docs = await listDocuments(user.id)
  return NextResponse.json({
    documents: docs.map((d) => ({
      id: d.id,
      title: d.title,
      chars: d.content.length,
      createdAt: d.createdAt,
    })),
  })
}
