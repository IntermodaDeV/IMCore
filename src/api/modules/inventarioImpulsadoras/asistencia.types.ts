// Asistencia de impulsadoras (api/InventarioImpulsadoras/Asistencia/App/*). Los nombres son
// los de las columnas de los SP (InventarioImpulsadoras_14_AsistenciaSP.sql). Horas «HH:mm».

export type TipoMarca = 'INICIO' | 'SALIDA_ALMUERZO' | 'REGRESO_ALMUERZO' | 'FIN'
export type EstadoMarca = 'VALIDA' | 'POR_REVISAR' | 'APROBADA' | 'RECHAZADA'
/** Por qué una marca no lleva coordenada. */
export type SinGps = 'PERMISO' | 'APAGADO' | 'TIMEOUT' | 'ERROR'

export interface IAgendaTurno {
  Id: number
  Fecha: string
  HoraInicio: string
  HoraSalidaAlm: string | null
  HoraRegresoAlm: string | null
  HoraFin: string
  FotoObligatoria: boolean
  Sucursal_Id: number
  Tienda: string
  Cliente: string
  Direccion: string | null
  Latitud: number | null
  Longitud: number | null
  Radio: number
  Comentario: string | null
}

export interface IAgendaTienda {
  Sucursal_Id: number
  Tienda: string
  Cliente: string
  Direccion: string | null
  Latitud: number | null
  Longitud: number | null
  Radio: number
}

export interface IAgendaMarca {
  Uuid: string
  Tipo: TipoMarca
  Turno_Id: number | null
  Sucursal_Id: number | null
  FechaHoraTelefono: string
  Estado: EstadoMarca
  Motivos: string | null
}

/** Lo que el teléfono guarda para poder marcar sin señal. */
export interface IAgenda {
  AhoraServidor: string
  PuedeMarcar: boolean
  Activa: boolean
  FotoObligatoria: boolean
  EsperaGpsSeg: number
  PermitirSinTurno: boolean
  RadioMetros: number
  PrecisionMaxM: number
  Turnos: IAgendaTurno[]
  Tiendas: IAgendaTienda[]
  Marcas: IAgendaMarca[]
}

export interface IMarcaEnvio {
  Uuid: string
  Tipo: TipoMarca
  Turno_Id: number | null
  Sucursal_Id: number | null
  FechaHoraTelefono: string
  SegundosDesdeMarca: number | null
  Latitud: number | null
  Longitud: number | null
  PrecisionM: number | null
  GpsFechaHora: string | null
  Simulada: boolean | null
  SinGpsMotivo: SinGps | null
  Comentario: string | null
  ConFoto: boolean
}

export interface ILoteMarcas {
  Equipo: string
  AppVersion: string
  Plataforma: string
  FechaHoraEnvio: string
  Marcas: IMarcaEnvio[]
}

export interface IMarcaResultado {
  Uuid: string
  Resultado: 'NUEVA' | 'YA_ESTABA' | 'RECHAZADA'
  Estado: EstadoMarca | null
  Motivos: string | null
  DistanciaM: number | null
  Rechazo: string | null
}

export interface IFotoResultado { Uuid: string; Estado: EstadoMarca; Motivos: string | null; TieneFoto: boolean }

export interface IMiMarca {
  Uuid: string
  Tipo: TipoMarca
  FechaHora: string
  Turno_Id: number | null
  Sucursal_Id: number | null
  Tienda: string | null
  Cliente: string | null
  Estado: EstadoMarca
  Motivos: string | null
  DistanciaM: number | null
  TieneFoto: boolean
  ComentarioRevision: string | null
}
