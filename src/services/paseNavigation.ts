/**
 * Mini bus para abrir/resaltar un pase desde una notificación (aprobación),
 * sin depender de params de navegación (que no se refrescan de forma confiable
 * cuando la pantalla ya está montada). Mismo patrón que passNavigation (Visitas).
 *
 * Flujo:
 *  - El router llama requestOpenPaseAprobacion(paseId) y navega a 'paseAprobaciones'.
 *  - Si la pantalla ya está montada -> resalta de inmediato.
 *  - Si aún no -> queda pendiente y se "drena" al suscribirse.
 */

/**
 * Además del pase, viaja la BANDEJA a la que hay que llevar.
 *
 * Sin esto la pantalla abría siempre la del jefe, así que quien autoriza por
 * RR. HH. tocaba su notificación y caía en una lista donde ese pase no está:
 * el aviso lo dejaba peor que no tocarlo.
 *
 * `modo` puede venir vacío (avisos viejos que ya salieron sin él); en ese caso
 * la pantalla lo deduce buscando el pase en la otra bandeja.
 */
export type ModoAprobacion = 'jefe' | 'rh'

type Destino = { paseId: number; modo?: ModoAprobacion }
type Listener = (destino: Destino) => void

let pending: Destino | null = null
let listener: Listener | null = null

export function requestOpenPaseAprobacion(paseId: number, modo?: ModoAprobacion) {
  if (!paseId || paseId <= 0) return
  const destino: Destino = { paseId, modo }
  if (listener) listener(destino)
  else pending = destino
}

export function subscribeOpenPaseAprobacion(cb: Listener): () => void {
  listener = cb
  if (pending != null) {
    const p = pending
    pending = null
    cb(p)
  }
  return () => {
    if (listener === cb) listener = null
  }
}


/* ───────────────────────────────────────────────────────────────────────────
   SEGUNDO CANAL: el pase PROPIO, en «Mis pases».
   
   Es otro bus y no el de arriba porque son dos pantallas distintas y dos
   papeles distintos: arriba se va a FIRMAR un pase ajeno, acá solo a VER el
   propio. El aviso `pase_estado` («tu jefe autorizó», «pase aprobado»,
   «rechazado») llevaba a la lista sin señalar cuál era, aunque el aviso ya
   traía el paseId: con varios permisos en pantalla, había que buscarlo a ojo.
   ─────────────────────────────────────────────────────────────────────────── */

let pendingMio: number | null = null
let listenerMio: ((paseId: number) => void) | null = null

export function requestOpenMiPase(paseId: number) {
  if (!paseId || paseId <= 0) return
  if (listenerMio) listenerMio(paseId)
  else pendingMio = paseId
}

export function subscribeOpenMiPase(cb: (paseId: number) => void): () => void {
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
