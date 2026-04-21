import { useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { useTheme, PALETAS, STATIC_COLORS, type PaletaId } from '@/context/ThemeContext'
import type { User } from '@supabase/supabase-js'

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
  const { colors, paletaId, setPaleta } = useTheme()
  const [user, setUser] = useState<User | null>(null)

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
    <SafeAreaView style={[s.safe, { backgroundColor: colors.bgMain }]}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.sidebar }]}>
        <Text style={s.headerTitle}>Configuración</Text>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content}>

        {/* Perfil */}
        <Section title="MI CUENTA">
          <View style={s.profileRow}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={s.avatar} />
            ) : (
              <View style={[s.avatarFallback, { backgroundColor: colors.accent }]}>
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
                onPress={() => setPaleta(p.id as PaletaId)}
                style={[
                  s.paletaBtn,
                  { backgroundColor: p.accent },
                  paletaId === p.id && s.paletaBtnActive,
                ]}
                activeOpacity={0.8}
              >
                {paletaId === p.id && <Text style={s.paletaCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
          <View style={s.paletaNames}>
            {PALETAS.map(p => (
              <Text
                key={p.id}
                style={[
                  s.paletaName,
                  paletaId === p.id && { color: colors.accent, fontWeight: '700' },
                ]}
              >
                {p.label}
              </Text>
            ))}
          </View>
          {/* Preview en vivo */}
          <View style={[s.previewRow, { backgroundColor: colors.sidebar }]}>
            <View style={[s.previewDot, { backgroundColor: colors.accent }]} />
            <Text style={s.previewText}>Vista previa del tema</Text>
            <View style={[s.previewBtn, { backgroundColor: colors.accent }]}>
              <Text style={s.previewBtnText}>Activo</Text>
            </View>
          </View>
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
  safe:   { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingVertical:   16,
  },
  headerTitle: {
    fontSize:   20,
    fontWeight: '800',
    color:      STATIC_COLORS.white,
  },
  scroll:  { flex: 1 },
  content: { padding: 20 },

  section:      { marginBottom: 24 },
  sectionTitle: {
    fontSize:     11,
    fontWeight:   '700',
    color:        STATIC_COLORS.textMuted,
    letterSpacing: 0.8,
    marginBottom:  8,
    marginLeft:    4,
  },
  sectionCard: {
    backgroundColor: STATIC_COLORS.bgCard,
    borderRadius:    16,
    borderWidth:     1,
    borderColor:     STATIC_COLORS.border,
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
    justifyContent:  'center',
    alignItems:      'center',
  },
  avatarInitial: { fontSize: 22, fontWeight: '700', color: STATIC_COLORS.white },
  profileInfo:   { flex: 1 },
  profileName:   { fontSize: 16, fontWeight: '700', color: STATIC_COLORS.textPrimary, marginBottom: 2 },
  profileEmail:  { fontSize: 13, color: STATIC_COLORS.textSecondary },

  row: {
    flexDirection:    'row',
    justifyContent:   'space-between',
    alignItems:       'center',
    paddingHorizontal: 16,
    paddingVertical:   14,
    borderBottomWidth: 1,
    borderBottomColor: STATIC_COLORS.border,
  },
  rowLabel:       { fontSize: 15, color: STATIC_COLORS.textPrimary },
  rowLabelDanger: { color: '#ef4444' },
  rowValue:       { fontSize: 14, color: STATIC_COLORS.textMuted },

  paletaLabel: {
    fontSize:     13,
    color:        STATIC_COLORS.textSecondary,
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
    borderColor: STATIC_COLORS.white,
  },
  paletaCheck: { color: STATIC_COLORS.white, fontSize: 16, fontWeight: '700' },
  paletaNames: {
    flexDirection: 'row',
    gap:           12,
    paddingHorizontal: 16,
    marginBottom:  12,
  },
  paletaName: {
    width:      40,
    fontSize:   10,
    color:      STATIC_COLORS.textMuted,
    textAlign:  'center',
  },

  previewRow: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              10,
    marginHorizontal: 16,
    marginBottom:     16,
    padding:          12,
    borderRadius:     12,
  },
  previewDot: {
    width: 12, height: 12, borderRadius: 6,
  },
  previewText: {
    flex:     1,
    fontSize: 12,
    color:    'rgba(255,255,255,0.7)',
  },
  previewBtn: {
    paddingHorizontal: 12,
    paddingVertical:   5,
    borderRadius:      8,
  },
  previewBtnText: {
    fontSize:   11,
    fontWeight: '700',
    color:      STATIC_COLORS.white,
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
