import { createClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('*').eq('id', user.id).single()

  const { data: sessions } = await supabase
    .from('sessions')
    .select('input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, total_tokens, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return NextResponse.json({ profile, sessions })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { bio } = body

  // bio가 null이면 초기화 허용, 문자열이면 30자 제한 검증 (유니코드 기준)
  if (bio !== null && bio !== undefined) {
    if (typeof bio !== 'string') {
      return NextResponse.json({ error: 'bio must be a string' }, { status: 400 })
    }
    if ([...bio].length > 50) {
      return NextResponse.json(
        { error: '한줄 소개는 50자 이내로 입력해주세요.' },
        { status: 400 }
      )
    }
  }

  const { data: profile, error } = await supabase
    .from('users')
    .update({ bio: bio ?? null })
    .eq('id', user.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ profile })
}
