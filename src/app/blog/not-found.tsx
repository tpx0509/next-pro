import Link from "next/link";

export default function NotFound() {
    return (
        <div>文章不存在 <Link href='/blog'>返回列表</Link></div>
    )
}