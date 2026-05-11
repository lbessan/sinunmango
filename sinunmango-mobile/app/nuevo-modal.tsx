import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Modal, FlatList,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import { router } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import * as Crypto from 'expo-crypto'
import { supabase } from '@/lib/supabase'
import { apiPost } from '@/lib/api'
import { calcularPeriodo, addMonths } from '@/lib/tarjeta-periodo'
import { todayAR } from '@/lib/timezone'
import { useTheme, type Theme } from '@/context/ThemeContext'

// ─── Types ────────────────────────────────────────────────────────────────────
type TipoMov = 'Gasto' | 'Ingreso' | 'Transferencia'

type Cuenta = {
  id: string; nombre_cuenta: string; tipo_cuenta: string; moneda: string
  fecha_cierre_tarjeta: string | null; fecha_vencimiento_tarjeta: string | null
}
type Categoria    = { id: string; nombre_categoria: string; icono: string; tipo_default: string }
type Subcategoria = { id: string; nombre_subcategoria: string; categoria_id: string }

type Form = {
  detalle: string; monto: string; moneda: 'ARS' | 'USD'; cuotas: string
  cuenta_id: string; cuenta_destino_id: string
  categoria_id: string; subcategoria_id: string; fecha: string
}

const EMPTY_FORM: Form = {
  detalle: '', monto: '', moneda: 'ARS', cuotas: '1',
  cuenta_id: '', cuenta_destino_id: '',
  categoria_id: '', subcategoria_id: '', fecha: todayAR(),
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
/** True only for real emoji / non-ASCII characters */
function isEmoji(s: string | null): boolean {
  return !!s && /[^\x00-\x7F]/.test(s)
}

const fmt = (n: number) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

// ─── Selector Modal ───────────────────────────────────────────────────────────
function SelectorModal<T extends { id: string; label: string; sub?: string; icon?: string }>({
  visible, title, items, onSelect, onClose, theme,
}: {
  visible: boolean; title: string; items: T[]
  onSelect: (id: string) => void; onClose: () => void; theme: Theme
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }}
        onPress={onClose} activeOpacity={1}
      />
      <View style={[sm.sheet, { backgroundColor: theme.surface }]}>
        <View style={[sm.handle, { backgroundColor: theme.border }]} />
        <Text style={[sm.title, { color: theme.text }]}>{title}</Text>
        <FlatList
          data={items} keyExtractor={i => i.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={sm.item}
              onPress={() => { onSelect(item.id); onClose() }}
              activeOpacity={0.7}
            >
              {isEmoji(item.icon ?? null) ? (
                <Text style={sm.itemIcon}>{item.icon}</Text>
              ) : (
                <View style={sm.itemIconPlaceholder} />
              )}
              <View style={sm.itemText}>
                <Text style={[sm.itemLabel, { color: theme.text }]}>{item.label}</Text>
                {item.sub ? <Text style={[sm.itemSub, { color: theme.textMuted }]}>{item.sub}</Text> : null}
              </View>
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={[sm.sep, { backgroundColor: theme.border }]} />}
        />
      </View>
    </Modal>
  )
}

const sm = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40, maxHeight: '70%',
  },
  handle:             { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  title:              { fontSize: 17, fontWeight: '700', marginBottom: 12 },
  item:               { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
  itemIcon:           { fontSize: 22, width: 32, textAlign: 'center' },
  itemIconPlaceholder:{ width: 32 },
  itemText:           { flex: 1 },
  itemLabel:          { fontSize: 15, fontWeight: '500' },
  itemSub:            { fontSize: 12, marginTop: 2 },
  sep:                { height: 1 },
})

// ─── Field helpers ────────────────────────────────────────────────────────────
function Label({ children, theme }: { children: string; theme: Theme }) {
  return <Text style={[f.label, { color: theme.textMuted }]}>{children}</Text>
}

function Dropdown({ label, value, placeholder, onPress, extra, theme }: {
  label: string; value: string; placeholder: string; onPress: () => void
  extra?: React.ReactNode; theme: Theme
}) {
  return (
    <View style={f.field}>
      {extra
        ? <View style={f.labelRow}><Label theme={theme}>{label}</Label>{extra}</View>
        : <Label theme={theme}>{label}</Label>
      }
      <TouchableOpacity
        style={[f.drop, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}
        onPress={onPress} activeOpacity={0.8}
      >
        <Text style={[f.dropText, { color: value ? theme.text : theme.textMuted }]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Text style={[f.chevron, { color: theme.textMuted }]}>›</Text>
      </TouchableOpacity>
    </View>
  )
}

const f = StyleSheet.create({
  field:    { marginBottom: 12 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  label:    { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5 },
  drop:     { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, borderWidth: 1 },
  dropText: { flex: 1, fontSize: 14, fontWeight: '500' },
  chevron:  { fontSize: 20, fontWeight: '300' },
})

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function NuevoModalScreen() {
  const { theme } = useTheme()
  const [tipo, setTipo]     = useState<TipoMov>('Gasto')
  const [form, setForm]     = useState<Form>(EMPTY_FORM)
  const [cuentas, setCuentas]           = useState<Cuenta[]>([])
  const [categorias, setCategorias]     = useState<Categoria[]>([])
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([])
  const [scanning, setScanning]         = useState(false)
  const [saving, setSaving]             = useState(false)
  const [showCuenta, setShowCuenta]         = useState(false)
  const [showCuentaDest, setShowCuentaDest] = useState(false)
  const [showCategoria, setShowCategoria]   = useState(false)
  const [showSubcat, setShowSubcat]         = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return
      const [{ data: c }, { data: cat }, { data: sub }] = await Promise.all([
        supabase.from('cuentas')
          .select('id, nombre_cuenta, tipo_cuenta, moneda, fecha_cierre_tarjeta, fecha_vencimiento_tarjeta')
          .eq('activa', true).eq('user_id', session.user.id).order('nombre_cuenta'),
        supabase.from('categorias')
          .select('id, nombre_categoria, icono, tipo_default')
          .eq('user_id', session.user.id).order('nombre_categoria'),
        supabase.from('subcategorias')
          .select('id, nombre_subcategoria, categoria_id')
          .eq('user_id', session.user.id).order('nombre_subcategoria'),
      ])
      setCuentas(c ?? [])
      setCategorias(cat ?? [])
      setSubcategorias(sub ?? [])
      if (c && c.length > 0) setForm(prev => ({ ...prev, cuenta_id: prev.cuenta_id || c[0].id }))
    }
    load()
  }, [])

  const set = useCallback((key: keyof Form, val: string) => {
    setForm(prev => ({ ...prev, [key]: val }))
  }, [])

  // ── Derived state ──
  const categoriasFiltradas = categorias.filter(c =>
    tipo === 'Gasto'   ? c.tipo_default !== 'Ingreso' :
    tipo === 'Ingreso' ? c.tipo_default !== 'Gasto' : true,
  )

  const subcategoriasFiltradas = subcategorias.filter(
    s => s.categoria_id === form.categoria_id,
  )

  const cuentaSeleccionada     = cuentas.find(c => c.id === form.cuenta_id)
  const cuentaDestSeleccionada = cuentas.find(c => c.id === form.cuenta_destino_id)
  const categoriaSeleccionada  = categorias.find(c => c.id === form.categoria_id)
  const subcatSeleccionada     = subcategorias.find(s => s.id === form.subcategoria_id)

  const cuotas     = parseInt(form.cuotas) || 1
  const montoNum   = parseFloat(form.monto.replace(',', '.')) || 0
  const montoCuota = cuotas > 1 && montoNum > 0 ? montoNum / cuotas : 0

  // Display helpers
  const catDisplay = categoriaSeleccionada
    ? isEmoji(categoriaSeleccionada.icono)
      ? `${categoriaSeleccionada.icono}  ${categoriaSeleccionada.nombre_categoria}`
      : categoriaSeleccionada.nombre_categoria
    : ''

  const cuentaItems    = cuentas.map(c => ({ id: c.id, label: c.nombre_cuenta, sub: `${c.tipo_cuenta} · ${c.moneda}` }))
  const categoriaItems = categoriasFiltradas.map(c => ({ id: c.id, label: c.nombre_categoria, icon: c.icono }))
  const subcatItems    = subcategoriasFiltradas.map(s => ({ id: s.id, label: s.nombre_subcategoria }))

  // ── Scan ticket ──
  const handleScanTicket = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') { Alert.alert('Permiso requerido', 'Necesitamos acceso a la cámara.'); return }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7, base64: true })
    if (result.canceled || !result.assets[0]?.base64) return
    setScanning(true)
    try {
      const { base64, mimeType } = result.assets[0]
      const data = await apiPost<{
        ok: boolean; detalle: string | null; monto: number | null
        moneda: string; fecha: string; cuotas: number
      }>('/api/leer-ticket', { image: base64, mimeType: mimeType ?? 'image/jpeg' })
      if (data.ok) {
        setForm(prev => ({
          ...prev,
          detalle: data.detalle ?? prev.detalle,
          monto:   data.monto   != null ? String(data.monto) : prev.monto,
          moneda:  (data.moneda as 'ARS' | 'USD') ?? prev.moneda,
          fecha:   data.fecha   ?? prev.fecha,
          cuotas:  data.cuotas  != null ? String(data.cuotas) : prev.cuotas,
        }))
        Alert.alert('✓ Ticket escaneado', 'Revisá los datos y confirmá.')
      }
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo leer el ticket.')
    } finally {
      setScanning(false)
    }
  }

  // ── Save ──
  const handleSave = async () => {
    if (!form.detalle.trim()) return Alert.alert('Falta el detalle')
    if (!form.monto.trim())   return Alert.alert('Falta el monto')
    if (!form.cuenta_id)      return Alert.alert('Elegí una cuenta')
    if (tipo !== 'Transferencia' && !form.categoria_id) return Alert.alert('Elegí una categoría')
    if (tipo === 'Transferencia' && !form.cuenta_destino_id) return Alert.alert('Elegí cuenta destino')
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) throw new Error('Sin sesión')
      const cuenta = cuentas.find(c => c.id === form.cuenta_id)
      if (!cuenta) throw new Error('Cuenta no encontrada')
      const isTarjeta  = cuenta.tipo_cuenta === 'Tarjeta Credito'
      const cierre     = cuenta.fecha_cierre_tarjeta      ? new Date(cuenta.fecha_cierre_tarjeta      + 'T12:00:00').getDate() : null
      const vence      = cuenta.fecha_vencimiento_tarjeta ? new Date(cuenta.fecha_vencimiento_tarjeta + 'T12:00:00').getDate() : null
      const monto      = parseFloat(form.monto.replace(',', '.'))
      const nCuotas    = tipo === 'Transferencia' ? 1 : (parseInt(form.cuotas) || 1)
      const montoCuotaActual = monto / nCuotas

      if (tipo === 'Transferencia') {
        const { error } = await supabase.from('movimientos').insert([{
          id: Crypto.randomUUID(), fecha: form.fecha, detalle: form.detalle.trim(),
          monto, moneda: form.moneda, tipo_movimiento: 'Transferencia',
          cuenta_origen: form.cuenta_id, cuenta_destino: form.cuenta_destino_id,
          categoria: null, subcategoria: null, cotizacion: null, conciliado: false,
          periodo_tarjeta: calcularPeriodo(form.fecha, cierre, vence, isTarjeta),
          cuotas_total: 1, cuota_actual: 1, ciclo_actual: 1, user_id: session.user.id,
        }])
        if (error) throw error
      } else {
        const records = Array.from({ length: nCuotas }, (_, i) => {
          const fechaCuota = addMonths(form.fecha, i)
          return {
            id: Crypto.randomUUID(), fecha: fechaCuota,
            detalle: nCuotas > 1
              ? `${form.detalle.trim()} (Cuota ${i + 1}/${nCuotas})`
              : form.detalle.trim(),
            monto: montoCuotaActual, moneda: form.moneda, tipo_movimiento: tipo,
            cuenta_origen: form.cuenta_id, cuenta_destino: null,
            categoria: form.categoria_id,
            subcategoria: form.subcategoria_id || null,
            cotizacion: null, conciliado: false,
            periodo_tarjeta: calcularPeriodo(fechaCuota, cierre, vence, isTarjeta),
            cuotas_total: nCuotas, cuota_actual: i + 1, ciclo_actual: 1,
            user_id: session.user.id,
          }
        })
        const { error } = await supabase.from('movimientos').insert(records)
        if (error) throw error
      }
      Alert.alert('✓ Guardado', `${form.detalle} por $${monto.toLocaleString('es-AR')} registrado.`, [
        { text: 'OK', onPress: () => router.back() },
      ])
      setForm({ ...EMPTY_FORM, fecha: todayAR(), cuenta_id: form.cuenta_id })
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setSaving(false)
    }
  }

  const TIPOS: TipoMov[] = ['Gasto', 'Ingreso', 'Transferencia']

  return (
    <View style={s.overlay}>
      {/* Backdrop */}
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={() => router.back()} />

      {/* Sheet */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.kav}>
        <View style={[s.sheet, { backgroundColor: theme.surface }]}>
          {/* Handle */}
          <View style={[s.handle, { backgroundColor: theme.border }]} />

          {/* Header */}
          <View style={s.header}>
            <Text style={[s.headerTitle, { color: theme.text }]}>Nuevo movimiento</Text>
            <TouchableOpacity
              style={[s.ticketBtn, { borderColor: theme.border, backgroundColor: theme.bg }, scanning && s.disabled]}
              onPress={handleScanTicket} disabled={scanning}
            >
              {scanning
                ? <ActivityIndicator color={theme.primary} size="small" />
                : <Text style={[s.ticketBtnText, { color: theme.primary }]}>📷  Ticket</Text>
              }
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ flexGrow: 0 }}
            contentContainerStyle={s.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* ── TIPO SEGMENTED ── */}
            <View style={[s.segmented, { backgroundColor: theme.bg, borderColor: theme.border }]}>
              {TIPOS.map(t => {
                const isActive = tipo === t
                return (
                  <TouchableOpacity
                    key={t}
                    style={[s.segment, isActive && { backgroundColor: theme.primary }]}
                    onPress={() => { setTipo(t); set('categoria_id', ''); set('subcategoria_id', '') }}
                    activeOpacity={0.85}
                  >
                    <Text style={[s.segmentText, { color: isActive ? '#ffffff' : theme.textSec }]}>{t}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            {/* ── FECHA + DETALLE ── */}
            <View style={s.row2}>
              <View style={[f.field, { flex: 1 }]}>
                <Label theme={theme}>Fecha</Label>
                <TextInput
                  style={[s.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                  value={form.fecha} onChangeText={v => set('fecha', v)}
                  placeholder="YYYY-MM-DD" placeholderTextColor={theme.textMuted}
                />
              </View>
              <View style={[f.field, { flex: 1.5 }]}>
                <Label theme={theme}>Detalle</Label>
                <TextInput
                  style={[s.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                  value={form.detalle} onChangeText={v => set('detalle', v)}
                  placeholder="Ej: COTO" placeholderTextColor={theme.textMuted}
                />
              </View>
            </View>

            {/* ── MONEDA + MONTO ── */}
            <View style={s.row2}>
              <View style={[f.field, { flex: 0.8 }]}>
                <Label theme={theme}>Moneda</Label>
                <View style={[s.monedaToggle, { borderColor: theme.border, backgroundColor: theme.bg }]}>
                  {(['ARS', 'USD'] as const).map(m => (
                    <TouchableOpacity
                      key={m}
                      style={[s.monedaBtn, form.moneda === m && { backgroundColor: theme.primary }]}
                      onPress={() => set('moneda', m)}
                    >
                      <Text style={[s.monedaBtnText, { color: form.moneda === m ? '#fff' : theme.textSec }]}>{m}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={[f.field, { flex: 1.2 }]}>
                <Label theme={theme}>Monto</Label>
                <TextInput
                  style={[s.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                  value={form.monto} onChangeText={v => set('monto', v)}
                  placeholder="0.00" keyboardType="decimal-pad" placeholderTextColor={theme.textMuted}
                />
              </View>
            </View>

            {/* ── CUENTA ── */}
            <Dropdown
              label="Cuenta" value={cuentaSeleccionada?.nombre_cuenta ?? ''}
              placeholder="Seleccioná una cuenta"
              onPress={() => setShowCuenta(true)} theme={theme}
            />

            {tipo === 'Transferencia' && (
              <Dropdown
                label="Cuenta destino" value={cuentaDestSeleccionada?.nombre_cuenta ?? ''}
                placeholder="Seleccioná destino"
                onPress={() => setShowCuentaDest(true)} theme={theme}
              />
            )}

            {/* ── CATEGORÍA ── */}
            {tipo !== 'Transferencia' && (
              <Dropdown
                label="Categoría" value={catDisplay}
                placeholder="Seleccioná categoría"
                onPress={() => setShowCategoria(true)} theme={theme}
                extra={
                  <TouchableOpacity>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: theme.primary }}>+ Nueva</Text>
                  </TouchableOpacity>
                }
              />
            )}

            {/* ── SUBCATEGORÍA (solo si hay subcategorías para la categoría elegida) ── */}
            {tipo !== 'Transferencia' && form.categoria_id !== '' && subcategoriasFiltradas.length > 0 && (
              <Dropdown
                label="Subcategoría (opcional)"
                value={subcatSeleccionada?.nombre_subcategoria ?? ''}
                placeholder="Sin subcategoría"
                onPress={() => setShowSubcat(true)} theme={theme}
              />
            )}

            {/* ── CUOTAS (todos los Gastos) ── */}
            {tipo === 'Gasto' && (
              <View style={f.field}>
                <Label theme={theme}>Cuotas</Label>
                <View style={s.cuotasRow}>
                  <TextInput
                    style={[s.input, s.cuotasInput, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                    value={form.cuotas} onChangeText={v => set('cuotas', v.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad" placeholderTextColor={theme.textMuted}
                  />
                  {montoCuota > 0 && cuotas > 1 && (
                    <View style={[s.cuotasBadge, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
                      <Text style={[s.cuotasBadgeText, { color: theme.primary }]}>
                        {cuotas} cuotas de ${fmt(montoCuota)} c/u
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* ── GUARDAR ── */}
            <TouchableOpacity
              style={[s.saveBtn, { backgroundColor: theme.primary }, saving && s.disabled]}
              onPress={handleSave} disabled={saving} activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.saveBtnText}>Guardar movimiento</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      {/* ── SELECTORS ── */}
      <SelectorModal
        visible={showCuenta} title="Cuenta" items={cuentaItems}
        onSelect={id => set('cuenta_id', id)} onClose={() => setShowCuenta(false)} theme={theme}
      />
      <SelectorModal
        visible={showCuentaDest} title="Cuenta destino"
        items={cuentaItems.filter(c => c.id !== form.cuenta_id)}
        onSelect={id => set('cuenta_destino_id', id)} onClose={() => setShowCuentaDest(false)} theme={theme}
      />
      <SelectorModal
        visible={showCategoria} title="Categoría" items={categoriaItems}
        onSelect={id => { set('categoria_id', id); set('subcategoria_id', '') }}
        onClose={() => setShowCategoria(false)} theme={theme}
      />
      <SelectorModal
        visible={showSubcat} title="Subcategoría" items={subcatItems}
        onSelect={id => set('subcategoria_id', id)} onClose={() => setShowSubcat(false)} theme={theme}
      />
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  overlay:  { flex: 1, justifyContent: 'flex-end' },
  backdrop: { flex: 1 },
  kav:      {},

  sheet: {
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 }, elevation: 20,
  },

  handle: {
    width: 40, height: 4, borderRadius: 2,
    alignSelf: 'center', marginTop: 12, marginBottom: 4,
  },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 10,
  },
  headerTitle:   { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  ticketBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1.5, gap: 4,
  },
  ticketBtnText: { fontSize: 13, fontWeight: '600' },

  content: { paddingHorizontal: 20, paddingBottom: 8 },

  segmented: {
    flexDirection: 'row', borderRadius: 12, padding: 3, marginBottom: 14, borderWidth: 1,
  },
  segment:     { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  segmentText: { fontSize: 13, fontWeight: '600' },

  row2: { flexDirection: 'row', gap: 10 },

  input: {
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 13, paddingVertical: 11, fontSize: 14,
  },

  monedaToggle: {
    flexDirection: 'row', borderRadius: 12, overflow: 'hidden', borderWidth: 1, height: 44,
  },
  monedaBtn:     { flex: 1, justifyContent: 'center', alignItems: 'center' },
  monedaBtnText: { fontSize: 12, fontWeight: '700' },

  cuotasRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap',
  },
  cuotasInput: {
    width: 80,
  },
  cuotasBadge: {
    flex: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  cuotasBadgeText: {
    fontSize: 13, fontWeight: '700',
  },

  saveBtn: {
    borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 8,
  },
  saveBtnText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  disabled:    { opacity: 0.55 },
})
