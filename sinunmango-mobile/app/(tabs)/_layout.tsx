import { Tabs } from 'expo-router'
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
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

// ─── FAB central ─────────────────────────────────────────────────────────────
function FabButton({ onPress, theme }: {
  onPress?: () => void
  theme:    ReturnType<typeof useTheme>['theme']
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[fab.btn, { backgroundColor: theme.primary }]}
      activeOpacity={0.85}
    >
      <Ionicons name="add" size={30} color="#ffffff" strokeWidth={2.5} />
    </TouchableOpacity>
  )
}

const fab = StyleSheet.create({
  btn: {
    width:          64,
    height:         64,
    borderRadius:   32,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   18,
    shadowColor:    '#000',
    shadowOpacity:  0.25,
    shadowRadius:   10,
    shadowOffset:   { width: 0, height: 4 },
    elevation:      8,
  },
})

// ─── Layout principal ─────────────────────────────────────────────────────────
export default function TabsLayout() {
  const { theme } = useTheme()

  return (
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
          tabBarButton: ({ onPress }) => (
            <FabButton onPress={onPress as () => void} theme={theme} />
          ),
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
  )
}
