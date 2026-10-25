'use client';

import { useState, useTransition } from "react";
import { likeAction } from "./actions";

export function LikeButton( { slug,initialCount }: { slug : string, initialCount: number }) {
    const [count,setCount] = useState(initialCount)
    const [pending,startTransition] = useTransition()
    return (
        <button onClick={() =>  startTransition(async () => {
            const next = await likeAction(slug);
            setCount(next)
        })} disabled={pending}>点赞{count}次</button>
    )
}