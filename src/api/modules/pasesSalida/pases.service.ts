import { httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'
import {
  IPaseSalida, IPaseSalidaDetalle, IPaseSalidaGuardar, IFirmaUsuario, IPaseSalidaAuth,
  IPaseSalidaEstado, BandejaFirma, BandejaPorteria, IPaseSalidaFirmar,
} from './pases.types'
import { IMaterial } from './pasesSalida.types'
import { IReglaResumen } from './configuracion.types'

// El pase de salida (api/PasesSalida). El solicitante no viaja desde acá: el
// backend lo toma del token.
const schema = 'PasesSalida'

/**
 * El guardado devuelve Success/mensajes MÁS el Id y el correlativo en el mismo
 * objeto, porque el SP los manda en la misma fila.
 */
export type PaseGuardarResponse = ExecutionResponse<null> & {
  Id?: number
  Correlativo?: string
}

export const pasesService = {
  // Mis pases. `todos` trae los de toda la empresa (bandejas y auditoría).
  getPases: (params?: { todos?: boolean; estado?: string; desde?: string; hasta?: string }) =>
    httpClient.get<ExecutionResponse<IPaseSalida[]>>(`${schema}`, params ?? {}),

  // El SP devuelve una fila; el arreglo trae 0 o 1 elemento.
  getPase: (id: number) =>
    httpClient.get<ExecutionResponse<IPaseSalida[]>>(`${schema}/${id}`),

  getDetalle: (id: number) =>
    httpClient.get<ExecutionResponse<IPaseSalidaDetalle[]>>(`${schema}/${id}/Detalle`),

  // La bitácora: una fila por alternativa de firma. `armarBitacora` las agrupa.
  getFirmasPase: (id: number) =>
    httpClient.get<ExecutionResponse<IPaseSalidaAuth[]>>(`${schema}/${id}/Firmas`),

  // El movimiento de estados, del más viejo al más nuevo. Las firmas dicen
  // quién autorizó; esto dice qué le fue pasando al pase.
  getHistorialPase: (id: number) =>
    httpClient.get<ExecutionResponse<IPaseSalidaEstado[]>>(`${schema}/${id}/Historial`),

  // Las firmas de TODOS mis pases del período, en una sola llamada. Evita pedir
  // una por tarjeta cuando la lista las muestra todas.
  getFirmasMisPases: (desde?: string, hasta?: string) =>
    httpClient.get<ExecutionResponse<IPaseSalidaAuth[]>>(`${schema}/MisFirmasPases`, { desde, hasta }),

  // Crear y editar van al mismo endpoint: Id = -1 crea, Id > 0 edita.
  guardar: (data: IPaseSalidaGuardar) =>
    httpClient.post<PaseGuardarResponse, IPaseSalidaGuardar>(`${schema}`, data),

  // Los materiales que puedo pedir: el backend los filtra por el token, así que
  // la pantalla no tiene que saber nada del alcance.
  getMisMateriales: () =>
    httpClient.get<ExecutionResponse<IMaterial[]>>(`${schema}/MisMateriales`),

  // Qué combinaciones grupo × tipo existen y en qué estado, para bloquear el
  // material al agregarlo en vez de rebotar al guardar.
  getReglas: () =>
    httpClient.get<ExecutionResponse<IReglaResumen[]>>(`${schema}/Reglas`),

  // ── Portería ───────────────────────────────────────────────────────────────
  /**
   * Una bandeja de portería. El backend filtra por estado: acá no se decide
   * nada sobre eso.
   *
   * `fecha` ('YYYY-MM-DD') solo aplica a PEND, que es una agenda del día. FIN y
   * REG son historial y se acotan por meses contra la fecha REAL de salida.
   */
  getPasesParaSalida: (bandeja: BandejaPorteria = 'PEND', fecha?: string, meses?: number) =>
    httpClient.get<ExecutionResponse<IPaseSalida[]>>(`${schema}/ParaSalida`, { bandeja, fecha, meses }),

  // El pase que codifica un QR escaneado. Devuelve 0 o 1 elemento, y lo trae
  // cualquiera sea su estado: un pase rechazado no puede verse igual que un
  // código inventado.
  getPasePorCorrelativo: (correlativo: string) =>
    httpClient.get<ExecutionResponse<IPaseSalida[]>>(`${schema}/PorCorrelativo`, { correlativo }),

  /**
   * Registra la salida real. Solo viaja el pase: la hora la pone el servidor
   * —el reloj del teléfono del guardia no es fuente confiable para un dato que
   * se audita— y quién la registra sale del token.
   *
   * `Retorna` en la respuesta dice qué falta después: con true el pase queda
   * esperando el retorno, con false quedó cerrado.
   */
  registrarSalida: (id: number) =>
    httpClient.post<
      ExecutionResponse<null> & { Estado?: string; Retorna?: boolean; FechaSalidaReal?: string },
      { Id: number }
    >(`${schema}/RegistrarSalida`, { Id: id }),

  /**
   * Registra el regreso de un pase que estaba afuera. Es el SEGUNDO escaneo del
   * mismo QR: qué significa cada escaneo lo decide el estado del pase, no el
   * guardia. El pase termina en Finalizado.
   */
  registrarRetorno: (id: number) =>
    httpClient.post<
      ExecutionResponse<null> & { Estado?: string; FechaRetorno?: string },
      { Id: number }
    >(`${schema}/RegistrarRetorno`, { Id: id }),

  // ── Bandeja de aprobaciones ────────────────────────────────────────────────
  // Mis accesos de firma. Normalmente devuelve uno.
  getMisFirmas: () =>
    httpClient.get<ExecutionResponse<IFirmaUsuario[]>>(`${schema}/MisFirmas`),

  // Aprobar o rechazar. Quién firma lo pone el backend desde el token.
  firmar: (data: IPaseSalidaFirmar) =>
    httpClient.post<ExecutionResponse<null> & { Estado?: string; Paso?: number }, IPaseSalidaFirmar>(
      `${schema}/Firmar`, data),

  /**
   * Los pases de una bandeja de firma. El backend valida que el acceso sea mío.
   * `bandeja`: PEND esperan mi firma · APR y REJ son mi historial.
   */
  getPasesPorFirmar: (accessId: number, bandeja: BandejaFirma = 'PEND', desde?: string, hasta?: string) =>
    httpClient.get<ExecutionResponse<IPaseSalida[]>>(`${schema}/PorFirmar`, { accessId, bandeja, desde, hasta }),

  // Descarta un pase pendiente: el backend lo mueve a PSELI y deja de traerlo.
  // La fila nunca se borra.
  eliminar: (id: number) =>
    httpClient.post<ExecutionResponse<null>, { Id: number }>(`${schema}/Eliminar`, { Id: id }),

  anular: (id: number, comentario?: string) =>
    httpClient.post<ExecutionResponse<null>, { Id: number; Comentario?: string }>(
      `${schema}/Anular`, { Id: id, Comentario: comentario }),
}
