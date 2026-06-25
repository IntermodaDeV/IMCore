import { httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'
import { IArea, IOperacion, ITipoParo } from './tickets.types'

// CRUD de catálogos de mantenimiento (api/Catalogos). El acceso lo gobierna el
// permiso de menú de cada pantalla; el backend solo exige autenticación.
const schema = 'Catalogos'

export interface IAreaPrincipal { Id: number; Name: string; PermiteMaquinas: boolean; Orden: number; Status_Id: number }
export interface IAreaPrincipalManage { Id?: number; Name: string; PermiteMaquinas: boolean; Status_Id?: number }
export interface IAreaManage { Id?: number; Name: string; AreaPrincipal_Id: number; Status_Id?: number }
export interface IOperacionManage { Id?: number; Area_Id: number; Name: string; Status_Id?: number }
export interface ITipoParoManage { Id?: number; Name: string }

export const catalogosService = {
  // ── Áreas principales ─────────────────────────────────────────────────────
  getAreasPrincipales: (onlyActive = false) =>
    httpClient.get<ExecutionResponse<IAreaPrincipal[]>>(`${schema}/AreasPrincipales`, { onlyActive }),
  crearAreaPrincipal: (data: IAreaPrincipalManage) =>
    httpClient.post<ExecutionResponse<null>, IAreaPrincipalManage>(`${schema}/AreasPrincipales`, data),
  editarAreaPrincipal: (data: IAreaPrincipalManage) =>
    httpClient.put<ExecutionResponse<null>, IAreaPrincipalManage>(`${schema}/AreasPrincipales`, data),
  toggleAreaPrincipal: (id: number) =>
    httpClient.post<ExecutionResponse<null>>(`${schema}/AreasPrincipales/Toggle?id=${id}`),

  // ── Áreas ───────────────────────────────────────────────────────────────
  getAreas: (onlyActive = false, areaPrincipalId?: number, soloMaquinas?: boolean) =>
    httpClient.get<ExecutionResponse<IArea[]>>(`${schema}/Areas`, { onlyActive, areaPrincipal_Id: areaPrincipalId, soloMaquinas }),
  crearArea: (data: IAreaManage) =>
    httpClient.post<ExecutionResponse<null>, IAreaManage>(`${schema}/Areas`, data),
  editarArea: (data: IAreaManage) =>
    httpClient.put<ExecutionResponse<null>, IAreaManage>(`${schema}/Areas`, data),
  toggleArea: (id: number) =>
    httpClient.post<ExecutionResponse<null>>(`${schema}/Areas/Toggle?id=${id}`),

  // ── Operaciones ───────────────────────────────────────────────────────────
  getOperaciones: (areaId: number, onlyActive = false) =>
    httpClient.get<ExecutionResponse<IOperacion[]>>(`${schema}/Operaciones`, { area_Id: areaId, onlyActive }),
  crearOperacion: (data: IOperacionManage) =>
    httpClient.post<ExecutionResponse<null>, IOperacionManage>(`${schema}/Operaciones`, data),
  editarOperacion: (data: IOperacionManage) =>
    httpClient.put<ExecutionResponse<null>, IOperacionManage>(`${schema}/Operaciones`, data),
  toggleOperacion: (id: number) =>
    httpClient.post<ExecutionResponse<null>>(`${schema}/Operaciones/Toggle?id=${id}`),

  // ── Tipos de paro ─────────────────────────────────────────────────────────
  getTiposParo: (onlyActive = false) =>
    httpClient.get<ExecutionResponse<ITipoParo[]>>(`${schema}/TiposParo`, { onlyActive }),
  crearTipoParo: (data: ITipoParoManage) =>
    httpClient.post<ExecutionResponse<null>, ITipoParoManage>(`${schema}/TiposParo`, data),
  editarTipoParo: (data: ITipoParoManage) =>
    httpClient.put<ExecutionResponse<null>, ITipoParoManage>(`${schema}/TiposParo`, data),
  toggleTipoParo: (id: number) =>
    httpClient.post<ExecutionResponse<null>>(`${schema}/TiposParo/Toggle?id=${id}`),
}
