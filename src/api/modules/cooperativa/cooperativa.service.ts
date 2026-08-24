import { httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'
import {
  ICatalogosSolicitud,
  ICrearSolicitud,
  IEmpleadoSinAfiliacion,
  IEstadoAfiliacion,
  ISolicitudCliente,
  ISolicitudSocio,
} from './cooperativa.types'

// Consume los endpoints de api/CooInter. La consulta de planilla la reenvía
// IMCoreApi a IMCoreProxy (SP del esquema CooInter); las solicitudes viven en
// IMCore. baseUrl ya incluye /api/, por eso la ruta va como 'CooInter/…'.
//
// Ninguna de las tres manda datos del empleado ni códigos: los resuelve el
// servidor desde el token. El SP de planilla devuelve datos personales, así que
// mandarlos desde acá permitiría consultar o guardar los de otro empleado.
const schema = 'CooInter'

export const cooperativaService = {
  /**
   * Todo lo que la pantalla necesita al abrirse: si el usuario aplica para
   * afiliarse y si ya tiene una solicitud en curso.
   */
  getEstadoAfiliacion: () =>
    httpClient.get<ExecutionResponse<IEstadoAfiliacion>>(`${schema}/EstadoAfiliacion`),

  /**
   * Crea la solicitud de afiliación. Sin cuerpo: el servidor vuelve a pedir los
   * datos a planilla antes de guardar.
   *
   * Devuelve la solicitud ya creada, con el estado resuelto.
   */
  crearSolicitudSocio: () =>
    httpClient.post<ExecutionResponse<ISolicitudSocio>, undefined>(
      `${schema}/SolicitudSocio`,
      undefined,
    ),

  /**
   * Solicitudes para la pantalla de aprobacion. statusCode vacio trae todas.
   * Requiere el acceso 'RequestSocio' del lado del servidor.
   */
  getSolicitudes: (statusCode?: string) =>
    httpClient.get<ExecutionResponse<ISolicitudSocio[]>>(
      `${schema}/Solicitudes${statusCode ? `?statusCode=${encodeURIComponent(statusCode)}` : ''}`,
    ),

  /**
   * Aprueba (APR) o rechaza (REJ) una o varias solicitudes.
   *
   * Va en UNA sola llamada con la lista de Ids, no una por solicitud: el
   * procedimiento las resuelve en una transaccion y aplica todo o nada.
   * Rejection_Reason es obligatorio al rechazar y se le muestra al solicitante.
   */
  resolverSolicitudes: (Ids: number[], Status_Code: string, Rejection_Reason?: string) =>
    httpClient.post<
      ExecutionResponse<null>,
      { Ids: number[]; Status_Code: string; Rejection_Reason?: string }
    >(`${schema}/ResolverSolicitud`, { Ids, Status_Code, Rejection_Reason }),

  /**
   * Solicitudes que el socio ha hecho en Cooperativa.
   *
   * Sin parametros: el codigo de personal lo resuelve el servidor desde el
   * token. Una lista vacia significa que todavia no ha hecho ninguna.
   */
  getSolicitudesCliente: () =>
    httpClient.get<ExecutionResponse<ISolicitudCliente[]>>(`${schema}/SolicitudesCliente`),

  /** Catalogos (tipos y plazos) del formulario de solicitud. */
  getCatalogosSolicitud: () =>
    httpClient.get<ExecutionResponse<ICatalogosSolicitud>>(`${schema}/CatalogosSolicitud`),

  /**
   * Crea la solicitud del socio. Nace en Pendiente; el estado no se manda desde
   * acá, lo fija el servidor.
   */
  crearSolicitud: (data: ICrearSolicitud) =>
    httpClient.post<ExecutionResponse<number | null>, ICrearSolicitud>(
      `${schema}/CrearSolicitud`,
      data,
    ),

  /**
   * Solo los datos de planilla, sin el estado de la solicitud. La pantalla usa
   * getEstadoAfiliacion; esta queda para consultas puntuales.
   */
  getEmpleadoSinAfiliacion: () =>
    httpClient.get<ExecutionResponse<IEmpleadoSinAfiliacion>>(`${schema}/EmpleadoSinAfiliacion`),
}
