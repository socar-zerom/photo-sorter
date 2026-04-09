'use client'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

export default function Navbar() {
  const pathname = usePathname()
  const publicPages = ['/login', '/signup']
  if (publicPages.includes(pathname)) return null

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const links = [
    { href: '/', label: '리더보드' },
    { href: '/my', label: '내 대시보드' },
  ]

  return (
    <nav className="border-b border-gray-800 mb-8">
      <div className="max-w-4xl mx-auto px-4 flex items-center justify-between h-14">
        <div className="flex items-center gap-6">
          <a href="/" className="font-bold text-lg">Claude Code Leaderboard</a>
          <div className="flex gap-1">
            {links.map(link => (
              <a
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 rounded-md text-sm transition ${
                  pathname === link.href
                    ? 'bg-gray-800 text-white font-medium'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                }`}
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="text-sm text-gray-500 hover:text-gray-300 cursor-pointer transition"
        >
          로그아웃
        </button>
      </div>
    </nav>
  )
}
