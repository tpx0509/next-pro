'use client';

import { useState, useTransition } from "react";
import { likeAction } from "./actions";
import { HeartIcon } from "@/components/heart-icon";

export function LikeButton( { slug,initialCount }: { slug : string, initialCount: number }) {
    const [count,setCount] = useState(initialCount)
    const [pending,startTransition] = useTransition()
    return (
        <button
            onClick={() =>  startTransition(async () => {
                const next = await likeAction(slug);
                setCount(next)
            })}
            disabled={pending}
            aria-label="点赞"
            className="group inline-flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-zinc-700 active:scale-[0.97] disabled:cursor-progress disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
            <HeartIcon className="size-4 transition-transform duration-200 group-hover:scale-110" />
            <span className="tabular-nums">{count}</span>
        </button>
    )
}
