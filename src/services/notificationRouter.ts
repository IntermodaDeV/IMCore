import { navigateWhenReady } from '../navigation/navigationRef'
import { requestOpenPass } from './passNavigation'
import { requestOpenMiPase, requestOpenPaseAprobacion } from './paseNavigation'
import { requestOpenHistorialHoraExtra, requestOpenSolicitudHoraExtra } from './overtimeNavigation'
import { requestMenuRefresh } from './menuRefresh'

// Enruta una notificación (push o bandeja) a su pantalla de detalle según la
// categoría. `data` es el payload de la notificación (FCM data o el Data del inbox).
export function routeNotification(data: any): boolean {
  if (!data) return false
  const category = data.category ?? data.type ?? data.Category

  if (category === 'coointer_solicitud_socio') {
    navigateWhenReady('RequestSocio')
    return true
  }

  if (category === 'coointer_solicitud_resultado') {
    if ((data.statusCode ?? data.Status_Code) === 'APR') requestMenuRefresh()
    navigateWhenReady('self')
    return true
  }

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
    // La bandeja viene en el aviso: la del jefe o la de RR. HH.
    const modo = String(data.modo ?? data.Modo ?? '') === 'rh' ? 'rh' : undefined
    navigateWhenReady('paseAprobaciones')
    if (paseId > 0) requestOpenPaseAprobacion(paseId, modo)
    return true
  }

  // Resultado del pase (aprobado/rechazado/registrado) -> Mis pases, con el
  // pase señalado. El aviso siempre trajo el paseId; no usarlo dejaba al
  // usuario buscando a ojo cuál de sus permisos era el del aviso.
  if (category === 'pase_estado') {
    const paseId = Number(data.paseId ?? data.PaseId)
    navigateWhenReady('paseHistorial')
    if (paseId > 0) requestOpenMiPase(paseId)
    return true
  }

  // Solicitud de horas extra esperando firma -> bandeja de aprobación, con la
  // solicitud resaltada un momento para no tener que buscarla en la lista.
  if (category === 'horas_extra_aprobacion') {
    const requestId = Number(data.requestId ?? data.RequestId)
    navigateWhenReady('RequestHours')
    if (requestId > 0) requestOpenSolicitudHoraExtra(requestId)
    return true
  }

  // Rechazo -> historial. La bandeja de aprobación no sirve acá: el solicitante
  // no aprueba nada, y su solicitud rechazada solo existe en el historial.
  if (category === 'horas_extra_rechazo') {
    const requestId = Number(data.requestId ?? data.RequestId)
    navigateWhenReady('HistoryHours')
    if (requestId > 0) requestOpenHistorialHoraExtra(requestId)
    return true
  }

  // Aprobada por todas las entidades -> historial, que es donde queda.
  if (category === 'horas_extra_completada') {
    const requestId = Number(data.requestId ?? data.RequestId)
    navigateWhenReady('HistoryHours')
    if (requestId > 0) requestOpenHistorialHoraExtra(requestId)
    return true
  }

  // Segundo flujo: una diferencia espera autorización -> su propia bandeja.
  if (category === 'horas_extra_revision') {
    navigateWhenReady('ReviewHours')
    return true
  }

  // Segundo flujo resuelto -> historial. Quien mandó la diferencia no aprueba
  // nada, así que la bandeja de autorización no le sirve.
  if (category === 'horas_extra_revision_resultado') {
    const requestId = Number(data.requestId ?? data.RequestId)
    navigateWhenReady('HistoryHours')
    if (requestId > 0) requestOpenHistorialHoraExtra(requestId)
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
