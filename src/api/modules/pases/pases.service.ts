import { httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'
import {
  IAprobador,
  IAprobarPase,
  ICrearPase,
  IEmpleado,
  IPase,
  IPaseCategoria,
  IPaseResult,
  IRegistrarAcceso,
  IRegistrarAccesoResult,
} from './pases.types'

const schema = 'Pases'

export const pasesService = {
  // Categorías (CRUD administrable)
  getCategorias: (onlyActive: boolean = true) =>
    httpClient.get<ExecutionResponse<IPaseCategoria[]>>(`${schema}/Categorias?onlyActive=${onlyActive}`),

  saveCategoria: (data: IPaseCategoria) =>
    httpClient.post<ExecutionResponse<any>, IPaseCategoria>(`${schema}/Categorias`, data),

  changeStatusCategoria: (data: IPaseCategoria) =>
    httpClient.put<ExecutionResponse<any>, IPaseCategoria>(`${schema}/Categorias`, data),

  // Empleados (alcance del usuario: su departamento + su personal a cargo)
  buscarEmpleados: (userCode: string, query: string = '') =>
    httpClient.get<ExecutionResponse<IEmpleado[]>>(
      `${schema}/Empleados?user_Code=${encodeURIComponent(userCode)}&query=${encodeURIComponent(query)}`
    ),

  // Candidatos a aprobador (rol "Aprobador de pases")
  getAprobadores: (query: string = '') =>
    httpClient.get<ExecutionResponse<IAprobador[]>>(`${schema}/Aprobadores?query=${encodeURIComponent(query)}`),

  // Pases
  crear: (data: ICrearPase) =>
    httpClient.post<ExecutionResponse<IPaseResult>, ICrearPase>(`${schema}/Crear`, data),

  getMisPases: (userCode: string) =>
    httpClient.get<ExecutionResponse<IPase[]>>(`${schema}/MisPases?user_Code=${encodeURIComponent(userCode)}`),

  // Historial global (todos los pases) — gated por access 'TodoHistorialPases'
  getHistorialTodos: (userCode: string) =>
    httpClient.get<ExecutionResponse<IPase[]>>(`${schema}/Historial?user_Code=${encodeURIComponent(userCode)}`),

  getPorAprobar: (userCode: string) =>
    httpClient.get<ExecutionResponse<IPase[]>>(`${schema}/PorAprobar?user_Code=${encodeURIComponent(userCode)}`),

  getSeguridad: (fecha?: string) =>
    httpClient.get<ExecutionResponse<IPase[]>>(`${schema}/Seguridad${fecha ? `?fecha=${fecha}` : ''}`),

  getDetalle: (id: number) =>
    httpClient.get<ExecutionResponse<IPase>>(`${schema}/Detalle?id=${id}`),

  aprobar: (data: IAprobarPase) =>
    httpClient.post<ExecutionResponse<any>, IAprobarPase>(`${schema}/Aprobar`, data),

  rechazar: (data: IAprobarPase) =>
    httpClient.post<ExecutionResponse<any>, IAprobarPase>(`${schema}/Rechazar`, data),

  // Seguridad: registrar entrada/salida escaneando el código del carnet
  registrarAcceso: (data: IRegistrarAcceso) =>
    httpClient.post<ExecutionResponse<IRegistrarAccesoResult>, IRegistrarAcceso>(`${schema}/RegistrarAcceso`, data),
}
