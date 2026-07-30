// Tipos del módulo de Tickets de Mantenimiento. Espejo de los DTOs del backend
// (Core.Features.Mantenimiento). La API mantiene PascalCase (PropertyNamingPolicy
// = null), por eso las claves van tal cual el JSON que devuelve.

// Registro de ticket (lectura): salida de api/Tickets y api/Tickets/Detalle.
export interface ITicket {
  Id: number
  CodigoTicket: string
  Fecha: string | null

  TipoDestino: string | null   // MAQUINA | AREA
  Objeto: string | null         // ¿qué reparar? (tickets de Área)

  Area_Id: number | null
  Area: string | null
  Operacion_Id: number | null
  Operacion: string | null

  Modelo: string | null
  NumeroMaquina: string | null
  TipoFalla: string | null
  Causa: string | null

  TipoParo_Id: number | null
  TipoParo: string | null

  Prioridad_Id: number | null
  Prioridad: string | null
  PrioridadColor: string | null

  Estado_Id: number | null
  Estado: string | null
  EstadoCode: string | null
  EstadoOrden: number | null

  Mecanico_UserCode: string | null
  Mecanico: string | null

  IdOperador: number | null
  FechaAsignacion: string | null   // sella el último momento de asignación/reasignación
  HoraInicio: string | null
  HoraFinal: string | null
  TiempoRespuestaMin: number | null
  TiempoResolucionMin: number | null
  TiempoNetoMin: number | null   // tiempo activo neto (excluye pausas)
  TiempoValidacionMin: number | null   // primer completado → validación

  // Sello de validación de producción (no es un estado; el estado sigue COMPLETADO).
  ValidadoPor: string | null
  ValidadoNombre: string | null
  FechaValidacion: string | null

  // Recordatorio recurrente (minutos) mientras esté En Proceso. Default 30; 0 = sin aviso.
  RecordatorioMin: number

  Observaciones: string | null
  Vigente: boolean
  Create_By: string | null
  Creation_Date: string | null
  Modified_By: string | null
  Modification_Date: string | null

  // COUNT(*) OVER() del listado, para paginación (viene en cada fila).
  TotalCount: number
}

// Entrada de creación/edición (Ticket_Manage). Create_By/Modified_By los asigna
// el backend desde el JWT; no se envían desde el cliente.
export interface ITicketManage {
  Id?: number
  Fecha?: string | null
  TipoDestino?: string         // MAQUINA | AREA (default MAQUINA)
  Objeto?: string | null        // ¿qué reparar? (tickets de Área)
  Area_Id?: number | null
  Operacion_Id?: number | null
  Modelo?: string | null
  NumeroMaquina?: string | null
  TipoFalla?: string | null
  Causa?: string | null
  TipoParo_Id?: number | null
  Prioridad_Id?: number | null
  Estado_Id?: number | null
  Mecanico_UserCode?: string | null
  IdOperador?: number | null
  Observaciones?: string | null
}

// Resultado de Ticket_Manage, con banderas de evento (informativas para la UI).
export interface ITicketResult {
  Success: boolean
  SuccessMessage?: string | null
  ErrorMessage?: string | null
  Id: number
  CodigoTicket?: string | null
  EventCreated: boolean
  EventAssigned: boolean
  EventStarted: boolean
  EventFinished: boolean
  EventValidated?: boolean
  EventRejected?: boolean
  AutoAsignado?: boolean   // el que asigna es el mismo asignado (autoasignación)
}

// Filtros del listado (nombres alineados a los query params de api/Tickets).
export interface ITicketFiltros {
  estado_Id?: number
  prioridad_Id?: number
  mecanico_UserCode?: string
  area_Id?: number
  search?: string
  // Alcance del listado: 'mias' (default, por rol) | 'todos' (pool, requiere permiso).
  scope?: 'mias' | 'todos'
  skip?: number
  take?: number
}

// ── Catálogos / cascadas ─────────────────────────────────────────────────────
export interface IArea {
  Id: number; Name: string; Categoria?: string | null
  AreaPrincipal_Id?: number | null; AreaPrincipal?: string | null; PermiteMaquinas?: boolean
  Status_Id: number
}
export interface IOperacion { Id: number; Area_Id: number; Name: string; Orden?: number | null; Status_Id?: number }
export interface IEstado { Id: number; Code: string; Name: string; Orden: number }
export interface IPrioridad { Id: number; Name: string; Orden: number; Color?: string | null }
export interface ITipoParo { Id: number; Name: string; Status_Id: number }
export interface IMotivoPausa { Id: number; Name: string; Status_Id: number }
export interface IModelo { Modelo: string }
export interface ITipoFalla { TipoFalla: string }
export interface ICausa { Causa: string }
export interface IMecanico { User_Code: string; Nombre?: string | null; Email?: string | null }

// Resumen de tickets por período (SP_GetTicketsResumen).
// EsGlobal=true => totales del período; EsGlobal=false => fila por mecánico/técnico.
export interface ITicketResumen {
  EsGlobal: boolean
  Mecanico_UserCode: string | null
  Mecanico: string | null
  Total: number
  Pendientes: number
  EnProceso: number
  Pausados: number
  Completados: number
  Cancelados: number
  TiempoRespuestaProm: number | null
  TiempoResolucionProm: number | null
}

// Bitácora de acciones del mecánico (línea de tiempo).
export interface ITicketEvento {
  Id: number
  Ticket_Id: number
  Evento: string | null          // INICIAR | PAUSAR | REANUDAR | COMPLETAR
  Fecha: string | null
  EstadoAnterior_Id: number | null
  EstadoAnterior: string | null
  EstadoNuevo_Id: number | null
  EstadoNuevo: string | null
  User_Code: string | null
  Usuario: string | null
  Comentario: string | null
}
