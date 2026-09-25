import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, Linking, Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import DeviceInfo from 'react-native-device-info'
import { appVersionService, IAppVersion } from '../api/modules/configuracion/appVersion.service'

// ── Aviso de versión nueva ──────────────────────────────────────────────────
// La versión publicada vive en las configuraciones globales (App.<Plat>.*,
// script Security_10_AppVersion) y NO se le pregunta a la tienda: Play no tiene
// API pública, y la tienda no sabe si la versión ya le llegó a todos. Se avisa
// cuando alguien sube la clave, por plataforma.

const ANDROID_ID = 'hn.com.intermoda.imcore'
// Id numérico de App Store Connect (itunes.apple.com/lookup?bundleId=…).
const IOS_APP_ID = '6783061707'

const STORE_URLS = Platform.select({
  ios: [`itms-apps://apps.apple.com/app/id${IOS_APP_ID}`, `https://apps.apple.com/app/id${IOS_APP_ID}`],
  default: [`market://details?id=${ANDROID_ID}`, `https://play.google.com/store/apps/details?id=${ANDROID_ID}`],
})

/** Abre la ficha de la app en su tienda. El esquema nativo primero (abre la
 *  app de la tienda directo); si no hay tienda instalada, la web. */
export async function openStore(): Promise<void> {
  for (const url of STORE_URLS) {
    try {
      await Linking.openURL(url)
      return
    } catch {}
  }
}

// Al descartar el aviso se guarda el build descartado: no vuelve a salir hasta
// que pase el plazo o se publique OTRO build. Un aviso que sale cada vez que se
// abre la app se aprende a cerrar sin leer.
const DESCARTE_KEY = 'appUpdate.descartado'
const DESCARTE_MS = 24 * 60 * 60 * 1000
// Al volver a primer plano no se consulta más de una vez en este plazo.
const CONSULTA_MS = 30 * 60 * 1000

export type AppUpdateState = {
  version: string
  obligatoria: boolean
} | null

/**
 * Consulta la versión publicada al montar y al volver a primer plano, y dice si
 * hay que mostrar el aviso. Cualquier fallo (sin red, API caída) = no avisar:
 * nunca se tranca la app por no poder preguntar.
 */
export function useAppUpdateCheck() {
  const [estado, setEstado] = useState<AppUpdateState>(null)
  const ultimaConsulta = useRef(0)
  const publicado = useRef<IAppVersion | null>(null)

  const revisar = useCallback(async (forzar = false) => {
    const ahora = Date.now()
    if (!forzar && ahora - ultimaConsulta.current < CONSULTA_MS) return
    ultimaConsulta.current = ahora
    try {
      const res = await appVersionService.get(Platform.OS)
      const v = res?.Success ? res.Data : null
      const instalado = Number(DeviceInfo.getBuildNumber())
      if (!v || !Number.isFinite(instalado) || !(v.Build > instalado)) {
        setEstado(null)
        return
      }
      publicado.current = v
      const obligatoria = v.BuildMinimo > instalado
      if (!obligatoria) {
        let descartado: { build: number; at: number } | null = null
        try {
          const raw = await AsyncStorage.getItem(DESCARTE_KEY)
          descartado = raw ? JSON.parse(raw) : null
        } catch {}
        if (descartado?.build === v.Build && ahora - descartado.at < DESCARTE_MS) {
          setEstado(null)
          return
        }
      }
      setEstado({ version: v.Version, obligatoria })
    } catch (e) {
      console.log('[appUpdate] no se pudo consultar la versión', e)
    }
  }, [])

  useEffect(() => {
    revisar(true)
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') revisar()
    })
    return () => sub.remove()
  }, [revisar])

  const descartar = useCallback(async () => {
    setEstado(prev => (prev?.obligatoria ? prev : null))
    const v = publicado.current
    if (!v) return
    try {
      await AsyncStorage.setItem(DESCARTE_KEY, JSON.stringify({ build: v.Build, at: Date.now() }))
    } catch {}
  }, [])

  return { estado, descartar }
}
