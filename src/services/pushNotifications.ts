import { Platform, PermissionsAndroid } from 'react-native'
import messaging from '@react-native-firebase/messaging'
import notifee, { AndroidImportance } from '@notifee/react-native'
import { notificationsService } from '../api/modules/notifications/notifications.service'

/**
 * Notificaciones push (Firebase Cloud Messaging).
 *
 * Todo está protegido con try/catch: si el módulo nativo de Firebase aún no
 * está configurado (faltan google-services.json / GoogleService-Info.plist),
 * cada función hace "no-op" y la app sigue funcionando con normalidad.
 */

const ANDROID_CHANNEL_ID = 'visitas'
let currentUserCode: string | null = null
let unsubscribeTokenRefresh: (() => void) | null = null
let unsubscribeForeground: (() => void) | null = null

// Pide permiso de notificaciones (iOS + Android 13+).
async function requestPermission(): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      if (Platform.Version >= 33) {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
        )
        return granted === PermissionsAndroid.RESULTS.GRANTED
      }
      return true
    }
    // iOS: solicita autorización APNs
    const status = await messaging().requestPermission()
    return (
      status === messaging.AuthorizationStatus.AUTHORIZED ||
      status === messaging.AuthorizationStatus.PROVISIONAL
    )
  } catch (e) {
    console.log('[push] requestPermission no disponible', e)
    return false
  }
}

// Crea el canal de Android (requerido para mostrar notificaciones).
async function ensureChannel() {
  try {
    if (Platform.OS === 'android') {
      await notifee.createChannel({
        id: ANDROID_CHANNEL_ID,
        name: 'Visitas',
        importance: AndroidImportance.HIGH,
      })
    }
  } catch (e) {
    console.log('[push] ensureChannel no disponible', e)
  }
}

// Muestra una notificación local (para mensajes recibidos en primer plano).
async function displayForeground(remoteMessage: any) {
  try {
    const title = remoteMessage?.notification?.title ?? 'Visitas'
    const body = remoteMessage?.notification?.body ?? ''
    await notifee.displayNotification({
      title,
      body,
      android: {
        channelId: ANDROID_CHANNEL_ID,
        smallIcon: 'ic_launcher',
        pressAction: { id: 'default' },
      },
    })
  } catch (e) {
    console.log('[push] displayForeground error', e)
  }
}

/**
 * Registra el dispositivo del usuario: pide permiso, obtiene el token FCM y lo
 * envía al backend. Configura el refresh de token y el handler de primer plano.
 */
export async function registerForUser(userCode: string): Promise<void> {
  currentUserCode = userCode
  try {
    const ok = await requestPermission()
    if (!ok) {
      console.log('[push] permiso de notificaciones no concedido')
      return
    }

    await ensureChannel()

    // En iOS, asegura el registro con APNs antes de pedir el token.
    if (Platform.OS === 'ios') {
      try {
        await messaging().registerDeviceForRemoteMessages()
      } catch {}
    }

    const token = await messaging().getToken()
    if (token) {
      await notificationsService.registerDevice({
        User_Code: userCode,
        Token: token,
        Platform: Platform.OS,
      })
    }

    // Re-registra si el token cambia
    if (unsubscribeTokenRefresh) unsubscribeTokenRefresh()
    unsubscribeTokenRefresh = messaging().onTokenRefresh(async (newToken) => {
      try {
        if (currentUserCode) {
          await notificationsService.registerDevice({
            User_Code: currentUserCode,
            Token: newToken,
            Platform: Platform.OS,
          })
        }
      } catch (e) {
        console.log('[push] onTokenRefresh error', e)
      }
    })

    // Muestra notificaciones recibidas con la app abierta
    if (unsubscribeForeground) unsubscribeForeground()
    unsubscribeForeground = messaging().onMessage(displayForeground)
  } catch (e) {
    console.log('[push] registerForUser no disponible (¿falta config nativa de Firebase?)', e)
  }
}

/** Desactiva el token del dispositivo en el backend (al cerrar sesión). */
export async function unregisterCurrent(): Promise<void> {
  try {
    if (unsubscribeTokenRefresh) {
      unsubscribeTokenRefresh()
      unsubscribeTokenRefresh = null
    }
    if (unsubscribeForeground) {
      unsubscribeForeground()
      unsubscribeForeground = null
    }
    const token = await messaging().getToken()
    if (token) {
      await notificationsService.unregister(token)
    }
  } catch (e) {
    console.log('[push] unregisterCurrent no disponible', e)
  } finally {
    currentUserCode = null
  }
}
