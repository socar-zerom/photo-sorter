import { createServiceClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createServiceClient()

    const { data: user } = await supabase
      .from('users').select('id').eq('api_token', token).single()
    if (!user) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const body = await request.json()
    const { session_id, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens } = body

    // buddy 필드가 명시적으로 전송된 경우에만 처리
    const hasBuddy = typeof body.buddy === 'boolean'

    if (!session_id) return NextResponse.json({ error: 'session_id required' }, { status: 400 })

    // 필드별 상한 검증 (정상 사용량 max × 10 기준)
    const limits = {
      input_tokens: 10_000_000,
      output_tokens: 10_000_000,
      cache_read_tokens: 2_000_000_000,
      cache_write_tokens: 200_000_000,
    } as const
    const fields = { input_tokens, output_tokens, cache_read_tokens, cache_write_tokens } as const
    for (const [key, value] of Object.entries(fields)) {
      if (typeof value !== 'number' || value < 0 || value > limits[key as keyof typeof limits]) {
        return NextResponse.json({ error: `Invalid ${key}: must be 0-${limits[key as keyof typeof limits]}` }, { status: 400 })
      }
    }

    const { error } = await supabase.from('sessions').upsert(
      {
        user_id: user.id,
        session_id,
        input_tokens: input_tokens || 0,
        output_tokens: output_tokens || 0,
        cache_read_tokens: cache_read_tokens || 0,
        cache_write_tokens: cache_write_tokens || 0,
      },
      { onConflict: 'user_id,session_id' }
    )

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // buddy 필드가 명시적으로 전송된 경우에만 업데이트 (기존 클라이언트 호환성)
    if (hasBuddy) {
      await supabase.from('users').update({ buddy: body.buddy }).eq('id', user.id)
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
