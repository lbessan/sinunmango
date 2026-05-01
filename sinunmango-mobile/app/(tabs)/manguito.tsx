import { useState, useRef, useCallback, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform, Image, Animated,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as Crypto from 'expo-crypto'
import { supabase } from '@/lib/supabase'
import { apiPost } from '@/lib/api'
import { useTheme } from '@/context/ThemeContext'

// ─── Markdown → plain text ────────────────────────────────────────────────────
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/#{1,6}\s+/g, '')
    .trim()
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Message = {
  id:            string
  role:          'user' | 'assistant'
  content:       string
  accion?:       Record<string, unknown>
  accionEstado?: 'pendiente' | 'confirmando' | 'ok' | 'error'
  accionMsg?:    string
}

// ─── 3-dot loading animation ──────────────────────────────────────────────────
function TypingDots({ color }: { color: string }) {
  const anims = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current]

  useEffect(() => {
    const animations = anims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(anim, { toValue: -6, duration: 300, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0,  duration: 300, useNativeDriver: true }),
          Animated.delay(300),
        ])
      )
    )
    animations.forEach(a => a.start())
    return () => animations.forEach(a => a.stop())
  }, [])

  return (
    <View style={dots.row}>
      {anims.map((anim, i) => (
        <Animated.View
          key={i}
          style={[dots.dot, { backgroundColor: color, transform: [{ translateY: anim }] }]}
        />
      ))}
    </View>
  )
}

const dots = StyleSheet.create({
  row: { flexDirection: 'row', gap: 5, paddingVertical: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
})

// ─── Acción card ──────────────────────────────────────────────────────────────
function AccionCard({ accion, estado, msg, onConfirmar, onCancelar, theme }: {
  accion:      Record<string, unknown>
  estado:      Message['accionEstado']
  msg?:        string
  onConfirmar: () => void
  onCancelar:  () => void
  theme:       ReturnType<typeof useTheme>['theme']
}) {
  if (estado === 'ok') {
    return (
      <View style={ac.successRow}>
        <Ionicons name="checkmark-circle" size={16} color={theme.income} />
        <Text style={[ac.successText, { color: theme.income }]}>{msg ?? 'Guardado correctamente'}</Text>
      </View>
    )
  }
  if (estado === 'error') {
    return (
      <View style={ac.errorRow}>
        <Text style={[ac.errorText, { color: theme.expense }]}>✗ {msg ?? 'Error al registrar'}</Text>
      </View>
    )
  }
  return (
    <View style={[ac.card, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
      <Text style={[ac.cardTitle, { color: theme.primary }]}>¿Registrar este movimiento?</Text>
      <Text style={[ac.detail, { color: theme.textSec }]}>Detalle: {String(accion.detalle ?? '—')}</Text>
      <Text style={[ac.detail, { color: theme.textSec }]}>
        Monto: ${Number(accion.monto ?? 0).toLocaleString('es-AR')} {String(accion.moneda ?? 'ARS')}
      </Text>
      {Number(accion.cuotas ?? 1) > 1 && (
        <Text style={[ac.detail, { color: theme.textSec }]}>Cuotas: {String(accion.cuotas)}</Text>
      )}
      <Text style={[ac.detail, { color: theme.textSec }]}>Fecha: {String(accion.fecha ?? '—')}</Text>
      <View style={ac.btnRow}>
        <TouchableOpacity
          style={[ac.btn, { backgroundColor: theme.primary }, estado === 'confirmando' && { opacity: 0.6 }]}
          onPress={onConfirmar}
          disabled={estado === 'confirmando'}
        >
          {estado === 'confirmando'
            ? <ActivityIndicator color="#ffffff" size="small" />
            : <Text style={ac.btnConfirmText}>✓ Confirmar</Text>
          }
        </TouchableOpacity>
        <TouchableOpacity
          style={[ac.btn, { borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface }]}
          onPress={onCancelar}
        >
          <Text style={[ac.btnCancelText, { color: theme.textSec }]}>Cancelar</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const ac = StyleSheet.create({
  card:          { marginTop: 8, borderRadius: 12, borderWidth: 1, padding: 12 },
  cardTitle:     { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  detail:        { fontSize: 12, marginBottom: 2 },
  btnRow:        { flexDirection: 'row', gap: 8, marginTop: 10 },
  btn:           { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  btnConfirmText:{ color: '#ffffff', fontWeight: '700', fontSize: 13 },
  btnCancelText: { fontSize: 13 },
  successRow:    { marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 6 },
  successText:   { fontSize: 13, fontWeight: '600' },
  errorRow:      { marginTop: 6 },
  errorText:     { fontSize: 13 },
})

// ─── Message bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg, onConfirmar, onCancelar, theme }: {
  msg:         Message
  onConfirmar: (id: string) => void
  onCancelar:  (id: string) => void
  theme:       ReturnType<typeof useTheme>['theme']
}) {
  const isUser = msg.role === 'user'
  return (
    <View style={[bub.row, isUser && bub.rowReverse]}>
      {isUser ? (
        <View style={[bub.userAvatar, { backgroundColor: theme.primary }]}>
          <Text style={bub.userAvatarText}>U</Text>
        </View>
      ) : (
        <View style={[bub.botAvatar, { backgroundColor: theme.surfaceAlt }]}>
          <Image source={require('@/assets/manguito.png')} style={bub.botAvatarImg} resizeMode="contain" />
        </View>
      )}

      <View style={[bub.msgContainer, isUser && bub.msgContainerRight]}>
        <View style={[
          bub.bubble,
          isUser
            ? { backgroundColor: theme.primary, borderBottomRightRadius: 4 }
            : { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderBottomLeftRadius: 4 },
        ]}>
          {!msg.content ? (
            <TypingDots color={theme.textMuted} />
          ) : (
            <Text style={[bub.text, isUser ? { color: '#ffffff' } : { color: theme.text }]}>
              {isUser ? msg.content : stripMarkdown(msg.content)}
            </Text>
          )}
        </View>

        {msg.accion && msg.accionEstado && (
          <AccionCard
            accion={msg.accion}
            estado={msg.accionEstado}
            msg={msg.accionMsg}
            onConfirmar={() => onConfirmar(msg.id)}
            onCancelar={() => onCancelar(msg.id)}
            theme={theme}
          />
        )}
      </View>
    </View>
  )
}

const bub = StyleSheet.create({
  row:              { flexDirection: 'row', marginBottom: 14, alignItems: 'flex-end', gap: 8 },
  rowReverse:       { flexDirection: 'row-reverse' },
  userAvatar:       { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  userAvatarText:   { color: '#ffffff', fontSize: 11, fontWeight: '700' },
  botAvatar:        { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  botAvatarImg:     { width: 22, height: 22 },
  msgContainer:     { flex: 1, alignItems: 'flex-start', maxWidth: '85%' },
  msgContainerRight:{ alignItems: 'flex-end' },
  bubble:           { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, maxWidth: '100%' },
  text:             { fontSize: 14, lineHeight: 20 },
})

// ─── Sugerencias vacías ───────────────────────────────────────────────────────
const SUGERENCIAS = [
  'Gasté $4.500 en el super',
  '¿Cuánto gasté este mes?',
  'Pagué $12.000 de nafta',
  '¿Cuál es mi cuenta con más gastos?',
]

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function ManguitoScreen() {
  const { theme } = useTheme()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const listRef                 = useRef<FlatList>(null)

  const scrollToBottom = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100)
  }, [])

  const sendMessage = async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || loading) return
    setInput('')

    const userMsg:    Message = { id: Crypto.randomUUID(), role: 'user', content }
    const assistantId = Crypto.randomUUID()
    const loadingMsg: Message = { id: assistantId, role: 'assistant', content: '' }

    setMessages(prev => [...prev, userMsg, loadingMsg])
    setLoading(true)
    scrollToBottom()

    try {
      const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))
      const data    = await apiPost<{ text: string; accion: Record<string, unknown> | null }>(
        '/api/asistente-mobile',
        { messages: history }
      )
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, content: data.text, accion: data.accion ?? undefined, accionEstado: data.accion ? 'pendiente' : undefined }
          : m
      ))
    } catch (e: unknown) {
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, content: `Error: ${e instanceof Error ? e.message : 'Algo salió mal.'}` }
          : m
      ))
    } finally {
      setLoading(false)
      scrollToBottom()
    }
  }

  const confirmarAccion = async (msgId: string) => {
    const msg = messages.find(m => m.id === msgId)
    if (!msg?.accion) return
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, accionEstado: 'confirmando' } : m))
    try {
      const data = await apiPost<{ ok: boolean; cuenta: string; monto: number; error?: string }>(
        '/api/asistente-accion',
        msg.accion
      )
      if (data.ok) {
        setMessages(prev => prev.map(m =>
          m.id === msgId
            ? { ...m, accionEstado: 'ok', accionMsg: `Guardado en ${data.cuenta} — $${Number(data.monto).toLocaleString('es-AR')}` }
            : m
        ))
      } else {
        setMessages(prev => prev.map(m =>
          m.id === msgId ? { ...m, accionEstado: 'error', accionMsg: data.error } : m
        ))
      }
    } catch (e: unknown) {
      setMessages(prev => prev.map(m =>
        m.id === msgId ? { ...m, accionEstado: 'error', accionMsg: e instanceof Error ? e.message : 'Error de red' } : m
      ))
    }
  }

  const cancelarAccion = (msgId: string) => {
    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, accion: undefined, accionEstado: undefined } : m
    ))
  }

  const handleLogout = () => {
    Alert.alert('Cerrar sesión', '¿Salir de la app?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ])
  }

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.bg }]} edges={['top']}>

      {/* ── BANNER ── */}
      <View style={[s.banner, { backgroundColor: theme.primary }]}>
        <View style={s.bannerCenter}>
          <View style={s.avatarLarge}>
            <Image source={require('@/assets/manguito.png')} style={s.avatarLargeImg} resizeMode="contain" />
          </View>
          <Text style={s.bannerTitle}>MANGUITO</Text>
          <Text style={s.bannerSub}>Asistente financiero</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={s.logoutBtn}>
          <Text style={s.logoutText}>Salir</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Mensajes */}
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => m.id}
          style={s.list}
          contentContainerStyle={s.listContent}
          onContentSizeChange={scrollToBottom}
          ListEmptyComponent={
            <View style={s.emptyContainer}>
              <Text style={[s.emptyTitle, { color: theme.textSec }]}>Podés preguntarme:</Text>
              {SUGERENCIAS.map(sug => (
                <TouchableOpacity
                  key={sug}
                  style={[s.exampleBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  onPress={() => sendMessage(sug)}
                  activeOpacity={0.8}
                >
                  <Text style={[s.exampleText, { color: theme.textSec }]}>{sug}</Text>
                  <Ionicons name="chevron-forward" size={14} color={theme.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          }
          renderItem={({ item }) => (
            <MessageBubble
              msg={item}
              onConfirmar={confirmarAccion}
              onCancelar={cancelarAccion}
              theme={theme}
            />
          )}
        />

        {/* Input bar */}
        <View style={[s.inputBar, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
          <View style={[s.avatarSmall, { backgroundColor: theme.surfaceAlt }]}>
            <Image source={require('@/assets/manguito.png')} style={s.avatarSmallImg} resizeMode="contain" />
          </View>
          <TextInput
            style={[s.input, { color: theme.text, backgroundColor: theme.bg, borderColor: theme.border }]}
            value={input}
            onChangeText={setInput}
            placeholder="Escribí un mensaje..."
            placeholderTextColor={theme.textMuted}
            multiline
            maxLength={500}
            returnKeyType="send"
            blurOnSubmit
            onSubmitEditing={() => sendMessage()}
          />
          <TouchableOpacity
            style={[
              s.sendBtn,
              { backgroundColor: input.trim() && !loading ? theme.primary : theme.border },
            ]}
            onPress={() => sendMessage()}
            disabled={!input.trim() || loading}
          >
            {loading
              ? <ActivityIndicator color="#ffffff" size="small" />
              : <Ionicons name="send" size={16} color="#ffffff" />
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },

  banner: {
    paddingHorizontal: 20, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center',
  },
  bannerCenter: { flex: 1, alignItems: 'center' },
  avatarLarge: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
    overflow: 'hidden', marginBottom: 8,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  avatarLargeImg: { width: 64, height: 64 },
  bannerTitle:    { fontSize: 22, fontWeight: '900', color: '#ffffff', letterSpacing: 2 },
  bannerSub:      { fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2 },
  logoutBtn: {
    position: 'absolute', top: 16, right: 20,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  logoutText: { color: 'rgba(255,255,255,0.7)', fontSize: 11 },

  list:        { flex: 1 },
  listContent: { padding: 16, paddingBottom: 8 },

  emptyContainer: { paddingTop: 8 },
  emptyTitle:     { fontSize: 14, marginBottom: 12 },
  exampleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 8,
  },
  exampleText: { fontSize: 14, flex: 1 },

  inputBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    borderTopWidth: 1,
  },
  avatarSmall:    { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarSmallImg: { width: 26, height: 26 },
  input: {
    flex: 1, fontSize: 14, maxHeight: 96,
    paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 22, borderWidth: 1,
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19,
    justifyContent: 'center', alignItems: 'center',
  },
})
