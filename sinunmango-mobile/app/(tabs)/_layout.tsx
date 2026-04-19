import { Tabs } from 'expo-router'
import { View, Text, Image, StyleSheet } from 'react-native'
import { Colors } from '@/constants/theme'

function PlusIcon({ color }: { color: string }) {
  return (
    <View style={styles.iconWrap}>
      <Text style={[styles.icon, { color }]}>＋</Text>
    </View>
  )
}

function ManguitoIcon({ focused }: { focused: boolean }) {
  return (
    <View style={[styles.manguitoWrap, focused && { backgroundColor: Colors.accent }]}>
      <Image
        source={require('@/assets/manguito.png')}
        style={styles.manguitoImg}
        resizeMode="contain"
      />
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
          tabBarIcon: ({ focused }) => <ManguitoIcon focused={focused} />,
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
  manguitoWrap: {
    width:          32,
    height:         32,
    borderRadius:   16,
    alignItems:     'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  manguitoImg: {
    width:  26,
    height: 26,
  },
})
