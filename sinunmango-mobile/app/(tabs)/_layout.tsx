import { Tabs } from 'expo-router'
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native'
import { useTheme } from '@/context/ThemeContext'
import { STATIC_COLORS } from '@/context/ThemeContext'

// ─── Tab icons ────────────────────────────────────────────────────────────────
function HomeIcon({ color }: { color: string }) {
  return <Text style={[styles.icon, { color }]}>⌂</Text>
}

function ListIcon({ color }: { color: string }) {
  return <Text style={[styles.icon, { color }]}>☰</Text>
}

function ManguitoIcon({ focused, accentColor }: {
  focused:     boolean
  accentColor: string
}) {
  return (
    <View style={[styles.manguitoWrap, focused && { backgroundColor: accentColor }]}>
      <Image
        source={require('@/assets/manguito.png')}
        style={styles.manguitoImg}
        resizeMode="contain"
      />
    </View>
  )
}

function GearIcon({ color }: { color: string }) {
  return <Text style={[styles.icon, { color }]}>⚙️</Text>
}

// ─── FAB tab button ───────────────────────────────────────────────────────────
function FabButton({ onPress, accentColor }: { onPress?: () => void; accentColor: string }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.fab, { backgroundColor: accentColor }]}
      activeOpacity={0.85}
    >
      <Text style={styles.fabText}>+</Text>
    </TouchableOpacity>
  )
}

// ─── Layout ───────────────────────────────────────────────────────────────────
export default function TabsLayout() {
  const { colors } = useTheme()

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor:  STATIC_COLORS.bgCard,
          borderTopColor:   STATIC_COLORS.border,
          borderTopWidth:   1,
          height:           60,
          paddingBottom:    8,
          paddingTop:       4,
        },
        tabBarActiveTintColor:   colors.accent,
        tabBarInactiveTintColor: STATIC_COLORS.textMuted,
        tabBarLabelStyle: {
          fontSize:   10,
          fontWeight: '600',
          marginTop:  2,
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color }) => <HomeIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="movimientos"
        options={{
          title: 'Movim.',
          tabBarIcon: ({ color }) => <ListIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="nuevo"
        options={{
          title: '',
          tabBarButton: ({ onPress }) => (
            <FabButton onPress={onPress as () => void} accentColor={colors.accent} />
          ),
        }}
      />
      <Tabs.Screen
        name="manguito"
        options={{
          title: 'Manguito',
          tabBarIcon: ({ focused }) => (
            <ManguitoIcon focused={focused} accentColor={colors.accent} />
          ),
        }}
      />
      <Tabs.Screen
        name="configuracion"
        options={{
          title: 'Config',
          tabBarIcon: ({ color }) => <GearIcon color={color} />,
        }}
      />
    </Tabs>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  icon: {
    fontSize: 20,
  },

  manguitoWrap: {
    width:           32,
    height:          32,
    borderRadius:    16,
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: 'transparent',
  },
  manguitoImg: {
    width:  26,
    height: 26,
  },

  fab: {
    width:          58,
    height:         58,
    borderRadius:   29,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   18,
    shadowColor:    '#000',
    shadowOpacity:  0.2,
    shadowRadius:   8,
    shadowOffset:   { width: 0, height: 3 },
    elevation:      6,
  },
  fabText: {
    color:      '#ffffff',
    fontSize:   32,
    fontWeight: '300',
    lineHeight: 38,
    marginTop:  -2,
  },
})
