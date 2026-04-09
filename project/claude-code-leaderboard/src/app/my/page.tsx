'use client'
import { useState, useEffect } from 'react'

const BIO_MAX_LENGTH = 50

/** 유니코드 문자 수 기준 길이 (이모지/특수문자도 1자) */
function unicodeLength(str: string): number {
  return [...str].length
}

function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toString()
}

export default function MyPage() {
  const [profile, setProfile] = useState<any>(null)
  const [sessions, setSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [bio, setBio] = useState('')
  const [bioSaving, setBioSaving] = useState(false)
  const [bioMessage, setBioMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/me')
      .then(res => res.json())
      .then(json => {
        setProfile(json.profile)
        setSessions(json.sessions || [])
        setBio(json.profile?.bio || '')
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-center py-12 text-gray-500">불러오는 중...</div>
  if (!profile) return <div className="text-center py-12 text-gray-500">프로필을 찾을 수 없습니다.</div>

  const totalTokens = sessions.reduce((sum: number, s: any) => sum + (s.total_tokens || 0), 0)

  // 일별 집계
  const dailyMap = new Map<string, number>()
  sessions.forEach((s: any) => {
    const date = new Date(s.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
    dailyMap.set(date, (dailyMap.get(date) || 0) + (s.total_tokens || 0))
  })

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
  const weekAgo = new Date(Date.now() - 7 * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })

  const todayTokens = dailyMap.get(today) || 0
  const yesterdayTokens = dailyMap.get(yesterday) || 0
  const weeklyTokens = Array.from(dailyMap.entries())
    .filter(([date]) => date >= weekAgo)
    .reduce((sum, [, tokens]) => sum + tokens, 0)

  const handleRegenerate = async () => {
    if (!confirm('토큰을 재발급하면 기존 토큰은 무효화됩니다. 터미널에서 curl 명령어를 다시 실행해야 합니다. 계속하시겠습니까?')) return
    const res = await fetch('/api/token/regenerate', { method: 'POST' })
    const json = await res.json()
    if (json.api_token) {
      setProfile({ ...profile, api_token: json.api_token })
      alert('토큰이 재발급되었습니다. 아래 curl 명령어를 다시 실행하세요.')
    }
  }

  const handleBioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    // 유니코드 기준 30자 초과 시 입력을 차단 (잘라냄)
    if (unicodeLength(value) > BIO_MAX_LENGTH) {
      // 30자까지만 허용
      const trimmed = [...value].slice(0, BIO_MAX_LENGTH).join('')
      setBio(trimmed)
      return
    }
    setBio(value)
    setBioMessage(null)
  }

  const handleBioSave = async () => {
    // 클라이언트 측 최종 검증
    if (unicodeLength(bio) > BIO_MAX_LENGTH) {
      setBioMessage({ type: 'error', text: `한줄 소개는 ${BIO_MAX_LENGTH}자 이내로 입력해주세요.` })
      return
    }
    setBioSaving(true)
    setBioMessage(null)
    try {
      const res = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bio: bio || null }),
      })
      const json = await res.json()
      if (!res.ok) {
        setBioMessage({ type: 'error', text: json.error || '저장에 실패했습니다.' })
      } else {
        setProfile({ ...profile, bio: json.profile?.bio ?? null })
        setBioMessage({ type: 'success', text: '저장되었습니다.' })
        setTimeout(() => setBioMessage(null), 2000)
      }
    } catch {
      setBioMessage({ type: 'error', text: '네트워크 오류가 발생했습니다.' })
    } finally {
      setBioSaving(false)
    }
  }

  const bioCharCount = unicodeLength(bio)
  const bioChanged = bio !== (profile?.bio || '')

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">내 대시보드</h1>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-100 rounded-lg p-4">
          <p className="text-sm text-gray-500">닉네임</p>
          <p className="text-xl font-bold mt-1 text-gray-900">{profile.nickname}</p>
        </div>
        <div className="bg-gray-100 rounded-lg p-4">
          <p className="text-sm text-gray-500">부서</p>
          <p className="text-xl font-bold mt-1 text-gray-900">{profile.department}</p>
        </div>
        <div className="bg-gray-100 rounded-lg p-4">
          <p className="text-sm text-gray-500">총 토큰</p>
          <p className="text-xl font-bold mt-1 text-gray-900">{formatTokens(totalTokens)}</p>
        </div>
      </div>

      <div className="bg-gray-100 rounded-lg p-4">
        <label className="block text-sm text-gray-500 mb-2">한줄 소개</label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={bio}
            onChange={handleBioChange}
            placeholder="30자 이내로 자신을 소개해보세요"
            /* maxLength 생략: HTML maxLength는 UTF-16 코드 유닛을 카운트하여
               이모지(surrogate pair) 입력 시 문제를 일으킬 수 있음.
               유니코드 문자 수 기반 제한은 handleBioChange에서 처리 */
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            onClick={handleBioSave}
            disabled={bioSaving || !bioChanged}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {bioSaving ? '저장 중...' : '저장'}
          </button>
        </div>
        <div className="flex justify-between items-center mt-1">
          <div>
            {bioMessage && (
              <span className={`text-sm ${bioMessage.type === 'success' ? 'text-green-600' : 'text-red-500'}`}>
                {bioMessage.text}
              </span>
            )}
          </div>
          <span className={`text-xs ${bioCharCount >= BIO_MAX_LENGTH ? 'text-red-500' : 'text-gray-400'}`}>
            {bioCharCount}/{BIO_MAX_LENGTH}
          </span>
        </div>
      </div>

      <div className="bg-gray-100 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-300 text-gray-500 text-sm">
              <th className="py-3 px-4 text-left">기간</th>
              <th className="py-3 px-4 text-right">사용량</th>
            </tr>
          </thead>
          <tbody className="text-gray-900">
            <tr className="border-b border-gray-200">
              <td className="py-3 px-4">어제</td>
              <td className="py-3 px-4 text-right font-mono">{formatTokens(yesterdayTokens)}</td>
            </tr>
            <tr className="border-b border-gray-200 bg-blue-50">
              <td className="py-4 px-4 font-semibold text-blue-700">오늘</td>
              <td className="py-4 px-4 text-right font-mono text-xl font-bold text-blue-700">{formatTokens(todayTokens)}</td>
            </tr>
            <tr>
              <td className="py-3 px-4">최근 7일 누적</td>
              <td className="py-3 px-4 text-right font-mono">{formatTokens(weeklyTokens)}</td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>
  )
}
