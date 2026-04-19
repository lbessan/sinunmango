import { Tabs } from 'expo-router'
import { View, Text, StyleSheet } from 'react-native'
import { Colors } from '@/constants/theme'

// Simple icon components (avoids adding lucide-react-native dependency)
function PlusIcon({ color }: { color: string }) {
  return (
    <View style={[styles.iconWrap]}>
      <Text style={[styles.icon, { color }]}>＋</Text>
    </View>
  )
}

function ChatIcon({ color }: { color: string }) {
  return (
    <View style={styles.iconWrap}>
      <Text style={[styles.icon, { color }]}>🤖</Text>
    </View>
  )
}

function GearIcon({ color }: { color: string }) {
  return (
    <View style={styles.iconWrap}>
      <Text style={[styles.icon, { color }]}>⚙️</Text>
    </View>
  )
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.sidebar,
          borderTopColor:  'rgba(255,255,255,0.08)',
          height:          60,
          paddingBottom:   8,
        },
        tabBarActiveTintColor:   Colors.accent,
        tabBarInactiveTintColor: 'rgba(255,255,255,0.4)',
        tabBarLabelStyle: {
          fontSize:   11,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="nuevo"
        options={{
          title: 'Nuevo',
          tabBarIcon: ({ color }) => <PlusIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="manguito"
        options={{
          title: 'Manguito',
          tabBarIcon: ({ color }) => <ChatIcon color={color} />,
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

const styles = StyleSheet.create({
  iconWrap: {
    alignItems:     'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 20,
  },
})
