import { useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/theme'
import type { User } from '@supabase/supabase-js'

// ─── Paletas de color ─────────────────────────────────────────────────────────
const PALETAS = [
  { id: 'verde',   label: 'Verde',   color: '#1a6b5a', bg: '#07192b' },
  { id: 'azul',    label: 'Azul',    color: '#1B3A6B', bg: '#0a1628' },
  { id: 'violeta', label: 'Violeta', color: '#6d28d9', bg: '#1a0a3b' },
  { id: 'naranja', label: 'Naranja', color: '#c2410c', bg: '#1a0f07' },
  { id: 'rosa',    label: 'Rosa',    color: '#be185d', bg: '#1a0716' },
] as const

// ─── Sección visual ───────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.sectionCard}>{children}</View>
    </View>
  )
}

function Row({ label, value, onPress, danger }: {
  label: string; value?: string; onPress?: () => void; danger?: boolean
}) {
  return (
    <TouchableOpacity
      style={s.row}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <Text style={[s.rowLabel, danger && s.rowLabelDanger]}>{label}</Text>
      {value && <Text style={s.rowValue}>{value}</Text>}
    </TouchableOpacity>
  )
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function ConfiguracionScreen() {
  const [user, setUser] = useState<User | null>(null)
  const [paleta, setPaleta] = useState('verde')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })
  }, [])

  const handleLogout = () => {
    Alert.alert(
      'Cerrar sesión',
      '¿Querés salir de la app?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Salir', style: 'destructive', onPress: () => supabase.auth.signOut() },
      ]
    )
  }

  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined
  const nombre    = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? '—'
  const email     = user?.email ?? '—'

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Configuración</Text>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content}>

        {/* Perfil */}
        <Section title="MI CUENTA">
          <View style={s.profileRow}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={s.avatar} />
            ) : (
              <View style={s.avatarFallback}>
                <Text style={s.avatarInitial}>{nombre[0]?.toUpperCase() ?? '?'}</Text>
              </View>
            )}
            <View style={s.profileInfo}>
              <Text style={s.profileName}>{nombre}</Text>
              <Text style={s.profileEmail}>{email}</Text>
            </View>
          </View>
        </Section>

        {/* Paleta de colores */}
        <Section title="APARIENCIA">
          <Text style={s.paletaLabel}>Color de acento</Text>
          <View style={s.paletaRow}>
            {PALETAS.map(p => (
              <TouchableOpacity
                key={p.id}
                onPress={() => setPaleta(p.id)}
                style={[s.paletaBtn, { backgroundColor: p.color }, paleta === p.id && s.paletaBtnActive]}
                activeOpacity={0.8}
              >
                {paleta === p.id && <Text style={s.paletaCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
          <View style={s.paletaNames}>
            {PALETAS.map(p => (
              <Text key={p.id} style={[s.paletaName, paleta === p.id && s.paletaNameActive]}>
                {p.label}
              </Text>
            ))}
          </View>
          <Text style={s.paletaNote}>
            Los cambios de color se aplicarán en la próxima actualización de la app.
          </Text>
        </Section>

        {/* Versión */}
        <Section title="APP">
          <Row label="Versión" value="1.0.0" />
          <Row label="sinunmango.com.ar" value="↗" onPress={() => {}} />
        </Section>

        {/* Logout */}
        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} activeOpacity={0.85}>
          <Text style={s.logoutText}>Cerrar sesión</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.bgMain },
  header: {
    backgroundColor:   Colors.sidebar,
    paddingHorizontal: 20,
    paddingVertical:   16,
  },
  headerTitle: {
    fontSize:   20,
    fontWeight: '800',
    color:      Colors.white,
  },
  scroll:  { flex: 1 },
  content: { padding: 20 },

  section:      { marginBottom: 24 },
  sectionTitle: {
    fontSize:     11,
    fontWeight:   '700',
    color:        Colors.textMuted,
    letterSpacing: 0.8,
    marginBottom:  8,
    marginLeft:    4,
  },
  sectionCard: {
    backgroundColor: Colors.bgCard,
    borderRadius:    16,
    borderWidth:     1,
    borderColor:     Colors.border,
    overflow:        'hidden',
  },

  profileRow: {
    flexDirection: 'row',
    alignItems:    'center',
    padding:       16,
    gap:           14,
  },
  avatar: {
    width: 56, height: 56, borderRadius: 28,
  },
  avatarFallback: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.accent,
    justifyContent:  'center',
    alignItems:      'center',
  },
  avatarInitial: { fontSize: 22, fontWeight: '700', color: Colors.white },
  profileInfo:   { flex: 1 },
  profileName:   { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
  profileEmail:  { fontSize: 13, color: Colors.textSecondary },

  row: {
    flexDirection:    'row',
    justifyContent:   'space-between',
    alignItems:       'center',
    paddingHorizontal: 16,
    paddingVertical:   14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  rowLabel:       { fontSize: 15, color: Colors.textPrimary },
  rowLabelDanger: { color: '#ef4444' },
  rowValue:       { fontSize: 14, color: Colors.textMuted },

  paletaLabel: {
    fontSize:     13,
    color:        Colors.textSecondary,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingTop:   16,
  },
  paletaRow: {
    flexDirection:    'row',
    gap:              12,
    paddingHorizontal: 16,
    marginBottom:     6,
  },
  paletaBtn: {
    width:        40,
    height:       40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems:   'center',
  },
  paletaBtnActive: {
    borderWidth: 3,
    borderColor: Colors.white,
  },
  paletaCheck: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  paletaNames: {
    flexDirection: 'row',
    gap:           12,
    paddingHorizontal: 16,
    marginBottom:  12,
  },
  paletaName: {
    width:      40,
    fontSize:   10,
    color:      Colors.textMuted,
    textAlign:  'center',
  },
  paletaNameActive: { color: Colors.accent, fontWeight: '700' },
  paletaNote: {
    fontSize:         12,
    color:            Colors.textMuted,
    paddingHorizontal: 16,
    paddingBottom:    14,
    fontStyle:        'italic',
  },

  logoutBtn: {
    backgroundColor: '#fee2e2',
    borderRadius:    14,
    paddingVertical: 16,
    alignItems:      'center',
    borderWidth:     1,
    borderColor:     '#fecaca',
  },
  logoutText: {
    color:      '#dc2626',
    fontSize:   15,
    fontWeight: '700',
  },
})
