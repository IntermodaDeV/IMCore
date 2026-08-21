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
  // Nombre de quien reportó (Security.Users). La API ya lo manda desde
  // vw_TicketsAnalisis; se muestra en vez del código de usuario.
  CreadoNombre: string | null
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
  // Rango de fechas [desde, hasta) del período (ISO local 'YYYY-MM-DDTHH:mm:ss').
  // Acota la carga en el servidor (el SP solo trae los tickets del rango).
  desde?: string
  hasta?: string
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
// El padrón (SP_GetMecanicos) devuelve Mecánico, Técnico Y Supervisor de
// Mantenimiento: los tres pueden tomar un ticket. `Rol` (script 74) permite
// contarlos aparte, porque sumar supervisores como mecánicos libres infla el número.
// Viene undefined contra una API anterior al script 74.
export interface IMecanico { User_Code: string; Nombre?: string | null; Email?: string | null; Rol?: string | null }

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

// Minutos netos de trabajo por mecánico en el período (SP_GetTiempoPorMecanico).
// Atribuido a quien REALMENTE trabajó (User_Code del evento), no al asignado actual.
export interface ITiempoMecanico {
  Mecanico_UserCode: string | null
  Mecanico: string | null
  MinNetos: number
  TicketsTocados: number
  MetaSemanal: number
  SemanasPeriodo: number
  MetaPeriodo: number
}

// MTTR de las reparaciones cerradas en el período (SP_GetMttr). Los MISMOS campos
// para los dos cortes: Clave/Nombre son el mecánico que CERRÓ la reparación o el
// modelo de máquina, según `agrupar`.
//
// MttrMin = inicio → cierre SIN la espera del reproceso: el rato que el ticket pasa
// completado hasta que producción lo rechaza no es tiempo de reparación (en agosto,
// un caso de 8 días le multiplicaba por 5 el promedio a un mecánico). Lo descontado
// viene en ReprocesoPromMin, a la vista.
export interface IMttr {
  Clave: string | null
  Nombre: string | null
  Reparaciones: number
  MttrMin: number
  MttrMedianaMin: number | null   // la reparación TÍPICA
  MejorMin: number
  PeorMin: number
  NetoPromMin: number             // trabajo activo, sin pausas
  PausaPromMin: number
  ParoPromMin: number             // reporte → cierre (suma el tiempo que nadie lo tomó)
  ReprocesoPromMin: number        // espera de producción excluida del MTTR
  ConReproceso: number
  RepMas24h: number               // >24 h = ticket que quedó abierto, no una reparación
  MaquinasDistintas: number
  ModelosDistintos: number
  MecanicosDistintos: number
  MttrGlobalMin: number           // promedio del período completo (para comparar)
  ReparacionesTotal: number
  SinAtribuir: number
}

// Metas de minutos de PARO ya escaladas al período (SP_GetMetaParo). Son DOS
// porque un área suma el paro de todas sus máquinas: la cifra de una máquina no le
// sirve. null = la configuración está vacía o no es numérica; ahí no se muestra la
// meta, en vez de comparar contra un default que nadie puso.
export interface IMetaParo {
  SemanasPeriodo: number
  MetaActivoSemanal: number | null
  MetaActivoPeriodo: number | null
  MetaAreaSemanal: number | null
  MetaAreaPeriodo: number | null
}

// Ranking de activos/máquinas por período (SP_GetActivosPeriodo). Sin meta.
export interface IActivoPeriodo {
  NumeroMaquina: string | null
  Modelo: string | null
  Area: string | null
  MinNetos: number
  TicketsCount: number
  CostoTotal: number
  RepuestosCount: number
}

// ── Pestaña "Análisis" del dashboard ────────────────────────────────────────
// Los mismos DTOs que usa el dashboard del web (IMCoreWeb), para que los dos
// muestren exactamente el mismo número a partir del mismo endpoint.

// Anatomía de la espera (SP_GetEsperaAnatomia): filas planas por dimensión.
// TOTAL alimenta el titular del paro; PRIORIDAD, AREA y MAQUINA, sus propios
// bloques (MAQUINA requiere el script 55).
//
// ESPERA_AREA / ESPERA_MAQUINA (script 56) son distintas: NO miran el rango
// desde/hasta, son lo que está detenido AHORA. En esas filas las columnas se
// leen así: Tickets = cuántos detenidos · ParoMin = minutos del MÁS ANTIGUO
// (lo que se pinta) · EsperaMin = suma de todos · PausaMin = la parte pausada ·
// EsperaProm = promedio · EsperaMed = null.
export interface IEsperaAnatomia {
  Dim:
    | 'TOTAL' | 'HORA' | 'DIA' | 'AREA' | 'PRIORIDAD' | 'MAQUINA'
    | 'ESPERA_AREA' | 'ESPERA_MAQUINA'
    | string
  Bucket: string | null
  Orden: number
  Tickets: number
  EsperaProm: number | null
  EsperaMed: number | null
  EsperaMin: number
  TrabajoMin: number
  PausaMin: number
  ParoMin: number
}

// Minutos de paro por motivo de pausa (SP_GetPausasPorMotivo).
export interface IPausaMotivo {
  Motivo: string | null
  Pausas: number
  PausasAbiertas: number
  MinPausa: number
  TicketsAfectados: number
  MaquinasAfectadas: number
}

// Pausas cruzadas por MECÁNICO y MÁQUINA (SP_GetPausasDetalle): PausasPorMotivo
// dice POR QUÉ se pausa; ésta, QUIÉN y EN QUÉ, que es lo accionable.
export interface IPausaDetalle {
  Mecanico_UserCode: string | null
  Mecanico: string | null
  NumeroMaquina: string | null
  Modelo: string | null
  Area: string | null
  Pausas: number
  PausasAbiertas: number
  MinPausa: number
  MotivoDominante: string | null
  MinMotivoDominante: number
  UltimaPausa: string | null
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

// Cumplimiento del SLA de validación por supervisor (SP_GetCumplimientoValidacion).
// El supervisor es quien REPORTÓ el ticket, que es a quien le llega el aviso
// "Ticket por validar". CerradosPorSistema = los que no validó dentro del plazo y
// cerró el autovalidado. PlazoHoras null = el autovalidado está desactivado.
export interface ICumplimientoValidacion {
  Supervisor_UserCode: string | null
  Supervisor: string | null
  Completados: number
  ValidadosPorPersona: number
  CerradosPorSistema: number
  PendientesDeValidar: number
  PctCumplimiento: number | null
  PromMinValidacion: number | null
  PlazoHoras: number | null
}
