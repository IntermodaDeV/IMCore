import { httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'
import { ITipoSalida, ITipoSalidaManage, IMaterial, IMaterialManage } from './pasesSalida.types'

// Catálogos maestros de pases de salida (api/PasesSalidaCatalogos). El acceso lo
// gobierna el permiso de menú de cada pantalla; el backend solo exige autenticación.
const schema = 'PasesSalidaCatalogos'

export const pasesSalidaService = {
  // ── Tipos de salida ─────────────────────────────────────────────────────────
  getTiposSalida: (onlyActive = false) =>
    httpClient.get<ExecutionResponse<ITipoSalida[]>>(`${schema}/TiposSalida`, { onlyActive }),
  crearTipoSalida: (data: ITipoSalidaManage) =>
    httpClient.post<ExecutionResponse<null>, ITipoSalidaManage>(`${schema}/TiposSalida`, data),
  editarTipoSalida: (data: ITipoSalidaManage) =>
    httpClient.put<ExecutionResponse<null>, ITipoSalidaManage>(`${schema}/TiposSalida`, data),
  toggleTipoSalida: (id: number) =>
    httpClient.post<ExecutionResponse<null>>(`${schema}/TiposSalida/Toggle?id=${id}`),

  // ── Materiales ──────────────────────────────────────────────────────────────
  getMateriales: (onlyActive = false) =>
    httpClient.get<ExecutionResponse<IMaterial[]>>(`${schema}/Materiales`, { onlyActive }),
  crearMaterial: (data: IMaterialManage) =>
    httpClient.post<ExecutionResponse<null>, IMaterialManage>(`${schema}/Materiales`, data),
  editarMaterial: (data: IMaterialManage) =>
    httpClient.put<ExecutionResponse<null>, IMaterialManage>(`${schema}/Materiales`, data),
  toggleMaterial: (id: number) =>
    httpClient.post<ExecutionResponse<null>>(`${schema}/Materiales/Toggle?id=${id}`),
}
