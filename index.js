import 'react-native-gesture-handler'
import 'react-native-safe-area-context'
import { enableScreens } from 'react-native-screens'

enableScreens(true)

import { AppRegistry } from 'react-native'
import messaging from '@react-native-firebase/messaging'
import App from './App'
import { name as appName } from './app.json'

// Handler de mensajes en segundo plano (FCM). Las notificaciones con payload
// "notification" las muestra el sistema automáticamente; este handler evita el
// warning de RNFirebase y permite procesar datos en background.
try {
  messaging().setBackgroundMessageHandler(async () => {})
} catch (e) {
  console.log('[push] setBackgroundMessageHandler no disponible', e)
}

AppRegistry.registerComponent(appName, () => App)