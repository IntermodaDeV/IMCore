/**
 * Cooperativa interna (esquema CooInter).
 */

/** Empleado activo en planilla que todavía no está afiliado a la cooperativa. */
export type IEmpleadoSinAfiliacion = {
  NIT: string | null
  PrimerNombre: string | null
  SegundoNombre: string | null
  PrimerApellido: string | null
  SegundoApellido: string | null
  Direccion: string | null
  FechaIngreso: string | null
  FechaNacimiento: string | null
  Estado: boolean
  Telefono1: string | null
  Telefono2: string | null
  Correo: string | null
  EmpresaId: number
  MonedaId: string | null
  /** COD_PERSONAL del empleado en planilla. */
  Codigo: string | null
  /** S = semanal, Q = quincenal, M = mensual, X = sin clasificar. */
  TipoPlanilla: string | null
}

/** Códigos de AdmSys.Status con Category 'CooInter'. */
export const ESTADO_SOLICITUD = {
  PENDIENTE: 'PEND',
  APROBADO: 'APR',
  RECHAZADO: 'REJ',
} as const

/** Solicitud de afiliación guardada en CooInter.SolicitudesSocio. */
export type ISolicitudSocio = {
  Id: number
  User_Code: string | null
  NIT: string | null
  PrimerNombre: string | null
  SegundoNombre: string | null
  PrimerApellido: string | null
  SegundoApellido: string | null
  Direccion: string | null
  FechaIngreso: string | null
  FechaNacimiento: string | null
  Telefono1: string | null
  Telefono2: string | null
  Correo: string | null
  EmpresaId: number | null
  MonedaId: string | null
  Codigo: string | null
  TipoPlanilla: string | null
  /** PEND o APR. Las validaciones van por este código, no por Id. */
  Status_Code: string | null
  Status_Name: string | null
  Status_Description: string | null
  /** Motivo del rechazo. Es el texto que ve el solicitante. */
  Rejection_Reason: string | null
  /** Quien aprobo o rechazo la solicitud. */
  Resolved_By: string | null
  /** Fecha y hora de la resolucion. */
  Resolution_Date: string | null
  Create_By: string | null
  Creation_Date: string | null
  Modified_By: string | null
  Modification_Date: string | null
}

/**
 * Solicitud del socio en Cooperativa.dbo.Solicitud.
 *
 * Estado, PlazoId y TipoSolicitudId llegan como ids: son catalogos de
 * Cooperativa que el app todavia no conoce.
 */
export type ISolicitudCliente = {
  SolicitudId: number
  ClienteId: number
  FechaSolicitud: string | null
  Estado: number | null
  Monto: number | null
  Descripcion: string | null
  EmpresaId: number | null
  UsuarioAprobo: string | null
  UsuarioRechazo: string | null
  FechaGestion: string | null
  UsuarioCreo: string | null
  UsuarioModifico: string | null
  FechaCreacion: string | null
  FechaModificacion: string | null
  PlazoId: number | null
  TipoSolicitudId: number | null
  Deduccion13vo: number | null
  Deduccion14vo: number | null
  // Resueltos por el SP: se muestran en vez de los ids.
  EstadoNombre: string | null
  PlazoDescripcion: string | null
  PlazoMes: number | null
  TipoSolicitudDescripcion: string | null
}

/** Estados de Cooperativa.dbo.Solicitud. */
export const ESTADO_SOLICITUD_COO = {
  APROBADO: 1,
  RECHAZADO: 2,
  PENDIENTE: 3,
} as const

/**
 * Estado de cuenta del socio: lo que tiene ahorrado contra lo que debe.
 */
export type IEstadoCuenta = {
  ClienteId: number
  Codigo: string | null
  NombreCompleto: string | null
  /** Cuantas cuentas de ahorro activas tiene. */
  TotalCuentas: number
  SaldoCuentas: number
  /** Cuantos prestamos vigentes tiene. */
  TotalPrestamos: number
  SaldoPrestamos: number
  /** Ahorros menos deuda. Negativo = debe mas de lo que tiene. */
  SaldoNeto: number
}

/** Catalogo Cooperativa.dbo.TipoSolicitud. */
export type ITipoSolicitud = {
  TipoSolicitudId: number
  Descripcion: string | null
  Estado: number | null
  EmpresaId: number | null
}

/** Catalogo Cooperativa.dbo.Plazo. */
export type IPlazo = {
  PlazoId: number
  Descripcion: string | null
  PlazoMes: number | null
  Estado: number | null
  EmpresaId: number | null
  TipoPlazo: string | null
}

/** Los dos catalogos del formulario, en una sola respuesta. */
export type ICatalogosSolicitud = {
  Tipos: ITipoSolicitud[]
  Plazos: IPlazo[]
}

/**
 * Lo que el socio llena en el formulario.
 *
 * No lleva codigo ni estado: el servidor pone el COD_PERSONAL del token y toda
 * solicitud nace en Pendiente.
 */
export type ICrearSolicitud = {
  TipoSolicitudId: number
  PlazoId: number
  Monto: number
  Descripcion?: string
  Deduccion13vo?: number
  Deduccion14vo?: number
}

/**
 * Estado de afiliación del usuario, en una sola llamada.
 *
 * Los tres casos que puede mostrar la pantalla:
 *  - Solicitud != null  -> ya solicitó, se muestra el estado
 *  - Empleado != null   -> aplica, se muestra el botón
 *  - Motivo != null     -> no aplica, se muestra el motivo
 */
/** Minimo y maximo que puede aportar, definidos en CooInter.FN_LimitesAporte. */
export type ILimitesAporte = {
  Minimo: number
  Maximo: number
}

export type IEstadoAfiliacion = {
  Empleado: IEmpleadoSinAfiliacion | null
  Solicitud: ISolicitudSocio | null
  Motivo: string | null
  PuedeSolicitar: boolean

  /** Rango permitido del aporte. Null si no se pudo leer. */
  LimitesAporte: ILimitesAporte | null

  /**
   * El servidor le acaba de dar el menú del socio en esta misma consulta.
   *
   * Solo pasa con quienes se afiliaron antes de este módulo, y solo la primera
   * vez. Sirve para refrescar el menú sin obligar a cerrar sesión.
   */
  MenuAsignado?: boolean
}
