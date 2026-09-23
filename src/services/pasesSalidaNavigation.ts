/**
 * Mini bus para abrir y RESALTAR un pase de salida desde una notificación.
 *
 * No se usan params de navegación porque no se refrescan de forma confiable
 * cuando la pantalla ya está montada: si el usuario ya tenía Mis pases abierta,
 * `navigate` con params nuevos no vuelve a disparar nada y el aviso no señala
 * nada. Mismo patrón que paseNavigation (RR. HH.) y passNavigation (Visitas).
 *
 * Flujo:
 *  - El router publica el destino y navega.
 *  - Si la pantalla ya está montada -> resalta de inmediato.
 *  - Si todavía no -> queda pendiente y se "drena" cuando se suscribe.
 */

/* ───────────────────────────────────────────────────────────────────────────
   CANAL 1: la bandeja de firmas. Es un pase AJENO.

   Viaja además la BANDEJA, por la misma razón que en el canal 2 viaja la
   pestaña: "te toca firmar" apunta a Pendientes, pero "el pase que autorizaste
   no ha regresado" apunta a Aprobadas — ese pase ya se firmó y salió. Sin este
   dato, el segundo aviso dejaba al usuario en una bandeja donde el pase no
   está.
   ─────────────────────────────────────────────────────────────────────────── */

export type BandejaDestino = 'PEND' | 'APR' | 'REJ'

type DestinoFirma = { paseId: number; bandeja?: BandejaDestino }

let pendingFirma: DestinoFirma | null = null
let listenerFirma: ((destino: DestinoFirma) => void) | null = null

export function requestOpenPaseSalidaFirma(paseId: number, bandeja?: BandejaDestino) {
  if (!paseId || paseId <= 0) return
  const destino: DestinoFirma = { paseId, bandeja }
  if (listenerFirma) listenerFirma(destino)
  else pendingFirma = destino
}

export function subscribeOpenPaseSalidaFirma(cb: (destino: DestinoFirma) => void): () => void {
  listenerFirma = cb
  if (pendingFirma != null) {
    const p = pendingFirma
    pendingFirma = null
    cb(p)
  }
  return () => {
    if (listenerFirma === cb) listenerFirma = null
  }
}

/* ───────────────────────────────────────────────────────────────────────────
   CANAL 2: «Mis pases». Es el pase PROPIO y solo se va a VER.

   Es otro bus y no el de arriba porque son dos pantallas y dos papeles
   distintos. Y acá viaja además la PESTAÑA: un pase vencido está en
   Finalizados, y llevar al usuario a "En proceso" sería mandarlo a buscarlo
   donde no está.
   ─────────────────────────────────────────────────────────────────────────── */

export type TabMisPases = 'PROC' | 'FIN'

type DestinoMio = { paseId: number; tab?: TabMisPases }

let pendingMio: DestinoMio | null = null
let listenerMio: ((destino: DestinoMio) => void) | null = null

export function requestOpenMiPaseSalida(paseId: number, tab?: TabMisPases) {
  if (!paseId || paseId <= 0) return
  const destino: DestinoMio = { paseId, tab }
  if (listenerMio) listenerMio(destino)
  else pendingMio = destino
}

export function subscribeOpenMiPaseSalida(cb: (destino: DestinoMio) => void): () => void {
  listenerMio = cb
  if (pendingMio != null) {
    const p = pendingMio
    pendingMio = null
    cb(p)
  }
  return () => {
    if (listenerMio === cb) listenerMio = null
  }
}
