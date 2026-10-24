'use client';

export default function Error({ error, reset } : {
    error : Error & { digest?: string}
    reset : () => void
}) {
    return (
        <div>
            { error.message }
            <button className="ml-5" onClick={ reset }>重试</button>
        </div>
    )
}