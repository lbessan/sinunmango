import { View, ActivityIndicator } from 'react-native'
import { StatusBar } from 'expo-status-bar'

// Pantalla de carga mientras _layout.tsx verifica la sesión y navega
export default function Index() {
  return (
    <View style={{ flex: 1, backgroundColor: '#07192b', justifyContent: 'center', alignItems: 'center' }}>
      <StatusBar style="light" />
      <ActivityIndicator size="large" color="#f97316" />
    </View>
  )
}
