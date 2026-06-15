// Tipos del dashboard de mantenimiento. Espejo de los DTOs del backend
// (MantenimientoPeriodoDTO / MantenimientoDTO / FiltrosDisponiblesDTO) que
// devuelve GET api/SharePoint/mantenimiento.

// Un registro de mantenimiento ya mapeado y con derivados (Anio/Mes/Semana,
// TiempoRespuestaMin/ResolucionMin, Atendido).
export interface MantenimientoRegistro {
  IDMantenimiento: string
  CodigoTicket: string
  Fecha: string | null
  Area: string
  Operacion: string
  ModeloMaquina: string
  NumeroMaquina: string
  TipoFalla: string
  HoraInicio: string | null
  HoraFinal: string | null
  TipoParo: string
  Mecanico: string
  CausaFalla: string
  IDOperador: string
  Estado: string
  Prioridad: string
  Anio: number | null
  Mes: number | null
  Semana: number | null
  TiempoRespuestaMin: number | null
  TiempoResolucionMin: number | null
  Atendido: boolean
}

// Opciones disponibles para los filtros finos (calculadas por el backend sobre el mes).
export interface FiltrosDisponibles {
  Anios: number[]
  Semanas: number[]
  Areas: string[]
  Prioridades: string[]
  TiposParo: string[]
}

// Payload del período (año/mes/semana) con sus registros y opciones de filtros.
export interface MantenimientoPeriodo {
  Anio: number
  Mes: number
  Semana: number | null
  Total: number
  Registros: MantenimientoRegistro[]
  Filtros: FiltrosDisponibles
}
