import { connection } from 'next/server';
import { getLikeCount } from '@/lib/likes';
import { LikeButton } from './like-button';


export async function LikeBox({ slug } : { slug: string }) {
    // 等到请求到来才继续 —— 详见 blog/page.tsx 里的说明。
    // 这一行让 build 阶段不执行下面的查询，构建 worker 就不会持有 SQLite 句柄。
    await connection()
    const count = await getLikeCount(slug)
    return <LikeButton slug={slug} initialCount={count}></LikeButton>
}
