import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import * as Crypto from 'expo-crypto'
import { supabase } from '@/lib/supabase'
import { apiPost } from '@/lib/api'
import { Colors } from '@/constants/theme'

// ─── Types ────────────────────────────────────────────────────────────────────
type Cuenta    = { id: string; nombre_cuenta: string; tipo_cuenta: string; moneda: string; fecha_cierre_tarjeta: string | null; fecha_vencimiento_tarjeta: string | null }
type Categoria = { id: string; nombre_categoria: string; tipo_default: string }

type Form = {
  detalle:      string
  monto:        string
  moneda:       'ARS' | 'USD'
  cuotas:       string
  cuenta_id:    string
  categoria_id: string
  fecha:        string
}

const today = () => new Date().toISOString().slice(0, 10)

const EMPTY_FORM: Form = {
  detalle:      '',
  monto:        '',
  moneda:       'ARS',
  cuotas:       '1',
  cuenta_id:    '',
  categoria_id: '',
  fecha:        today(),
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

// ─── Selector component ───────────────────────────────────────────────────────
function Selector<T extends { id: string; label: string }>({
  label, items, selectedId, onSelect, placeholder,
}: {
  label:       string
  items:       T[]
  selectedId:  string
  onSelect:    (id: string) => void
  placeholder: string
}) {
  const selected = items.find(i => i.id === selectedId)
  return (
    <View style={fieldStyles.field}>
      <Text style={fieldStyles.label}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={fieldStyles.chipScroll}>
        {items.map(item => (
          <TouchableOpacity
            key={item.id}
            onPress={() => onSelect(item.id)}
            style={[
              fieldStyles.chip,
              item.id === selectedId && fieldStyles.chipActive,
            ]}
          >
            <Text style={[
              fieldStyles.chipText,
              item.id === selectedId && fieldStyles.chipTextActive,
            ]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  )
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function NuevoMovimientoScreen() {
  const [form, setForm]           = useState<Form>(EMPTY_FORM)
  const [cuentas, setCuentas]     = useState<Cuenta[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [scanning, setScanning]   = useState(false)
  const [saving, setSaving]       = useState(false)

  // Load cuentas + categorias on mount
  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return

      const [{ data: c }, { data: cat }] = await Promise.all([
        supabase.from('cuentas').select('id, nombre_cuenta, tipo_cuenta, moneda, fecha_cierre_tarjeta, fecha_vencimiento_tarjeta').eq('activa', true).eq('user_id', session.user.id).order('nombre_cuenta'),
        supabase.from('categorias').select('id, nombre_categoria, tipo_default').eq('user_id', session.user.id).order('nombre_categoria'),
      ])
      setCuentas(c ?? [])
      setCategorias(cat ?? [])
    }
    load()
  }, [])

  const set = useCallback((key: keyof Form, val: string) => {
    setForm(prev => ({ ...prev, [key]: val }))
  }, [])

  // ── OCR ───────────────────────────────────────────────────────────────────
  const handleScanTicket = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a la cámara para escanear tickets.')
      return
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality:    0.7,
      base64:     true,
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

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.detalle.trim())   return Alert.alert('Falta el detalle')
    if (!form.monto.trim())     return Alert.alert('Falta el monto')
    if (!form.cuenta_id)        return Alert.alert('Elegí una cuenta')
    if (!form.categoria_id)     return Alert.alert('Elegí una categoría')

    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) throw new Error('Sin sesión')

      const cuenta = cuentas.find(c => c.id === form.cuenta_id)
      if (!cuenta) throw new Error('Cuenta no encontrada')

      const isTarjeta = cuenta.tipo_cuenta === 'Tarjeta Credito'
      // Extraer día de cierre y vencimiento para calcular período correcto
      const cierre = cuenta.fecha_cierre_tarjeta
        ? new Date(cuenta.fecha_cierre_tarjeta + 'T12:00:00').getDate()
        : null
      const vence = cuenta.fecha_vencimiento_tarjeta
        ? new Date(cuenta.fecha_vencimiento_tarjeta + 'T12:00:00').getDate()
        : null

      const monto      = parseFloat(form.monto.replace(',', '.'))
      const cuotas     = parseInt(form.cuotas) || 1
      const montoCuota = monto / cuotas

      const records = Array.from({ length: cuotas }, (_, i) => {
        const fechaCuota = addMonths(form.fecha, i)
        return {
          id:              Crypto.randomUUID(),
          fecha:           fechaCuota,
          detalle:         cuotas > 1 ? `${form.detalle.trim()} (Cuota ${i + 1}/${cuotas})` : form.detalle.trim(),
          monto:           montoCuota,
          moneda:          form.moneda,
          tipo_movimiento: 'Gasto',
          cuenta_origen:   form.cuenta_id,
          cuenta_destino:  null,
          categoria:       form.categoria_id,
          subcategoria:    null,
          cotizacion:      null,
          conciliado:      false,
          periodo_tarjeta: calcularPeriodo(fechaCuota, cierre, vence, isTarjeta),
          cuotas_total:    cuotas,
          cuota_actual:    i + 1,
          ciclo_actual:    1,
          user_id:         session.user.id,
        }
      })

      const { error } = await supabase.from('movimientos').insert(records)
      if (error) throw error

      Alert.alert('✓ Guardado', `${form.detalle} por $${monto.toLocaleString('es-AR')} registrado.`)
      setForm({ ...EMPTY_FORM, fecha: today() })
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setSaving(false)
    }
  }

  const cuentaItems    = cuentas.map(c => ({ id: c.id, label: `${c.nombre_cuenta} (${c.moneda})` }))
  const categoriaItems = categorias.map(c => ({ id: c.id, label: c.nombre_categoria }))

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Nuevo movimiento</Text>
        <TouchableOpacity
          style={[s.scanBtn, scanning && s.btnDisabled]}
          onPress={handleScanTicket}
          disabled={scanning}
        >
          {scanning
            ? <ActivityIndicator color={Colors.white} size="small" />
            : <Text style={s.scanBtnText}>📷  Escanear ticket</Text>
          }
        </TouchableOpacity>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

        {/* Detalle */}
        <View style={fieldStyles.field}>
          <Text style={fieldStyles.label}>Detalle</Text>
          <TextInput
            style={fieldStyles.input}
            value={form.detalle}
            onChangeText={v => set('detalle', v)}
            placeholder="Ej: Supermercado, nafta, cena..."
            placeholderTextColor={Colors.textMuted}
          />
        </View>

        {/* Monto + Moneda */}
        <View style={s.row}>
          <View style={[fieldStyles.field, { flex: 2, marginRight: 8 }]}>
            <Text style={fieldStyles.label}>Monto</Text>
            <TextInput
              style={fieldStyles.input}
              value={form.monto}
              onChangeText={v => set('monto', v)}
              placeholder="0"
              keyboardType="decimal-pad"
              placeholderTextColor={Colors.textMuted}
            />
          </View>
          <View style={[fieldStyles.field, { flex: 1 }]}>
            <Text style={fieldStyles.label}>Moneda</Text>
            <View style={s.toggleRow}>
              {(['ARS', 'USD'] as const).map(m => (
                <TouchableOpacity
                  key={m}
                  style={[s.toggleBtn, form.moneda === m && s.toggleBtnActive]}
                  onPress={() => set('moneda', m)}
                >
                  <Text style={[s.toggleBtnText, form.moneda === m && s.toggleBtnTextActive]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Cuotas */}
        <View style={fieldStyles.field}>
          <Text style={fieldStyles.label}>Cuotas</Text>
          <TextInput
            style={fieldStyles.input}
            value={form.cuotas}
            onChangeText={v => set('cuotas', v)}
            keyboardType="number-pad"
            placeholderTextColor={Colors.textMuted}
          />
        </View>

        {/* Preview de cuotas */}
        {parseInt(form.cuotas) > 1 && parseFloat(form.monto.replace(',', '.')) > 0 && (() => {
          const cuotas = parseInt(form.cuotas)
          const total  = parseFloat(form.monto.replace(',', '.'))
          const cuota  = total / cuotas
          return (
            <View style={cuotaPreviewStyles.box}>
              <Text style={cuotaPreviewStyles.title}>
                {cuotas} cuotas de ${cuota.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} {form.moneda}
              </Text>
              {Array.from({ length: cuotas }, (_, i) => (
                <View key={i} style={cuotaPreviewStyles.row}>
                  <Text style={cuotaPreviewStyles.label}>
                    Cuota {i + 1}/{cuotas} · {addMonths(form.fecha || today(), i)}
                  </Text>
                  <Text style={cuotaPreviewStyles.amount}>
                    ${cuota.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                  </Text>
                </View>
              ))}
            </View>
          )
        })()}

        {/* Fecha */}
        <View style={fieldStyles.field}>
          <Text style={fieldStyles.label}>Fecha (YYYY-MM-DD)</Text>
          <TextInput
            style={fieldStyles.input}
            value={form.fecha}
            onChangeText={v => set('fecha', v)}
            placeholder="2026-04-18"
            placeholderTextColor={Colors.textMuted}
          />
        </View>

        {/* Cuenta */}
        <Selector
          label="Cuenta"
          items={cuentaItems}
          selectedId={form.cuenta_id}
          onSelect={id => set('cuenta_id', id)}
          placeholder="Elegí una cuenta"
        />

        {/* Categoría */}
        <Selector
          label="Categoría"
          items={categoriaItems}
          selectedId={form.categoria_id}
          onSelect={id => set('categoria_id', id)}
          placeholder="Elegí una categoría"
        />

        {/* Guardar */}
        <TouchableOpacity
          style={[s.saveBtn, saving && s.btnDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving
            ? <ActivityIndicator color={Colors.white} size="small" />
            : <Text style={s.saveBtnText}>Guardar movimiento</Text>
          }
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const cuotaPreviewStyles = StyleSheet.create({
  box: {
    backgroundColor: '#eff6ff',
    borderWidth:     1,
    borderColor:     '#bfdbfe',
    borderRadius:    12,
    padding:         12,
    marginBottom:    16,
  },
  title: {
    fontSize:     13,
    fontWeight:   '700',
    color:        '#1d4ed8',
    marginBottom: 8,
  },
  row: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#dbeafe',
  },
  label:  { fontSize: 12, color: '#3b82f6' },
  amount: { fontSize: 12, fontWeight: '600', color: '#1d4ed8' },
})

const fieldStyles = StyleSheet.create({
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize:     12,
    fontWeight:   '600',
    color:        Colors.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: Colors.bgCard,
    borderWidth:     1,
    borderColor:     Colors.border,
    borderRadius:    12,
    paddingHorizontal: 14,
    paddingVertical:   12,
    fontSize:        15,
    color:           Colors.textPrimary,
  },
  chipScroll: {
    flexDirection: 'row',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical:   8,
    borderRadius:      20,
    borderWidth:       1,
    borderColor:       Colors.border,
    backgroundColor:   Colors.bgCard,
    marginRight:       8,
  },
  chipActive: {
    backgroundColor: Colors.accent,
    borderColor:     Colors.accent,
  },
  chipText: {
    fontSize:   13,
    color:      Colors.textSecondary,
    fontWeight: '500',
  },
  chipTextActive: {
    color:      Colors.white,
    fontWeight: '700',
  },
})

const s = StyleSheet.create({
  safe: {
    flex:            1,
    backgroundColor: Colors.bgMain,
  },
  header: {
    backgroundColor:  Colors.sidebar,
    paddingHorizontal: 20,
    paddingTop:        16,
    paddingBottom:     16,
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
  },
  headerTitle: {
    fontSize:   20,
    fontWeight: '800',
    color:      Colors.white,
  },
  scanBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: Colors.accent,
    paddingHorizontal: 14,
    paddingVertical:   8,
    borderRadius:    20,
    gap:             6,
  },
  scanBtnText: {
    color:      Colors.white,
    fontSize:   13,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems:    'flex-start',
  },
  toggleRow: {
    flexDirection:  'row',
    borderRadius:   12,
    overflow:       'hidden',
    borderWidth:    1,
    borderColor:    Colors.border,
    height:         46,
  },
  toggleBtn: {
    flex:           1,
    justifyContent: 'center',
    alignItems:     'center',
    backgroundColor: Colors.bgCard,
  },
  toggleBtnActive: {
    backgroundColor: Colors.accent,
  },
  toggleBtnText: {
    fontSize:   13,
    fontWeight: '600',
    color:      Colors.textSecondary,
  },
  toggleBtnTextActive: {
    color: Colors.white,
  },
  saveBtn: {
    backgroundColor: Colors.accent,
    borderRadius:    14,
    paddingVertical: 16,
    alignItems:      'center',
    marginTop:       8,
  },
  saveBtnText: {
    color:      Colors.white,
    fontSize:   16,
    fontWeight: '700',
  },
})
