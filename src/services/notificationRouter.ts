import { navigateWhenReady } from '../navigation/navigationRef'
import { requestOpenPass } from './passNavigation'
import { requestOpenMiPase, requestOpenPaseAprobacion } from './paseNavigation'
import { requestOpenHistorialHoraExtra, requestOpenSolicitudHoraExtra } from './overtimeNavigation'
import { requestOpenMiPaseSalida, requestOpenPaseSalidaFirma } from './pasesSalidaNavigation'

// Enruta una notificación (push o bandeja) a su pantalla de detalle según la
// categoría. `data` es el payload de la notificación (FCM data o el Data del inbox).
export function routeNotification(data: any): boolean {
  if (!data) return false
  const category = data.category ?? data.type ?? data.Category

  // Las dos categorias de AFILIACION a la cooperativa desaparecieron con su
  // paso de aprobacion: ahora la afiliacion es directa, asi que no hay
  // solicitud que avisarle a nadie ni resultado que esperar. Las notificaciones
  // viejas que todavia esten en la bandeja caen al return false del final y no
  // navegan. Las de PRESTAMO, que si tienen cadena de aprobacion, van abajo.

  // Un socio pidio un prestamo -> la bandeja del primer aprobador, con la
  // solicitud resaltada para no tener que buscarla en la lista.
  if (category === 'coointer_solicitud_prestamo') {
    const solicitud = Number(data.solicitudId ?? data.SolicitudId)
    navigateWhenReady('RequestSocio', solicitud > 0 ? { solicitud } : undefined)
    return true
  }

  // Le asignaron una solicitud para firmar -> la misma pantalla: el servidor le
  // muestra solo lo suyo.
  if (category === 'coointer_prestamo_asignado') {
    const solicitud = Number(data.solicitudId ?? data.SolicitudId)
    navigateWhenReady('RequestSocio', solicitud > 0 ? { solicitud } : undefined)
    return true
  }

  // Ya no hace falta su firma: se cerro con el minimo de otros, la rechazaron,
  // o lo sacaron de la cadena. Va a la misma pantalla, donde la solicitud ya
  // aparece resuelta.
  if (category === 'coointer_prestamo_no_requerido') {
    const solicitud = Number(data.solicitudId ?? data.SolicitudId)
    navigateWhenReady('RequestSocio', solicitud > 0 ? { solicitud } : undefined)
    return true
  }

  // Al SOLICITANTE: su prestamo se resolvio. Va a "Mis solicitudes", no a la
  // bandeja de aprobacion — el no aprueba nada.
  if (category === 'coointer_prestamo_resultado') {
    const solicitud = Number(data.solicitudId ?? data.SolicitudId)
    navigateWhenReady('RequestCoo', solicitud > 0 ? { solicitud } : undefined)
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

  // El repuesto que pidio el mecanico ya entro a bodega -> su solicitud. Se abre
  // primero el listado para que "atras" no lo deje fuera del modulo.
  if (category === 'repuesto_ingresado') {
    const id = Number(data.solicitudId ?? data.SolicitudId)
    const numero = data.numero ?? data.Numero
    navigateWhenReady('solicitudesRepuestos')
    if (id > 0) {
      setTimeout(() => navigateWhenReady('solicitudesRepuestosDetalle', { id, numero }), 300)
    }
    return true
  }

  // Todo lo que le pasa a una firma de un pase de salida -> la bandeja de
  // Aprobaciones. Las tres variantes (se requiere, ya no se requiere, ya firmó
  // otro) van a la misma pantalla: en las tres lo que el usuario quiere ver es
  // cómo le quedó la bandeja. El `evento` viaja para la bandeja de avisos.
  if (category === 'pase_salida_firma') {
    const paseId = Number(data.paseId ?? data.PaseId)
    navigateWhenReady('pasesSalidaAprobaciones')
    // Se publica DESPUÉS de navegar, igual que el resto: si la pantalla ya
    // estaba montada resalta al toque, y si no, el destino queda pendiente y
    // se consume al suscribirse.
    if (paseId > 0) requestOpenPaseSalidaFirma(paseId)
    return true
  }

  // Al SOLICITANTE: su pase de salida se resolvió (aprobado, y más adelante
  // rechazado) -> Mis pases, con el pase señalado. No va a Aprobaciones: él no
  // firma nada, y ahí su pase no aparece.
  if (category === 'pase_salida_estado' || category === 'pase_salida_rechazado') {
    const paseId = Number(data.paseId ?? data.PaseId)
    const tab = String(data.tab ?? data.Tab ?? 'PROC') === 'FIN' ? 'FIN' : 'PROC'
    navigateWhenReady('pasesSalidaMisPases', { tab })
    if (paseId > 0) requestOpenMiPaseSalida(paseId, tab)
    return true
  }

  // Un pase de salida venció sin usarse -> Mis pases, en la pestaña Finalizados
  // y con el pase señalado. La pestaña viaja en el aviso y no se asume acá: si
  // el servidor algún día avisa por otro motivo, manda a dónde corresponda sin
  // tocar la app.
  // Un pase salió y no ha regresado. Le llega al SOLICITANTE —que es quien
  // tiene que recuperar el material— y a QUIENES LO FIRMARON, y cada uno va a
  // una pantalla distinta: el pase del firmante no está en "Mis pases", él no
  // lo pidió. El destino viaja en el aviso en vez de deducirse acá, igual que
  // la pestaña del aviso de vencimiento.
  if (category === 'pase_salida_retorno') {
    const paseId = Number(data.paseId ?? data.PaseId)
    const destino = String(data.destino ?? data.Destino ?? 'misPases')

    if (destino === 'aprobaciones') {
      navigateWhenReady('pasesSalidaAprobaciones')
      // El pase que firmó ya está aprobado y salió, así que vive en la bandeja
      // de Aprobadas: mandarlo a Pendientes sería mandarlo a donde no está.
      if (paseId > 0) requestOpenPaseSalidaFirma(paseId, 'APR')
      return true
    }

    // Un pase que está afuera sigue abierto, así que está en "En proceso".
    const tab = 'PROC'
    navigateWhenReady('pasesSalidaMisPases', { tab })
    if (paseId > 0) requestOpenMiPaseSalida(paseId, tab)
    return true
  }

  if (category === 'pase_salida_vencido') {
    const paseId = Number(data.paseId ?? data.PaseId)

    /* Este aviso le cae a DOS papeles: al solicitante, que es el dueño del
       pase, y a quien lo tenía esperando su firma. El firmante no va a Mis
       pases —el pase no es suyo y ahí no aparece—, va a su bandeja, que es la
       que acaba de perder la fila.

       No se pide resaltar el pase en ese caso: un pase vencido ya no está en
       ninguna de las tres bandejas de firma (Pendientes lo excluye por estado,
       y Aprobadas/Rechazadas piden una firma que nunca dio), así que el
       resaltado no tendría a qué agarrarse. */
    if (String(data.destino ?? data.Destino ?? 'misPases') === 'aprobaciones') {
      navigateWhenReady('pasesSalidaAprobaciones')
      return true
    }

    const tab = String(data.tab ?? data.Tab ?? 'FIN') === 'PROC' ? 'PROC' : 'FIN'
    navigateWhenReady('pasesSalidaMisPases', { tab })
    if (paseId > 0) requestOpenMiPaseSalida(paseId, tab)
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

  // Terminó (o falló) la carga de datos de AX de una corrida -> su resumen.
  // Se abre primero el listado para que «atrás» no lo deje fuera del módulo,
  // igual que en tickets y en solicitudes de repuestos.
  //
  // El aviso trae `url` y `ruta` además de `corridaId`: `url` es una ruta del
  // WEB (/creditosAdministracionPaquetes?corrida=N) que la app no puede abrir,
  // por eso se usa el id suelto y no se parsea la URL.
  if (category === 'administracion_paquetes') {
    const id = Number(data.corridaId ?? data.CorridaId)
    navigateWhenReady('creditosAdministracionPaquetes')
    if (id > 0) {
      setTimeout(() => navigateWhenReady('creditosCorridaDetalle', { id }), 300)
    }
    return true
  }

  if(category === 'expense') {
    const gastoId = data.ExpenseId ?? data.ExpenseId
    navigateWhenReady('detalleGasto', gastoId ? { gasto: null, id: String(gastoId) } : undefined)
    return true
  }

  return false
}
