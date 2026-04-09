'use client'

type Entry = {
  rank: number
  nickname: string
  department: string
  total_tokens: number
  all_time_tokens: number
  buddy?: boolean
  bio?: string
  isMe?: boolean
}

const BADGE_TIERS = [
  { threshold: 10_000_000_000, emoji: '👑' }, // 레전드
  { threshold:  1_000_000_000, emoji: '💎' }, // 마스터
  { threshold:    500_000_000, emoji: '⚔️' }, // 히어로
  { threshold:    100_000_000, emoji: '🔥' }, // 파워유저
  { threshold:     10_000_000, emoji: '⚡' }, // 러너
  { threshold:              0, emoji: '🌱' }, // 새싹
]

function getBadge(allTimeTokens: number): string {
  return BADGE_TIERS.find(t => allTimeTokens >= t.threshold)?.emoji ?? '🌱'
}

function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toString()
}

export default function LeaderboardTable({ data, loading }: { data: Entry[]; loading: boolean }) {
  if (loading) {
    return <div className="text-center py-12 text-gray-500">불러오는 중...</div>
  }

  if (data.length === 0) {
    return <div className="text-center py-12 text-gray-500">아직 데이터가 없습니다.</div>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-800 text-gray-400 text-sm">
            <th className="py-3 px-4 text-left w-16">#</th>
            <th className="py-3 px-4 text-left w-full">닉네임</th>
            <th className="py-3 pl-0 pr-4 text-left whitespace-nowrap">부서</th>
            <th className="py-3 px-4 text-right whitespace-nowrap">사용량</th>
          </tr>
        </thead>
        <tbody>
          {data.map(entry => (
            <tr key={entry.rank}
              className={`border-b border-gray-800/50 ${entry.isMe ? 'bg-blue-500/10' : 'hover:bg-gray-800/50'}`}>
              <td className="py-3 px-4 font-mono text-gray-400">
                {entry.rank <= 3 ? ['\u{1F947}', '\u{1F948}', '\u{1F949}'][entry.rank - 1] : entry.rank}
              </td>
              <td className="py-3 px-4 font-medium">
                <span className="mr-1">{getBadge(entry.all_time_tokens)}</span>
                {entry.nickname}
                {entry.isMe && <span className="text-blue-400 text-xs ml-1">나</span>}
                {entry.bio && <span className="ml-5 text-sm text-gray-400 font-normal">{entry.bio}</span>}
              </td>
              <td className="py-3 pl-0 pr-4 text-gray-400 whitespace-nowrap">{entry.department}</td>
              <td className="py-3 px-4 text-right font-mono">{formatTokens(entry.total_tokens)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
