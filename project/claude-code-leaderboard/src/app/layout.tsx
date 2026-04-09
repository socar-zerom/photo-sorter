import type { Metadata } from 'next'
import './globals.css'
import Navbar from '@/components/Navbar'

export const metadata: Metadata = {
  title: 'Claude Code Leaderboard',
  description: '쏘카 Claude Code 사용량 리더보드',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-gray-950 text-white">
        <Navbar />
        <main className="max-w-4xl mx-auto px-4 pb-8">
          {children}
        </main>
      </body>
    </html>
  )
}
