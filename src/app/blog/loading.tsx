export default function Loading() {
    return (
        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            { [0, 1, 2].map((i) => (
                <div key={ i } className="flex items-center justify-between gap-6 py-5">
                    <div className="flex-1 animate-pulse space-y-2">
                        <div className="h-4 w-1/2 rounded bg-zinc-200 dark:bg-zinc-800" />
                        <div className="h-3 w-3/4 rounded bg-zinc-100 dark:bg-zinc-900" />
                    </div>
                    <div className="h-6 w-16 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-900" />
                </div>
            )) }
        </div>
    )
}
