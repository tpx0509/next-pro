'use client';

import { useState } from "react";

export function LikeButton(props: { slug : string}) {
    const [liked,setLiked] = useState(false)
    return (
        <button onClick={() =>  setLiked(!liked) }>{ liked ? '已赞' : '点赞' }</button>
    )
}