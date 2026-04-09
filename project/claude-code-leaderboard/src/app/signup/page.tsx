'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import CurlCommand from '@/components/CurlCommand'

type Step = 'email' | 'verify' | 'profile' | 'done'

export default function SignupPage() {
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [nickname, setNickname] = useState('')
  const [department, setDepartment] = useState('')
  const [role, setRole] = useState<'developer' | 'non-developer'>('developer')
  const [apiToken, setApiToken] = useState('')
  const [error, setError] = useState('')

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.endsWith('@socar.kr')) {
      setError('쏘카 이메일(@socar.kr)만 사용할 수 있습니다.')
      return
    }
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/signup` },
    })
    if (error) setError(error.message)
    else setStep('verify')
  }

  const handleProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('로그인 상태가 아닙니다.'); return }

    const token = crypto.randomUUID()
    const { error } = await supabase.from('users').insert({
      id: user.id,
      email: user.email,
      nickname,
      department,
      role,
      api_token: token,
    })
    if (error) { setError(error.message); return }

    setApiToken(token)
    setStep('done')
  }

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase.from('users').select('api_token').eq('id', user.id).single()
        if (data) {
          setApiToken(data.api_token)
          setStep('done')
        } else {
          setEmail(user.email || '')
          setStep('profile')
        }
      }
    }
    checkAuth()
  }, [])

  if (step === 'verify') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <h1 className="text-2xl font-bold">메일을 확인하세요</h1>
        <p className="text-gray-400">{email}로 인증 링크를 보냈습니다.</p>
        <p className="text-gray-500 text-sm">링크를 클릭하면 자동으로 돌아옵니다.</p>
      </div>
    )
  }

  if (step === 'profile') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <h1 className="text-2xl font-bold">프로필 설정</h1>
        <form onSubmit={handleProfile} className="flex flex-col gap-4 w-full max-w-sm">
          <div>
            <label className="text-sm text-gray-400 mb-1 block">닉네임</label>
            <input type="text" required value={nickname}
              onChange={e => setNickname(e.target.value)}
              placeholder="리더보드에 표시될 이름"
              className="w-full px-4 py-3 bg-white text-gray-900 rounded-lg border border-gray-900 focus:border-blue-500 outline-none placeholder-gray-400" />
          </div>
          <div>
            <label className="text-sm text-gray-400 mb-1 block">부서</label>
            <input type="text" required value={department}
              onChange={e => setDepartment(e.target.value)}
              placeholder="소속 부서명"
              className="w-full px-4 py-3 bg-white text-gray-900 rounded-lg border border-gray-900 focus:border-blue-500 outline-none placeholder-gray-400" />
          </div>
          <div>
            <label className="text-sm text-gray-400 mb-1 block">역할</label>
            <div className="flex gap-3">
              <button type="button" onClick={() => setRole('developer')}
                className={`flex-1 py-3 rounded-lg border cursor-pointer active:scale-95 transition ${role === 'developer' ? 'border-blue-500 bg-blue-500/20' : 'border-gray-700 bg-gray-800 hover:bg-gray-700'}`}>
                개발자
              </button>
              <button type="button" onClick={() => setRole('non-developer')}
                className={`flex-1 py-3 rounded-lg border cursor-pointer active:scale-95 transition ${role === 'non-developer' ? 'border-blue-500 bg-blue-500/20' : 'border-gray-700 bg-gray-800 hover:bg-gray-700'}`}>
                비개발자
              </button>
            </div>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button type="submit" className="px-4 py-3 bg-blue-600 rounded-lg hover:bg-blue-500 active:bg-blue-700 active:scale-95 cursor-pointer font-medium transition">완료</button>
        </form>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <h1 className="text-2xl font-bold">설정 완료!</h1>
        <CurlCommand token={apiToken} />
        <a href="/" className="text-blue-400 hover:underline">리더보드 보기 →</a>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
      <h1 className="text-3xl font-bold">가입하기</h1>
      <p className="text-gray-400">쏘카 이메일로 가입하세요</p>
      <form onSubmit={handleSendEmail} className="flex flex-col gap-4 w-full max-w-sm">
        <input type="email" placeholder="name@socar.kr"
          value={email} onChange={e => setEmail(e.target.value)}
          className="px-4 py-3 bg-white text-gray-900 rounded-lg border border-gray-900 focus:border-blue-500 outline-none placeholder-gray-400" />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button type="submit" className="px-4 py-3 bg-blue-600 rounded-lg hover:bg-blue-500 active:bg-blue-700 active:scale-95 cursor-pointer font-medium transition">인증 메일 보내기</button>
      </form>
      <p className="text-gray-500 text-sm">
        이미 가입하셨나요? <a href="/login" className="text-blue-400 hover:underline">로그인</a>
      </p>
    </div>
  )
}
