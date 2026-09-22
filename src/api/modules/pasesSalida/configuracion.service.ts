import { httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'
import {
  IGrupo, IGrupoManage, IGrupoDetalle, IGrupoHorario, IMaterialConGrupo, IGrupoMateriales,
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

  // ── Horario de salida ───────────────────────────────────────────────────────
  // El grupo con su horario propio y el general. Devuelve 0 o 1 elemento.
  getGrupo: (id: number) =>
    httpClient.get<ExecutionResponse<IGrupoDetalle[]>>(`${schema}/Grupo`, { id }),
  // Las dos horas vacías devuelven el grupo al horario general.
  guardarHorario: (data: IGrupoHorario) =>
    httpClient.post<ExecutionResponse<null>, IGrupoHorario>(`${schema}/Grupos/Horario`, data),

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
