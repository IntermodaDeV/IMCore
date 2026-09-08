import { httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'
import {
  IModeloMaquina, IMotivoSolicitud, ISolicitud, ISolicitudHistorial,
  ISolicitudLinea, ISolicitudPermisos, ISolicitudResult,
} from './solicitudes.types'

// api/SolicitudesRepuestos. baseUrl (API_URL) ya incluye /api/.
// El ALCANCE lo decide el servidor: el mecánico ve las suyas, quien tiene
// 'GestionarSolicitudesRepuestos' las ve todas. Acá no se filtra nada.
const schema = 'SolicitudesRepuestos'

type Res<T> = Promise<ExecutionResponse<T>>

export const solicitudesRepuestosService = {
  // Modelos del PARQUE de máquinas (Mantenimiento.Maquina), no del maestro de
  // fallas. Son ~66 y casi no cambian: la pantalla los cachea mientras vive.
  getModelos: (busqueda?: string): Res<IModeloMaquina[]> =>
    httpClient.get(`${schema}/Modelos`, { busqueda }),

  getMotivos: (soloActivos = true): Res<IMotivoSolicitud[]> =>
    httpClient.get(`${schema}/Motivos`, { soloActivos }),

  getPermisos: (): Res<ISolicitudPermisos> => httpClient.get(`${schema}/Permisos`),

  // Rango [desde, hasta) en ISO local, igual que el resto del módulo.
  getSolicitudes: (desde?: string, hasta?: string, estado?: string, busqueda?: string): Res<ISolicitud[]> =>
    httpClient.get(schema, { desde, hasta, estado, busqueda }),

  getSolicitud: (id: number): Res<ISolicitud> => httpClient.get(`${schema}/${id}`),

  getLineas: (id: number): Res<ISolicitudLinea[]> => httpClient.get(`${schema}/${id}/Lineas`),

  getHistorial: (lineaId: number): Res<ISolicitudHistorial[]> =>
    httpClient.get(`${schema}/Lineas/${lineaId}/Historial`),

  crear: (data: {
    Modelo: string
    MotivoSolicitud_Id: number
    // Opcional: el ticket de mantenimiento por el que se pide la pieza. Es lo
    // que después permite medir cuánto paro costó esperarla.
    Ticket_Id?: number | null
    Observacion?: string | null
    Lineas: { NumeroParte: string; Descripcion: string; Cantidad: number }[]
  }): Res<ISolicitudResult> => httpClient.post(schema, data),

  editar: (id: number, data: { Modelo: string; MotivoSolicitud_Id: number; Ticket_Id?: number | null; Observacion?: string | null }):
    Res<ISolicitudResult> => httpClient.put(`${schema}/${id}`, { ...data, Id: id }),

  anular: (id: number): Res<ISolicitudResult> => httpClient.delete(`${schema}/${id}`),

  agregarLinea: (solicitudId: number, data: { NumeroParte: string; Descripcion: string; Cantidad: number }):
    Res<ISolicitudResult> => httpClient.post(`${schema}/${solicitudId}/Lineas`, data),

  editarLinea: (lineaId: number, data: { NumeroParte: string; Descripcion: string; Cantidad: number }):
    Res<ISolicitudResult> => httpClient.put(`${schema}/Lineas/${lineaId}`, { ...data, Id: lineaId }),

  // anularSolicitud solo aplica cuando era el ÚLTIMO repuesto: cierra el número
  // en vez de dejar la solicitud vacía. La pantalla lo pregunta antes.
  eliminarLinea: (lineaId: number, anularSolicitud = false): Res<ISolicitudResult> =>
    httpClient.delete(`${schema}/Lineas/${lineaId}`, { anularSolicitud }),

  // El código va TAL COMO LO TECLEA Óscar ('3202-205'); lo interpreta el servidor,
  // para que la app y el web no puedan entenderlo distinto.
  codificar: (lineaId: number, codigo: string): Res<ISolicitudResult> =>
    httpClient.patch(`${schema}/Lineas/${lineaId}/Codigo`, { Codigo: codigo }),

  cambiarEstado: (lineaId: number, data: { Estado: string; Referencia?: string | null; Comentario?: string | null }):
    Res<ISolicitudResult> => httpClient.patch(`${schema}/Lineas/${lineaId}/Estado`, data),
}
