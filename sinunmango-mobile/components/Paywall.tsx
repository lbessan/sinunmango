import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { type PurchasesPackage } from 'react-native-purchases'
import { useSubscription } from '@/context/SubscriptionContext'
import { useTheme } from '@/context/ThemeContext'

// ─── Features que se muestran en el paywall ───────────────────────────────────
const FEATURES = [
  { icon: 'sparkles-outline',      text: 'Manguito IA sin límites'           },
  { icon: 'bar-chart-outline',     text: 'Analítica avanzada con filtros'    },
  { icon: 'scan-outline',          text: 'Escáner de tickets ilimitado'      },
  { icon: 'trending-up-outline',   text: 'Gestión de inversiones completa'   },
  { icon: 'notifications-outline', text: 'Alertas y resúmenes automáticos'   },
  { icon: 'cloud-outline',         text: 'Sync en tiempo real'               },
]

// ─── Props ────────────────────────────────────────────────────────────────────
type PaywallProps = {
  visible:  boolean
  onClose:  () => void
}

// ─── Componente ───────────────────────────────────────────────────────────────
export function Paywall({ visible, onClose }: PaywallProps) {
  const { theme }                              = useTheme()
  const { offering, purchasing, errorMsg, purchasePackage, restorePurchases } = useSubscription()
  const insets                                 = useSafeAreaInsets()

  const monthly = offering?.monthly   ?? null
  const annual  = offering?.annual    ?? null

  const handlePurchase = async (pkg: PurchasesPackage) => {
    const ok = await purchasePackage(pkg)
    if (ok) onClose()
  }

  const handleRestore = async () => {
    const ok = await restorePurchases()
    if (ok) onClose()
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[s.root, { backgroundColor: theme.bg, paddingBottom: insets.bottom + 16 }]}>

        {/* ── Botón cerrar ─────────────────────────────────────────────── */}
        <TouchableOpacity style={[s.closeBtn, { top: insets.top + 12 }]} onPress={onClose} hitSlop={12}>
          <Ionicons name="close" size={22} color={theme.textMuted} />
        </TouchableOpacity>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

          {/* ── Header ───────────────────────────────────────────────────── */}
          <LinearGradient
            colors={[theme.primary, theme.primaryDark]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={s.header}
          >
            <Text style={s.headerBadge}>PRO</Text>
            <Text style={s.headerTitle}>sinunmango Pro</Text>
            <Text style={s.headerSub}>Tus finanzas sin límites</Text>
          </LinearGradient>

          {/* ── Features ─────────────────────────────────────────────────── */}
          <View style={[s.featuresCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {FEATURES.map((f, i) => (
              <View key={i} style={[s.featureRow, i < FEATURES.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                <View style={[s.featureIcon, { backgroundColor: theme.primaryLight }]}>
                  <Ionicons name={f.icon as any} size={16} color={theme.primary} />
                </View>
                <Text style={[s.featureText, { color: theme.text }]}>{f.text}</Text>
                <Ionicons name="checkmark-circle" size={18} color={theme.primary} />
              </View>
            ))}
          </View>

          {/* ── Planes ───────────────────────────────────────────────────── */}
          <Text style={[s.plansTitle, { color: theme.textSec }]}>Elegí tu plan</Text>

          {offering === null ? (
            <View style={s.loadingWrap}>
              <ActivityIndicator color={theme.primary} />
              <Text style={[s.loadingText, { color: theme.textMuted }]}>Cargando planes...</Text>
            </View>
          ) : (
            <View style={s.plans}>

              {/* Anual — destacado */}
              {annual && (
                <TouchableOpacity
                  style={[s.planCard, s.planCardFeatured, { borderColor: theme.primary }]}
                  onPress={() => handlePurchase(annual)}
                  disabled={purchasing}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={[theme.primary + '18', theme.primary + '08']}
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={s.planBadgeWrap}>
                    <View style={[s.planBadge, { backgroundColor: theme.primary }]}>
                      <Text style={s.planBadgeText}>MEJOR OPCIÓN</Text>
                    </View>
                  </View>
                  <Text style={[s.planName, { color: theme.text }]}>Anual</Text>
                  <Text style={[s.planPrice, { color: theme.primary }]}>
                    {annual.product.priceString}
                    <Text style={[s.planPricePer, { color: theme.textSec }]}> / año</Text>
                  </Text>
                  <Text style={[s.planSaving, { color: theme.primary }]}>
                    Equivale a {formatMonthlyEquiv(annual)} por mes · 44% de descuento
                  </Text>
                </TouchableOpacity>
              )}

              {/* Mensual */}
              {monthly && (
                <TouchableOpacity
                  style={[s.planCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  onPress={() => handlePurchase(monthly)}
                  disabled={purchasing}
                  activeOpacity={0.85}
                >
                  <Text style={[s.planName, { color: theme.text }]}>Mensual</Text>
                  <Text style={[s.planPrice, { color: theme.text }]}>
                    {monthly.product.priceString}
                    <Text style={[s.planPricePer, { color: theme.textSec }]}> / mes</Text>
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* ── Error ────────────────────────────────────────────────────── */}
          {errorMsg && (
            <Text style={[s.error, { color: theme.expense }]}>{errorMsg}</Text>
          )}

          {/* ── Spinner de compra ─────────────────────────────────────────── */}
          {purchasing && (
            <View style={s.purchasingWrap}>
              <ActivityIndicator color={theme.primary} />
              <Text style={[s.purchasingText, { color: theme.textSec }]}>Procesando...</Text>
            </View>
          )}

          {/* ── Restaurar + legales ───────────────────────────────────────── */}
          <TouchableOpacity onPress={handleRestore} disabled={purchasing} style={s.restoreBtn}>
            <Text style={[s.restoreText, { color: theme.textMuted }]}>Restaurar compra anterior</Text>
          </TouchableOpacity>

          <Text style={[s.legal, { color: theme.textMuted }]}>
            La suscripción se renueva automáticamente. Podés cancelar en cualquier momento desde
            la configuración de Google Play. Al suscribirte aceptás los Términos de Uso.
          </Text>

        </ScrollView>
      </View>
    </Modal>
  )
}

// ─── Helper: precio mensual equivalente del plan anual ───────────────────────
function formatMonthlyEquiv(pkg: PurchasesPackage): string {
  const price = pkg.product.price / 12
  const sym   = pkg.product.currencyCode === 'ARS' ? '$' : (pkg.product.currencyCode === 'USD' ? 'US$' : pkg.product.currencyCode + ' ')
  return `${sym}${price.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:           { flex: 1 },
  scroll:         { paddingBottom: 24 },
  closeBtn:       { position: 'absolute', right: 16, zIndex: 10, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },

  header:         { paddingTop: 56, paddingBottom: 32, paddingHorizontal: 24, alignItems: 'center' },
  headerBadge:    { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 2, marginBottom: 8 },
  headerTitle:    { fontSize: 28, fontWeight: '800', color: '#fff', marginBottom: 6 },
  headerSub:      { fontSize: 15, color: 'rgba(255,255,255,0.75)' },

  featuresCard:   { margin: 16, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  featureRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16, gap: 12 },
  featureIcon:    { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  featureText:    { flex: 1, fontSize: 14, fontWeight: '500' },

  plansTitle:     { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginHorizontal: 16, marginBottom: 10 },
  plans:          { marginHorizontal: 16, gap: 10 },

  planCard:       { borderRadius: 16, borderWidth: 1.5, padding: 18, overflow: 'hidden' },
  planCardFeatured: { borderWidth: 2 },
  planBadgeWrap:  { marginBottom: 10 },
  planBadge:      { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  planBadgeText:  { fontSize: 10, fontWeight: '700', color: '#fff', letterSpacing: 1 },
  planName:       { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  planPrice:      { fontSize: 22, fontWeight: '800' },
  planPricePer:   { fontSize: 14, fontWeight: '400' },
  planSaving:     { fontSize: 12, fontWeight: '500', marginTop: 4 },

  loadingWrap:    { alignItems: 'center', paddingVertical: 32, gap: 10 },
  loadingText:    { fontSize: 13 },

  error:          { textAlign: 'center', fontSize: 13, marginTop: 12, marginHorizontal: 16 },

  purchasingWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 16 },
  purchasingText: { fontSize: 14 },

  restoreBtn:     { alignItems: 'center', marginTop: 20, paddingVertical: 8 },
  restoreText:    { fontSize: 13, textDecorationLine: 'underline' },

  legal:          { fontSize: 11, textAlign: 'center', lineHeight: 16, marginHorizontal: 24, marginTop: 12 },
})
