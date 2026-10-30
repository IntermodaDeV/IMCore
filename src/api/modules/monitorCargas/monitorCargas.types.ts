// Monitor de cargas de IMAnalitica. Espejo de IMCoreWeb (api/modules/monitorCargas) y de
// Core.Features.Analitica (IMCoreApi), que son filas de carga.usp_Monitor_* (IMCoreApi/
// Persistance/Scripts/Analitica_06_Monitor_Pantalla.sql). Solo lo que usa el resumen de la
// app. Fechas sin zona: hora de Honduras.

/** Estado de una corrida. 'Cancelada' también es una que quedó «Corriendo» sin conexión. */
export type EstadoCorrida = 'Corriendo' | 'OK' | 'Advertencia' | 'Error' | 'Cancelada'

/** Estado de una fuente o cuenta clave (carga.Frescura). */
export type EstadoFuente = 'OK' | 'Atrasada' | 'SinDatos' | 'Corriendo' | 'Error' | 'Excluida' | 'SinRitmo'

export interface IProcesoMonitor {
  Codigo: string
  Nombre: string
  Descripcion: string | null
  Horario: string | null
  Activo: boolean
  /** SQL: lo corre la base. Proxy: una rutina de IMCoreProxy (la publicación a IMCore). */
  Ejecutor: 'SQL' | 'Proxy' | null
  LimiteLecturas: number | null
  CorridaId: number | null
  Estado: EstadoCorrida | null
  Inicio: string | null
  Fin: string | null
  Segundos: number | null
  LecturasLogicas: number | null
  Mensaje: string | null
  ErrorMensaje: string | null
  PasoActual: string | null
  UltimaBuena: string | null
  ProximaCorrida: string | null
}

export interface IFuenteMonitor {
  Sistema: string
  Fuente: string
  Clave: string
  Nombre: string | null
  Estado: EstadoFuente | null
  UltimoDato: string | null
  VistoEn: string | null
  Detalle: string | null
  Estructura: 'OK' | 'Advertencia' | 'Error' | null
}

/** Una medición de una corrida de la vigilancia (carga.Medicion). */
export interface IMedicionMonitor {
  MedidaEn: string
  Fuente: string
  Clave: string
  /** AtrasoMin, CargasAbiertas, TablasConProblema, IndicesFaltantes, FilasNuevas, CuentasConProblema. */
  Metrica: string
  Valor: number | null
}

/** Capa de IMAnalitica. 'publicacion' es la copia de los resúmenes a IMCore_Pro. */
export type CapaAnalitica = 'carga' | 'stg' | 'core' | 'mart' | 'publicacion'

export interface ICapaMonitor {
  Capa: CapaAnalitica
  Tablas: number
  Filas: number
  Procesos: number
  ProcesosAlDia: number
  /** ProcesosAlDia sobre Procesos; null si la capa no tiene procesos. */
  Porcentaje: number | null
  UltimaCarga: string | null
  Estado: 'PorConstruir' | 'AlDia' | 'Parcial' | 'Error'
}

/** Si un servidor responde, según la última revisión del proceso CONEXIONES (cada 15 min). */
export interface IConexionEstado {
  Servidor: string
  Estado: 'OK' | 'Error'
  Milisegundos: number | null
  Error: string | null
  RevisadaEn: string
  UltimaOkEn: string | null
  /** Desde cuándo no responde; null si responde. */
  FallaDesde: string | null
}

/** Un paso de una corrida, con sus lecturas y procesador. */
export interface IPasoMonitor {
  Orden: number
  Nombre: string
  Estado: string | null
  Inicio: string | null
  Fin: string | null
  Milisegundos: number | null
  Filas: number | null
  LecturasLogicas: number | null
  CpuMs: number | null
  Mensaje: string | null
}

/** Ejecutar no espera la corrida: Aceptado = false si ya estaba corriendo. */
export interface IAccionMonitorResult {
  Aceptado: boolean
  Mensaje: string
  CorridaId: number | null
}

/** Una advertencia o error de las revisiones, agrupado por fuente, cuenta y revisión. */
export interface IAdvertenciaMonitor {
  Resultado: 'Advertencia' | 'Error'
  Tipo: string
  Proceso: string
  Sistema: string | null
  Fuente: string | null
  Clave: string
  NombreClave: string | null
  PrimeraVez: string
  UltimaVez: string
  Veces: number
  UltimoDetalle: string | null
  /** Apareció en la última corrida terminada de su proceso. */
  Vigente: boolean
}

/** Una tabla publicada: lo que IMAnalitica le publicó contra lo que IMCore tiene (la API lee IMCore directo). */
export interface ISincronizacionTabla {
  Tabla: string
  Origen: string | null
  ColumnaParte: string | null
  Activa: boolean
  Partes: number
  FilasIMAnalitica: number
  ExisteEnIMCore: boolean
  FilasIMCore: number | null
  PublicadaEnIMCore: string | null
  Estado: 'AlDia' | 'Pendiente' | 'Distinta' | 'FaltaTabla' | 'SinOrigen' | 'Inactiva'
  Detalle: string
}

/** Sincronización con IMCore (D-16): cada tabla y el estado general. */
export interface ISincronizacion {
  Estado: 'AlDia' | 'Pendiente' | 'Error' | 'SinTablas'
  Resumen: string
  BaseIMCore: string | null
  UltimaVersion: number | null
  UltimaPublicacion: string | null
  ErrorIMAnalitica: string | null
  ErrorIMCore: string | null
  Tablas: ISincronizacionTabla[]
}
