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

  // La columna `tipo` es TEXT con CHECK en banco|billetera|crypto. Casteamos
  // al union type que espera el client (TypeScript no infiere del CHECK).
  type BancoTipo = 'banco' | 'billetera' | 'crypto'
  const safe = (bancosCustom ?? []).map(b => ({
    ...b,
    tipo: (['banco', 'billetera', 'crypto'].includes(b.tipo) ? b.tipo : 'banco') as BancoTipo,
  }))
  return <BancosClient bancosCustom={safe} />
}
