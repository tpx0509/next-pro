import 'server-only'

/**
 * 把上传的文件变成纯文本。
 *
 * 为什么先抽成纯文本再入库：
 * RAG 的下一步是「切块 → embedding」，两者都只吃文本。原文的排版、图片、
 * 页眉页脚对检索没有意义，先丢在抽取这一步，后面的管道就不用重复处理。
 * 原始文件本身没存（Document 表只有 content），要留原文件的话得加
 * 一个存磁盘/对象存储的字段 —— 目前的取舍是「先跑通链路」。
 */

export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

/** 允许的扩展名。按扩展名判断，不信任客户端的 MIME —— 它可以随便写。 */
export const ALLOWED_EXTENSIONS = ['.txt', '.md', '.markdown', '.pdf', '.docx'] as const

export type ExtractResult =
  | { ok: true; text: string }
  | { ok: false; error: string }

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot === -1 ? '' : filename.slice(dot).toLowerCase()
}

export function titleFromFilename(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return (dot === -1 ? filename : filename.slice(0, dot)).trim() || '未命名文档'
}

export async function extractText(file: File): Promise<ExtractResult> {
  const ext = extensionOf(file.name)

  if (!ALLOWED_EXTENSIONS.includes(ext as (typeof ALLOWED_EXTENSIONS)[number])) {
    return { ok: false, error: `暂不支持 ${ext || '无扩展名'} 的文件` }
  }

  if (file.size === 0) return { ok: false, error: '文件是空的' }
  if (file.size > MAX_FILE_SIZE) {
    return { ok: false, error: `文件超过 ${MAX_FILE_SIZE / 1024 / 1024}MB` }
  }

  try {
    // 纯文本直接用 File.text()。这是 Web 标准的 File API，
    // Node 20+ 原生支持（File 继承自 Blob），所以服务端也能用同一套。
    if (ext === '.txt' || ext === '.md' || ext === '.markdown') {
      const text = await file.text()
      return text.trim() ? { ok: true, text } : { ok: false, error: '文件里没有文字内容' }
    }

    if (ext === '.pdf') {
      // unpdf 打包了一份为 serverless 裁剪过的 pdf.js，不需要 worker、
      // 不需要 canvas，纯 Node 环境就能跑。动态 import：只有真的传 PDF 时
      // 才付这份解析器的加载成本。
      const { extractText: extractPdfText } = await import('unpdf')
      const { text } = await extractPdfText(new Uint8Array(await file.arrayBuffer()), {
        mergePages: true,
      })
      return text.trim()
        ? { ok: true, text }
        : { ok: false, error: 'PDF 里没抽出文字（可能是扫描件，需要 OCR）' }
    }

    // .docx：mammoth 把 OOXML 里的文本节点抽出来，忽略样式和图片。
    // 注意它只认 docx（zip 包），老的二进制 .doc 解析不了 —— 那种文件
    // 得先另存为 docx，或者上 LibreOffice 转换。
    const mammoth = (await import('mammoth')).default
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(await file.arrayBuffer()) })
    return value.trim()
      ? { ok: true, text: value }
      : { ok: false, error: '文档里没抽出文字' }
  } catch (e) {
    // 解析器抛错大多是因为文件损坏或者扩展名撒谎（把 jpg 改成 .pdf）。
    // 不把原始异常抛给用户看，但留在服务端日志里方便排查。
    console.error('[extractText]', file.name, e)
    return { ok: false, error: '文件解析失败，可能已损坏或扩展名不符' }
  }
}
