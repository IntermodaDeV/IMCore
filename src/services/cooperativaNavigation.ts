/**
 * Mini bus para abrir y RESALTAR una solicitud de préstamo desde una
 * notificación.
 *
 * No se usan params de navegación porque no se refrescan de forma confiable
 * cuando la pantalla ya está montada: si el aprobador ya tenía "Solicitudes"
 * abierta, `navigate` con params nuevos no vuelve a disparar nada y el aviso
 * no señala nada. Mismo patrón que pasesSalidaNavigation, paseNavigation y
 * passNavigation.
 *
 * Flujo:
 *  - El router publica el destino y navega.
 *  - Si la pantalla ya está montada -> resalta de inmediato.
 *  - Si todavía no -> queda pendiente y se "drena" cuando se suscribe.
 */

/**
 * La pestaña a la que hay que llevarlo.
 *
 * Viaja con el destino por la misma razón que la bandeja en pases de salida:
 * "te toca firmar" apunta a Pendientes, pero el día que haya un aviso de
 * "ya se resolvió" va a apuntar a otra. Sin este dato, el segundo caso dejaría
 * al aprobador en una pestaña donde la solicitud no está.
 */
export type TabAprobacion = 'Pendiente' | 'Aprobada' | 'Rechazada'

type DestinoAprobacion = { solicitudId: number; tab?: TabAprobacion }

let pendiente: DestinoAprobacion | null = null
let listener: ((destino: DestinoAprobacion) => void) | null = null

export function requestOpenSolicitudAprobacion(
  solicitudId: number,
  tab?: TabAprobacion,
) {
  if (!solicitudId || solicitudId <= 0) return

  const destino: DestinoAprobacion = { solicitudId, tab }

  if (listener) listener(destino)
  else pendiente = destino
}

export function subscribeOpenSolicitudAprobacion(
  cb: (destino: DestinoAprobacion) => void,
): () => void {
  listener = cb

  if (pendiente != null) {
    const p = pendiente
    pendiente = null
    cb(p)
  }

  return () => {
    if (listener === cb) listener = null
  }
}

/* ───────────────────────────────────────────────────────────────────────────
   CANAL 2: «Mis solicitudes». Es la solicitud PROPIA y solo se va a VER.

   Es otro bus y no el de arriba porque son dos pantallas y dos papeles
   distintos: en una el usuario firma lo de otro, en esta mira lo suyo. Con un
   solo canal, un aviso de "tu préstamo fue aprobado" resaltaría una fila en la
   bandeja del aprobador, donde su propia solicitud no está.
   ─────────────────────────────────────────────────────────────────────────── */

type DestinoMia = { solicitudId: number }

let pendienteMia: DestinoMia | null = null
let listenerMia: ((destino: DestinoMia) => void) | null = null

export function requestOpenMiSolicitud(solicitudId: number) {
  if (!solicitudId || solicitudId <= 0) return

  const destino: DestinoMia = { solicitudId }

  if (listenerMia) listenerMia(destino)
  else pendienteMia = destino
}

export function subscribeOpenMiSolicitud(
  cb: (destino: DestinoMia) => void,
): () => void {
  listenerMia = cb

  if (pendienteMia != null) {
    const p = pendienteMia
    pendienteMia = null
    cb(p)
  }

  return () => {
    if (listenerMia === cb) listenerMia = null
  }
}
