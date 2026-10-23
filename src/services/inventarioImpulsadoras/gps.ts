import { PermissionsAndroid, Platform } from 'react-native'
import Geolocation, { GeolocationError, GeolocationResponse } from '@react-native-community/geolocation'
import { SinGps } from '../../api/modules/inventarioImpulsadoras/asistencia.types'

/*
 * Lectura de GPS para marcar asistencia. El GPS del teléfono NO necesita internet: con
 * cielo abierto da la posición aunque no haya señal de datos (solo tarda más en el primer
 * arranque). Se pide SOLO al tocar «Marcar» (sin rastreo de fondo, permiso «mientras se usa»)
 * y se espera hasta `esperaSeg` (regla del servidor) quedándose con la MEJOR lectura; corta
 * antes si llega una buena. Si no hay ninguna, la marca igual se guarda sin coordenada y el
 * servidor la manda a revisión: nunca se bloquea a la impulsadora.
 */

Geolocation.setRNConfiguration({
  skipPermissionRequests: true,          // el permiso se pide aquí, con su explicación
  authorizationLevel: 'whenInUse',
  enableBackgroundLocationUpdates: false,
  locationProvider: 'android',           // el GPS de Android: funciona sin Google Play y sin datos
})

export type LecturaGps =
  | { ok: true; lat: number; lng: number; prec: number; fecha: string; simulada: boolean | null }
  | { ok: false; motivo: SinGps }

/** En iOS el permiso ya se confirmó en esta sesión de la app. */
let permisoIos = false

/** ¿Tiene (o da ahora) el permiso de ubicación «mientras se usa»? */
export async function pedirPermiso(): Promise<boolean> {
  if (Platform.OS === 'android') {
    const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, {
      title: 'Ubicación para marcar asistencia',
      message: 'IMCore registra dónde marcas tu asistencia, solo en el momento de marcar. No sigue tu ubicación.',
      buttonPositive: 'Permitir',
      buttonNegative: 'Ahora no',
    })
    return r === PermissionsAndroid.RESULTS.GRANTED
  }
  if (permisoIos) return true
  // iOS solo contesta requestAuthorization al crear su gestor de ubicación o cuando el permiso CAMBIA: pedirlo otra
  // vez con el permiso ya dado no contesta nunca (la segunda marca se quedaba buscando). Si no contesta en 3 s se
  // sigue: la lectura del GPS dice si falta el permiso (error 1).
  return new Promise(resolve => {
    const t = setTimeout(() => resolve(true), 3000)
    Geolocation.requestAuthorization(
      () => { clearTimeout(t); permisoIos = true; resolve(true) },
      () => { clearTimeout(t); resolve(false) })
  })
}

const dos = (n: number) => String(n).padStart(2, '0')
const isoLocal = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}`
}

/**
 * La mejor lectura en `esperaSeg` segundos. Corta antes si la precisión ya es ≤ `buena` m.
 * `onAvance(segRestantes, mejorPrecision)` para que la pantalla muestre que está buscando.
 * `cortar()` termina YA con la mejor lectura que haya (o TIMEOUT): «Marcar sin esperar».
 */
export function buscarUbicacion(esperaSeg: number, buena = 20,
  onAvance?: (restan: number, mejor: number | null) => void): { resultado: Promise<LecturaGps>; cortar: () => void } {
  // «Marcar sin esperar» suelta la pantalla en cualquier momento, también mientras se pide el permiso.
  let cortado = false
  let cortarLectura: (() => void) | null = null
  let soltar: (r: LecturaGps) => void = () => {}
  const resultado = new Promise<LecturaGps>(resolve => {
    soltar = resolve
    void (async () => {
      if (!(await pedirPermiso())) return resolve({ ok: false, motivo: 'PERMISO' })
      if (cortado) return
      resolve(await leer(esperaSeg, buena, onAvance, fn => { cortarLectura = fn }))
    })()
  })
  return {
    resultado,
    cortar: () => {
      cortado = true
      if (cortarLectura) cortarLectura()
      else soltar({ ok: false, motivo: 'TIMEOUT' })
    },
  }
}

function leer(esperaSeg: number, buena: number, onAvance: ((restan: number, mejor: number | null) => void) | undefined,
  exponerCorte: (fn: () => void) => void): Promise<LecturaGps> {
  const espera = Math.max(5, Math.min(120, esperaSeg || 15)) * 1000
  const inicio = Date.now()

  return new Promise(resolve => {
    let mejor: GeolocationResponse | null = null
    let terminado = false
    let watchId: number | null = null

    const terminar = (r: LecturaGps) => {
      if (terminado) return
      terminado = true
      clearInterval(tic)
      clearTimeout(limite)
      if (watchId != null) Geolocation.clearWatch(watchId)
      resolve(r)
    }
    const resultado = (): LecturaGps => mejor
      ? {
          ok: true, lat: mejor.coords.latitude, lng: mejor.coords.longitude, prec: Math.round(mejor.coords.accuracy * 10) / 10,
          fecha: isoLocal(mejor.timestamp || Date.now()),
          // Android dice si la ubicación viene de una app de GPS falso; iOS 15+ también (el simulador sale «simulada»).
          simulada: typeof (mejor as any).mocked === 'boolean' ? (mejor as any).mocked : null,
        }
      : { ok: false, motivo: 'TIMEOUT' }

    const tic = setInterval(() => {
      onAvance?.(Math.max(0, Math.ceil((espera - (Date.now() - inicio)) / 1000)), mejor ? Math.round(mejor.coords.accuracy) : null)
    }, 500)
    const limite = setTimeout(() => terminar(resultado()), espera)
    exponerCorte(() => terminar(resultado()))

    watchId = Geolocation.watchPosition(
      pos => {
        // Una posición vieja guardada por el sistema no sirve: tiene que ser de ahora.
        if (pos.timestamp && Date.now() - pos.timestamp > 120_000) return
        if (!mejor || pos.coords.accuracy < mejor.coords.accuracy) mejor = pos
        onAvance?.(Math.max(0, Math.ceil((espera - (Date.now() - inicio)) / 1000)), Math.round(mejor.coords.accuracy))
        if (mejor.coords.accuracy <= buena) terminar(resultado())
      },
      (e: GeolocationError) => {
        if (mejor) return
        if (e.code === 1) terminar({ ok: false, motivo: 'PERMISO' })
        else if (e.code === 2) terminar({ ok: false, motivo: 'APAGADO' })
        // 3 = timeout de una lectura: se sigue esperando hasta el límite.
      },
      { enableHighAccuracy: true, maximumAge: 0, distanceFilter: 0, interval: 1000, fastestInterval: 500, timeout: espera },
    )
  })
}
