import { getLikeCount } from '@/lib/likes';
import { LikeButton } from './like-button';


export async function LikeBox({ slug } : { slug: string }) {
    const count = await getLikeCount(slug)
    return <LikeButton slug={slug} initialCount={count}></LikeButton>
}