// Espejo de Core/Features/InventarioImpulsadoras/InventarioImpulsadorasDTOs.cs (IMCoreApi).
// La API responde en PascalCase.

export type EstadoAsignacion = 'ACTIVA' | 'FINALIZADA' | 'CERRADO' | 'DESACTIVADO' | 'QUITADA'
export type TipoLectura = 'QR' | 'BARRA' | 'NOENCONTRADO'

export interface IMiAsignacion {
  InventarioUsuario_Id: number
  Inventario_Id: number
  Correlativo: string
  Fecha: string
  Empresa: string
  ClienteCodigo: string
  ClienteNombre: string
  SucursalNombre: string
  SucursalDireccion: string
  Linea: string
  /** QR | Barra | QR/Barra */
  TipoEscaneo: string
  Estado: EstadoAsignacion
  PuedeEscanear: boolean
  Inicio: string | null
  FechaFinalizado: string | null
  LecturasServidor: number
  PiezasServidor: number
}

/** Lo que ya no está por hacer (finalizado, cerrado…), desde el servidor. */
export interface IMiHistorico {
  InventarioUsuario_Id: number
  Inventario_Id: number
  Correlativo: string
  Fecha: string
  Empresa: string
  ClienteCodigo: string
  ClienteNombre: string
  SucursalNombre: string
  Linea: string
  TipoEscaneo: string
  /** FINALIZADA = mi parte lista, falta que la oficina cierre */
  Estado: Exclude<EstadoAsignacion, 'ACTIVA'>
  Inicio: string | null
  FechaFinalizado: string | null
  FechaCerrado: string | null
  LecturasServidor: number
  PiezasServidor: number
  CodigosServidor: number
  /** La última solicitud de reapertura de esta asignación (si hubo). */
  Solicitud_Id?: number | null
  SolicitudEstado?: EstadoSolicitud | null
  SolicitudFecha?: string | null
  SolicitudComentario?: string | null
  /** El servidor dice si se le ofrece «Solicitar reabrir» (reglas y parámetros del módulo). */
  PuedeSolicitar?: boolean
}

export type EstadoSolicitud = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'CANCELADA'

export interface ISolicitudReapertura {
  Solicitud_Id: number
  Estado: EstadoSolicitud
  FechaSolicitud: string
  InventarioCerrado: boolean
  YaExistia: boolean
  Correlativo: string
}

export interface IResumenCodigo {
  Tipo: TipoLectura
  Codigo: string
  Cantidad: number
  UltimaFecha: string
}

export interface ILecturaLote {
  Uuid: string
  Secuencia: number
  Tipo: TipoLectura
  Codigo: string
  Delta: number
  EsAjuste: boolean
  FechaEquipo: string
}

export interface ILote {
  InventarioUsuario_Id: number
  Equipo: string
  AppVersion?: string
  Plataforma?: string
  LecturasEquipo?: number
  PiezasEquipo?: number
  PendientesEquipo?: number
  Lecturas: ILecturaLote[]
}

export interface ILoteResult {
  Recibidas: number
  YaEstaban: number
  Rechazadas: number
  RechazadasDetalle: { Uuid: string; Motivo: string }[]
  LecturasServidor: number
  PiezasServidor: number
  LecturasDeEsteEquipo: number
  Estado: EstadoAsignacion
}

export interface ILecturaServidor {
  Id: number
  Uuid: string
  Equipo: string
  Secuencia: number
  Tipo: TipoLectura
  Codigo: string
  Delta: number
  EsAjuste: boolean
  FechaEquipo: string
}

export interface IFinalizarResult {
  Finalizada: boolean
  Estado: EstadoAsignacion
  Faltan: number
  LecturasServidor: number
  PiezasServidor: number
  TodasFinalizadas: boolean
}
// ── Dashboard ───────────────────────────────────────────────────────────────

export interface IDashboardEmpresa { Company_Id: number; Empresa: string; Nombre: string | null }

export interface IDashboardResumen {
  Programados: number
  Cerrados: number
  Abiertos: number
  Listos: number
  EnProceso: number
  SinIniciar: number
  SinPersonas: number
  /** null = no hay meta cargada para el mes. */
  Meta: number | null
  PiezasCerradas: number
}

export interface IDashboardPais {
  Company_Id: number
  Empresa: string
  Nombre: string | null
  Programados: number
  Cerrados: number
  Abiertos: number
  Listos: number
  Vencidos: number
  Meta: number | null
  PiezasCerradas: number
}

export interface IDashboardMes { Mes: string; Programados: number; Cerrados: number; Abiertos: number; Meta: number | null }

/** Un inventario abierto en las listas del dashboard (listos, vencidos, sin personas). */
export interface IDashboardInventario {
  Inventario_Id: number
  Correlativo: string
  Empresa: string
  Cliente: string | null
  Sucursal: string | null
  Linea: string | null
  Fecha: string
  Personas: number
  Finalizadas: number
  Lecturas: number
  Piezas: number
  SinEnviar: number
  UltimaFinalizacion: string | null
  DiasAtraso: number | null
  DiasParaFecha: number | null
  Estado: 'SIN_INICIAR' | 'EN_PROCESO' | 'SIN_PERSONAS' | null
}

export interface IDashboardEnCurso {
  InventarioUsuario_Id: number
  Inventario_Id: number
  Correlativo: string
  Empresa: string
  Cliente: string | null
  Sucursal: string | null
  User_Code: string | null
  Persona: string | null
  Lecturas: number
  Piezas: number
  SinEnviar: number
  UltimaLectura: string | null
  MinutosSinContacto: number | null
  SinContacto: boolean
}

export interface IDashboardSucursal {
  Sucursal_Id: number
  Empresa: string
  Cliente: string | null
  Sucursal: string | null
  UltimoCorrelativo: string | null
  UltimaFecha: string | null
  UltimoCierre: string | null
  DiasSinInventario: number
}

export interface IDashboardAlertas {
  SinContacto: number
  LecturasSinEnviar: number
  DoblesConteo: number
  QrDanadoRepetido: number
  SolicitudesPendientes: number
  CierresConError: number
  LecturasTardias: number
}

export interface IDashboard {
  Mes: string
  Hoy: string
  Empresas: IDashboardEmpresa[]
  Resumen: IDashboardResumen
  PorPais: IDashboardPais[]
  Tendencia: IDashboardMes[]
  Listos: IDashboardInventario[]
  Vencidos: IDashboardInventario[]
  SinPersonas: IDashboardInventario[]
  EnCurso: IDashboardEnCurso[]
  SinSeguimiento: IDashboardSucursal[]
  Alertas: IDashboardAlertas
}
