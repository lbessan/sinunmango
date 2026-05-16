import { useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Linking,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/context/ThemeContext'
import type { User } from '@supabase/supabase-js'

function Avatar({ initial, color }: { initial: string; color: string }) {
  return (
    <View style={[av.circle, { backgroundColor: color }]}>
      <Text style={av.letter}>{initial}</Text>
    </View>
  )
}
const av = StyleSheet.create({
  circle: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  letter: { fontSize: 34, fontWeight: '800', color: '#fff' },
})

function InfoRow({ icon, label, value, theme }: {
  icon: string; label: string; value: string
  theme: ReturnType<typeof useTheme>['theme']
}) {
  return (
    <View style={[row.wrap, { borderBottomColor: theme.border }]}>
      <View style={[row.iconBox, { backgroundColor: theme.surfaceAlt }]}>
        <Ionicons name={icon as any} size={16} color={theme.primary} />
      </View>
      <View style={row.texts}>
        <Text style={[row.label, { color: theme.textMuted }]}>{label}</Text>
        <Text style={[row.value, { color: theme.text }]}>{value}</Text>
      </View>
    </View>
  )
}
const row = StyleSheet.create({
  wrap:    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1 },
  iconBox: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  texts:   { flex: 1 },
  label:   { fontSize: 11, fontWeight: '500', marginBottom: 1 },
  value:   { fontSize: 15, fontWeight: '600' },
})

export default function PerfilModal() {
  const { theme } = useTheme()
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null))
  }, [])

  const nombre    = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? '—'
  const email     = user?.email ?? '—'
  const initial   = nombre[0]?.toUpperCase() ?? '?'
  const provider  = user?.app_metadata?.provider ?? 'email'
  const miembro   = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—'

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.bg }]} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: theme.border }]}>
        <Text style={[s.title, { color: theme.text }]}>Mi cuenta</Text>
        <TouchableOpacity onPress={() => router.back()} style={[s.closeBtn, { backgroundColor: theme.surfaceAlt }]}>
          <Ionicons name="close" size={18} color={theme.textSec} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Avatar y nombre */}
        <View style={s.avatarSection}>
          <Avatar initial={initial} color={theme.primary} />
          <Text style={[s.name, { color: theme.text }]}>{nombre}</Text>
          <Text style={[s.email, { color: theme.textMuted }]}>{email}</Text>
          <View style={[s.badge, { backgroundColor: theme.surfaceAlt }]}>
            <Ionicons
              name={provider === 'google' ? 'logo-google' : 'mail-outline'}
              size={12}
              color={theme.textMuted}
            />
            <Text style={[s.badgeText, { color: theme.textMuted }]}>
              {provider === 'google' ? 'Google' : 'Email'}
            </Text>
          </View>
        </View>

        {/* Info */}
        <View style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <InfoRow icon="person-outline"     label="Nombre"           value={nombre}   theme={theme} />
          <InfoRow icon="mail-outline"       label="Email"            value={email}    theme={theme} />
          <InfoRow icon="calendar-outline"   label="Miembro desde"    value={miembro}  theme={theme} />
          <InfoRow icon="shield-outline"     label="Autenticación"    value={provider === 'google' ? 'Google OAuth' : 'Email / contraseña'} theme={theme} />
        </View>

        {/* Acciones */}
        <View style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border, marginTop: 16 }]}>
          {provider === 'google' && (
            <TouchableOpacity
              style={[s.actionRow, { borderBottomColor: theme.border }]}
              onPress={() => Linking.openURL('https://myaccount.google.com')}
              activeOpacity={0.7}
            >
              <View style={[s.actionIcon, { backgroundColor: theme.surfaceAlt }]}>
                <Ionicons name="logo-google" size={16} color="#4285F4" />
              </View>
              <Text style={[s.actionLabel, { color: theme.text }]}>Administrar cuenta Google</Text>
              <Ionicons name="open-outline" size={14} color={theme.textMuted} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[s.actionRow, { borderBottomColor: 'transparent' }]}
            onPress={() => Linking.openURL('https://app.sinunmango.com.ar')}
            activeOpacity={0.7}
          >
            <View style={[s.actionIcon, { backgroundColor: theme.surfaceAlt }]}>
              <Ionicons name="globe-outline" size={16} color={theme.primary} />
            </View>
            <Text style={[s.actionLabel, { color: theme.text }]}>Abrir versión web</Text>
            <Ionicons name="open-outline" size={14} color={theme.textMuted} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:    { flex: 1 },
  header:  {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1,
  },
  title:    { fontSize: 17, fontWeight: '700' },
  closeBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },

  content:       { padding: 20, gap: 0 },
  avatarSection: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  name:          { fontSize: 20, fontWeight: '800' },
  email:         { fontSize: 13 },
  badge:         { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginTop: 4 },
  badgeText:     { fontSize: 11, fontWeight: '600' },

  card: { borderRadius: 16, borderWidth: 1, overflow: 'hidden', paddingHorizontal: 16 },

  actionRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1 },
  actionIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { flex: 1, fontSize: 15, fontWeight: '500' },
})
