/**
 * Mini bus para resaltar una solicitud de horas extra al llegar desde una
 * notificación, sin depender de params de navegación (que no se refrescan de
 * forma confiable cuando la pantalla ya está montada).
 *
 * Mismo patrón que paseNavigation (Pases) y passNavigation (Visitas).
 *
 * Hay DOS canales porque son dos pantallas distintas y dos avisos distintos:
 * la aprobación lleva a la bandeja y el rechazo al historial. Con un solo canal,
 * la pantalla que estuviera montada se robaría la señal de la otra.
 *
 * Flujo de cada canal:
 *  - El router llama request…(requestId) y navega a la pantalla.
 *  - Si ya está montada -> resalta de inmediato.
 *  - Si aún no -> queda pendiente y se "drena" al suscribirse.
 */

type Listener = (requestId: number) => void

type Canal = {
  pending: number | null
  listener: Listener | null
}

const canales: Record<'bandeja' | 'historial', Canal> = {
  bandeja: { pending: null, listener: null },
  historial: { pending: null, listener: null },
}

function emitir(canal: Canal, requestId: number) {
  if (!requestId || requestId <= 0) return
  if (canal.listener) canal.listener(requestId)
  else canal.pending = requestId
}

function suscribir(canal: Canal, cb: Listener): () => void {
  canal.listener = cb
  if (canal.pending != null) {
    const p = canal.pending
    canal.pending = null
    cb(p)
  }
  return () => {
    if (canal.listener === cb) canal.listener = null
  }
}

/** Bandeja de aprobación (aviso de "se requiere tu aprobación"). */
export const requestOpenSolicitudHoraExtra = (requestId: number) =>
  emitir(canales.bandeja, requestId)

export const subscribeOpenSolicitudHoraExtra = (cb: Listener) =>
  suscribir(canales.bandeja, cb)

/** Historial (aviso de "tu solicitud fue rechazada"). */
export const requestOpenHistorialHoraExtra = (requestId: number) =>
  emitir(canales.historial, requestId)

export const subscribeOpenHistorialHoraExtra = (cb: Listener) =>
  suscribir(canales.historial, cb)
