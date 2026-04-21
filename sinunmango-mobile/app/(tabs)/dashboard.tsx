import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView,
  RefreshControl, TouchableOpacity, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { apiGet } from '@/lib/api'
import { useTheme } from '@/context/ThemeContext'
import { STATIC_COLORS } from '@/context/ThemeContext'

// ─── Types ────────────────────────────────────────────────────────────────────
type DashboardData = {
  mes_label:               string
  saldo_disponible:        number
  proyectado:              number
  gastos_mes:              number
  ingresos_mes:            number
  gastos_fijos_pendientes: number
  deuda_tarjetas:          number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

function fmtSigned(n: number) {
  return (n >= 0 ? '+' : '') + fmt(n)
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, accent, sub }: {
  label:   string
  value:   string
  accent?: boolean
  sub?:    string
}) {
  return (
    <View style={statStyles.card}>
      <Text style={statStyles.label}>{label}</Text>
      <Text style={[statStyles.value, accent && statStyles.valueAccent]}>{value}</Text>
      {sub ? <Text style={statStyles.sub}>{sub}</Text> : null}
    </View>
  )
}

const statStyles = StyleSheet.create({
  card: {
    flex:             1,
    backgroundColor:  STATIC_COLORS.bgCard,
    borderRadius:     16,
    padding:          16,
    borderWidth:      1,
    borderColor:      STATIC_COLORS.border,
  },
  label: {
    fontSize:     11,
    fontWeight:   '600',
    color:        STATIC_COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom:  6,
  },
  value: {
    fontSize:   22,
    fontWeight: '800',
    color:      STATIC_COLORS.textPrimary,
  },
  valueAccent: {
    color: STATIC_COLORS.green,
  },
  sub: {
    fontSize:   11,
    color:      STATIC_COLORS.textMuted,
    marginTop:  4,
  },
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

  const saldoPositivo  = (data?.saldo_disponible ?? 0) >= 0
  const proyPositivo   = (data?.proyectado ?? 0) >= 0

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.bgMain }]}>
      {/* ── HEADER BANNER ── */}
      <View style={[s.banner, { backgroundColor: colors.sidebar }]}>
        <View>
          <Text style={s.bannerSub}>Resumen</Text>
          <Text style={s.bannerTitle}>
            {data?.mes_label ?? '— —'}
          </Text>
        </View>
        {loading && !refreshing ? (
          <ActivityIndicator color="rgba(255,255,255,0.5)" />
        ) : (
          <TouchableOpacity onPress={() => load(true)} style={s.refreshBtn}>
            <Text style={s.refreshText}>↻</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
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
            {/* ── SALDO DISPONIBLE (principal) ── */}
            <View style={[s.mainCard, { backgroundColor: colors.sidebar }]}>
              <Text style={s.mainCardLabel}>SALDO DISPONIBLE HOY</Text>
              {loading ? (
                <ActivityIndicator color="rgba(255,255,255,0.5)" size="large" style={{ marginVertical: 12 }} />
              ) : (
                <Text style={[
                  s.mainCardValue,
                  { color: saldoPositivo ? '#4ade80' : '#f87171' },
                ]}>
                  ${fmt(data?.saldo_disponible ?? 0)}
                </Text>
              )}
              <Text style={s.mainCardSub}>
                Saldo en cuentas y efectivo, descontando lo ya gastado este mes
              </Text>
            </View>

            {/* ── PROYECTADO A FIN DE MES ── */}
            <View style={[s.mainCard, s.mainCardAlt, { borderColor: colors.border ?? STATIC_COLORS.border }]}>
              <Text style={[s.mainCardLabel, { color: STATIC_COLORS.textMuted }]}>
                PROYECTADO FIN DE MES
              </Text>
              {loading ? (
                <ActivityIndicator color={STATIC_COLORS.textMuted} size="large" style={{ marginVertical: 12 }} />
              ) : (
                <Text style={[
                  s.mainCardValue,
                  { color: proyPositivo ? STATIC_COLORS.green : STATIC_COLORS.red },
                ]}>
                  {fmtSigned(data?.proyectado ?? 0)}
                </Text>
              )}
              <Text style={s.mainCardSubAlt}>
                Incluye ingresos pendientes, gastos fijos y cuotas de tarjeta
              </Text>
            </View>

            {/* ── STATS GRID ── */}
            <View style={s.grid}>
              <StatCard
                label="Gastos del mes"
                value={`$${fmt(data?.gastos_mes ?? 0)}`}
                sub="registrados hasta hoy"
              />
              <StatCard
                label="Ingresos del mes"
                value={`$${fmt(data?.ingresos_mes ?? 0)}`}
                accent
              />
            </View>

            <View style={s.grid}>
              <StatCard
                label="Gastos fijos pendientes"
                value={`$${fmt(data?.gastos_fijos_pendientes ?? 0)}`}
                sub="estimado hasta fin de mes"
              />
              <StatCard
                label="Deuda tarjetas"
                value={`$${fmt(data?.deuda_tarjetas ?? 0)}`}
                sub="a pagar este período"
              />
            </View>

            <View style={{ height: 24 }} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:   { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: 16 },

  banner: {
    paddingHorizontal: 20,
    paddingTop:        16,
    paddingBottom:     18,
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
  },
  bannerSub: {
    fontSize:     11,
    fontWeight:   '600',
    color:        'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom:  4,
  },
  bannerTitle: {
    fontSize:   24,
    fontWeight: '900',
    color:      '#ffffff',
    letterSpacing: 0.5,
  },
  refreshBtn: {
    width:           38,
    height:          38,
    borderRadius:    19,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent:  'center',
    alignItems:      'center',
  },
  refreshText: { color: '#ffffff', fontSize: 20, fontWeight: '300' },

  mainCard: {
    borderRadius:  20,
    padding:       22,
    marginBottom:  12,
    alignItems:    'center',
  },
  mainCardAlt: {
    backgroundColor: STATIC_COLORS.bgCard,
    borderWidth:     1,
  },
  mainCardLabel: {
    fontSize:      11,
    fontWeight:    '700',
    color:         'rgba(255,255,255,0.55)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom:  8,
    textAlign:     'center',
  },
  mainCardValue: {
    fontSize:   42,
    fontWeight: '900',
    textAlign:  'center',
    letterSpacing: -0.5,
  },
  mainCardSub: {
    fontSize:   11,
    color:      'rgba(255,255,255,0.4)',
    textAlign:  'center',
    marginTop:  8,
    lineHeight: 16,
  },
  mainCardSubAlt: {
    fontSize:   11,
    color:      STATIC_COLORS.textMuted,
    textAlign:  'center',
    marginTop:  8,
    lineHeight: 16,
  },

  grid: {
    flexDirection: 'row',
    gap:           10,
    marginBottom:  10,
  },

  errorBox: {
    alignItems:   'center',
    paddingTop:   40,
    paddingBottom: 20,
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
