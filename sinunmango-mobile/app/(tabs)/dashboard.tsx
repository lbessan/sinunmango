import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView,
  RefreshControl, TouchableOpacity, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { apiGet } from '@/lib/api'
import { useTheme } from '@/context/ThemeContext'
import { STATIC_COLORS } from '@/context/ThemeContext'

// ─── Types ────────────────────────────────────────────────────────────────────
type Cuenta = {
  id:     string
  nombre: string
  tipo:   string
  moneda: string
  saldo:  number
}

type Movimiento = {
  id:               string
  fecha:            string
  detalle:          string
  monto:            number
  moneda:           string
  tipo:             string
  cuenta_nombre:    string | null
  categoria_nombre: string | null
  categoria_icono:  string | null
}

type DashboardData = {
  mes_label:               string
  saldo_disponible:        number
  saldo_usd:               number
  proyectado:              number
  gastos_mes:              number
  ingresos_mes:            number
  gastos_fijos_pendientes: number
  deuda_tarjetas:          number
  dolar:                   number
  cuentas:                 Cuenta[]
  ultimos_movimientos:     Movimiento[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

function labelTipo(tipo: string) {
  switch (tipo) {
    case 'Banco CA':        return 'Caja de ahorro'
    case 'Banco CC':        return 'Cuenta corriente'
    case 'Billetera':       return 'Billetera'
    case 'Efectivo':        return 'Efectivo'
    case 'Tarjeta Credito': return 'Tarjeta crédito'
    default:                return tipo
  }
}

function dotColor(tipo: string) {
  if (tipo === 'Tarjeta Credito') return '#f97316'
  if (tipo === 'Banco CA' || tipo === 'Banco CC') return '#3b82f6'
  if (tipo === 'Billetera') return '#8b5cf6'
  return '#64748b'
}

function formatFecha(iso: string) {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

// ─── Cuenta card ──────────────────────────────────────────────────────────────
function CuentaCard({ cuenta }: { cuenta: Cuenta }) {
  const isNeg = cuenta.saldo < 0
  return (
    <View style={cc.card}>
      <View style={cc.header}>
        <View style={[cc.dot, { backgroundColor: dotColor(cuenta.tipo) }]} />
        <Text style={cc.tipo} numberOfLines={1}>{labelTipo(cuenta.tipo)}</Text>
      </View>
      <Text style={cc.nombre} numberOfLines={1}>{cuenta.nombre}</Text>
      <Text style={[cc.saldo, isNeg && cc.saldoNeg]}>
        {cuenta.moneda === 'USD' ? 'US$' : '$'}{fmt(Math.abs(cuenta.saldo))}
        {isNeg ? '' : ''}
      </Text>
    </View>
  )
}

const cc = StyleSheet.create({
  card: {
    backgroundColor: STATIC_COLORS.bgCard,
    borderRadius:    16,
    padding:         14,
    marginRight:     10,
    width:           140,
    borderWidth:     1,
    borderColor:     STATIC_COLORS.border,
    shadowColor:     '#000',
    shadowOpacity:   0.04,
    shadowRadius:    6,
    shadowOffset:    { width: 0, height: 2 },
    elevation:       2,
  },
  header: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
    marginBottom:  6,
  },
  dot: {
    width: 8, height: 8, borderRadius: 4,
  },
  tipo: {
    fontSize: 11,
    color:    STATIC_COLORS.textMuted,
    flex:     1,
  },
  nombre: {
    fontSize:     14,
    fontWeight:   '700',
    color:        STATIC_COLORS.textPrimary,
    marginBottom: 6,
  },
  saldo: {
    fontSize:   15,
    fontWeight: '700',
    color:      STATIC_COLORS.textPrimary,
  },
  saldoNeg: {
    color: STATIC_COLORS.red,
  },
})

// ─── Movimiento row ───────────────────────────────────────────────────────────
function MovRow({ mov }: { mov: Movimiento }) {
  const isGasto   = mov.tipo === 'Gasto'
  const isIngreso = mov.tipo === 'Ingreso'
  const icon = mov.categoria_icono ?? (isIngreso ? '💰' : '💸')
  const sign = isGasto ? '-' : isIngreso ? '+' : ''
  const montoColor = isGasto ? STATIC_COLORS.red : isIngreso ? STATIC_COLORS.green : STATIC_COLORS.textPrimary
  const symbol = mov.moneda === 'USD' ? 'USD ' : '$'

  return (
    <View style={mr.row}>
      <View style={mr.iconBox}>
        <Text style={mr.icon}>{icon}</Text>
      </View>
      <View style={mr.info}>
        <Text style={mr.detalle} numberOfLines={1}>{mov.detalle || '—'}</Text>
        <Text style={mr.sub}>
          {mov.cuenta_nombre ?? ''}
          {mov.cuenta_nombre ? '  ·  ' : ''}
          {formatFecha(mov.fecha)}
        </Text>
      </View>
      <Text style={[mr.monto, { color: montoColor }]}>
        {sign}{symbol}{fmt(mov.monto)}
      </Text>
    </View>
  )
}

const mr = StyleSheet.create({
  row: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingVertical: 12,
    gap:             12,
    borderBottomWidth: 1,
    borderBottomColor: STATIC_COLORS.border,
  },
  iconBox: {
    width:          40,
    height:         40,
    borderRadius:   12,
    backgroundColor: STATIC_COLORS.bgCard,
    borderWidth:    1,
    borderColor:    STATIC_COLORS.border,
    alignItems:     'center',
    justifyContent: 'center',
  },
  icon:    { fontSize: 20 },
  info:    { flex: 1, gap: 2 },
  detalle: { fontSize: 14, fontWeight: '600', color: STATIC_COLORS.textPrimary },
  sub:     { fontSize: 12, color: STATIC_COLORS.textMuted },
  monto:   { fontSize: 14, fontWeight: '700' },
})

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function DashboardScreen() {
  const { colors } = useTheme()
  const [data, setData]           = useState<DashboardData | null>(null)
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const d = await apiGet<DashboardData>('/api/dashboard-mobile')
      setData(d)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: STATIC_COLORS.bgMain }]} edges={['top']}>

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <Text style={s.logo}>sinunmango</Text>
        <View style={s.headerRight}>
          <TouchableOpacity style={s.bellBtn}>
            <Text style={s.bellIcon}>🔔</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── MES NAV ────────────────────────────────────────────────────── */}
      <View style={s.mesNav}>
        <TouchableOpacity style={s.mesArrow}>
          <Text style={s.mesArrowText}>‹</Text>
        </TouchableOpacity>
        <Text style={s.mesLabel}>{data?.mes_label ?? '— —'}</Text>
        <TouchableOpacity style={s.mesArrow}>
          <Text style={s.mesArrowText}>›</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={colors.accent}
          />
        }
      >
        {error ? (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => load()} style={[s.retryBtn, { borderColor: colors.accent }]}>
              <Text style={[s.retryText, { color: colors.accent }]}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* ── BALANCE CARD ── */}
            <View style={[s.balanceCard, { backgroundColor: colors.accent }]}>
              <Text style={s.balanceLabel}>BALANCE TOTAL  ·  ARS</Text>
              {loading ? (
                <ActivityIndicator color="rgba(255,255,255,0.6)" size="large" style={{ marginVertical: 14 }} />
              ) : (
                <>
                  <Text style={s.balanceValue}>
                    ${fmt(data?.saldo_disponible ?? 0)}
                  </Text>
                  {(data?.saldo_usd ?? 0) !== 0 && (
                    <Text style={s.balanceUsd}>
                      USD {fmt(data?.saldo_usd ?? 0)}
                    </Text>
                  )}
                </>
              )}

              {/* Ingresos / Gastos dentro del card */}
              <View style={s.igRow}>
                <View style={s.igItem}>
                  <Text style={s.igLabel}>INGRESOS</Text>
                  <Text style={[s.igValue, s.igValueGreen]}>
                    ${fmt(data?.ingresos_mes ?? 0)}
                  </Text>
                </View>
                <View style={s.igDivider} />
                <View style={s.igItem}>
                  <Text style={s.igLabel}>GASTOS</Text>
                  <Text style={[s.igValue, s.igValueRed]}>
                    ${fmt(data?.gastos_mes ?? 0)}
                  </Text>
                </View>
              </View>
            </View>

            {/* ── MIS CUENTAS ── */}
            {(data?.cuentas?.length ?? 0) > 0 && (
              <View style={s.section}>
                <View style={s.sectionHeader}>
                  <Text style={s.sectionTitle}>Mis cuentas</Text>
                  <TouchableOpacity>
                    <Text style={[s.sectionLink, { color: colors.accent }]}>Ver todas</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.cuentasScroll}>
                  {(data?.cuentas ?? []).map(c => (
                    <CuentaCard key={c.id} cuenta={c} />
                  ))}
                  <View style={{ width: 4 }} />
                </ScrollView>
              </View>
            )}

            {/* ── ÚLTIMOS MOVIMIENTOS ── */}
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>Últimos movimientos</Text>
                <TouchableOpacity onPress={() => router.push('/(tabs)/movimientos' as never)}>
                  <Text style={[s.sectionLink, { color: colors.accent }]}>Ver todos</Text>
                </TouchableOpacity>
              </View>

              <View style={s.movCard}>
                {loading ? (
                  <ActivityIndicator color={colors.accent} style={{ marginVertical: 20 }} />
                ) : (data?.ultimos_movimientos?.length ?? 0) === 0 ? (
                  <Text style={s.emptyText}>Sin movimientos este período</Text>
                ) : (
                  (data?.ultimos_movimientos ?? []).map(m => (
                    <MovRow key={m.id} mov={m} />
                  ))
                )}
              </View>
            </View>

            <View style={{ height: 20 }} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:    { flex: 1 },
  scroll:  { flex: 1 },
  content: { padding: 16 },

  // Header
  header: {
    flexDirection:    'row',
    alignItems:       'center',
    justifyContent:   'space-between',
    paddingHorizontal: 20,
    paddingTop:        6,
    paddingBottom:     4,
    backgroundColor:  STATIC_COLORS.bgMain,
  },
  logo: {
    fontSize:   22,
    fontWeight: '800',
    color:      STATIC_COLORS.textPrimary,
    letterSpacing: -0.5,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
  },
  bellBtn: {
    width:          36,
    height:         36,
    borderRadius:   18,
    backgroundColor: STATIC_COLORS.bgCard,
    borderWidth:    1,
    borderColor:    STATIC_COLORS.border,
    alignItems:     'center',
    justifyContent: 'center',
  },
  bellIcon: { fontSize: 16 },

  // Mes nav
  mesNav: {
    flexDirection:    'row',
    alignItems:       'center',
    justifyContent:   'center',
    paddingVertical:  8,
    backgroundColor:  STATIC_COLORS.bgMain,
    gap:              16,
  },
  mesArrow: {
    paddingHorizontal: 8,
    paddingVertical:   4,
  },
  mesArrowText: {
    fontSize:   22,
    color:      STATIC_COLORS.textSecondary,
    fontWeight: '300',
  },
  mesLabel: {
    fontSize:   14,
    fontWeight: '700',
    color:      STATIC_COLORS.textPrimary,
    letterSpacing: 0.5,
    minWidth:   120,
    textAlign:  'center',
  },

  // Balance card
  balanceCard: {
    borderRadius: 20,
    padding:      22,
    marginBottom: 16,
    shadowColor:  '#000',
    shadowOpacity: 0.12,
    shadowRadius:  12,
    shadowOffset:  { width: 0, height: 4 },
    elevation:     5,
  },
  balanceLabel: {
    fontSize:      11,
    fontWeight:    '700',
    color:         'rgba(255,255,255,0.65)',
    letterSpacing: 0.8,
    marginBottom:  8,
  },
  balanceValue: {
    fontSize:   44,
    fontWeight: '900',
    color:      '#ffffff',
    letterSpacing: -1,
    marginBottom: 2,
  },
  balanceUsd: {
    fontSize:   14,
    fontWeight: '600',
    color:      'rgba(255,255,255,0.7)',
    marginBottom: 16,
  },
  igRow: {
    flexDirection:  'row',
    marginTop:      16,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius:   14,
    overflow:       'hidden',
  },
  igItem: {
    flex:           1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems:     'flex-start',
  },
  igDivider: {
    width:           1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginVertical:  10,
  },
  igLabel: {
    fontSize:      10,
    fontWeight:    '700',
    color:         'rgba(255,255,255,0.6)',
    letterSpacing: 0.6,
    marginBottom:  4,
  },
  igValue: {
    fontSize:   18,
    fontWeight: '800',
  },
  igValueGreen: { color: '#4ade80' },
  igValueRed:   { color: '#fca5a5' },

  // Sections
  section: { marginBottom: 16 },
  sectionHeader: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   10,
  },
  sectionTitle: {
    fontSize:   16,
    fontWeight: '700',
    color:      STATIC_COLORS.textPrimary,
  },
  sectionLink: {
    fontSize:   13,
    fontWeight: '600',
  },

  cuentasScroll: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },

  movCard: {
    backgroundColor: STATIC_COLORS.bgCard,
    borderRadius:    16,
    borderWidth:     1,
    borderColor:     STATIC_COLORS.border,
    paddingHorizontal: 14,
    overflow:        'hidden',
  },
  emptyText: {
    textAlign:    'center',
    color:        STATIC_COLORS.textMuted,
    paddingVertical: 24,
    fontSize:     14,
  },

  // Error
  errorBox: {
    alignItems:   'center',
    paddingTop:   60,
  },
  errorText: {
    color:        STATIC_COLORS.red,
    fontSize:     14,
    textAlign:    'center',
    marginBottom: 16,
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical:   10,
    borderRadius:      12,
    borderWidth:       1,
  },
  retryText: { fontSize: 14, fontWeight: '600' },
})
