// Tipos del módulo de Recursos Humanos / Pases de personal.

/**
 * Categoría de pase. `Tipo` es la SECUENCIA de movimientos, no una letra:
 *   'S'  salida            'SE'  sale y regresa
 *   'E'  entrada           'ES'  entra y sale
 * De ahí sale qué horas pide el formulario, y en la puerta cuál es el
 * movimiento que toca.
 */
export interface IPaseCategoria {
  Id?: number
  Name: string
  Tipo: string // 'S' | 'E' | 'SE' | 'ES'
  Description?: string | null
  Status_Id?: number
  Create_By?: string
  Modified_By?: string
}

export interface IEmpleado {
  EmpleadoCode: string
  CodAlterno?: string | null
  EmpleadoNombre: string
  cod_Departamento?: string | null
  Departamento?: string | null
  JefeCode?: string | null
  JefeNombre?: string | null
  /** El alterno del jefe. Con esto el servidor resuelve quién debe firmar;
   *  cruzar por JefeCode da falsos positivos (el código se repite por empresa). */
  JefeAlterno?: string | null
}

export interface IAprobador {
  User_Code: string
  Nombre: string
  ExternalCode?: string | null // código PayWeb
  Alterno?: string | null      // el del carnet: con este se cruza el jefe
  /** El que la pantalla deja preseleccionado. Lo decide el servidor. */
  Sugerido?: boolean
  /** Si el sugerido es el jefe de verdad o un reemplazo por defecto. */
  EsJefeReal?: boolean
}

export interface ICrearPase {
  EmpleadoCode: string
  Categoria_Id: number
  FechaPase: string // YYYY-MM-DD
  /** Horas previstas, "HH:mm". Obligatorias según la secuencia de la categoría. */
  HoraSalida?: string | null
  HoraEntrada?: string | null
  Observacion?: string | null
  Create_By: string
  /** No va cuando el pase se salta la firma del jefe (acceso PaseSinJefe). */
  AprobadorUser?: string
  AprobadorNombre?: string
}

export interface IPaseResult {
  Success: boolean
  SuccessMessage?: string
  ErrorMessage?: string
  Id?: number
  AprobadorUser?: string
  JefeNombre?: string
  Estado_Id?: number
  /** true si nació sin jefe: va directo a RR. HH. */
  SinJefe?: boolean
  Token?: string
}

export interface IPase {
  Id: number
  EmpleadoCode?: string
  CodAlterno?: string | null
  EmpleadoNombre?: string
  Departamento?: string | null
  cod_Departamento?: string | null
  Categoria_Id?: number
  Categoria?: string
  Tipo?: string // E | S
  JefeCode?: string | null
  JefeNombre?: string | null
  AprobadorUser?: string | null
  AprobadorNombre?: string | null
  FechaPase?: string
  Observacion?: string | null
  // 1=Pendiente jefe · 6=Pendiente RR. HH. · 2=Aprobado · 3=Rechazado
  // 4=Utilizado · 5=Vencido
  Estado_Id?: number
  Estado?: string
  MotivoRechazo?: string | null
  Aprobado_By?: string | null
  Aprobacion_Date?: string | null
  Create_By?: string | null
  Creation_Date?: string | null
  RegistradoAt?: string | null
  /** Horas previstas, "HH:mm". */
  HoraSalida?: string | null
  HoraEntrada?: string | null
  /** Token del QR. Solo viene con sentido para el dueño del pase. */
  Token?: string | null
  /** La segunda firma; la del jefe está en Aprobado_By. */
  RH_Aprobado_By?: string | null
  RH_Aprobacion_Date?: string | null
  /** Avance: cuántos movimientos se registraron de los que tiene el pase. */
  MovimientosHechos?: number | null
  MovimientosTotal?: number | null
}

export interface IAprobarPase {
  Id: number
  Create_By: string
  MotivoRechazo?: string | null
}

/**
 * Autorización en lote, en cualquiera de las dos instancias. Los permisos
 * llegan de a montones —un turno entero pide para el mismo día—, así que
 * firmarlos de uno en uno es el trabajo real.
 */
export interface IAprobarLote {
  Ids: number[]
  Create_By: string
  /** 'jefe' primera firma · 'rh' segunda. Cada una con su propia validación. */
  Modo?: 'jefe' | 'rh'
}

/** No es todo-o-nada: los que se pudieron entran y el resto se reporta. */
export interface IAprobarLoteResult {
  Aprobados: number
  Fallidos: Array<{ Id: number; Error?: string | null }>
}

/**
 * Registro en la puerta. El pase se identifica de una de tres maneras y el
 * servidor las prueba en ese orden: Token (QR del pase), Pase_Id (elegido de la
 * lista del día) o EmpleadoCode (carnet/código).
 */
export interface IRegistrarAcceso {
  EmpleadoCode?: string
  Token?: string
  Pase_Id?: number
  /** 'C' carnet o código · 'Q' QR del pase · 'L' elegido de la lista. */
  Metodo?: 'C' | 'Q' | 'L'
  Create_By: string
}

export interface IRegistrarAccesoResult {
  Success: boolean
  Valid: boolean
  // entrada | salida | notfound | pendiente | pendienterh | rechazado
  // utilizado | repetido | vencido | futuro
  Reason?: string
  Message?: string
  PaseId?: number
  EmpleadoCode?: string
  /** El del carnet: el que Seguridad puede comparar con lo que tiene en la mano. */
  CodAlterno?: string | null
  EmpleadoNombre?: string
  Categoria?: string
  Tipo?: string
  FechaHora?: string
  /** La hora a la que se suponía, "HH:mm". */
  HoraPrevista?: string | null
  /** Minutos contra lo previsto. Negativo = se adelantó. */
  DesvioMin?: number | null
  /** Movimientos que le quedan al pase. 0 = quedó completo. */
  Faltan?: number | null
  Metodo?: string | null
}
