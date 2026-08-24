import { Platform, PermissionsAndroid } from 'react-native'
import messaging from '@react-native-firebase/messaging'
import notifee, { AndroidImportance, EventType } from '@notifee/react-native'
import { notificationsService } from '../api/modules/notifications/notifications.service'
import { routeNotification } from './notificationRouter'
import { requestMenuRefresh } from './menuRefresh'

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

// Callback que la app registra para refrescar la bandeja cuando llega un push.
let onPushReceived: ((remoteMessage?: any) => void) | null = null
export function setOnPushReceived(cb: ((remoteMessage?: any) => void) | null) {
  onPushReceived = cb
}

// Callback para cuando un administrador cierra la sesión de este usuario
// (push silencioso 'force_logout'). La app lo usa para expulsar al usuario.
let onForceLogout: ((data?: any) => void) | null = null
export function setOnForceLogout(cb: ((data?: any) => void) | null) {
  onForceLogout = cb
}

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
  // Mensaje de control 'force_logout': no se muestra banner; se expulsa al usuario.
  if (remoteMessage?.data?.type === 'force_logout') {
    try { onForceLogout?.(remoteMessage.data) } catch {}
    return
  }
  try {
    const noti = remoteMessage?.notification
    // Push "data-only" (sin bloque notification): NO mostramos una notificación
    // vacía/fantasma. Nuestro backend siempre envía title+body; un push sin ellos
    // viene de fuera (p. ej. una prueba de Firebase Console). Solo refrescamos la
    // bandeja (en el finally) y no mostramos nada.
    if (!noti?.title && !noti?.body) return

    const title = noti?.title ?? 'IMCore'
    const body = noti?.body ?? ''
    await notifee.displayNotification({
      title,
      body,
      // Conserva el data del push para poder enrutar al tocar la notificación.
      data: remoteMessage?.data ?? {},
      android: {
        channelId: ANDROID_CHANNEL_ID,
        smallIcon: 'ic_launcher',
        pressAction: { id: 'default' },
      },
    })
  } catch (e) {
    console.log('[push] displayForeground error', e)
  } finally {
    // Avisa a la bandeja para que actualice el conteo / la lista.
    try { onPushReceived?.(remoteMessage) } catch {}

    // Aprobacion de socio: el servidor acaba de darle el menu del modulo, y el
    // menu vive cacheado. Se refresca al LLEGAR y no solo al tocar la
    // notificacion, para que la pantalla nueva aparezca aunque no la abra.
    try {
      const d: any = remoteMessage?.data ?? {}
      const categoria = d.category ?? d.type ?? d.Category
      if (categoria === 'coointer_solicitud_resultado'
          && (d.statusCode ?? d.Status_Code) === 'APR') {
        requestMenuRefresh()
      }
    } catch {}
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

let openHandlersReady = false
/**
 * Engancha el tap de notificaciones para hacer deep-link al detalle:
 *  - App en primer plano (notif local de notifee) -> onForegroundEvent PRESS
 *  - App en segundo plano -> onNotificationOpenedApp
 *  - App cerrada (abierta desde la notif) -> getInitialNotification
 * Se llama una sola vez al iniciar la app.
 */
export function setupNotificationOpenHandlers(): void {
  if (openHandlersReady) return
  openHandlersReady = true
  try {
    // Tap en la notificación local (primer plano)
    notifee.onForegroundEvent(({ type, detail }) => {
      if (type === EventType.PRESS) routeNotification(detail.notification?.data)
    })
    // Tap con la app en segundo plano
    messaging().onNotificationOpenedApp((rm) => {
      if (rm?.data) routeNotification(rm.data)
    })
    // App abierta desde una notificación (estaba cerrada)
    messaging()
      .getInitialNotification()
      .then((rm) => {
        if (rm?.data) routeNotification(rm.data)
      })
      .catch(() => {})
  } catch (e) {
    console.log('[push] setupNotificationOpenHandlers no disponible', e)
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
