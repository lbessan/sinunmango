import { Tabs, router } from 'expo-router'
import { View, Text, TouchableOpacity, StyleSheet, Image, Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/context/ThemeContext'

// ─── Tab icon wrapper (activo: bg surfaceAlt + color primary) ─────────────────
function TabIcon({
  name, focused, theme,
}: {
  name: React.ComponentProps<typeof Ionicons>['name']
  focused: boolean
  theme: ReturnType<typeof useTheme>['theme']
}) {
  return (
    <View style={[
      ti.wrap,
      focused && { backgroundColor: theme.surfaceAlt },
    ]}>
      <Ionicons
        name={name}
        size={20}
        color={focused ? theme.primary : theme.textMuted}
      />
    </View>
  )
}

const ti = StyleSheet.create({
  wrap: {
    width:          34,
    height:         28,
    borderRadius:   10,
    alignItems:     'center',
    justifyContent: 'center',
  },
})

// ─── Manguito tab icon ────────────────────────────────────────────────────────
function ManguitoIcon({ focused, theme }: {
  focused: boolean
  theme:   ReturnType<typeof useTheme>['theme']
}) {
  return (
    <View style={[
      mi.wrap,
      focused && { borderColor: theme.primary, borderWidth: 2 },
    ]}>
      <Image
        source={require('@/assets/manguito.png')}
        style={[mi.img, { opacity: focused ? 1 : 0.4 }]}
        resizeMode="contain"
      />
    </View>
  )
}

const mi = StyleSheet.create({
  wrap: {
    width:           34,
    height:          34,
    borderRadius:    17,
    alignItems:      'center',
    justifyContent:  'center',
    borderColor:     'transparent',
    borderWidth:     2,
    overflow:        'hidden',
  },
  img: {
    width:  28,
    height: 28,
  },
})

// ─── FAB overlay ─────────────────────────────────────────────────────────────
// Se renderiza fuera del tab bar como un overlay absoluto para evitar
// recortes en dispositivos Android con distintas densidades de pantalla.
function FabOverlay({ theme }: { theme: ReturnType<typeof useTheme>['theme'] }) {
  const insets = useSafeAreaInsets()
  const tabBarH = 70
  const bottom  = insets.bottom + tabBarH - 28   // centrado sobre el tab bar, subido 28px

  return (
    <TouchableOpacity
      onPress={() => router.push('/nuevo-modal')}
      style={[fab.btn, { backgroundColor: theme.primary, bottom }]}
      activeOpacity={0.85}
    >
      <Ionicons name="add" size={36} color="#ffffff" />
    </TouchableOpacity>
  )
}

const fab = StyleSheet.create({
  btn: {
    position:       'absolute',
    alignSelf:      'center',
    left:           '50%',
    marginLeft:     -38,   // mitad del ancho
    width:          76,
    height:         76,
    borderRadius:   38,
    alignItems:     'center',
    justifyContent: 'center',
    zIndex:         99,
    shadowColor:    '#000',
    shadowOpacity:  0.3,
    shadowRadius:   14,
    shadowOffset:   { width: 0, height: 6 },
    elevation:      12,
  },
})

// ─── Layout principal ─────────────────────────────────────────────────────────
export default function TabsLayout() {
  const { theme } = useTheme()

  return (
    <View style={{ flex: 1 }}>
    <FabOverlay theme={theme} />
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor:  theme.tabBar,
          borderTopColor:   theme.tabBarBorder,
          borderTopWidth:   1,
          height:           70,
          paddingBottom:    22,
          paddingTop:       6,
        },
        tabBarActiveTintColor:   theme.primary,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarLabelStyle: {
          fontSize:   10,
          marginTop:  2,
        },
        tabBarActiveLabelStyle: {
          fontWeight: '600',
          color:      theme.primary,
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'home' : 'home-outline'} focused={focused} theme={theme} />
          ),
        }}
      />

      <Tabs.Screen
        name="movimientos"
        options={{
          title: 'Movim.',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'list' : 'list-outline'} focused={focused} theme={theme} />
          ),
        }}
      />

      <Tabs.Screen
        name="nuevo"
        options={{
          title: '',
          tabBarButton: () => <View style={{ width: 76 }} />,
        }}
      />

      <Tabs.Screen
        name="manguito"
        options={{
          title: 'Manguito',
          tabBarIcon: ({ focused }) => (
            <ManguitoIcon focused={focused} theme={theme} />
          ),
        }}
      />

      <Tabs.Screen
        name="configuracion"
        options={{
          title: 'Config',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'settings' : 'settings-outline'} focused={focused} theme={theme} />
          ),
        }}
      />
    </Tabs>
    </View>
  )
}
