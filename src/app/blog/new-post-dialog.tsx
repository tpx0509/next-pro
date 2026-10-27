'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { createPostAction, type CreatePostState } from './actions'

const initialState: CreatePostState = { status: 'idle' }

// 整个弹框只用原生 <dialog>：
// - showModal() 之后背景自动 inert（点不到、Tab 跳不进去）
// - ESC 关闭、焦点被困在弹框里，都是浏览器给的，不用手写
// - 弹框渲染在 top layer，不受父级 z-index / overflow 影响
// 自己写一个 fixed 遮罩 div 要把这三件事都重做一遍，还容易漏。
export function NewPostDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null)

  // 每次打开都换一个 key，把里面的表单整个重建。
  // 不这么做的话：发布成功后 useActionState 里还存着 status:'ok'，
  // 下次打开会先看到上一次的「已发布」提示，表单也还是那份旧状态。
  const [formSeq, setFormSeq] = useState(0)

  function openDialog() {
    setFormSeq((n) => n + 1)
    dialogRef.current?.showModal()
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="shrink-0 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        新增文章
      </button>

      <dialog
        ref={dialogRef}
        // 原生 dialog 不会因为点背景就关闭，得自己判：点在 dialog 元素本身
        // （也就是遮罩层，它的 padding 之外）才算点背景。
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close()
        }}
        className="m-auto w-[min(92vw,32rem)] rounded-xl border border-zinc-200 bg-white p-5 text-zinc-900 shadow-lg backdrop:bg-zinc-950/70 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
      >
        <PostForm key={formSeq} dialogRef={dialogRef} />
      </dialog>
    </>
  )
}

function PostForm({
  dialogRef,
}: {
  dialogRef: React.RefObject<HTMLDialogElement | null>
}) {
  const [state, formAction, pending] = useActionState(
    createPostAction,
    initialState,
  )

  // 发布成功 → 关弹框。列表会在 action 里 revalidatePath 后自动刷新。
  useEffect(() => {
    if (state.status === 'ok') dialogRef.current?.close()
  }, [state, dialogRef])

  return (
    <form action={formAction} className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium tracking-tight">写一篇新文章</h2>
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          className="rounded-md px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          关闭
        </button>
      </div>

      <input
        name="title"
        placeholder="标题"
        required
        maxLength={80}
        autoFocus
        className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-teal-500 dark:border-zinc-700 dark:focus:border-teal-500"
      />

      <textarea
        name="body"
        placeholder="内容"
        required
        rows={5}
        className="w-full resize-y rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm leading-6 outline-none transition-colors placeholder:text-zinc-400 focus:border-teal-500 dark:border-zinc-700 dark:focus:border-teal-500"
      />

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-progress disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {pending ? '发布中…' : '发布'}
        </button>

        {state.status === 'error' && (
          <p className="text-xs text-red-500">{state.message}</p>
        )}
      </div>
    </form>
  )
}
