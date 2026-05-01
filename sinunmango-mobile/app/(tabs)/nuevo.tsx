import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Modal, FlatList,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import * as Crypto from 'expo-crypto'
import { supabase } from '@/lib/supabase'
import { apiPost } from '@/lib/api'
import { useTheme, type Theme } from '@/context/ThemeContext'

// ─── Types ────────────────────────────────────────────────────────────────────
type TipoMov = 'Gasto' | 'Ingreso' | 'Transferencia'

type Cuenta    = {
  id: string
  nombre_cuenta: string
  tipo_cuenta: string
  moneda: string
  fecha_cierre_tarjeta: string | null
  fecha_vencimiento_tarjeta: string | null
}
type Categoria = { id: string; nombre_categoria: string; icono: string; tipo_default: string }

type Form = {
  detalle:      string
  monto:        string
  moneda:       'ARS' | 'USD'
  cuotas:       string
  cuenta_id:    string
  cuenta_destino_id: string
  categoria_id: string
  fecha:        string
}

const today = () => new Date().toISOString().slice(0, 10)

const EMPTY_FORM: Form = {
  detalle:           '',
  monto:             '',
  moneda:            'ARS',
  cuotas:            '1',
  cuenta_id:         '',
  cuenta_destino_id: '',
  categoria_id:      '',
  fecha:             today(),
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function calcularPeriodo(fecha: string, cierre: number | null, vence: number | null, esTarjeta: boolean) {
  const d    = new Date(fecha + 'T12:00:00')
  let mes    = d.getMonth()
  let anio   = d.getFullYear()
  if (esTarjeta && cierre && vence) {
    const day = d.getDate()
    if (day <= cierre) {
      if (vence <= cierre) mes++
    } else {
      if (vence > cierre) mes++
      else mes += 2
    }
    while (mes > 11) { mes -= 12; anio++ }
  }
  return `${anio}-${String(mes + 1).padStart(2, '0')}-01`
}

function addMonths(d: string, n: number) {
  const dt = new Date(d + 'T12:00:00')
  dt.setMonth(dt.getMonth() + n)
  return dt.toISOString().slice(0, 10)
}

// ─── Selector Modal ───────────────────────────────────────────────────────────
function SelectorModal<T extends { id: string; label: string; sub?: string; icon?: string }>({
  visible, title, items, onSelect, onClose, theme,
}: {
  visible:  boolean
  title:    string
  items:    T[]
  onSelect: (id: string) => void
  onClose:  () => void
  theme:    Theme
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={onClose} activeOpacity={1} />
      <View style={[mod.sheet, { backgroundColor: theme.surface }]}>
        <View style={[mod.handle, { backgroundColor: theme.border }]} />
        <Text style={[mod.title, { color: theme.text }]}>{title}</Text>
        <FlatList
          data={items}
          keyExtractor={i => i.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={mod.item}
              onPress={() => { onSelect(item.id); onClose() }}
              activeOpacity={0.7}
            >
              {item.icon ? <Text style={mod.itemIcon}>{item.icon}</Text> : null}
              <View style={mod.itemText}>
                <Text style={[mod.itemLabel, { color: theme.text }]}>{item.label}</Text>
                {item.sub ? <Text style={[mod.itemSub, { color: theme.textMuted }]}>{item.sub}</Text> : null}
              </View>
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={[mod.separator, { backgroundColor: theme.border }]} />}
        />
      </View>
    </Modal>
  )
}

const mod = StyleSheet.create({
  sheet: {
    borderTopLeftRadius:  24,
    borderTopRightRadius: 24,
    paddingHorizontal:    20,
    paddingTop:           12,
    paddingBottom:        40,
    maxHeight:            '70%',
  },
  handle: {
    width: 40, height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title:     { fontSize: 17, fontWeight: '700', marginBottom: 12 },
  item:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
  itemIcon:  { fontSize: 22, width: 32, textAlign: 'center' },
  itemText:  { flex: 1 },
  itemLabel: { fontSize: 15, fontWeight: '500' },
  itemSub:   { fontSize: 12, marginTop: 2 },
  separator: { height: 1 },
})

// ─── Field label ──────────────────────────────────────────────────────────────
function FieldLabel({ children, theme }: { children: string; theme: Theme }) {
  return (
    <Text style={[fl.label, { color: theme.textMuted }]}>{children}</Text>
  )
}

// ─── Dropdown field ───────────────────────────────────────────────────────────
function DropdownField({ label, value, placeholder, onPress, extra, theme }: {
  label:       string
  value:       string
  placeholder: string
  onPress:     () => void
  extra?:      React.ReactNode
  theme:       Theme
}) {
  return (
    <View style={fl.field}>
      {extra ? (
        <View style={fl.labelRow}>
          <FieldLabel theme={theme}>{label}</FieldLabel>
          {extra}
        </View>
      ) : (
        <FieldLabel theme={theme}>{label}</FieldLabel>
      )}
      <TouchableOpacity
        style={[fl.dropdown, { backgroundColor: theme.bg, borderColor: theme.border }]}
        onPress={onPress}
        activeOpacity={0.8}
      >
        <Text style={[fl.dropdownText, { color: value ? theme.text : theme.textMuted }]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Text style={[fl.chevron, { color: theme.textMuted }]}>›</Text>
      </TouchableOpacity>
    </View>
  )
}

const fl = StyleSheet.create({
  field:    { marginBottom: 14 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  label:    { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  dropdown: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    borderWidth: 1,
  },
  dropdownText: { flex: 1, fontSize: 15, fontWeight: '500' },
  chevron:      { fontSize: 20, fontWeight: '300' },
})

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function NuevoMovimientoScreen() {
  const { theme } = useTheme()
  const [tipo, setTipo]             = useState<TipoMov>('Gasto')
  const [form, setForm]             = useState<Form>(EMPTY_FORM)
  const [cuentas, setCuentas]       = useState<Cuenta[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [scanning, setScanning]     = useState(false)
  const [saving, setSaving]         = useState(false)
  const [showCuenta, setShowCuenta] = useState(false)
  const [showCuentaDest, setShowCuentaDest] = useState(false)
  const [showCategoria, setShowCategoria]   = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return
      const [{ data: c }, { data: cat }] = await Promise.all([
        supabase.from('cuentas')
          .select('id, nombre_cuenta, tipo_cuenta, moneda, fecha_cierre_tarjeta, fecha_vencimiento_tarjeta')
          .eq('activa', true).eq('user_id', session.user.id).order('nombre_cuenta'),
        supabase.from('categorias')
          .select('id, nombre_categoria, icono, tipo_default')
          .eq('user_id', session.user.id).order('nombre_categoria'),
      ])
      setCuentas(c ?? [])
      setCategorias(cat ?? [])
      if (c && c.length > 0) {
        setForm(prev => ({ ...prev, cuenta_id: prev.cuenta_id || c[0].id }))
      }
    }
    load()
  }, [])

  const set = useCallback((key: keyof Form, val: string) => {
    setForm(prev => ({ ...prev, [key]: val }))
  }, [])

  const categoriasFiltradas = categorias.filter(c =>
    tipo === 'Gasto'   ? c.tipo_default !== 'Ingreso' :
    tipo === 'Ingreso' ? c.tipo_default !== 'Gasto' :
    true
  )

  // ── OCR ─────────────────────────────────────────────────────────────────────
  const handleScanTicket = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a la cámara para escanear tickets.')
      return
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'], quality: 0.7, base64: true,
    })
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

  // ── Save ─────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.detalle.trim()) return Alert.alert('Falta el detalle')
    if (!form.monto.trim())   return Alert.alert('Falta el monto')
    if (!form.cuenta_id)      return Alert.alert('Elegí una cuenta')
    if (tipo !== 'Transferencia' && !form.categoria_id) return Alert.alert('Elegí una categoría')
    if (tipo === 'Transferencia' && !form.cuenta_destino_id) return Alert.alert('Elegí la cuenta destino')

    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) throw new Error('Sin sesión')

      const cuenta = cuentas.find(c => c.id === form.cuenta_id)
      if (!cuenta) throw new Error('Cuenta no encontrada')

      const isTarjeta  = cuenta.tipo_cuenta === 'Tarjeta Credito'
      const cierre     = cuenta.fecha_cierre_tarjeta        ? new Date(cuenta.fecha_cierre_tarjeta        + 'T12:00:00').getDate() : null
      const vence      = cuenta.fecha_vencimiento_tarjeta   ? new Date(cuenta.fecha_vencimiento_tarjeta   + 'T12:00:00').getDate() : null
      const monto      = parseFloat(form.monto.replace(',', '.'))
      const cuotas     = tipo === 'Transferencia' ? 1 : (parseInt(form.cuotas) || 1)
      const montoCuota = monto / cuotas

      if (tipo === 'Transferencia') {
        const records = [{
          id: Crypto.randomUUID(), fecha: form.fecha, detalle: form.detalle.trim(),
          monto, moneda: form.moneda, tipo_movimiento: 'Transferencia',
          cuenta_origen: form.cuenta_id, cuenta_destino: form.cuenta_destino_id,
          categoria: null, subcategoria: null, cotizacion: null, conciliado: false,
          periodo_tarjeta: calcularPeriodo(form.fecha, cierre, vence, isTarjeta),
          cuotas_total: 1, cuota_actual: 1, ciclo_actual: 1, user_id: session.user.id,
        }]
        const { error } = await supabase.from('movimientos').insert(records)
        if (error) throw error
      } else {
        const records = Array.from({ length: cuotas }, (_, i) => {
          const fechaCuota = addMonths(form.fecha, i)
          return {
            id: Crypto.randomUUID(), fecha: fechaCuota,
            detalle: cuotas > 1 ? `${form.detalle.trim()} (Cuota ${i + 1}/${cuotas})` : form.detalle.trim(),
            monto: montoCuota, moneda: form.moneda, tipo_movimiento: tipo,
            cuenta_origen: form.cuenta_id, cuenta_destino: null,
            categoria: form.categoria_id, subcategoria: null, cotizacion: null, conciliado: false,
            periodo_tarjeta: calcularPeriodo(fechaCuota, cierre, vence, isTarjeta),
            cuotas_total: cuotas, cuota_actual: i + 1, ciclo_actual: 1, user_id: session.user.id,
          }
        })
        const { error } = await supabase.from('movimientos').insert(records)
        if (error) throw error
      }

      Alert.alert('✓ Guardado', `${form.detalle} por $${monto.toLocaleString('es-AR')} registrado.`)
      setForm({ ...EMPTY_FORM, fecha: today(), cuenta_id: form.cuenta_id })
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setSaving(false)
    }
  }

  // ── Derived values ─────────────────────────────────────────────────────────
  const cuentaSeleccionada      = cuentas.find(c => c.id === form.cuenta_id)
  const cuentaDestSeleccionada  = cuentas.find(c => c.id === form.cuenta_destino_id)
  const categoriaSeleccionada   = categorias.find(c => c.id === form.categoria_id)

  const cuentaItems = cuentas.map(c => ({
    id: c.id, label: c.nombre_cuenta, sub: `${c.tipo_cuenta} · ${c.moneda}`,
  }))
  const categoriaItems = categoriasFiltradas.map(c => ({
    id: c.id, label: c.nombre_categoria, icon: c.icono,
  }))

  const TIPO_COLORS: Record<TipoMov, string> = {
    Gasto:         theme.expense,
    Ingreso:       theme.income,
    Transferencia: theme.primary,
  }

  const TIPOS: TipoMov[] = ['Gasto', 'Ingreso', 'Transferencia']

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.bg }]} edges={['top']}>

      {/* ── HEADER ── */}
      <View style={[s.header, { backgroundColor: theme.bg }]}>
        <Text style={[s.headerTitle, { color: theme.text }]}>Nuevo movimiento</Text>
        <TouchableOpacity
          style={[s.ticketBtn, { borderColor: theme.border, backgroundColor: theme.surface }, scanning && s.btnDisabled]}
          onPress={handleScanTicket}
          disabled={scanning}
        >
          {scanning
            ? <ActivityIndicator color={theme.primary} size="small" />
            : <Text style={[s.ticketBtnText, { color: theme.primary }]}>📷  Ticket</Text>
          }
        </TouchableOpacity>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>

          {/* ── TIPO SEGMENTED CONTROL ── */}
          <View style={[s.segmented, { backgroundColor: theme.bg, borderColor: theme.border }]}>
            {TIPOS.map(t => {
              const isActive = tipo === t
              return (
                <TouchableOpacity
                  key={t}
                  style={[
                    s.segment,
                    isActive && { backgroundColor: TIPO_COLORS[t] },
                  ]}
                  onPress={() => { setTipo(t); set('categoria_id', '') }}
                  activeOpacity={0.85}
                >
                  <Text style={[s.segmentText, { color: isActive ? '#ffffff' : theme.textSec }]}>
                    {t}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          {/* ── FECHA y DETALLE ── */}
          <View style={s.row2}>
            <View style={[fl.field, { flex: 1 }]}>
              <FieldLabel theme={theme}>Fecha</FieldLabel>
              <TextInput
                style={[s.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                value={form.fecha}
                onChangeText={v => set('fecha', v)}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.textMuted}
              />
            </View>
            <View style={[fl.field, { flex: 1.4 }]}>
              <FieldLabel theme={theme}>Detalle</FieldLabel>
              <TextInput
                style={[s.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                value={form.detalle}
                onChangeText={v => set('detalle', v)}
                placeholder="Ej: COTO"
                placeholderTextColor={theme.textMuted}
              />
            </View>
          </View>

          {/* ── MONEDA y MONTO ── */}
          <View style={s.row2}>
            <View style={[fl.field, { flex: 0.8 }]}>
              <FieldLabel theme={theme}>Moneda</FieldLabel>
              <View style={[s.monedaToggle, { borderColor: theme.border }]}>
                {(['ARS', 'USD'] as const).map(m => (
                  <TouchableOpacity
                    key={m}
                    style={[
                      s.monedaBtn,
                      { backgroundColor: form.moneda === m ? theme.primary : theme.bg },
                    ]}
                    onPress={() => set('moneda', m)}
                  >
                    <Text style={[s.monedaBtnText, { color: form.moneda === m ? '#ffffff' : theme.textSec }]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={[fl.field, { flex: 1.2 }]}>
              <FieldLabel theme={theme}>Monto</FieldLabel>
              <TextInput
                style={[s.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                value={form.monto}
                onChangeText={v => set('monto', v)}
                placeholder="0.00"
                keyboardType="decimal-pad"
                placeholderTextColor={theme.textMuted}
              />
            </View>
          </View>

          {/* ── CUENTA (origen) ── */}
          <DropdownField
            label="Cuenta"
            value={cuentaSeleccionada?.nombre_cuenta ?? ''}
            placeholder="Seleccioná una cuenta"
            onPress={() => setShowCuenta(true)}
            theme={theme}
          />

          {/* ── CUENTA DESTINO (solo Transferencia) ── */}
          {tipo === 'Transferencia' && (
            <DropdownField
              label="Cuenta destino"
              value={cuentaDestSeleccionada?.nombre_cuenta ?? ''}
              placeholder="Seleccioná destino"
              onPress={() => setShowCuentaDest(true)}
              theme={theme}
            />
          )}

          {/* ── CATEGORÍA (no Transferencia) ── */}
          {tipo !== 'Transferencia' && (
            <DropdownField
              label="Categoría"
              value={categoriaSeleccionada
                ? `${categoriaSeleccionada.icono}  ${categoriaSeleccionada.nombre_categoria}`
                : ''}
              placeholder="Seleccioná categoría"
              onPress={() => setShowCategoria(true)}
              theme={theme}
              extra={
                <TouchableOpacity>
                  <Text style={[s.newCatBtn, { color: theme.primary }]}>+ Nueva</Text>
                </TouchableOpacity>
              }
            />
          )}

          {/* ── CUOTAS (solo Gasto con tarjeta) ── */}
          {tipo === 'Gasto' && cuentaSeleccionada?.tipo_cuenta === 'Tarjeta Credito' && (
            <View style={fl.field}>
              <FieldLabel theme={theme}>Cuotas</FieldLabel>
              <TextInput
                style={[s.input, { width: 100, backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                value={form.cuotas}
                onChangeText={v => set('cuotas', v)}
                keyboardType="number-pad"
                placeholderTextColor={theme.textMuted}
              />
            </View>
          )}

          {/* ── GUARDAR ── */}
          <TouchableOpacity
            style={[s.saveBtn, { backgroundColor: TIPO_COLORS[tipo] }, saving && s.btnDisabled]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={s.saveBtnText}>Guardar movimiento</Text>
            }
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── MODALS ── */}
      <SelectorModal
        visible={showCuenta}
        title="Cuenta"
        items={cuentaItems}
        onSelect={id => set('cuenta_id', id)}
        onClose={() => setShowCuenta(false)}
        theme={theme}
      />
      <SelectorModal
        visible={showCuentaDest}
        title="Cuenta destino"
        items={cuentaItems.filter(c => c.id !== form.cuenta_id)}
        onSelect={id => set('cuenta_destino_id', id)}
        onClose={() => setShowCuentaDest(false)}
        theme={theme}
      />
      <SelectorModal
        visible={showCategoria}
        title="Categoría"
        items={categoriaItems}
        onSelect={id => set('categoria_id', id)}
        onClose={() => setShowCategoria(false)}
        theme={theme}
      />
    </SafeAreaView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:    { flex: 1 },
  scroll:  { flex: 1 },
  content: { padding: 16 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  ticketBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1.5, gap: 4,
  },
  ticketBtnText: { fontSize: 13, fontWeight: '600' },

  card: {
    borderRadius: 20, padding: 18, borderWidth: 1,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },

  segmented: {
    flexDirection: 'row', borderRadius: 12, padding: 3, marginBottom: 18, borderWidth: 1,
  },
  segment: {
    flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center',
  },
  segmentText: { fontSize: 13, fontWeight: '600' },

  row2: { flexDirection: 'row', gap: 10 },

  input: {
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 13, paddingVertical: 12,
    fontSize: 15,
  },

  monedaToggle: {
    flexDirection: 'row', borderRadius: 12, overflow: 'hidden', borderWidth: 1, height: 46,
  },
  monedaBtn: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
  },
  monedaBtnText: { fontSize: 12, fontWeight: '700' },

  newCatBtn: { fontSize: 12, fontWeight: '700' },

  saveBtn: {
    borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 6,
  },
  saveBtnText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  btnDisabled: { opacity: 0.55 },
})
