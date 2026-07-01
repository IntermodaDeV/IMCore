import 'react-native-gesture-handler'
import 'react-native-safe-area-context'
import { enableScreens } from 'react-native-screens'

enableScreens(true)

import { AppRegistry } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import messaging from '@react-native-firebase/messaging'
import App from './App'
import { name as appName } from './app.json'

// Handler de mensajes en segundo plano (FCM). Las notificaciones con payload
// "notification" las muestra el sistema automáticamente; este handler evita el
// warning de RNFirebase y permite procesar datos en background.
try {
  messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    // Cierre de sesión forzado por un admin: limpia tokens y deja una marca para
    // que, al abrir la app, se muestre la pantalla "sesión cerrada".
    if (remoteMessage?.data?.type === 'force_logout') {
      try {
        await AsyncStorage.removeItem('accessToken')
        await AsyncStorage.removeItem('refreshToken')
        await AsyncStorage.setItem('forcedLogout', '1')
      } catch (e) {
        console.log('[push] force_logout background error', e)
      }
    }
  })
} catch (e) {
  console.log('[push] setBackgroundMessageHandler no disponible', e)
}

AppRegistry.registerComponent(appName, () => App)