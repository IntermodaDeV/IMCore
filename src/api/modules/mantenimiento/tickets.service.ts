import { httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'
import {
  ITicket,
  ITicketManage,
  ITicketResult,
  ITicketFiltros,
  IArea,
  IOperacion,
  IEstado,
  IPrioridad,
  ITipoParo,
  IModelo,
  ITipoFalla,
  ICausa,
  IMecanico,
} from './tickets.types'

// Consume los endpoints de api/Tickets. baseUrl (API_URL) ya incluye /api/,
// por eso las rutas van como 'Tickets/...'.
const schema = 'Tickets'

export const ticketsService = {
  // ── Tickets ───────────────────────────────────────────────────────────────
  // Listado con alcance por rol (el backend resuelve el alcance según el JWT).
  getTickets: (filtros: ITicketFiltros = {}) =>
    httpClient.get<ExecutionResponse<ITicket[]>>(`${schema}`, { ...filtros }),

  getTicketById: (id: number) =>
    httpClient.get<ExecutionResponse<ITicket>>(`${schema}/Detalle`, { id }),

  // Crear ticket (reportar paro).
  create: (data: ITicketManage) =>
    httpClient.post<ExecutionResponse<ITicketResult>, ITicketManage>(`${schema}`, data),

  // Edición completa (administrador).
  updateAdmin: (data: ITicketManage) =>
    httpClient.put<ExecutionResponse<ITicketResult>, ITicketManage>(`${schema}/Admin`, data),

  // Actualización del técnico/supervisor de mantenimiento (asignar, avanzar estado).
  updateTecnico: (data: ITicketManage) =>
    httpClient.put<ExecutionResponse<ITicketResult>, ITicketManage>(`${schema}/Tecnico`, data),

  // Anular (soft-delete).
  anular: (id: number) =>
    httpClient.post<ExecutionResponse<ITicketResult>>(`${schema}/Anular?id=${id}`),

  // ── Catálogos / cascadas ────────────────────────────────────────────────────
  getMecanicos: () =>
    httpClient.get<ExecutionResponse<IMecanico[]>>(`${schema}/Mecanicos`),

  getAreas: (onlyActive: boolean = true) =>
    httpClient.get<ExecutionResponse<IArea[]>>(`${schema}/Areas`, { onlyActive }),

  getOperaciones: (areaId: number) =>
    httpClient.get<ExecutionResponse<IOperacion[]>>(`${schema}/Operaciones`, { area_Id: areaId }),

  getModelos: (operacionId: number) =>
    httpClient.get<ExecutionResponse<IModelo[]>>(`${schema}/Modelos`, { operacion_Id: operacionId }),

  getTiposFalla: (operacionId: number, modelo: string) =>
    httpClient.get<ExecutionResponse<ITipoFalla[]>>(`${schema}/TiposFalla`, {
      operacion_Id: operacionId,
      modelo,
    }),

  getCausas: (modelo: string, tipoFalla: string) =>
    httpClient.get<ExecutionResponse<ICausa[]>>(`${schema}/Causas`, { modelo, tipoFalla }),

  getEstados: () =>
    httpClient.get<ExecutionResponse<IEstado[]>>(`${schema}/Estados`),

  getPrioridades: () =>
    httpClient.get<ExecutionResponse<IPrioridad[]>>(`${schema}/Prioridades`),

  getTiposParo: (onlyActive: boolean = true) =>
    httpClient.get<ExecutionResponse<ITipoParo[]>>(`${schema}/TiposParo`, { onlyActive }),
}
