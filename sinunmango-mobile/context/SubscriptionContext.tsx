'use client'

import {
  createContext, useContext, useState, useEffect, useCallback, useRef,
  type ReactNode,
} from 'react'
import Purchases, {
  type PurchasesOffering,
  type PurchasesPackage,
  type CustomerInfo,
  LOG_LEVEL,
} from 'react-native-purchases'
import { supabase } from '@/lib/supabase'
import { Platform } from 'react-native'

// ─── Constantes ───────────────────────────────────────────────────────────────
const RC_ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? ''
const ENTITLEMENT_ID = 'pro'

// ─── Tipos ────────────────────────────────────────────────────────────────────
type SubscriptionState = {
  hasPro:       boolean       // true si grandfathered o suscripción activa
  plan:         string        // 'free' | 'pro' | 'grandfathered'
  offering:     PurchasesOffering | null
  loading:      boolean
  purchasing:   boolean
  errorMsg:     string | null
}

type SubscriptionActions = {
  purchasePackage:   (pkg: PurchasesPackage) => Promise<boolean>
  restorePurchases:  () => Promise<boolean>
  refetch:           () => Promise<void>
}

type SubscriptionContextValue = SubscriptionState & SubscriptionActions

// ─── Context ──────────────────────────────────────────────────────────────────
const SubscriptionContext = createContext<SubscriptionContextValue>({
  hasPro:          false,
  plan:            'free',
  offering:        null,
  loading:         true,
  purchasing:      false,
  errorMsg:        null,
  purchasePackage: async () => false,
  restorePurchases: async () => false,
  refetch:         async () => {},
})

// ─── Provider ─────────────────────────────────────────────────────────────────
export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SubscriptionState>({
    hasPro:    false,
    plan:      'free',
    offering:  null,
    loading:   true,
    purchasing: false,
    errorMsg:  null,
  })

  const configuredRef = useRef(false)

  // ── Helper: configurar RC sin tirar abajo la app si algo falla ───────────
  // Defensa contra:
  //  - API key vacía o no válida (skip configure, no rompe la app)
  //  - Excepciones del SDK nativo (try/catch + plan='free' como fallback)
  // El crash original por apiKey vacío era una IllegalArgumentException tirada
  // en el thread nativo `mqt_v_native`, que un try/catch en JS no puede atrapar
  // — por eso el guard de la key ANTES de la llamada es la defensa principal.
  const safeConfigureRC = useCallback(async (userId: string) => {
    if (!RC_ANDROID_KEY || !RC_ANDROID_KEY.startsWith('goog_')) {
      console.warn('[SubscriptionContext] RC_ANDROID_KEY ausente o inválida — skip configure')
      setState(s => ({ ...s, loading: false }))
      return
    }
    try {
      if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG)
      await Purchases.configure({ apiKey: RC_ANDROID_KEY, appUserID: userId })
      await loadData()
    } catch (err) {
      console.error('[SubscriptionContext] configure error:', err)
      configuredRef.current = false
      setState(s => ({ ...s, loading: false, hasPro: false, plan: 'free' }))
    }
  }, [])

  // ── Inicializar RevenueCat con el user ID de Supabase ─────────────────────
  useEffect(() => {
    if (Platform.OS === 'web') return

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user && !configuredRef.current) {
        configuredRef.current = true
        // Sin await: errores ya manejados dentro de safeConfigureRC
        safeConfigureRC(session.user.id)
      }

      if (!session?.user) {
        // Al cerrar sesión, resetear RC
        configuredRef.current = false
        setState(s => ({ ...s, hasPro: false, plan: 'free', offering: null, loading: false }))
      }
    })

    // Chequear sesión inicial
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (session?.user && !configuredRef.current) {
          configuredRef.current = true
          return safeConfigureRC(session.user.id)
        }
        setState(s => ({ ...s, loading: false }))
      })
      .catch(err => {
        console.error('[SubscriptionContext] getSession error:', err)
        setState(s => ({ ...s, loading: false }))
      })

    return () => subscription.unsubscribe()
  }, [safeConfigureRC])

  // ── Cargar customer info + offerings ─────────────────────────────────────
  const loadData = useCallback(async () => {
    setState(s => ({ ...s, loading: true, errorMsg: null }))
    try {
      const [customerInfo, offerings] = await Promise.all([
        Purchases.getCustomerInfo(),
        Purchases.getOfferings(),
      ])

      const hasPro = resolveHasPro(customerInfo)
      const offering = offerings.current ?? null

      setState(s => ({ ...s, hasPro, plan: hasPro ? 'pro' : 'free', offering, loading: false }))
    } catch (err) {
      console.error('[SubscriptionContext] loadData error:', err)
      setState(s => ({ ...s, loading: false }))
    }
  }, [])

  // ── Comprar un paquete ────────────────────────────────────────────────────
  const purchasePackage = useCallback(async (pkg: PurchasesPackage): Promise<boolean> => {
    setState(s => ({ ...s, purchasing: true, errorMsg: null }))
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg)
      const hasPro = resolveHasPro(customerInfo)
      setState(s => ({ ...s, hasPro, plan: hasPro ? 'pro' : 'free', purchasing: false }))
      return hasPro
    } catch (err: unknown) {
      // El usuario canceló — no es un error real
      const cancelled = (err as { userCancelled?: boolean })?.userCancelled
      if (!cancelled) {
        console.error('[SubscriptionContext] purchasePackage error:', err)
        setState(s => ({ ...s, errorMsg: 'No se pudo completar la compra. Intentá de nuevo.', purchasing: false }))
      } else {
        setState(s => ({ ...s, purchasing: false }))
      }
      return false
    }
  }, [])

  // ── Restaurar compras ─────────────────────────────────────────────────────
  const restorePurchases = useCallback(async (): Promise<boolean> => {
    setState(s => ({ ...s, purchasing: true, errorMsg: null }))
    try {
      const customerInfo = await Purchases.restorePurchases()
      const hasPro = resolveHasPro(customerInfo)
      setState(s => ({
        ...s,
        hasPro,
        plan:      hasPro ? 'pro' : 'free',
        purchasing: false,
        errorMsg:  hasPro ? null : 'No se encontraron compras anteriores.',
      }))
      return hasPro
    } catch (err) {
      console.error('[SubscriptionContext] restorePurchases error:', err)
      setState(s => ({ ...s, purchasing: false, errorMsg: 'No se pudieron restaurar las compras.' }))
      return false
    }
  }, [])

  return (
    <SubscriptionContext.Provider value={{ ...state, purchasePackage, restorePurchases, refetch: loadData }}>
      {children}
    </SubscriptionContext.Provider>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useSubscription() {
  return useContext(SubscriptionContext)
}

// ─── Helper: tiene acceso pro? ────────────────────────────────────────────────
function resolveHasPro(info: CustomerInfo): boolean {
  return ENTITLEMENT_ID in info.entitlements.active
}
