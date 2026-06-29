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

type Listener = (paseId: number) => void

let pending: number | null = null
let listener: Listener | null = null

export function requestOpenPaseAprobacion(paseId: number) {
  if (!paseId || paseId <= 0) return
  if (listener) listener(paseId)
  else pending = paseId
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
