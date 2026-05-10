import { getAuthedClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BancosClient } from './bancos-client'

export default async function BancosPage() {
  const { supabase, user } = await getAuthedClient()
  if (!user) redirect('/login')

  const { data: bancosCustom } = await supabase
    .from('bancos_custom')
    .select('*')
    .eq('user_id', user.id)
    .order('nombre')

  return <BancosClient bancosCustom={bancosCustom ?? []} />
}
