import { createClient, createServiceClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import { SupabaseClient } from '@supabase/supabase-js'

const PAGE_SIZE = 1000

async function fetchAllSessions(client: SupabaseClient, sinceDate: string | null) {
  const rows: { user_id: string; total_tokens: number }[] = []
  let from = 0
  while (true) {
    let q = client.from('sessions').select('user_id, total_tokens').range(from, from + PAGE_SIZE - 1)
    if (sinceDate) q = q.gte('created_at', sinceDate)
    const { data, error } = await q
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return rows
}

function aggregateByUser(sessions: { user_id: string; total_tokens: number }[]) {
  const totals = new Map<string, number>()
  for (const s of sessions) {
    totals.set(s.user_id, (totals.get(s.user_id) || 0) + (s.total_tokens || 0))
  }
  return totals
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const period = searchParams.get('period') || 'all'
  const role = searchParams.get('role') || 'all'

  const validPeriods = ['daily', 'weekly', 'all']
  const validRoles = ['all', 'developer', 'non-developer']
  if (!validPeriods.includes(period) || !validRoles.includes(role)) {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
  }

  // 기간 필터 계산 (KST 기준)
  let sinceDate: string | null = null
  const now = new Date()
  const kstOffset = 9 * 60 * 60 * 1000
  const kstNow = new Date(now.getTime() + kstOffset)
  const kstToday = kstNow.toISOString().split('T')[0]

  if (period === 'daily') {
    sinceDate = new Date(`${kstToday}T00:00:00+09:00`).toISOString()
  } else if (period === 'weekly') {
    // ISO 8601 주차: 월요일 시작
    const kstDay = kstNow.getUTCDay() // 0=일 ~ 6=토
    const daysSinceMonday = (kstDay + 6) % 7 // 월=0, 화=1, ..., 일=6
    const monday = new Date(kstNow.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000)
    const mondayDate = monday.toISOString().split('T')[0]
    sinceDate = new Date(`${mondayDate}T00:00:00+09:00`).toISOString()
  }

  const serviceClient = createServiceClient()

  try {
    // 기간별 sessions + all-time sessions 페이지네이션으로 전체 조회
    const [periodSessions, allTimeSessions] = await Promise.all([
      fetchAllSessions(serviceClient, sinceDate),
      period === 'all' ? Promise.resolve(null) : fetchAllSessions(serviceClient, null),
    ])

    const userTotals = aggregateByUser(periodSessions)
    const userAllTimeTotals = allTimeSessions ? aggregateByUser(allTimeSessions) : userTotals

    // 사용량이 있는 사용자만 조회
    const userIds = Array.from(userTotals.keys())
    if (userIds.length === 0) {
      return NextResponse.json({ data: [] })
    }

    let usersQuery = serviceClient
      .from('users')
      .select('id, nickname, department, role, buddy, bio')
      .in('id', userIds)

    if (role !== 'all') {
      usersQuery = usersQuery.eq('role', role)
    }

    const { data: users, error: usersError } = await usersQuery
    if (usersError) return NextResponse.json({ error: usersError.message }, { status: 500 })

    // 순위 계산
    const result = (users || [])
      .map(u => ({
        user_id: u.id,
        nickname: u.nickname,
        department: u.department,
        role: u.role,
        buddy: u.buddy ?? false,
        bio: u.bio || '',
        total_tokens: userTotals.get(u.id) || 0,
        all_time_tokens: userAllTimeTotals.get(u.id) || 0,
        isMe: u.id === user.id,
      }))
      .filter(u => u.total_tokens > 0)
      .sort((a, b) => b.total_tokens - a.total_tokens)
      .map((u, i) => ({ ...u, rank: i + 1 }))

    return NextResponse.json({ data: result })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
