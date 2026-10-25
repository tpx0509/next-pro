'use client';

export default function Error({ error, reset } : {
    error : Error & { digest?: string}
    reset : () => void
}) {
    return (
        <div className="flex flex-col items-start gap-5 rounded-xl border border-red-200 bg-red-50/50 p-8 dark:border-red-900/60 dark:bg-red-950/20">
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-red-500">
                error
            </span>

            <div className="space-y-1.5">
                <h2 className="text-lg font-medium tracking-tight">这一页出问题了</h2>
                <p className="font-mono text-sm leading-6 text-red-600/80 dark:text-red-400/80">
                    { error.message }
                </p>
                { error.digest && (
                    <p className="font-mono text-xs text-zinc-400">digest: { error.digest }</p>
                )}
            </div>

            <button
                onClick={ reset }
                className="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 active:scale-[0.97]"
            >
                重试
            </button>
        </div>
    )
}
