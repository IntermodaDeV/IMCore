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
  ITicketEvento,
  ITicketResumen,
  ITiempoMecanico,
  IMttr,
  IMetaParo,
  IActivoPeriodo,
  IEsperaAnatomia,
  IPausaMotivo,
  IPausaDetalle,
} from './tickets.types'
import { MantenimientoPeriodo } from '../sharepoint/mantenimiento.types'

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

  // Cancelar (solo Pendiente; el backend valida creador o admin).
  cancelar: (id: number) =>
    httpClient.post<ExecutionResponse<ITicketResult>>(`${schema}/Cancelar?id=${id}`),

  // Asignar mecánico/técnico (el backend valida rol o acceso 'AsignarTickets').
  asignar: (id: number, mecanicoUserCode: string) =>
    httpClient.post<ExecutionResponse<ITicketResult>>(
      `${schema}/Asignar?id=${id}&mecanico_UserCode=${encodeURIComponent(mecanicoUserCode)}`,
    ),

  // ── Acciones del mecánico (el backend valida: asignado o Admin/Sup. Mtto) ────
  iniciar: (id: number) =>
    httpClient.post<ExecutionResponse<ITicketResult>>(`${schema}/Iniciar?id=${id}`),

  // Pausar requiere motivo obligatorio (catálogo MotivoPausa).
  pausar: (id: number, motivoPausaId: number) =>
    httpClient.post<ExecutionResponse<ITicketResult>>(`${schema}/Pausar?id=${id}&motivoPausa_Id=${motivoPausaId}`),

  reanudar: (id: number) =>
    httpClient.post<ExecutionResponse<ITicketResult>>(`${schema}/Reanudar?id=${id}`),

  // Completar; datos de cierre (causa/observaciones) opcionales.
  completar: (id: number, cierre?: { Causa?: string | null; Observaciones?: string | null }) =>
    httpClient.post<ExecutionResponse<ITicketResult>, { Causa?: string | null; Observaciones?: string | null }>(
      `${schema}/Completar?id=${id}`,
      cierre ?? {},
    ),

  // Diagnóstico (tipo de falla + causa).
  diagnosticar: (id: number, dto: { TipoFalla?: string | null; Causa?: string | null }) =>
    httpClient.post<ExecutionResponse<ITicketResult>, { TipoFalla?: string | null; Causa?: string | null }>(
      `${schema}/Diagnosticar?id=${id}`,
      dto,
    ),

  // ── Validación de producción (post-completado) ──────────────────────────────
  // Validar/aprobar (el backend valida rol Sup. Producción/Admin o acceso 'ValidarTickets').
  validar: (id: number) =>
    httpClient.post<ExecutionResponse<ITicketResult>>(`${schema}/Validar?id=${id}`),

  // Rechazar/reabrir con motivo obligatorio.
  rechazar: (id: number, motivo: string) =>
    httpClient.post<ExecutionResponse<ITicketResult>, { Motivo: string }>(
      `${schema}/Rechazar?id=${id}`,
      { Motivo: motivo },
    ),

  // Configurar el recordatorio recurrente (0/15/30/60 min). Permiso validado en el backend.
  configurarRecordatorio: (id: number, minutos: number) =>
    httpClient.post<ExecutionResponse<ITicketResult>>(`${schema}/Recordatorio?id=${id}&minutos=${minutos}`),

  // Bitácora de acciones (línea de tiempo).
  getEventos: (id: number) =>
    httpClient.get<ExecutionResponse<ITicketEvento[]>>(`${schema}/Eventos`, { id }),

  // Resumen por período (KPIs + desglose por mecánico). desde/hasta en ISO.
  getResumen: (desde: string, hasta: string) =>
    httpClient.get<ExecutionResponse<ITicketResumen[]>>(`${schema}/Resumen`, { desde, hasta }),

  // Dashboard principal (global) desde nuestra BD — reemplaza al de SharePoint.
  // Devuelve el período (registros + filtros) con la misma forma para reutilizar los gráficos.
  getDashboard: (desde: string, hasta: string, tipoDestino?: string) =>
    httpClient.get<ExecutionResponse<MantenimientoPeriodo>>(`${schema}/Dashboard`, { desde, hasta, tipoDestino }),

  // Minutos netos de trabajo por mecánico en el período (pestaña "Tiempos").
  // Atribuido a quien realmente trabajó (no al asignado actual). Mismo período que Dashboard.
  getTiempoMecanicos: (desde: string, hasta: string, prioridades?: string) =>
    httpClient.get<ExecutionResponse<ITiempoMecanico[]>>(`${schema}/TiempoMecanicos`, { desde, hasta, prioridades }),

  // MTTR de las reparaciones cerradas en el período. agrupar = 'MECANICO' (quien la
  // cerró) o 'MODELO'; los dos cortes traen las mismas columnas.
  getMttr: (desde: string, hasta: string, agrupar: 'MECANICO' | 'MODELO' = 'MECANICO', prioridades?: string) =>
    httpClient.get<ExecutionResponse<IMttr[]>>(`${schema}/Mttr`, { desde, hasta, agrupar, prioridades }),

  // Metas de minutos de paro ya escaladas al período (una fila, dos metas: por
  // máquina y por área). No lleva prioridades: no lee tickets, solo la
  // configuración global y las semanas del rango.
  getMetaParo: (desde: string, hasta: string) =>
    httpClient.get<ExecutionResponse<IMetaParo[]>>(`${schema}/MetaParo`, { desde, hasta }),

  // Ranking de activos/máquinas por período (minutos de mantenimiento + costo de repuestos).
  getActivos: (desde: string, hasta: string, prioridades?: string) =>
    httpClient.get<ExecutionResponse<IActivoPeriodo[]>>(`${schema}/Activos`, { desde, hasta, prioridades }),

  // ── Pestaña "Análisis" ──────────────────────────────────────────────────────
  // Estos KPIs se agregan en SQL (no hay filas crudas que filtrar en el cliente),
  // así que el toggle Máquina/Área viaja al servidor como tipoDestino; 'Todos' va
  // como undefined y el SP lo interpreta como "sin filtro".

  // Anatomía del paro: espera / trabajo / pausa, por total, hora, día, área y prioridad.
  getEsperaAnatomia: (desde: string, hasta: string, tipoDestino?: string, prioridades?: string) =>
    httpClient.get<ExecutionResponse<IEsperaAnatomia[]>>(`${schema}/EsperaAnatomia`, { desde, hasta, tipoDestino, prioridades }),

  // Minutos de paro por motivo de pausa (el motivo es obligatorio al pausar).
  getPausasPorMotivo: (desde: string, hasta: string, tipoDestino?: string, prioridades?: string) =>
    httpClient.get<ExecutionResponse<IPausaMotivo[]>>(`${schema}/PausasPorMotivo`, { desde, hasta, tipoDestino, prioridades }),

  // Pausas por mecánico y máquina: quién pausó, en qué activo y por qué motivo.
  getPausasDetalle: (desde: string, hasta: string, tipoDestino?: string, prioridades?: string) =>
    httpClient.get<ExecutionResponse<IPausaDetalle[]>>(`${schema}/PausasDetalle`, { desde, hasta, tipoDestino, prioridades }),

  // ── Catálogos / cascadas ────────────────────────────────────────────────────
  getMecanicos: () =>
    httpClient.get<ExecutionResponse<IMecanico[]>>(`${schema}/Mecanicos`),

  getAreas: (onlyActive: boolean = true, categoria?: string) =>
    httpClient.get<ExecutionResponse<IArea[]>>(`${schema}/Areas`, { onlyActive, categoria }),

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
