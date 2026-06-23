/**
 * Mini bus para abrir el detalle de un pase desde cualquier parte (ej. la
 * bandeja de notificaciones), sin depender de params de navegación — que no se
 * refrescan de forma confiable cuando la pantalla de Pases ya está montada.
 *
 * Flujo:
 *  - La bandeja llama requestOpenPass(visitaId) y navega a 'visitasHistorial'.
 *  - Si la pantalla ya está montada (listener activo) -> abre de inmediato.
 *  - Si aún no está montada -> queda pendiente y se "drena" al suscribirse.
 */

type Listener = (visitaId: number) => void

let pending: number | null = null
let listener: Listener | null = null

export function requestOpenPass(visitaId: number) {
  if (!visitaId || visitaId <= 0) return
  if (listener) {
    listener(visitaId)
  } else {
    pending = visitaId
  }
}

export function subscribeOpenPass(cb: Listener): () => void {
  listener = cb
  // Si había una solicitud pendiente (la pantalla acaba de montarse), la atiende.
  if (pending != null) {
    const p = pending
    pending = null
    cb(p)
  }
  return () => {
    if (listener === cb) listener = null
  }
}
