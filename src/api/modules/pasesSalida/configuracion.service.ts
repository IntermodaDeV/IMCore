import { httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'
import {
  IGrupo, IGrupoManage, IMaterialConGrupo, IGrupoMateriales,
  IReglaFila, IAccesoFirma, IReglaGuardar,
  ISolicitante, IMaterialSolicitante, ISolicitanteMateriales,
} from './configuracion.types'

// Configuración de firmas (api/PasesSalidaConfiguracion). El acceso lo gobierna
// el permiso de menú de la pantalla; el backend solo exige autenticación.
const schema = 'PasesSalidaConfiguracion'

export const pasesSalidaConfigService = {
  // ── Grupos ──────────────────────────────────────────────────────────────────
  getGrupos: (onlyActive = false) =>
    httpClient.get<ExecutionResponse<IGrupo[]>>(`${schema}/Grupos`, { onlyActive }),
  crearGrupo: (data: IGrupoManage) =>
    httpClient.post<ExecutionResponse<null>, IGrupoManage>(`${schema}/Grupos`, data),
  editarGrupo: (data: IGrupoManage) =>
    httpClient.put<ExecutionResponse<null>, IGrupoManage>(`${schema}/Grupos`, data),
  toggleGrupo: (id: number) =>
    httpClient.post<ExecutionResponse<null>>(`${schema}/Grupos/Toggle?id=${id}`),

  // ── Materiales del grupo ────────────────────────────────────────────────────
  // Sin grupoId trae todos, con su grupo cuando lo tienen.
  getMateriales: (grupoId?: number, onlyActive = false) =>
    httpClient.get<ExecutionResponse<IMaterialConGrupo[]>>(
      `${schema}/Materiales`,
      grupoId != null ? { grupoId, onlyActive } : { onlyActive },
    ),
  asignarMateriales: (data: IGrupoMateriales) =>
    httpClient.post<ExecutionResponse<null>, IGrupoMateriales>(`${schema}/Materiales`, data),

  // ── Matriz de firmas ────────────────────────────────────────────────────────
  getReglas: (grupoId: number) =>
    httpClient.get<ExecutionResponse<IReglaFila[]>>(`${schema}/Reglas`, { grupoId }),
  getFirmas: () =>
    httpClient.get<ExecutionResponse<IAccesoFirma[]>>(`${schema}/Firmas`),
  guardarRegla: (data: IReglaGuardar) =>
    httpClient.post<ExecutionResponse<null>, IReglaGuardar>(`${schema}/Reglas`, data),

  // ── Solicitantes ────────────────────────────────────────────────────────────
  getSolicitantes: () =>
    httpClient.get<ExecutionResponse<ISolicitante[]>>(`${schema}/Solicitantes`),
  getMaterialesDeSolicitante: (userCode: string) =>
    httpClient.get<ExecutionResponse<IMaterialSolicitante[]>>(`${schema}/Solicitantes/Materiales`, { userCode }),
  asignarMaterialesSolicitante: (data: ISolicitanteMateriales) =>
    httpClient.post<ExecutionResponse<null>, ISolicitanteMateriales>(`${schema}/Solicitantes/Materiales`, data),
}
