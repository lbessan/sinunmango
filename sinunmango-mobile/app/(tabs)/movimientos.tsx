import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { useTheme, STATIC_COLORS } from '@/context/ThemeContext'

// ─── Types ────────────────────────────────────────────────────────────────────
type Movimiento = {
  id:               string
  fecha:            string
  detalle:          string
  monto:            number
  moneda:           string
  tipo_movimiento:  string
  cuenta_nombre:    string | null
  categoria_nombre: string | null
  categoria_icono:  string | null
}

type Filtro = 'todos' | 'gastos' | 'ingresos'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

function formatFecha(iso: string) {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

// ─── Movimiento row ───────────────────────────────────────────────────────────
function MovRow({ mov }: { mov: Movimiento }) {
  const isGasto   = mov.tipo_movimiento === 'Gasto'
  const isIngreso = mov.tipo_movimiento === 'Ingreso'
  const icon = mov.categoria_icono ?? (isIngreso ? '💰' : isGasto ? '💸' : '↔️')
  const sign = isGasto ? '-' : isIngreso ? '+' : ''
  const montoColor = isGasto ? STATIC_COLORS.red : isIngreso ? STATIC_COLORS.green : STATIC_COLORS.textSecondary
  const symbol = mov.moneda === 'USD' ? 'USD ' : '$'

  return (
    <View style={s.row}>
      <View style={s.iconBox}>
        <Text style={s.icon}>{icon}</Text>
      </View>
      <View style={s.info}>
        <Text style={s.detalle} numberOfLines={1}>{mov.detalle || '—'}</Text>
        <Text style={s.sub}>
          {mov.cuenta_nombre ?? ''}
          {mov.cuenta_nombre ? '  ·  ' : ''}
          {formatFecha(mov.fecha)}
        </Text>
      </View>
      <View style={s.montoCol}>
        <Text style={[s.monto, { color: montoColor }]}>
          {sign}{symbol}{fmt(mov.monto)}
        </Text>
        {mov.moneda === 'USD' && (
          <Text style={s.monedaBadge}>USD</Text>
        )}
      </View>
    </View>
  )
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function MovimientosScreen() {
  const { colors } = useTheme()
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [filtro, setFiltro]           = useState<Filtro>('todos')
  const [loading, setLoading]         = useState(true)
  const [refreshing, setRefreshing]   = useState(false)

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) { setLoading(false); setRefreshing(false); return }

    let query = supabase
      .from('movimientos')
      .select('id, fecha, detalle, monto, moneda, tipo_movimiento, cuenta_origen, categorias(nombre_categoria, icono), cuentas!cuenta_origen(nombre_cuenta)')
      .eq('user_id', session.user.id)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100)

    if (filtro === 'gastos')   query = query.eq('tipo_movimiento', 'Gasto')
    if (filtro === 'ingresos') query = query.eq('tipo_movimiento', 'Ingreso')

    const { data } = await query

    const mapped: Movimiento[] = (data ?? []).map((m: any) => ({
      id:               m.id,
      fecha:            m.fecha,
      detalle:          m.detalle ?? '',
      monto:            Math.round(Number(m.monto)),
      moneda:           m.moneda,
      tipo_movimiento:  m.tipo_movimiento,
      cuenta_nombre:    m.cuentas?.nombre_cuenta ?? null,
      categoria_nombre: m.categorias?.nombre_categoria ?? null,
      categoria_icono:  m.categorias?.icono ?? null,
    }))

    setMovimientos(mapped)
    setLoading(false)
    setRefreshing(false)
  }, [filtro])

  useEffect(() => { load() }, [load])

  const total = movimientos.length

  const FILTROS: { key: Filtro; label: string }[] = [
    { key: 'todos',    label: 'Todos' },
    { key: 'gastos',   label: 'Gastos' },
    { key: 'ingresos', label: 'Ingresos' },
  ]

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: STATIC_COLORS.bgMain }]} edges={['top']}>

      {/* ── HEADER ── */}
      <View style={s.header}>
        <Text style={s.title}>Movimientos</Text>
      </View>

      {/* ── FILTROS ── */}
      <View style={s.filterBar}>
        <View style={s.filterPills}>
          {FILTROS.map(f => (
            <TouchableOpacity
              key={f.key}
              onPress={() => setFiltro(f.key)}
              style={[
                s.pill,
                filtro === f.key && { backgroundColor: colors.accent },
              ]}
              activeOpacity={0.8}
            >
              <Text style={[
                s.pillText,
                filtro === f.key && s.pillTextActive,
              ]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── COUNT ── */}
      <View style={s.countRow}>
        <Text style={s.countText}>
          {loading ? '...' : `${total} movimientos`}
        </Text>
      </View>

      {/* ── LIST ── */}
      {loading && !refreshing ? (
        <View style={s.center}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : (
        <FlatList
          data={movimientos}
          keyExtractor={m => m.id}
          renderItem={({ item }) => <MovRow mov={item} />}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={colors.accent}
            />
          }
          ListEmptyComponent={
            <View style={s.center}>
              <Text style={s.emptyText}>Sin movimientos</Text>
            </View>
          }
          ItemSeparatorComponent={() => <View style={s.separator} />}
        />
      )}
    </SafeAreaView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:   { flex: 1 },

  header: {
    paddingHorizontal: 20,
    paddingTop:        8,
    paddingBottom:     4,
  },
  title: {
    fontSize:   26,
    fontWeight: '800',
    color:      STATIC_COLORS.textPrimary,
    letterSpacing: -0.5,
  },

  filterBar: {
    paddingHorizontal: 16,
    paddingVertical:   10,
  },
  filterPills: {
    flexDirection: 'row',
    gap:           8,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical:   7,
    borderRadius:      20,
    backgroundColor:   STATIC_COLORS.bgCard,
    borderWidth:       1,
    borderColor:       STATIC_COLORS.border,
  },
  pillText: {
    fontSize:   13,
    fontWeight: '600',
    color:      STATIC_COLORS.textSecondary,
  },
  pillTextActive: {
    color: '#ffffff',
  },

  countRow: {
    paddingHorizontal: 20,
    marginBottom:      4,
  },
  countText: {
    fontSize:   12,
    color:      STATIC_COLORS.textMuted,
    fontWeight: '600',
  },

  listContent: {
    paddingHorizontal: 16,
    paddingBottom:     24,
    backgroundColor:   STATIC_COLORS.bgCard,
    marginHorizontal:  16,
    borderRadius:      16,
    borderWidth:       1,
    borderColor:       STATIC_COLORS.border,
    marginTop:         8,
    overflow:          'hidden',
  },

  row: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingVertical: 12,
    gap:             12,
  },
  separator: {
    height:          1,
    backgroundColor: STATIC_COLORS.border,
  },

  iconBox: {
    width:          40,
    height:         40,
    borderRadius:   12,
    backgroundColor: STATIC_COLORS.bgMain,
    borderWidth:    1,
    borderColor:    STATIC_COLORS.border,
    alignItems:     'center',
    justifyContent: 'center',
  },
  icon:    { fontSize: 20 },
  info:    { flex: 1, gap: 2 },
  detalle: { fontSize: 14, fontWeight: '600', color: STATIC_COLORS.textPrimary },
  sub:     { fontSize: 12, color: STATIC_COLORS.textMuted },

  montoCol: {
    alignItems: 'flex-end',
    gap:        2,
  },
  monto: {
    fontSize:   14,
    fontWeight: '700',
  },
  monedaBadge: {
    fontSize:      10,
    fontWeight:    '600',
    color:         STATIC_COLORS.textMuted,
    textAlign:     'right',
  },

  center: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 14,
    color:    STATIC_COLORS.textMuted,
  },
})
