import { httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'
import { IArea, IOperacion, ITipoParo } from './tickets.types'

// CRUD de catálogos de mantenimiento (api/Catalogos). El acceso lo gobierna el
// permiso de menú de cada pantalla; el backend solo exige autenticación.
const schema = 'Catalogos'

export interface IAreaManage { Id?: number; Name: string; Categoria?: string | null }
export interface IOperacionManage { Id?: number; Area_Id: number; Name: string }
export interface ITipoParoManage { Id?: number; Name: string }

export const catalogosService = {
  // ── Áreas ───────────────────────────────────────────────────────────────
  getAreas: (onlyActive = false, categoria?: string) =>
    httpClient.get<ExecutionResponse<IArea[]>>(`${schema}/Areas`, { onlyActive, categoria }),
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
