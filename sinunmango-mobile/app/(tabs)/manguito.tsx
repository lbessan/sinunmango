import { useState, useRef, useCallback } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform, Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Crypto from 'expo-crypto'
import { supabase } from '@/lib/supabase'
import { apiPost } from '@/lib/api'
import { Colors } from '@/constants/theme'

// ─── Types ────────────────────────────────────────────────────────────────────
type Message = {
  id:            string
  role:          'user' | 'assistant'
  content:       string
  accion?:       Record<string, unknown>
  accionEstado?: 'pendiente' | 'confirmando' | 'ok' | 'error'
  accionMsg?:    string
}

// ─── Action card ──────────────────────────────────────────────────────────────
function AccionCard({
  accion, estado, msg, onConfirmar, onCancelar,
}: {
  accion:      Record<string, unknown>
  estado:      Message['accionEstado']
  msg?:        string
  onConfirmar: () => void
  onCancelar:  () => void
}) {
  if (estado === 'ok') {
    return (
      <View style={accionStyles.successRow}>
        <Text style={accionStyles.successText}>✓ {msg ?? 'Guardado correctamente'}</Text>
      </View>
    )
  }
  if (estado === 'error') {
    return (
      <View style={accionStyles.errorRow}>
        <Text style={accionStyles.errorText}>✗ {msg ?? 'Error al registrar'}</Text>
      </View>
    )
  }
  return (
    <View style={accionStyles.card}>
      <Text style={accionStyles.cardTitle}>¿Registrar este movimiento?</Text>
      <Text style={accionStyles.detail}>Detalle: {String(accion.detalle ?? '—')}</Text>
      <Text style={accionStyles.detail}>Monto: ${Number(accion.monto ?? 0).toLocaleString('es-AR')} {String(accion.moneda ?? 'ARS')}</Text>
      {Number(accion.cuotas ?? 1) > 1 && <Text style={accionStyles.detail}>Cuotas: {String(accion.cuotas)}</Text>}
      <Text style={accionStyles.detail}>Fecha: {String(accion.fecha ?? '—')}</Text>
      <View style={accionStyles.btnRow}>
        <TouchableOpacity
          style={[accionStyles.btn, accionStyles.btnConfirmar, estado === 'confirmando' && { opacity: 0.6 }]}
          onPress={onConfirmar}
          disabled={estado === 'confirmando'}
        >
          {estado === 'confirmando'
            ? <ActivityIndicator color={Colors.white} size="small" />
            : <Text style={accionStyles.btnConfirmarText}>✓ Confirmar</Text>
          }
        </TouchableOpacity>
        <TouchableOpacity style={[accionStyles.btn, accionStyles.btnCancelar]} onPress={onCancelar}>
          <Text style={accionStyles.btnCancelarText}>Cancelar</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ─── Message bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg, onConfirmar, onCancelar }: {
  msg:         Message
  onConfirmar: (id: string) => void
  onCancelar:  (id: string) => void
}) {
  const isUser = msg.role === 'user'
  return (
    <View style={[bubbleStyles.row, isUser && bubbleStyles.rowReverse]}>
      {/* Avatar */}
      {isUser ? (
        <View style={bubbleStyles.userAvatar}>
          <Text style={bubbleStyles.userAvatarText}>U</Text>
        </View>
      ) : (
        <View style={bubbleStyles.botAvatar}>
          <Image source={require('@/assets/manguito.png')} style={bubbleStyles.botAvatarImg} resizeMode="contain" />
        </View>
      )}

      <View style={[bubbleStyles.msgContainer, isUser && bubbleStyles.msgContainerRight]}>
        <View style={[bubbleStyles.bubble, isUser ? bubbleStyles.bubbleUser : bubbleStyles.bubbleBot]}>
          {msg.content ? (
            <Text style={[bubbleStyles.text, isUser && bubbleStyles.textUser]}>{msg.content}</Text>
          ) : (
            <ActivityIndicator size="small" color={Colors.textMuted} />
          )}
        </View>

        {msg.accion && msg.accionEstado && (
          <AccionCard
            accion={msg.accion}
            estado={msg.accionEstado}
            msg={msg.accionMsg}
            onConfirmar={() => onConfirmar(msg.id)}
            onCancelar={() => onCancelar(msg.id)}
          />
        )}
      </View>
    </View>
  )
}

// ─── Ejemplo prompts ──────────────────────────────────────────────────────────
const EJEMPLOS = [
  'Gasté $4.500 en el super',
  '¿Cuánto gasté este mes?',
  'Pagué $12.000 de nafta',
  '¿Cuál es mi cuenta con más gastos?',
]

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function ManguitoScreen() {
  const [messages, setMessages]   = useState<Message[]>([])
  const [input, setInput]         = useState('')
  const [loading, setLoading]     = useState(false)
  const listRef                   = useRef<FlatList>(null)

  const scrollToBottom = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100)
  }, [])

  const sendMessage = async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || loading) return
    setInput('')

    const userMsg: Message = { id: Crypto.randomUUID(), role: 'user', content }
    const assistantId      = Crypto.randomUUID()
    const loadingMsg: Message = { id: assistantId, role: 'assistant', content: '' }

    setMessages(prev => [...prev, userMsg, loadingMsg])
    setLoading(true)
    scrollToBottom()

    try {
      const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))

      const data = await apiPost<{ text: string; accion: Record<string, unknown> | null }>(
        '/api/asistente-mobile',
        { messages: history }
      )

      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? {
              ...m,
              content:       data.text,
              accion:        data.accion ?? undefined,
              accionEstado:  data.accion ? 'pendiente' : undefined,
            }
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

  const handleLogout = async () => {
    Alert.alert('Cerrar sesión', '¿Salir de la app?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ])
  }

  return (
    <SafeAreaView style={s.safe}>
      {/* Header / Banner */}
      <View style={s.banner}>
        <View style={s.bannerContent}>
          <View style={s.avatarLarge}>
            <Image source={require('@/assets/manguito.png')} style={s.avatarLargeImg} resizeMode="contain" />
          </View>
          <View style={s.bannerText}>
            <Text style={s.bannerTitle}>MANGUITO</Text>
            <Text style={s.bannerSub}>Asistente financiero</Text>
          </View>
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
        {/* Messages */}
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => m.id}
          style={s.list}
          contentContainerStyle={s.listContent}
          onContentSizeChange={scrollToBottom}
          ListEmptyComponent={
            <View style={s.emptyContainer}>
              <Text style={s.emptyTitle}>Podés preguntarme:</Text>
              {EJEMPLOS.map(ej => (
                <TouchableOpacity
                  key={ej}
                  style={s.exampleBtn}
                  onPress={() => sendMessage(ej)}
                >
                  <Text style={s.exampleText}>{ej}</Text>
                </TouchableOpacity>
              ))}
            </View>
          }
          renderItem={({ item }) => (
            <MessageBubble
              msg={item}
              onConfirmar={confirmarAccion}
              onCancelar={cancelarAccion}
            />
          )}
        />

        {/* Input bar */}
        <View style={s.inputBar}>
          <View style={s.avatarSmall}>
            <Image source={require('@/assets/manguito.png')} style={s.avatarSmallImg} resizeMode="contain" />
          </View>
          <TextInput
            style={s.input}
            value={input}
            onChangeText={setInput}
            placeholder="Escribí un mensaje..."
            placeholderTextColor={Colors.textMuted}
            multiline
            maxLength={500}
            returnKeyType="send"
            blurOnSubmit
            onSubmitEditing={() => sendMessage()}
          />
          <TouchableOpacity
            style={[s.sendBtn, (!input.trim() || loading) && s.sendBtnDisabled]}
            onPress={() => sendMessage()}
            disabled={!input.trim() || loading}
          >
            {loading
              ? <ActivityIndicator color={Colors.white} size="small" />
              : <Text style={s.sendBtnText}>↑</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const accionStyles = StyleSheet.create({
  card: {
    marginTop:        8,
    backgroundColor:  '#eff6ff',
    borderWidth:      1,
    borderColor:      '#bfdbfe',
    borderRadius:     12,
    padding:          12,
  },
  cardTitle: { fontSize: 13, fontWeight: '700', color: '#1d4ed8', marginBottom: 6 },
  detail:    { fontSize: 12, color: '#1e40af', marginBottom: 2 },
  btnRow:    { flexDirection: 'row', gap: 8, marginTop: 10 },
  btn:       { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  btnConfirmar:     { backgroundColor: Colors.accent },
  btnConfirmarText: { color: Colors.white, fontWeight: '700', fontSize: 13 },
  btnCancelar:      { borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: Colors.white },
  btnCancelarText:  { color: '#1d4ed8', fontSize: 13 },
  successRow: { marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 6 },
  successText:{ fontSize: 13, color: Colors.green, fontWeight: '600' },
  errorRow:   { marginTop: 6 },
  errorText:  { fontSize: 13, color: Colors.red },
})

const bubbleStyles = StyleSheet.create({
  row:            { flexDirection: 'row', marginBottom: 14, alignItems: 'flex-end', gap: 8 },
  rowReverse:     { flexDirection: 'row-reverse' },
  userAvatar:     { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.sidebar, justifyContent: 'center', alignItems: 'center' },
  userAvatarText: { color: Colors.white, fontSize: 11, fontWeight: '700' },
  botAvatar:      { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.sidebar, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  botAvatarImg:   { width: 22, height: 22 },
  msgContainer:   { flex: 1, alignItems: 'flex-start', maxWidth: '85%' },
  msgContainerRight: { alignItems: 'flex-end' },
  bubble:         { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, maxWidth: '100%' },
  bubbleBot:      { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderBottomLeftRadius: 4 },
  bubbleUser:     { backgroundColor: Colors.sidebar, borderBottomRightRadius: 4 },
  text:           { fontSize: 14, color: Colors.textPrimary, lineHeight: 20 },
  textUser:       { color: Colors.white },
})

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.bgMain },
  flex:   { flex: 1 },
  banner: {
    backgroundColor:   Colors.sidebar,
    paddingHorizontal: 20,
    paddingVertical:   14,
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
  },
  bannerContent: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarLarge:   {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
  },
  avatarLargeImg: { width: 36, height: 36 },
  bannerText:    {},
  bannerTitle:   { fontSize: 20, fontWeight: '900', color: Colors.white, letterSpacing: 1 },
  bannerSub:     { fontSize: 11, color: 'rgba(255,255,255,0.5)' },
  logoutBtn:     { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  logoutText:    { color: 'rgba(255,255,255,0.7)', fontSize: 12 },

  list:        { flex: 1 },
  listContent: { padding: 16, paddingBottom: 8 },

  emptyContainer: { paddingTop: 8 },
  emptyTitle:     { fontSize: 14, color: Colors.textSecondary, marginBottom: 12 },
  exampleBtn:     {
    backgroundColor: Colors.bgCard,
    borderWidth:     1,
    borderColor:     Colors.border,
    borderRadius:    12,
    padding:         12,
    marginBottom:    8,
  },
  exampleText: { fontSize: 14, color: Colors.textSecondary },

  inputBar: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               8,
    paddingHorizontal: 12,
    paddingVertical:   10,
    backgroundColor:   Colors.bgCard,
    borderTopWidth:    1,
    borderTopColor:    Colors.border,
  },
  avatarSmall:    { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.sidebar, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarSmallImg: { width: 24, height: 24 },
  input: {
    flex:              1,
    fontSize:          14,
    color:             Colors.textPrimary,
    maxHeight:         96,
    paddingVertical:   8,
  },
  sendBtn: {
    width:           38,
    height:          38,
    borderRadius:    19,
    backgroundColor: Colors.accent,
    justifyContent:  'center',
    alignItems:      'center',
  },
  sendBtnDisabled: { backgroundColor: Colors.border },
  sendBtnText:     { color: Colors.white, fontSize: 18, fontWeight: '700', marginTop: -2 },
})
