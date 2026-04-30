import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/context/ThemeContext'

// ─── Types ────────────────────────────────────────────────────────────────────
type Movimiento = {
  id: string; fecha: string; detalle: string; monto: number; moneda: string
  tipo_movimiento: string
  cuenta_nombre: string | null; categoria_nombre: string | null; categoria_icono: string | null
}

type Filtro    = 'todos' | 'gastos' | 'ingresos'
type FechaKey  = 'todos' | 'este_mes' | 'mes_anterior' | 'esta_semana'

const FECHA_LABELS: Record<FechaKey, string> = {
  todos:         'Todos',
  este_mes:      'Este mes',
  mes_anterior:  'Mes anterior',
  esta_semana:   'Esta semana',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

function formatFecha(iso: string) {
  const d    = new Date(iso + 'T12:00:00')
  const hoy  = new Date()
  const ayer = new Date(); ayer.setDate(hoy.getDate() - 1)
  if (d.toDateString() === hoy.toDateString())  return 'Hoy'
  if (d.toDateString() === ayer.toDateString()) return 'Ayer'
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

function buildDateFilter(key: FechaKey): { gte?: string; lt?: string } {
  const now = new Date()
  if (key === 'este_mes') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end   = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    return { gte: start.toISOString().slice(0, 10), lt: end.toISOString().slice(0, 10) }
  }
  if (key === 'mes_anterior') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const end   = new Date(now.getFullYear(), now.getMonth(), 1)
    return { gte: start.toISOString().slice(0, 10), lt: end.toISOString().slice(0, 10) }
  }
  if (key === 'esta_semana') {
    const day   = now.getDay()  // 0=Dom
    const start = new Date(now); start.setDate(now.getDate() - day)
    const end   = new Date(now); end.setDate(start.getDate() + 7)
    return { gte: start.toISOString().slice(0, 10), lt: end.toISOString().slice(0, 10) }
  }
  return {}
}

// ─── Movimiento row ───────────────────────────────────────────────────────────
function MovRow({ mov, theme }: { mov: Movimiento; theme: ReturnType<typeof useTheme>['theme'] }) {
  const isGasto   = mov.tipo_movimiento === 'Gasto'
  const isIngreso = mov.tipo_movimiento === 'Ingreso'
  const icon      = mov.categoria_icono ?? (isIngreso ? '💰' : isGasto ? '💸' : '↔️')
  const sign      = isGasto ? '-' : isIngreso ? '+' : ''
  const montoColor = isGasto ? theme.expense : isIngreso ? theme.income : theme.textSec
  const symbol    = mov.moneda === 'USD' ? 'USD ' : '$'

  return (
    <View style={[row.wrap, { borderBottomColor: theme.border }]}>
      <View style={[row.iconBox, { backgroundColor: theme.surfaceAlt }]}>
        <Text style={row.icon}>{icon}</Text>
      </View>
      <View style={row.info}>
        <Text style={[row.detalle, { color: theme.text }]} numberOfLines={1}>
          {mov.detalle || '—'}
        </Text>
        <Text style={[row.sub, { color: theme.textSec }]}>
          {mov.cuenta_nombre ?? ''}{mov.cuenta_nombre ? '  ·  ' : ''}{formatFecha(mov.fecha)}
        </Text>
      </View>
      <View style={row.right}>
        <Text style={[row.monto, { color: montoColor }]}>{sign}{symbol}{fmt(mov.monto)}</Text>
        {mov.moneda === 'USD' && (
          <Text style={[row.badge, { color: theme.textMuted }]}>USD</Text>
        )}
      </View>
    </View>
  )
}

const row = StyleSheet.create({
  wrap:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12, borderBottomWidth: 1 },
  iconBox: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  icon:    { fontSize: 19 },
  info:    { flex: 1, gap: 2 },
  detalle: { fontSize: 13, fontWeight: '600' },
  sub:     { fontSize: 11 },
  right:   { alignItems: 'flex-end', gap: 2 },
  monto:   { fontSize: 14, fontWeight: '700' },
  badge:   { fontSize: 10, fontWeight: '600' },
})

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function MovimientosScreen() {
  const { theme } = useTheme()
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [filtro, setFiltro]           = useState<Filtro>('todos')
  const [fechaKey, setFechaKey]       = useState<FechaKey>('este_mes')
  const [loading, setLoading]         = useState(true)
  const [refreshing, setRefreshing]   = useState(false)
  const [showFechaMenu, setShowFechaMenu] = useState(false)

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
      .limit(150)

    if (filtro === 'gastos')   query = query.eq('tipo_movimiento', 'Gasto')
    if (filtro === 'ingresos') query = query.eq('tipo_movimiento', 'Ingreso')

    const dateFilter = buildDateFilter(fechaKey)
    if (dateFilter.gte) query = query.gte('fecha', dateFilter.gte)
    if (dateFilter.lt)  query = query.lt('fecha', dateFilter.lt)

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
  }, [filtro, fechaKey])

  useEffect(() => { load() }, [load])

  const FILTROS: { key: Filtro; label: string }[] = [
    { key: 'todos',    label: 'Todos' },
    { key: 'gastos',   label: 'Gastos' },
    { key: 'ingresos', label: 'Ingresos' },
  ]

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.bg }]} edges={['top']}>

      {/* ── HEADER ── */}
      <View style={[s.header, { backgroundColor: theme.bg }]}>
        <Text style={[s.title, { color: theme.text }]}>Movimientos</Text>
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
                { backgroundColor: theme.surface, borderColor: theme.border },
                filtro === f.key && { backgroundColor: theme.primary, borderColor: theme.primary },
              ]}
              activeOpacity={0.8}
            >
              <Text style={[
                s.pillText, { color: theme.textSec },
                filtro === f.key && { color: '#ffffff' },
              ]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Botón calendario */}
        <TouchableOpacity
          style={[s.calBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={() => setShowFechaMenu(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="calendar-outline" size={16} color={theme.primary} />
        </TouchableOpacity>
      </View>

      {/* ── CONTADOR ── */}
      <View style={s.countRow}>
        <Text style={[s.countText, { color: theme.textMuted }]}>
          {loading ? '...' : `${movimientos.length} movimientos`}
        </Text>
        <Text style={[s.fechaTag, { color: theme.primary }]}>
          {FECHA_LABELS[fechaKey]}
        </Text>
      </View>

      {/* ── LISTA ── */}
      {loading && !refreshing ? (
        <View style={s.center}>
          <ActivityIndicator color={theme.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={movimientos}
          keyExtractor={m => m.id}
          renderItem={({ item }) => <MovRow mov={item} theme={theme} />}
          contentContainerStyle={[
            s.listContent,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.primary} />
          }
          ListEmptyComponent={
            <View style={s.center}>
              <Text style={[s.emptyText, { color: theme.textMuted }]}>
                No hay movimientos para este período
              </Text>
            </View>
          }
          ItemSeparatorComponent={() => <View style={[s.separator, { backgroundColor: theme.border }]} />}
        />
      )}

      {/* ── MODAL FECHA ── */}
      <Modal
        visible={showFechaMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFechaMenu(false)}
      >
        <TouchableOpacity
          style={s.backdrop}
          onPress={() => setShowFechaMenu(false)}
          activeOpacity={1}
        />
        <View style={[s.fechaMenu, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {(Object.keys(FECHA_LABELS) as FechaKey[]).map(k => (
            <TouchableOpacity
              key={k}
              style={[s.fechaItem, k === fechaKey && { backgroundColor: theme.surfaceAlt }]}
              onPress={() => { setFechaKey(k); setShowFechaMenu(false) }}
              activeOpacity={0.8}
            >
              {k === fechaKey && (
                <Ionicons name="checkmark" size={16} color={theme.primary} style={{ marginRight: 4 }} />
              )}
              <Text style={[
                s.fechaItemText, { color: theme.text },
                k === fechaKey && { color: theme.primary, fontWeight: '700' },
              ]}>
                {FECHA_LABELS[k]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Modal>
    </SafeAreaView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:    { flex: 1 },
  header:  { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  title:   { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },

  filterBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10, gap: 8,
  },
  filterPills: { flexDirection: 'row', gap: 8, flex: 1 },
  pill: {
    paddingHorizontal: 16, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1,
  },
  pillText: { fontSize: 13, fontWeight: '600' },
  calBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },

  countRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, marginBottom: 4,
  },
  countText: { fontSize: 12, fontWeight: '600' },
  fechaTag:  { fontSize: 12, fontWeight: '600' },

  listContent: {
    paddingHorizontal: 14, paddingBottom: 24,
    marginHorizontal: 16, borderRadius: 16,
    borderWidth: 1, marginTop: 8, overflow: 'hidden',
  },
  separator: { height: 1 },

  center:    { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 14 },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  fechaMenu: {
    position: 'absolute', top: 140, right: 16,
    borderRadius: 14, borderWidth: 1, overflow: 'hidden',
    minWidth: 180,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  fechaItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  fechaItemText: { fontSize: 14 },
})
