import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView,
  RefreshControl, TouchableOpacity, ActivityIndicator, Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { apiGet } from '@/lib/api'
import { currentMesAR } from '@/lib/timezone'
import { useTheme } from '@/context/ThemeContext'

// ─── Types ────────────────────────────────────────────────────────────────────
type Cuenta = { id: string; nombre: string; tipo: string; moneda: string; saldo: number }

type DashboardData = {
  mes_label: string; saldo_disponible: number; saldo_usd: number
  proyectado: number; gastos_mes: number; ingresos_mes: number
  gastos_fijos_pendientes: number
  deuda_tarjetas: number; deuda_tarjetas_ars?: number; deuda_tarjetas_usd?: number
  dolar: number
  cuentas: Cuenta[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

function saludo() {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días 👋'
  if (h < 19) return 'Buenas tardes 👋'
  return 'Buenas noches 👋'
}

function mesActual() {
  return currentMesAR()
}

function labelTipo(tipo: string) {
  switch (tipo) {
    case 'Banco CA':  return 'Caja de ahorro'
    case 'Banco CC':  return 'Cta. corriente'
    case 'Billetera': return 'Billetera'
    case 'Efectivo':  return 'Efectivo'
    default:          return tipo
  }
}

function dotColor(tipo: string) {
  switch (tipo) {
    case 'Banco CA':
    case 'Banco CC':  return '#3b82f6'
    case 'Billetera': return '#8b5cf6'
    case 'Efectivo':  return '#10b981'
    default:          return '#64748b'
  }
}

// ─── Cuenta card ──────────────────────────────────────────────────────────────
function CuentaCard({ cuenta, theme }: { cuenta: Cuenta; theme: ReturnType<typeof useTheme>['theme'] }) {
  const isNeg = cuenta.saldo < 0
  return (
    <View style={[cc.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={cc.header}>
        <View style={[cc.dot, { backgroundColor: dotColor(cuenta.tipo) }]} />
        <Text style={[cc.tipo, { color: theme.textMuted }]} numberOfLines={1}>
          {labelTipo(cuenta.tipo)}
        </Text>
      </View>
      <Text style={[cc.nombre, { color: theme.text }]} numberOfLines={1}>{cuenta.nombre}</Text>
      <Text style={[cc.saldo, { color: isNeg ? theme.expense : theme.text }]}>
        {cuenta.moneda === 'USD' ? 'US$' : '$'}{fmt(Math.abs(cuenta.saldo))}
      </Text>
    </View>
  )
}

const cc = StyleSheet.create({
  card: {
    borderRadius: 16, padding: 14,
    flex: 1, borderWidth: 1,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  dot:    { width: 8, height: 8, borderRadius: 4 },
  tipo:   { fontSize: 11, flex: 1 },
  nombre: { fontSize: 14, fontWeight: '700', marginBottom: 6 },
  saldo:  { fontSize: 16, fontWeight: '800' },
})

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function DashboardScreen() {
  const { theme }                       = useTheme()
  const [data, setData]                 = useState<DashboardData | null>(null)
  const [loading, setLoading]           = useState(true)
  const [refreshing, setRefreshing]     = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [hidden, setHidden]             = useState(false)

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const d = await apiGet<DashboardData>(`/api/dashboard-mobile?mes=${mesActual()}`)
      setData(d)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
    } finally {
      setLoading(false); setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const mask = '• • • •'
  const show = (v: number, prefix = '$') => hidden ? mask : `${prefix}${fmt(v)}`

  // Solo cuentas que no son tarjeta de crédito
  const cuentasFiltradas = (data?.cuentas ?? []).filter(c => c.tipo !== 'Tarjeta Credito')

  // Armar filas de 2 para la grilla
  const cuentaRows: Cuenta[][] = []
  for (let i = 0; i < cuentasFiltradas.length; i += 2) {
    cuentaRows.push(cuentasFiltradas.slice(i, i + 2))
  }

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.bg }]} edges={['top']}>

      {/* ── HEADER ── */}
      <View style={[s.header, { backgroundColor: theme.bg }]}>
        <View>
          <Text style={[s.greeting, { color: theme.textMuted }]}>{saludo()}</Text>
          <Text style={[s.logo, { color: theme.text }]}>sinunmango</Text>
        </View>
        <View style={s.headerRight}>
          <TouchableOpacity style={[s.iconBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Ionicons name="notifications-outline" size={18} color={theme.textSec} />
          </TouchableOpacity>
          <View style={[s.avatarBtn, { backgroundColor: theme.surfaceAlt }]}>
            <Image source={require('@/assets/logo.png')} style={s.avatarImg} resizeMode="contain" />
          </View>
        </View>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.primary} />
        }
      >
        {error ? (
          <View style={s.errorBox}>
            <Text style={[s.errorText, { color: theme.expense }]}>{error}</Text>
            <TouchableOpacity onPress={() => load()} style={[s.retryBtn, { borderColor: theme.primary }]}>
              <Text style={{ color: theme.primary, fontWeight: '600' }}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* ── BALANCE CARD ── */}
            <View style={[s.balanceCard, { backgroundColor: theme.primary }]}>
              <View style={s.balanceTopRow}>
                <Text style={s.balanceLabel}>BALANCE TOTAL  ·  ARS</Text>
                <TouchableOpacity onPress={() => setHidden(h => !h)} style={{ padding: 4 }}>
                  <Ionicons
                    name={hidden ? 'eye-off-outline' : 'eye-outline'}
                    size={18} color="rgba(255,255,255,0.7)"
                  />
                </TouchableOpacity>
              </View>

              {loading ? (
                <ActivityIndicator color="rgba(255,255,255,0.6)" size="large" style={{ marginVertical: 16 }} />
              ) : (
                <>
                  <Text style={s.balanceValue}>{show(data?.saldo_disponible ?? 0)}</Text>
                  {(data?.saldo_usd ?? 0) !== 0 && !hidden && (
                    <Text style={s.balanceUsd}>USD {fmt(data?.saldo_usd ?? 0)}</Text>
                  )}
                </>
              )}

              <View style={s.igRow}>
                <View style={s.igItem}>
                  <Text style={s.igLabel}>INGRESOS</Text>
                  <Text style={[s.igValue, { color: '#4ade80' }]}>{show(data?.ingresos_mes ?? 0)}</Text>
                </View>
                <View style={s.igDivider} />
                <View style={s.igItem}>
                  <Text style={s.igLabel}>GASTOS</Text>
                  <Text style={[s.igValue, { color: '#fca5a5' }]}>{show(data?.gastos_mes ?? 0)}</Text>
                </View>
              </View>
            </View>

            {/* ── RESUMEN DEL MES ── */}
            {!loading && data && (
              <View style={s.section}>
                <Text style={[s.sectionTitle, { color: theme.text }]}>Resumen del mes</Text>
                <View style={s.resumeGrid}>

                  {/* Proyección */}
                  <View style={[s.resumeCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <View style={[s.resumeIcon, { backgroundColor: theme.surfaceAlt }]}>
                      <Ionicons name="trending-up-outline" size={16} color={theme.primary} />
                    </View>
                    <Text style={[s.resumeLabel, { color: theme.textMuted }]}>Proyectado fin de mes</Text>
                    <Text style={[s.resumeValue, { color: (data.proyectado ?? 0) >= 0 ? theme.income : theme.expense }]}>
                      {show(data.proyectado ?? 0)}
                    </Text>
                  </View>

                  {/* Gastos fijos pendientes */}
                  <View style={[s.resumeCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <View style={[s.resumeIcon, { backgroundColor: theme.surfaceAlt }]}>
                      <Ionicons name="receipt-outline" size={16} color="#f59e0b" />
                    </View>
                    <Text style={[s.resumeLabel, { color: theme.textMuted }]}>Gastos fijos pendientes</Text>
                    <Text style={[s.resumeValue, { color: (data.gastos_fijos_pendientes ?? 0) > 0 ? '#f59e0b' : theme.text }]}>
                      {show(data.gastos_fijos_pendientes ?? 0)}
                    </Text>
                  </View>

                  {/* Deuda tarjetas — ARS nativo + USD nativo separado */}
                  <View style={[s.resumeCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <View style={[s.resumeIcon, { backgroundColor: theme.surfaceAlt }]}>
                      <Ionicons name="card-outline" size={16} color="#8b5cf6" />
                    </View>
                    <Text style={[s.resumeLabel, { color: theme.textMuted }]}>Deuda en tarjetas</Text>
                    <Text style={[s.resumeValue, { color: (data.deuda_tarjetas_ars ?? data.deuda_tarjetas ?? 0) > 0 ? '#8b5cf6' : theme.text }]}>
                      {show(data.deuda_tarjetas_ars ?? data.deuda_tarjetas ?? 0)}
                    </Text>
                    {!hidden && (data.deuda_tarjetas_usd ?? 0) > 0 && (
                      <Text style={[s.resumeExtra, { color: '#8b5cf6' }]}>
                        + US$ {fmt(data.deuda_tarjetas_usd ?? 0)}
                      </Text>
                    )}
                  </View>

                  {/* Dólar BNA */}
                  {(data.dolar ?? 0) > 0 && (
                    <View style={[s.resumeCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                      <View style={[s.resumeIcon, { backgroundColor: theme.surfaceAlt }]}>
                        <Ionicons name="cash-outline" size={16} color="#10b981" />
                      </View>
                      <Text style={[s.resumeLabel, { color: theme.textMuted }]}>Dólar BNA</Text>
                      <Text style={[s.resumeValue, { color: theme.text }]}>
                        {'$'}{fmt(data.dolar)}
                      </Text>
                    </View>
                  )}

                </View>
              </View>
            )}

            {/* ── MIS CUENTAS — grilla 2 columnas ── */}
            {cuentasFiltradas.length > 0 && (
              <View style={s.section}>
                <Text style={[s.sectionTitle, { color: theme.text }]}>Mis cuentas</Text>
                {cuentaRows.map((fila, i) => (
                  <View key={i} style={s.cuentaFila}>
                    {fila.map(c => <CuentaCard key={c.id} cuenta={c} theme={theme} />)}
                    {/* Si la fila tiene solo 1 item, relleno con un espacio */}
                    {fila.length === 1 && <View style={{ flex: 1 }} />}
                  </View>
                ))}
              </View>
            )}

            <View style={{ height: 32 }} />
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
  content: { paddingHorizontal: 16, paddingBottom: 16 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 6, paddingBottom: 8,
  },
  greeting:    { fontSize: 12, fontWeight: '500', marginBottom: 1 },
  logo:        { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  avatarBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarImg: { width: 32, height: 32 },

  balanceCard: {
    borderRadius: 20, padding: 20, marginBottom: 20,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  balanceTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  balanceLabel:  { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.65)', letterSpacing: 0.8 },
  balanceValue:  { fontSize: 44, fontWeight: '900', color: '#ffffff', letterSpacing: -1, marginBottom: 2 },
  balanceUsd:    { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.6)', marginBottom: 12 },

  igRow: {
    flexDirection: 'row', marginTop: 16,
    backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 14, overflow: 'hidden',
  },
  igItem:    { flex: 1, paddingVertical: 12, paddingHorizontal: 16 },
  igDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: 10 },
  igLabel:   { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.6)', letterSpacing: 0.6, marginBottom: 4 },
  igValue:   { fontSize: 18, fontWeight: '800' },

  section:      { marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
  cuentaFila:   { flexDirection: 'row', gap: 10, marginBottom: 10 },

  resumeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  resumeCard: {
    width: '47%', borderRadius: 14, borderWidth: 1,
    padding: 14, gap: 6,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  resumeIcon:  {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', marginBottom: 2,
  },
  resumeLabel: { fontSize: 11, fontWeight: '500', lineHeight: 14 },
  resumeValue: { fontSize: 17, fontWeight: '800' },
  resumeExtra: { fontSize: 12, fontWeight: '700', marginTop: -2 },

  errorBox:  { alignItems: 'center', paddingTop: 60 },
  errorText: { fontSize: 14, textAlign: 'center', marginBottom: 16 },
  retryBtn:  { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
})
