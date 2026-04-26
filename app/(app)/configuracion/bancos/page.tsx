import { adminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { BancosClient } from './bancos-client'

export default async function BancosPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const { data: bancosCustom } = await adminClient
    .from('bancos_custom')
    .select('*')
    .eq('user_id', user.id)
    .order('nombre')

  return <BancosClient bancosCustom={bancosCustom ?? []} />
}
