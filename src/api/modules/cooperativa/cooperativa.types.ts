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
  /** Aprobada por el primer nivel, esperando a los demás aprobadores. */
  EN_APROBACION: 'EAPR',
  APROBADO: 'APR',
  RECHAZADO: 'REJ',
  /**
   * Estado de UNA firma de la cadena, no de la solicitud: la solicitud alcanzó
   * su mínimo de aprobaciones con las firmas de otros — o la rechazaron — así
   * que esta dejó de hacer falta. Llega en MiEstado.
   */
  NO_REQUERIDA: 'NREQ',
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

  // --------------------------------------------------------------------
  // El préstamo. Todo null o cero mientras la solicitud no sea uno: una
  // pendiente o una rechazada no tienen préstamo.
  //
  // Una vez aprobada, la solicitud ES el préstamo, y lo que pidió deja de
  // importar: lo que necesita saber es cuánto debe hoy.
  // --------------------------------------------------------------------

  /** Que venga lleno dice que la solicitud ya es un préstamo. */
  PrestamoId: number | null
  /** Lo que debe hoy. */
  SaldoPendiente: number | null
  /** Cuánto le van a descontar en el próximo pago. */
  ProximaCuota: number | null
  /** Cuándo cae ese pago. */
  ProximoPago: string | null
  CuotasTotal: number
  CuotasPagadas: number
  /** Ya terminó de pagarlo. */
  PrestamoCancelado: boolean
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

  /**
   * Lo que se le descuenta de cada pago por ahorro (Cuentas.Aporte).
   *
   * El saldo dice cuánto lleva; esto dice cuánto le sale de cada planilla.
   */
  CuotaAhorro: number

  /**
   * Lo que se le descuenta de cada pago por préstamos (Prestamo.Cuota).
   *
   * OJO: en los préstamos MIGRADOS esa columna trae el número de cuotas y no
   * el pago, así que un socio con préstamos viejos muestra acá un valor que no
   * es dinero.
   */
  CuotaPrestamo: number
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
/**
 * Minimo y maximo que puede aportar, de CooInter.FN_LimitesAporte.
 *
 * Dependen de su tipo de planilla: el mismo monto descontado cada semana pesa
 * cuatro veces mas que descontado cada mes.
 */
export type ILimitesAporte = {
  Minimo: number
  Maximo: number
  /** Tipo al que corresponde el rango: S, Q, M... */
  TipoPlanilla: string | null
  /** El tipo en palabras, resuelto por el servidor: 'semanal', 'quincenal'... */
  NombrePlanilla: string | null
}

export type IEstadoAfiliacion = {
  Empleado: IEmpleadoSinAfiliacion | null
  Solicitud: ISolicitudSocio | null
  Motivo: string | null
  PuedeSolicitar: boolean

  /** Rango permitido del aporte. Null si no se pudo leer. */
  LimitesAporte: ILimitesAporte | null

  /**
   * Por qué no puede afiliarse todavía, aunque sea elegible por lo demás.
   *
   * Hoy solo lo llena la antigüedad mínima. Es un texto y no un booleano porque
   * hay que poder DECIRLE el motivo: un botón que no está, sin explicación, se
   * lee como una falla del sistema.
   */
  BloqueoSolicitud: string | null

  /**
   * El servidor le acaba de dar el menú del socio en esta misma consulta.
   *
   * Solo pasa con quienes se afiliaron antes de este módulo, y solo la primera
   * vez. Sirve para refrescar el menú sin obligar a cerrar sesión.
   */
  MenuAsignado?: boolean
}


/**
 * Solicitud de préstamo guardada en IMCore, esperando aprobación.
 *
 * No es lo mismo que ISolicitudCliente: esa vive en Cooperativa y son las que
 * ya llegaron allá. Esta todavía está en revisión y aún no existe del otro lado.
 *
 * El tipo y el plazo traen su TEXTO además del Id: el catálogo vive en
 * Cooperativa, así que el listado no tendría cómo resolverlos sin cruzar el
 * proxy. Y es lo correcto para algo que se aprueba — se ve lo que se pidió, con
 * las palabras que tenía el catálogo ese día.
 */
export type ISolicitudPrestamo = {
  Id: number
  User_Code: string | null
  COD_PERSONAL: string | null
  /** Nombre actual del solicitante, resuelto desde Security.Users. */
  Solicitante: string | null

  TipoSolicitudId: number
  TipoSolicitudDesc: string | null
  PlazoId: number
  PlazoDesc: string | null
  PlazoMeses: number | null

  Monto: number
  Descripcion: string | null
  Deduccion13vo: number
  Deduccion14vo: number

  /** S, Q o M. Dice cada cuánto se le va a descontar. */
  TipoPlanilla: string | null

  /** Id de AdmSys.Status. Lo resuelve el SP a partir del Code. */
  Status_Id: number | null
  Status_Code: string | null
  Status_Name: string | null
  Status_Description: string | null

  Create_By: string | null
  Creation_Date: string | null
  Modified_By: string | null
  Modification_Date: string | null

  /**
   * Área, puesto, jefe y antigüedad del solicitante.
   *
   * Solo viene en el listado del aprobador. Null si no se pudo consultar
   * planilla — el listado se muestra igual, sin esa parte.
   */
  Empleado: IEmpleadoInfo | null

  /** Cuántas firmas lleva la cadena, y cuántas ya aprobaron. */
  AprobacionesTotal: number | null
  AprobacionesHechas: number | null

  /**
   * Lo que le toca a QUIEN mira: 'PEND', 'APR', 'REJ', o null si no es uno de
   * los aprobadores asignados. Con esto la pantalla sabe si mostrar los botones.
   */
  MiEstado: string | null

  /** Motivo del rechazo. Solo viene en el listado del socio. */
  Rejection_Reason: string | null

  /**
   * Si a quien mira le toca resolver ESTA solicitud ahora.
   *
   * Lo calcula la API porque depende del acceso de quien pregunta, que la
   * pantalla no conoce. No se deduce de MiEstado: una solicitud recién creada
   * todavía no tiene fila de aprobador, y el primer nivel igual puede
   * resolverla.
   */
  PuedeResolver: boolean

  /**
   * El estado desde el punto de vista de quien mira, para las pestañas.
   *
   * Es lo que ESA persona hizo, no el estado de la solicitud: una que el primer
   * aprobador ya firmó y sigue esperando a los demás es "Aprobada" para él.
   */
  EstadoParaMi: string | null

  /**
   * Si quien mira es el primer aprobador.
   *
   * Decide cuánto muestra la pantalla, no qué se autoriza — eso lo resuelve el
   * servidor. El asignado solo aprueba o rechaza lo suyo: quiénes más firman no
   * es asunto suyo y verlo solo agrega ruido a una decisión que no lo incluye.
   */
  EsPrimerNivel: boolean
}

/** Una firma de la cadena de aprobación. */
export type IAprobadorSolicitud = {
  Id: number
  SolicitudId: number
  User_Code: string | null
  /** Nombre actual, resuelto desde Security.Users. */
  Aprobador: string | null
  /**
   * 1 = la firma del primer aprobador, 2 = un asignado.
   *
   * La pantalla lo usa para saber a quién se le puede ofrecer quitar: la firma
   * que autorizó el préstamo no se quita.
   */
  Nivel: number
  Status_Code: string | null
  Status_Name: string | null
  Rejection_Reason: string | null
  Resolution_Date: string | null
  Create_By: string | null
  Creation_Date: string | null
}

/** Un usuario que puede elegirse como siguiente aprobador. */
export type IAprobadorDisponible = {
  User_Code: string | null
  /** Cae al código si no tiene nombre cargado. */
  Nombre: string | null
  Email: string | null
}

/**
 * Un usuario cualquiera, como resultado de una búsqueda.
 *
 * Es un tipo aparte de IAprobadorDisponible aunque compartan tres campos: aquel
 * son "los que tienen el acceso Aprobador2", este es "cualquier usuario". Para
 * configurar quién aprueba no sirve el primero — limitar la lista a quienes ya
 * pueden firmar es circular.
 */
export type IUsuarioBusqueda = {
  User_Code: string | null
  /** Cae al código si no tiene nombre cargado. */
  Nombre: string | null
  Email: string | null
  /** Tipo de usuario. Sirve para distinguir homónimos. */
  TypeName: string | null
  /**
   * Si la cuenta está activa. La búsqueda solo trae activos, pero un aprobador
   * ya configurado que se dio de baja llega con false: hay que poder verlo para
   * sacarlo.
   */
  Activo: boolean
}

/**
 * La cadena que le toca a UNA solicitud según la configuración.
 *
 * La combinación del solicitante — cómo le pagan y de qué área es — decide
 * quiénes firman su préstamo. Ya no es el acceso 'Aprobador2': eso daba la misma
 * lista para todos, sin importar de dónde fuera cada uno.
 */
export type ICadenaConfigurada = {
  Id: number
  Solicitante: string | null

  /** S, Q, M o 'Default'. */
  TipoPlanilla: string | null
  /** 'Semanal', 'Quincenal'... para mostrar en vez del código. */
  NombrePlanilla: string | null
  /** El Tipo de la estructura contable. Null si no se pudo ubicar el área. */
  Tipo: string | null

  /** Cuántas firmas pide la configuración de esa combinación. */
  AprobacionesMinimas: number

  /** Si la combinación tiene una fila configurada. */
  Configurado: boolean

  /** Los aprobadores configurados, con nombre. */
  Aprobadores: IUsuarioBusqueda[]

  /**
   * Por qué la lista viene vacía, cuando viene vacía: no se ubicó el área, la
   * combinación no está configurada, o está configurada sin nadie. Son tres
   * problemas con arreglos distintos.
   */
  Aviso: string | null
}

/**
 * Una tasa de interés del catálogo.
 *
 * Los ids son los MISMOS que los de Cooperativa: ese número es el que viaja al
 * crear el préstamo.
 */
export type ITasaInteres = {
  TasaId: number
  Porcentaje: number
  /** La que se usa cuando nadie elige. */
  TasaPrincipal: boolean
}

/**
 * Un concepto de las prestaciones del solicitante: con qué respaldo cuenta si
 * saliera hoy.
 *
 * Es solo de CONSULTA, para decidir el préstamo. No se guarda nada, y la lista
 * viene vacía si quien mira no tiene el acceso 'VerPrestaciones'.
 */
export type IPrestacionEmpleado = {
  /** COD_PERSONAL. Con varias solicitudes, dice de quién es. */
  Codigo: string | null

  AnioAntiguedad: number
  MesAntiguedad: number
  DiaAntiguedad: number

  CodigoConcepto: number
  Concepto: string | null

  Valor: number
  /** 'IN' suma, 'DE' resta. */
  Tipo: string | null
  /** El valor con el signo que le toca. Para totalizar, se suma esta. */
  ValorNeto: number
}

/**
 * Una cuota del plan de pagos de un préstamo.
 *
 * Los datos del préstamo — monto, plazo, tasa — vienen repetidos en cada fila
 * para traer todo en una sola consulta; la pantalla los lee de la primera.
 */
export type ICuotaPrestamo = {
  PrestamoId: number
  SolicitudId: number
  Monto: number
  Plazo: number
  /** El pago periódico. */
  Cuota: number
  FechaPrestamo: string | null
  MonedaId: string | null
  TipoPlazo: number | null
  /** La tasa aplicada, en porcentaje anual. */
  TasaAnual: number | null

  NumeroCuota: number
  FechaCuota: string | null
  SaldoAnterior: number
  CapitalCuota: number
  InteresCuota: number
  TotalCuota: number
  /** Lo que falta pagar DE esa cuota. En cero = pagada. */
  SaldoCuota: number
  /** Lo que queda debiendo después de pagarla. */
  SaldoActual: number
  Pagada: boolean
}

/**
 * Un préstamo del socio en el histórico, con el resumen de cómo va.
 *
 * Incluye los que NO nacieron de una solicitud del app — cargados en el
 * sistema de escritorio o migrados — que son la mayoría. En esos SolicitudId
 * viene null.
 */
export type IPrestamoResumen = {
  PrestamoId: number
  /** null en los que no nacieron de una solicitud del app. */
  SolicitudId: number | null
  Monto: number
  Plazo: number
  FechaPrestamo: string | null
  MonedaId: string | null
  TipoPlazo: number | null
  /** El pago periódico, tomado del plan y no de Prestamo.Cuota. */
  Cuota: number | null
  /** Lo que debe hoy. */
  SaldoPendiente: number | null
  /** Cuánto le van a descontar en el próximo pago. */
  ProximaCuota: number | null
  /** Cuándo cae ese pago. */
  ProximoPago: string | null
  /** Cero = el préstamo no tiene plan de cuotas. */
  CuotasTotal: number
  CuotasPagadas: number
  /** Ya terminó de pagarlo. */
  Cancelado: boolean
}

/**
 * Una cuota de un préstamo SIMULADO: lo que le tocaría pagar al socio si le
 * aprobaran ese monto a ese plazo.
 *
 * No tiene PrestamoId ni SolicitudId — nada de esto existe todavía — y por eso
 * no reusa ICuotaPrestamo. Tampoco trae Pagada: no hay nada que pagar.
 */
export type ICuotaSimulada = {
  NumeroCuota: number
  FechaCuota: string | null
  /** El pago del periodo: capital + interés. */
  TotalCuota: number
  SaldoAnterior: number
  CapitalCuota: number
  InteresCuota: number
  /** Lo que quedaría debiendo después de pagarla. */
  SaldoActual: number
  /** La tasa con la que se simuló, en porcentaje anual. */
  TasaAnual: number | null

  // El encabezado, repetido en cada fila.
  Monto: number
  Plazo: number
  TipoPlazo: number | null
}

/** La cadena que se le asigna a una solicitud del lote. */
export type ICadenaPrestamo = {
  Id: number
  /** Vacío = sin más firmas: esa solicitud queda aprobada. */
  Aprobadores: string[]
}

/** Lo que se manda al aprobar o rechazar. */
export type IResolverPrestamo = {
  /**
   * Las solicitudes a resolver. Varias para poder aprobar o rechazar en lote
   * desde una sola confirmación; cada una se resuelve por separado del lado del
   * servidor.
   */
  Ids: number[]
  /** 'APR' o 'REJ'. */
  Accion: string
  /** Obligatorio al rechazar. Se le muestra al solicitante. */
  Motivo?: string
  /**
   * A quiénes se manda después, para TODAS las del lote. El servidor lo sigue
   * aceptando, pero manda `Cadenas` cuando llega.
   */
  Aprobadores?: string[]
  /**
   * La cadena de cada solicitud, por separado. Es el camino normal desde que
   * los aprobadores salen de la configuración: cada solicitante tiene su
   * combinación, así que un lote de cinco puede llevar cinco cadenas distintas.
   */
  Cadenas?: ICadenaPrestamo[]
  /**
   * La tasa de interés con la que va el préstamo.
   *
   * Solo la manda el primer aprobador y solo si tiene el acceso para elegirla.
   * Sin ella el préstamo va con la tasa principal; el servidor la ignora si
   * quien llama no puede elegirla.
   */
  TasaId?: number
}

/** Qué pasó con UNA de las solicitudes del lote. */
export type IResolucionDetalle = {
  Id: number
  Ok: boolean
  Mensaje: string | null
  /** 'APR', 'EAPR' o 'REJ'. Null si no se pudo resolver. */
  EstadoFinal: string | null
}

/**
 * El resumen del lote.
 *
 * Trae las dos cuentas porque un lote puede salir a medias: cinco aprobadas y
 * dos que alguien ya había resuelto.
 */
export type IResolverPrestamosResult = {
  Resueltas: number
  Fallidas: number
  Detalles: IResolucionDetalle[]
}

/**
 * Información organizacional del solicitante.
 *
 * No se guarda en la solicitud: se pide a planilla al armar el listado. Es un
 * dato que cambia — la gente se traslada de área, le cambian de jefe — y quien
 * aprueba necesita el actual.
 */
export type IEmpleadoInfo = {
  Employees_Code: string | null
  Employees_Name: string | null
  Cod_Alterno: string | null
  Email: string | null

  /** La cadena organizacional, de lo más amplio a lo más concreto. */
  Unidad_Negocios: string | null
  Departamento: string | null
  Centro_Costos: string | null
  Posicion: string | null

  Jefe_InmediatoName: string | null
  NameJefe: string | null

  Cod_Planilla: string | null
  Company_Code: string | null

  /** Desde cuándo está en la empresa. Puede venir null. */
  FechaIngreso: string | null
}

/**
 * Lo que se manda al EDITAR una solicitud de préstamo.
 *
 * Es ICrearSolicitud más el Id. La API solo la acepta mientras la solicitud
 * siga pendiente, y solo si es del propio usuario.
 */
export type IEditarSolicitud = {
  Id: number
  TipoSolicitudId: number
  PlazoId: number
  Monto: number
  Descripcion?: string
  Deduccion13vo?: number
  Deduccion14vo?: number
}


/**
 * La configuración de aprobación de un tipo de estructura contable.
 *
 * Los tipos (Directo, Indirecto, Administrativo...) NO se guardan en IMCore: se
 * leen en vivo de dbo.EstructuraContable y se cruzan con lo guardado. Un tipo
 * sin configurar llega igual, con los valores por defecto y `Configurado` en
 * false — así aparece en la pantalla desde el primer día.
 */
export type IConfiguracionAprobadores = {
  /** S, Q, M o 'Default'. El mismo juego que los límites del aporte. */
  TipoPlanilla: string | null
  /** 'Semanal', 'Quincenal'... para mostrar en vez del código. */
  NombrePlanilla: string | null
  /** En qué orden va la planilla. Lo decide el servidor. */
  OrdenPlanilla: number

  Tipo: string | null

  /** Cuántos centros de costo usan este tipo. Dice si pesa mucho o es aislado. */
  CentrosCosto: number

  /** Cuántas firmas hacen falta. 0 = con el primer aprobador alcanza. */
  AprobacionesMinimas: number

  /** Los usuarios, separados por comas. Es cómo se guarda. */
  Aprobadores: string | null

  /** Los mismos ya partidos. Es con lo que trabaja la pantalla. */
  AprobadoresLista: string[]

  /**
   * Los mismos, con nombre, resueltos por el servidor.
   *
   * La pantalla ya no trae la lista completa de usuarios (son cientos), así que
   * sin esto los aprobadores configurados se verían como 'lchinchilla'. Un
   * código que ya no exista llega igual, con el código por nombre y
   * Activo = false, para poder quitarlo.
   */
  AprobadoresInfo: IUsuarioBusqueda[]

  /** Si alguien ya lo configuró, o son los valores por defecto. */
  Configurado: boolean

  Modified_By: string | null
  Modification_Date: string | null
}

/** Lo que se manda al guardar UNA combinación. */
export type IGuardarConfiguracionAprobadores = {
  TipoPlanilla: string
  Tipo: string
  AprobacionesMinimas: number
  Aprobadores: string[]
}
