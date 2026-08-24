/**
 * Mini bus para pedir un refresco del menú desde fuera de React.
 *
 * Lo necesitan los handlers de notificaciones: son módulos sueltos, sin acceso
 * a los contextos. Mismo patrón que passNavigation / paseNavigation.
 *
 * Flujo:
 *  - Al llegar (o tocarse) una notificación que cambia los permisos, el handler
 *    llama requestMenuRefresh().
 *  - MenuProvider está suscrito y vuelve a pedir el menú del usuario.
 *  - Si todavía no hay nadie suscrito (arranque en frío desde la notificación),
 *    el pedido queda pendiente y se atiende al suscribirse.
 */

type Listener = () => void

let pending = false
let listener: Listener | null = null

/** Pide que el menú se vuelva a cargar del servidor. */
export function requestMenuRefresh(): void {
  if (listener) {
    listener()
  } else {
    pending = true
  }
}

export function subscribeMenuRefresh(cb: Listener): () => void {
  listener = cb

  // Si había un pedido en cola (el provider acaba de montarse), se atiende.
  if (pending) {
    pending = false
    cb()
  }

  return () => {
    if (listener === cb) listener = null
  }
}
