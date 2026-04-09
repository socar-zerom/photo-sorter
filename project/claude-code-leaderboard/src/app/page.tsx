'use client'
import dynamic from 'next/dynamic'
import { useState, useEffect } from 'react'
import LeaderboardTable from '@/components/LeaderboardTable'
import CurlCommand from '@/components/CurlCommand'

const PeriodTabs = dynamic(() => import('@/components/PeriodTabs'), { ssr: false })
const RoleTabs = dynamic(() => import('@/components/RoleTabs'), { ssr: false })

const BADGE_TIERS = [
  { threshold: 10_000_000_000, emoji: '👑' },
  { threshold:  1_000_000_000, emoji: '💎' },
  { threshold:    500_000_000, emoji: '⚔️' },
  { threshold:    100_000_000, emoji: '🔥' },
  { threshold:     10_000_000, emoji: '⚡' },
  { threshold:              0, emoji: '🌱' },
]

function formatCompact(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toString()
}

export default function Home() {
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'all'>('daily')
  const [role, setRole] = useState<'all' | 'developer' | 'non-developer'>('all')
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [apiToken, setApiToken] = useState('')
  const [setupOpen, setSetupOpen] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchLeaderboard = (silent = false) => {
    if (!silent) setLoading(true)
    fetch(`/api/leaderboard?period=${period}&role=${role}`)
      .then(res => res.json())
      .then(json => {
        setData(json.data || [])
        setLoading(false)
        setLastUpdated(new Date())
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => {
    fetchLeaderboard()
  }, [period, role])

  // 1분마다 백그라운드 새로고침
  useEffect(() => {
    const interval = setInterval(() => fetchLeaderboard(true), 60000)
    return () => clearInterval(interval)
  }, [period, role])

  useEffect(() => {
    fetch('/api/me')
      .then(res => {
        if (!res.ok) throw new Error('unauthorized')
        return res.json()
      })
      .then(json => { if (json.profile?.api_token) setApiToken(json.profile.api_token) })
      .catch(() => setApiToken(''))
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <PeriodTabs value={period} onChange={setPeriod} />
        <RoleTabs value={role} onChange={setRole} />
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-400">
          {(() => {
            const now = new Date()
            const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
            if (period === 'daily') {
              return kst.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', timeZone: 'UTC' })
            }
            if (period === 'weekly') {
              const day = kst.getUTCDay()
              const daysSinceMonday = (day + 6) % 7
              const monday = new Date(kst.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000)
              const sunday = new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1000)
              const jan4 = new Date(Date.UTC(monday.getUTCFullYear(), 0, 4))
              const weekNum = Math.ceil(((monday.getTime() - jan4.getTime()) / (24 * 60 * 60 * 1000) + jan4.getUTCDay() + 1) / 7)
              const fmt = (d: Date) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}`
              return `${monday.getUTCFullYear()}년 W${weekNum} (${fmt(monday)} ~ ${fmt(sunday)})`
            }
            return '\u00A0'
          })()}
        </span>
        {lastUpdated && (
          <span className="text-xs text-gray-500">
            마지막 갱신: {lastUpdated.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
          </span>
        )}
      </div>
      <LeaderboardTable data={data} loading={loading} />

      <div className="flex items-center justify-between text-xs text-gray-500">
        <p>
          🌱 10M 미만 &nbsp;⚡ 10M+ &nbsp;🔥 100M+ &nbsp;⚔️ 500M+ &nbsp;💎 1B+ &nbsp;👑 10B+
        </p>
        {(() => {
          const me = (data as any[]).find((d: any) => d.isMe)
          if (!me) return null
          const tokens = me.all_time_tokens as number
          const tierIdx = BADGE_TIERS.findIndex(t => tokens >= t.threshold)
          const current = BADGE_TIERS[tierIdx]
          const next = tierIdx > 0 ? BADGE_TIERS[tierIdx - 1] : null
          const progress = next
            ? Math.min(((tokens - current.threshold) / (next.threshold - current.threshold)) * 100, 100)
            : 100
          return (
            <div className="flex items-center gap-2">
              <span>{current.emoji}</span>
              <div className="w-24 h-2 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${progress}%` }} />
              </div>
              <span>{next ? next.emoji : '✨'}</span>
              <span className="text-gray-600">{formatCompact(tokens)}</span>
            </div>
          )
        })()}
      </div>

      <div className="border border-gray-800 rounded-lg">
        <button
          onClick={() => setSetupOpen(!setupOpen)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-800 cursor-pointer transition rounded-lg"
        >
          <span>설치 명령어</span>
          <span className={`transition-transform ${setupOpen ? 'rotate-180' : ''}`}>▼</span>
        </button>
        {setupOpen && (
          <div className="px-4 pb-4">
            {apiToken ? (
              <CurlCommand token={apiToken} />
            ) : (
              <p className="text-sm text-gray-400">
                설치 명령어를 보려면 먼저 <a href="/signup" className="text-blue-400 hover:underline">가입</a>해주세요.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
