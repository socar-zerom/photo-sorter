'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.endsWith('@socar.kr')) {
      setError('쏘카 이메일(@socar.kr)만 사용할 수 있습니다.')
      return
    }
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) setError(error.message)
    else setSent(true)
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <h1 className="text-2xl font-bold">메일을 확인하세요</h1>
        <p className="text-gray-400">{email}로 로그인 링크를 보냈습니다.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
      <h1 className="text-3xl font-bold">Claude Code Leaderboard</h1>
      <p className="text-gray-400">쏘카 이메일로 로그인하세요</p>
      <form onSubmit={handleLogin} className="flex flex-col gap-4 w-full max-w-sm">
        <input
          type="email"
          placeholder="name@socar.kr"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="px-4 py-3 bg-white text-gray-900 rounded-lg border border-gray-900 focus:border-blue-500 outline-none placeholder-gray-400"
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button type="submit" className="px-4 py-3 bg-blue-600 rounded-lg hover:bg-blue-500 active:bg-blue-700 active:scale-95 cursor-pointer font-medium transition">
          로그인 링크 받기
        </button>
      </form>
      <p className="text-gray-500 text-sm">
        처음이신가요? <a href="/signup" className="text-blue-400 hover:underline">가입하기</a>
      </p>
    </div>
  )
}
