import { useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { useTheme, ACCENTS, type AccentId, type ModeId } from '@/context/ThemeContext'
import type { User } from '@supabase/supabase-js'

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function ConfiguracionScreen() {
  const { theme, accentId, mode, setAccent, setMode } = useTheme()
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

  const nombre   = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? '—'
  const email    = user?.email ?? '—'
  const initial  = nombre[0]?.toUpperCase() ?? '?'

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* ── PERFIL ── */}
        <View style={[s.profileCard, { backgroundColor: theme.primary }]}>
          <View style={s.profileInner}>
            <View style={s.avatarCircle}>
              <Text style={s.avatarInitial}>{initial}</Text>
            </View>
            <View style={s.profileText}>
              <Text style={s.profileLabel}>Mi cuenta</Text>
              <Text style={s.profileName} numberOfLines={1}>{nombre}</Text>
              <Text style={s.profileEmail} numberOfLines={1}>{email}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.5)" />
          </View>
        </View>

        {/* ── APARIENCIA ── */}
        <View style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {/* Header de sección */}
          <View style={[s.cardHeader, { borderBottomColor: theme.border }]}>
            <Ionicons name="color-palette-outline" size={18} color={theme.primary} />
            <View style={s.cardHeaderText}>
              <Text style={[s.cardTitle, { color: theme.text }]}>Apariencia</Text>
              <Text style={[s.cardSub, { color: theme.textMuted }]}>Colores y modo de visualización</Text>
            </View>
          </View>

          {/* Color de acento */}
          <View style={s.section}>
            <Text style={[s.sectionLabel, { color: theme.textMuted }]}>Color de acento</Text>
            <View style={s.accentRow}>
              {ACCENTS.map(a => {
                const isActive = accentId === a.id
                return (
                  <TouchableOpacity
                    key={a.id}
                    onPress={() => setAccent(a.id as AccentId)}
                    style={[
                      s.accentBtn,
                      { backgroundColor: a.hex },
                      isActive
                        ? { borderWidth: 3, borderColor: '#ffffff' }
                        : { borderWidth: 3, borderColor: 'transparent' },
                    ]}
                    activeOpacity={0.8}
                  >
                    {isActive && (
                      <Ionicons name="checkmark" size={18} color="#ffffff" />
                    )}
                  </TouchableOpacity>
                )
              })}
            </View>
            <View style={s.accentNames}>
              {ACCENTS.map(a => (
                <Text
                  key={a.id}
                  style={[
                    s.accentName, { color: theme.textMuted },
                    accentId === a.id && { color: theme.primary, fontWeight: '700' },
                  ]}
                >
                  {a.label}
                </Text>
              ))}
            </View>
          </View>

          {/* Modo claro / oscuro */}
          <View style={[s.section, { paddingTop: 0 }]}>
            <Text style={[s.sectionLabel, { color: theme.textMuted }]}>Modo de visualización</Text>
            <View style={s.modeRow}>
              {(['claro', 'oscuro'] as ModeId[]).map(m => {
                const isActive = mode === m
                return (
                  <TouchableOpacity
                    key={m}
                    onPress={() => setMode(m)}
                    style={[
                      s.modeBtn,
                      { backgroundColor: theme.surfaceAlt, borderColor: theme.border },
                      isActive && { borderColor: theme.primary, borderWidth: 2 },
                    ]}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={m === 'claro' ? 'sunny-outline' : 'moon-outline'}
                      size={18}
                      color={isActive ? theme.primary : theme.textSec}
                    />
                    <Text style={[
                      s.modeBtnText, { color: theme.textSec },
                      isActive && { color: theme.primary, fontWeight: '700' },
                    ]}>
                      {m === 'claro' ? 'Claro' : 'Oscuro'}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
        </View>

        {/* ── APP ── */}
        <View style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={[s.appRow, { borderBottomColor: theme.border }]}>
            <Text style={[s.appRowLabel, { color: theme.text }]}>Versión</Text>
            <Text style={[s.appRowValue, { color: theme.textMuted }]}>1.0.0</Text>
          </View>
          <View style={s.appRow}>
            <Text style={[s.appRowLabel, { color: theme.text }]}>app.sinunmango.com.ar</Text>
            <Ionicons name="open-outline" size={14} color={theme.textMuted} />
          </View>
        </View>

        {/* ── LOGOUT ── */}
        <TouchableOpacity
          style={[s.logoutBtn, { backgroundColor: theme.mode === 'oscuro' ? '#2d1515' : '#fee2e2', borderColor: '#fecaca' }]}
          onPress={handleLogout}
          activeOpacity={0.85}
        >
          <Ionicons name="log-out-outline" size={18} color="#dc2626" />
          <Text style={s.logoutText}>Cerrar sesión</Text>
        </TouchableOpacity>

        {/* ── FOOTER ── */}
        <View style={s.footer}>
          <Image
            source={require('@/assets/logo_completo.png')}
            style={[s.footerLogo, { tintColor: theme.textMuted }]}
            resizeMode="contain"
          />
          <Text style={[s.footerVersion, { color: theme.textMuted }]}>v1.0.0</Text>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:    { flex: 1 },
  scroll:  { flex: 1 },
  content: { padding: 20, gap: 16 },

  // Perfil
  profileCard: {
    borderRadius: 18,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
  profileInner: {
    flexDirection: 'row', alignItems: 'center', padding: 20, gap: 14,
  },
  avatarCircle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarInitial: { fontSize: 22, fontWeight: '700', color: '#ffffff' },
  profileText:   { flex: 1 },
  profileLabel:  { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.55)', letterSpacing: 0.8, marginBottom: 2 },
  profileName:   { fontSize: 16, fontWeight: '700', color: '#ffffff', marginBottom: 2 },
  profileEmail:  { fontSize: 12, color: 'rgba(255,255,255,0.65)' },

  // Card base
  card: {
    borderRadius: 16, borderWidth: 1, overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  cardHeaderText: { flex: 1 },
  cardTitle:      { fontSize: 15, fontWeight: '700' },
  cardSub:        { fontSize: 11, marginTop: 1 },

  // Section dentro del card
  section: { padding: 16 },
  sectionLabel: {
    fontSize: 12, fontWeight: '600', letterSpacing: 0.3, marginBottom: 12,
  },

  // Acentos
  accentRow: { flexDirection: 'row', gap: 14, marginBottom: 8 },
  accentBtn: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  accentNames: { flexDirection: 'row', gap: 14 },
  accentName:  { width: 44, fontSize: 10, textAlign: 'center' },

  // Modo
  modeRow: { flexDirection: 'row', gap: 10 },
  modeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12, borderRadius: 12, borderWidth: 1,
  },
  modeBtnText: { fontSize: 14 },

  // App rows
  appRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  appRowLabel: { fontSize: 15 },
  appRowValue: { fontSize: 14 },

  // Logout
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 14, paddingVertical: 15,
    borderWidth: 1,
  },
  logoutText: { color: '#dc2626', fontSize: 15, fontWeight: '700' },

  // Footer
  footer: { alignItems: 'center', gap: 6, marginTop: 8 },
  footerLogo:    { width: 180, height: 48, opacity: 0.3 },
  footerVersion: { fontSize: 11 },
})
