import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteNav } from "@/components/site-nav";
import { UserMenu } from "@/components/user-menu";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Next",
    template: "%s | Next",
  },
  description: "三天掌握 App Router",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <header className="sticky top-0 z-50 border-b border-zinc-200/70 bg-white/80 backdrop-blur-md dark:border-zinc-800/70 dark:bg-zinc-950/80">
          <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-6">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="flex size-6 items-center justify-center rounded-md bg-zinc-900 font-mono text-[11px] font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">
                N
              </span>
              <span className="font-mono text-sm font-medium tracking-tight text-zinc-700 dark:text-zinc-300">
                next-learn
              </span>
            </Link>
            <SiteNav>
              {/* UserMenu 里 await cookies()，必须包 Suspense。
                  否则这个 layout 会变成阻塞预渲染，整站退化。 */}
              <Suspense fallback={null}>
                <UserMenu />
              </Suspense>
            </SiteNav>
          </div>
        </header>

        <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
          {children}
        </main>

        <footer className="border-t border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-6 text-xs text-zinc-400 dark:text-zinc-500">
            <span>Next.js 16 · App Router · Cache Components</span>
            <span className="font-mono">day 2 / 3</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
