import { adminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const records = await req.json()
  const withUser = Array.isArray(records)
    ? records.map(r => ({ ...r, user_id: user.id }))
    : { ...records, user_id: user.id }

  const { error } = await adminClient.from('movimientos').insert(withUser)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
