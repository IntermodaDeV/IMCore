import { navigateWhenReady } from '../navigation/navigationRef'
import { requestOpenPass } from './passNavigation'
import { requestOpenPaseAprobacion } from './paseNavigation'

// Enruta una notificación (push o bandeja) a su pantalla de detalle según la
// categoría. `data` es el payload de la notificación (FCM data o el Data del inbox).
export function routeNotification(data: any): boolean {
  if (!data) return false
  const category = data.category ?? data.type ?? data.Category

  if (category === 'mantenimiento_ticket') {
    const id = Number(data.ticketId ?? data.TicketId)
    if (id > 0) {
      // Abre primero el listado y luego el detalle, para que "atrás" regrese al listado.
      navigateWhenReady('mantenimientoTickets')
      setTimeout(() => navigateWhenReady('mantenimientoTicketDetalle', { id }), 300)
      return true
    }
  }

  if (category === 'visita_acceso') {
    const visitaId = Number(data.visitaId ?? data.VisitaId)
    if (visitaId > 0) {
      requestOpenPass(visitaId)
      navigateWhenReady('visitasHistorial')
      return true
    }
  }

  // Pase pendiente de aprobación -> pantalla de Aprobaciones (resalta el pase)
  if (category === 'pase_aprobacion') {
    const paseId = Number(data.paseId ?? data.PaseId)
    navigateWhenReady('paseAprobaciones')
    if (paseId > 0) requestOpenPaseAprobacion(paseId)
    return true
  }

  // Resultado del pase (aprobado/rechazado/registrado) -> Mis pases
  if (category === 'pase_estado') {
    navigateWhenReady('paseHistorial')
    return true
  }

  if (category === 'solicitud_compra') {
    const solicitud = data.solicitud ?? data.Solicitud
    navigateWhenReady('aprobacionSC', solicitud ? { solicitud: String(solicitud) } : undefined)
    return true
  }

  if (category === 'solicitud_compra_historico') {
    const solicitud = data.solicitud ?? data.Solicitud
    navigateWhenReady('historic', solicitud ? { solicitud: String(solicitud) } : undefined)
    return true
  }

  if(category === 'expense') {
    const gastoId = data.ExpenseId ?? data.ExpenseId
    navigateWhenReady('detalleGasto', gastoId ? { gasto: null, id: String(gastoId) } : undefined)
    return true
  }

  return false
}
