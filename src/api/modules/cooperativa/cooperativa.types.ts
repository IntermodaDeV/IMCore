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

  /**
   * Administrativo, Directo o Indirecto.
   *
   * Junto con la empresa y el tipo de planilla decide cuánto puede aportar.
   */
  TipoEmpleado: string | null

  /** PERM o TEMP, de planilla. */
  RelacionLaboral: string | null

  /**
   * Si puede afiliarse. Hoy lo único que lo impide es ser temporal.
   *
   * La regla vive en el servidor: acá solo se lee. Así, el día que se agregue
   * otra condición, la pantalla no se entera.
   */
  PuedeAfiliarse: boolean

  /**
   * Cuánto puede aportar al afiliarse. Lo resuelve el servidor.
   *
   * null cuando su combinación de empresa, planilla y tipo de empleado no está
   * parametrizada en la cooperativa. En ese caso no hay rango que mostrar ni
   * contra qué validar — y no se inventa uno.
   */
  LimitesAporte: ILimitesAporte | null
}

/**
 * Resultado de afiliarse.
 *
 * `SocioCreado` y `CuentaCreada` distinguen el alta real de un reintento sobre
 * algo que ya existía — útil para no felicitar dos veces por lo mismo.
 */
export type IAfiliacionResult = {
  Success: boolean
  Mensaje: string | null

  /**
   * Se guardó, pero con algo que conviene saber.
   *
   * Hoy solo llega cuando el aporte quedó fuera de un rango informativo. La
   * pantalla no debería producirlo: valida antes de mandar.
   */
  Aviso: string | null

  ClienteId: number | null
  CuentaId: number | null
  SocioCreado: boolean
  CuentaCreada: boolean

  /**
   * Si se le acaba de dar el menú del socio.
   *
   * Solo viene `true` cuando se asignó ahora. Con eso se refresca el drawer:
   * sin refrescarlo, la persona tendría que cerrar sesión para ver su pantalla
   * nueva — y refrescarlo siempre sería pedir los menús de gusto.
   */
  MenuAsignado: boolean
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
 * Una solicitud del socio, como está en Cooperativa.dbo.Solicitud.
 *
 * Ya no trae datos del préstamo: antes se pegaban acá con un JOIN porque la
 * solicitud aprobada "era" el préstamo, pero son dos cosas y cada una tiene su
 * consulta.
 */
export type ISolicitudCliente = {
  SolicitudId: number
  ClienteId: number
  FechaSolicitud: string | null

  /** 0 Pendiente, 1 Aprobada, 2 Rechazada, 3 EnAprobación, 4 Anulada. */
  Estado: number | null

  /**
   * El nombre del estado, resuelto por el servidor contra el catálogo.
   *
   * Se usa este y no un mapa en la pantalla: si la cooperativa agrega un
   * estado, aparece con su nombre sin tocar el app.
   */
  EstadoNombre: string | null
  EstadoCodigo: string | null

  /**
   * true = esta solicitud le impide pedir otra.
   *
   * Lo decide el servidor con la MISMA condición con la que
   * CooInter.SP_CrearSolicitud rechaza la creación — Pendiente o En
   * aprobación, con cobro por planilla. Por eso la pantalla pregunta esto y no
   * compara estados por su cuenta: una lista propia acá se desincroniza en
   * cuanto la cooperativa agrega un estado, y el socio llenaría el formulario
   * para que recién al guardar le digan que no.
   */
  EnTramite: boolean

  Monto: number | null
  Descripcion: string | null

  TipoSolicitudId: number | null
  TipoSolicitud: string | null

  /** El PlazoId con el que se guardó. */
  Plazo: number | null
  /** 0 Mensual, 1 Quincenal, 2 Semanal. */
  TipoPlazo: number | null
  PlazoMeses: number | null

  /** La que pidió el socio. */
  CuotaSolicitada: number | null
  /** La que calculó el sistema para ese monto y plazo. */
  CuotaCotizada: number | null
  /** La que quedó al aprobarla. null mientras no se apruebe. */
  CuotaAutorizada: number | null

  Deduccion13vo: number | null
  Deduccion14vo: number | null

  EsRefinanciamiento: boolean | null
  PrestamoIdRefinanciar: number | null

  /**
   * El motivo que corresponde al estado: el del rechazo o el de la anulación.
   * Lo resuelve el servidor para que la pantalla no tenga que saber cuál mirar.
   */
  Motivo: string | null
  MotivoRechazo: string | null
  MotivoAnulacion: string | null

  AprobacionesMinimas: number | null
  /** 0 planilla, 1 personal. */
  TipoDeCobro: number | null
  FechaPrimeraCuota: string | null

  UsuarioCreo: string | null
  UsuarioAprobo: string | null
  UsuarioRechazo: string | null
  UsuarioAnulo: string | null

  FechaGestion: string | null
  FechaAnulacion: string | null
  FechaCreacion: string | null
  FechaModificacion: string | null

  EmpresaId: number | null
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

  /**
   * El ENUM del negocio (0..3), que NO es `TipoSolicitudId`.
   *
   * `TipoSolicitudId` es la llave de la fila y es POR EMPRESA: la empresa 2
   * puede tener los mismos cuatro tipos con otros Id. Este es el mismo en
   * todas y es el que mira el servidor al crear.
   */
  TipoDeSolicitud: number | null

  /**
   * El tipo exige la deducción del 13.º.
   *
   * Lo decide el servidor con la misma condición con la que rechaza la
   * creación. Antes esta pantalla llevaba su propia tabla por
   * `TipoSolicitudId` (1, 2 y 4), que da el resultado correcto para la
   * empresa 1 de casualidad: en otra empresa pediría la deducción equivocada
   * y el socio se enteraría recién al guardar.
   */
  RequiereDeduccion13vo: boolean

  /** Igual que la anterior, para el 14.º. */
  RequiereDeduccion14vo: boolean

  Estado: number | null
  EmpresaId: number | null
}

/**
 * Una opción de cuota para un monto.
 *
 * Vienen dos o tres: la mínima, la "personalizada" — la sugerida a partir de
 * lo que el socio escribió, que solo aparece si escribió algo — y la máxima.
 *
 * Las columnas generales (monto, tramo, tasa, refinanciamiento, bloqueo) se
 * repiten en cada una porque el servidor devuelve un solo juego de filas.
 *
 * Cada opción la resuelve la misma función que usa el servidor al guardar, así
 * que lo que el socio elige acá es lo que después se le cobra.
 */
export type IOpcionCuota = {
  Success: boolean
  Mensaje: string | null

  /** 'minima' | 'personalizada' | 'maxima'. */
  Clave: string | null
  Etiqueta: string | null
  Detalle: string | null

  /** La cuota con la que se resolvió esta opción. */
  CuotaPedida: number | null

  /**
   * false = ESTA opción no se pudo resolver; `MensajeOpcion` dice por qué.
   * Las otras del mismo juego pueden estar bien, así que se muestra el motivo
   * en su tarjeta en vez de descartar todo.
   */
  Ok: boolean | null
  MensajeOpcion: string | null
  Aviso: string | null

  /** Cuántas cuotas salen con esta opción. */
  Plazo: number | null

  /** 0 Mensual | 1 Quincenal | 2 Semanal. */
  TipoPlazo: number | null

  /** La cuota nivelada que de verdad se va a cobrar. */
  Cuota: number | null
  InteresTotal: number | null
  TotalAPagar: number | null

  MontoSolicitado: number | null

  /** Lo que cuesta cancelar el préstamo vigente, si lo hay. */
  SaldoAnterior: number | null

  /** MontoSolicitado + SaldoAnterior: sobre esto se calcula. */
  MontoTotal: number | null

  CuotaMinima: number | null
  CuotaMaxima: number | null

  /** El tramo es solo informativo: deja salirse del rango. */
  TramoInformativo: boolean | null

  CargoAdministrativo: number | null
  Tasa: number | null

  EsRefinanciamiento: boolean | null
  PrestamoIdRefinanciar: number | null

  /**
   * Por qué el socio NO podría crear la solicitud. null si puede.
   *
   * Las opciones vienen calculadas igual: se muestran con el aviso, en vez de
   * dejar la pantalla vacía sin explicar nada.
   */
  Bloqueo: string | null
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
  /**
   * Sin esto crea; con el Id de una solicitud, la edita.
   *
   * Es el mismo endpoint y el mismo procedimiento para los dos casos, a
   * propósito: con dos caminos separados bastaría que la cooperativa cambie
   * una regla del alta para que editando se pudiera guardar algo que no se
   * habría podido crear.
   *
   * El servidor solo deja editar una que esté Pendiente, que sea del socio del
   * token y que ningún firmante haya tocado.
   */
  SolicitudId?: number

  TipoSolicitudId: number
  Monto: number

  /**
   * Lo que el socio dijo que puede pagar por período.
   *
   * No lleva `PlazoId`: el plazo NO es una decisión aparte, sale del monto y
   * de la cuota. Pidiéndolos por separado se podía armar una combinación que
   * no existe, y el servidor la rechazaba después de llenar todo el
   * formulario.
   */
  CuotaSolicitada: number

  /**
   * La cuota de la opción que tocó — mínima, sugerida o máxima.
   *
   * Es una elección entre las que el servidor ya calculó, no un número que el
   * teléfono imponga: al guardar las vuelve a resolver con la misma función y
   * se queda con la que corresponde.
   */
  CuotaElegida?: number

  Descripcion?: string
  Deduccion13vo?: number
  Deduccion14vo?: number

  /**
   * El refinanciamiento ya NO se manda desde acá.
   *
   * Si el socio tiene un préstamo de planilla vigente, el servidor lo detecta
   * solo y lo incluye en el cálculo. Mandarlo desde el teléfono permitía pedir
   * cualquier monto diciendo que ya se debía.
   */
  RefinanciaPrestamoId?: never
}

/**
 * Hasta cuánto puede pedir el socio, según los tramos configurados para su
 * empresa y su tipo de planilla.
 *
 * Sirve para avisarle el límite ANTES de que lo pase. Sin esto el servidor
 * contesta "no hay un tramo de crédito configurado para un monto de
 * 250,000.00", que es cierto pero no dice cuánto SÍ puede pedir: el socio
 * tiene que ir adivinando a la baja.
 */
export type ILimitesPrestamo = {
  /** El capital mínimo más bajo configurado. null = no hay tramos. */
  MontoMinimo: number | null

  /** El capital máximo más alto configurado. */
  MontoMaximo: number | null

  /** 0 Mensual | 1 Quincenal | 2 Semanal, según su planilla. */
  TipoPlazo: number | null

  /**
   * Cuántos tramos activos hay.
   *
   * Importa porque los tramos PUEDEN TENER HUECOS: con uno de 1,000 a 20,000
   * y otro de 50,000 a 100,000, un monto de 30,000 está dentro del mínimo y el
   * máximo y aun así no tiene tramo. Por eso esto es una ayuda temprana, no la
   * última palabra: el servidor sigue decidiendo al calcular.
   */
  Tramos: number
}

/**
 * Una firma de la cadena, con lo que esa persona propuso.
 */
export type IFirmaSolicitud = {
  SolicitudAprobadorId: number
  SolicitudId: number
  UsuarioId: number

  /** El que tiene la última palabra. */
  EsAprobadorFinal: boolean

  /** En qué lugar de la fila firma. 1 es el primero. */
  Orden: number

  /** 0 Pendiente · 1 Aprobada · 2 Rechazada. */
  Estado: number

  UsuarioLogin: string | null
  CodigoEmpleado: string | null

  /** Nombre y apellidos, para decir quién propuso qué. */
  Nombre: string | null

  /** Cuándo firmó. null mientras no se pronuncie. */
  FechaResolucion: string | null
  MotivoRechazo: string | null

  /**
   * Lo que ESTA persona autorizó, que puede no ser lo que pidió el socio.
   *
   * Todo en null mientras no firme, y también cuando rechaza: ahí no autorizó
   * nada.
   */
  MontoPropuesto: number | null
  CuotaPropuesta: number | null
  PlazoResultante: number | null
  TasaId: number | null
}

/**
 * Lo que un aprobador decide sobre una solicitud.
 *
 * Quién firma no va acá: lo resuelve el servidor desde el token.
 */
export type IResolverAprobacion = {
  SolicitudId: number

  /** true aprueba, false rechaza. */
  Aprobar: boolean

  /**
   * Los tres van juntos al aprobar: describen una sola decisión —tanto, en
   * tantas cuotas, de tanto cada una—. Mandar solo la cuota dejaría la firma
   * sin decir sobre qué monto se dio.
   */
  MontoAutorizado?: number | null
  CuotaAutorizada?: number | null
  PlazoResultante?: number | null

  TasaId?: number | null

  /** Obligatorio al rechazar: el socio lo va a leer. */
  MotivoRechazo?: string | null

  /**
   * Cuándo se entrega el dinero.
   *
   * Solo la manda el ÚLTIMO firmante — es el único que otorga — y por eso la
   * pantalla solo le muestra ese campo a él. Es la fecha del préstamo y el
   * punto desde el que el servidor proyecta el plan de cuotas.
   */
  FechaOtorgamiento?: string | null
}

/** Cómo quedó la solicitud después de la firma. */
export type IResolverAprobacionResult = {
  Success: boolean
  Mensaje: string | null

  SolicitudAprobadorId: number | null

  /**
   * Esta firma cerró la cadena: además de grabarse, creó el préstamo y pasó
   * la solicitud a Aprobada.
   */
  EsUltimaFirma: boolean

  /** 1 Aprobado · 2 Rechazado · 3 En aprobación. */
  EstadoSolicitud: number | null

  /**
   * El préstamo que acaba de nacer. null en todo lo que no sea un cierre: las
   * firmas intermedias y los rechazos no otorgan nada.
   */
  PrestamoId: number | null
  FechaPrestamo: string | null

  SiguienteUsuarioId: number | null
  SiguienteCodigo: string | null
  SiguienteLogin: string | null

  /**
   * Si se le pudo avisar al siguiente.
   *
   * Falso no invalida nada: la firma ya quedó. Sirve para poder decir "quedó
   * firmada, pero al siguiente no se le pudo avisar" en vez de callarlo.
   */
  AvisoAlSiguiente: boolean
}

/**
 * Una solicitud en la que el usuario que consulta es firmante.
 *
 * Alimenta "Solicitudes de préstamo", la pantalla donde se aprueba.
 */
export type ISolicitudPorAprobar = {
  /**
   * 'Pendiente' | 'Aprobada' | 'Rechazada' | 'Otro'.
   *
   * Es lo que hizo ÉL, NO cómo quedó la solicitud: puede haberla aprobado y
   * que después otro la rechazara. Para eso está `EstadoNombre`, que es otra
   * cosa. Confundirlas le diría al aprobador que algo salió como su voto
   * cuando no fue así.
   */
  Grupo: string | null

  /** El número crudo del estado del firmante, por si aparece uno nuevo. */
  MiEstado: number
  MiEstadoNombre: string | null

  /**
   * true = le toca firmar AHORA.
   *
   * Estar asignado no es poder firmar: la cadena va por orden y hasta que no
   * resuelvan los anteriores, este no puede hacer nada. Las suyas aparecen
   * igual en la lista — si desaparecieran no sabría que tiene algo en camino —
   * pero sin poder resolverlas.
   */
  MeToca: boolean

  SolicitudAprobadorId: number
  MiOrden: number
  EsAprobadorFinal: boolean
  MiFechaResolucion: string | null
  MiMotivoRechazo: string | null

  SolicitudId: number
  FechaSolicitud: string | null

  /** El estado de la SOLICITUD, no el del firmante. */
  Estado: number | null
  EstadoNombre: string | null

  Monto: number | null
  Descripcion: string | null

  TipoSolicitudId: number | null
  TipoSolicitud: string | null

  /** La CANTIDAD de cuotas, no un PlazoId. */
  Plazo: number | null

  /** 0 Mensual | 1 Quincenal | 2 Semanal. */
  TipoPlazo: number | null

  CuotaSolicitada: number | null
  CuotaCotizada: number | null
  CuotaAutorizada: number | null

  Deduccion13vo: number | null
  Deduccion14vo: number | null

  EsRefinanciamiento: boolean | null
  PrestamoIdRefinanciar: number | null

  AprobacionesMinimas: number | null
  TotalFirmantes: number
  FirmasAFavor: number

  SocioCodigo: string | null
  SocioNombre: string | null
  TipoPlanilla: string | null

  EmpresaId: number | null
}

/** Un concepto de la liquidación del socio: lo que le toca si saliera hoy. */
export type IPrestacionSocio = {
  PrestacionesId: number
  Codigo: string | null
  CodigoPayroll: string | null

  /** Cuánto lleva en la empresa. Se repite en cada fila: es del empleado. */
  AnioAntiguedad: number
  MesAntiguedad: number
  DiaAntiguedad: number

  CodigoConcepto: number
  Concepto: string | null

  /** Tal como está guardado. NO sirve para sumar: ver `ValorNeto`. */
  Valor: number

  /** 'IN' suma, 'DE' resta. */
  Tipo: string | null

  /**
   * El valor con el signo que le toca según el Tipo.
   *
   * Es el que hay que sumar. `Valor` no sirve porque los descuentos a veces
   * vienen guardados en negativo y a veces no; el servidor lo normaliza.
   */
  ValorNeto: number

  EmpresaId: number | null
}

/** El empleado en planilla: su ubicación en la organización. */
export type IEmpleadoPlanilla = {
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
}

/**
 * Todo lo que el aprobador necesita de una solicitud, en una sola llamada.
 *
 * Se arma de tres fuentes distintas y viene junto a propósito: la pantalla las
 * pediría igual, y resolviéndolas en el servidor no quedan tres estados de
 * carga que puedan contradecirse.
 *
 * Cada parte puede venir vacía sin que las otras fallen: que planilla no esté
 * arriba no tiene por qué esconder el monto de la solicitud.
 */
export type IDetalleAprobacion = {
  Solicitud: ISolicitudPorAprobar | null

  /**
   * El usuario tiene el acceso 'VerPrestaciones'.
   *
   * En false, `EstadoCuenta`, `Cuentas`, `Prestamos` y `Prestaciones` vienen
   * VACÍOS — y no por un error: el servidor ni los consultó.
   *
   * Por eso viaja la bandera: la pantalla puede decir "no tenés acceso" en vez
   * de mostrar todo en cero, que se leería como un socio sin ahorros ni
   * deudas.
   */
  PuedeVerPrestaciones: boolean
  Empleado: IEmpleadoPlanilla | null

  /**
   * La cadena de firmas en orden, con lo que cada una propuso.
   *
   * >>> EL QUE FIRMA SEGUNDO NO DECIDE SOBRE LO QUE PIDIÓ EL SOCIO <<<
   * Decide sobre lo que dejó el anterior. Si el primero bajó el monto de
   * 25,000 a 10,000, el segundo tiene que estar mirando 10,000 — y además
   * tiene que poder ver que el socio había pedido otra cosa.
   *
   * `Solicitud.Monto` sigue siendo lo que pidió el socio a propósito: no se
   * pisa hasta que la solicitud se cierre. Por eso la propuesta vigente hay
   * que sacarla de acá y no de ahí.
   *
   * No va detrás de 'VerPrestaciones': es de la solicitud, no de la plata del
   * socio.
   */
  Firmas: IFirmaSolicitud[]

  Prestaciones: IPrestacionSocio[]

  /** La suma de los ValorNeto: el respaldo con el que se decide. */
  PrestacionesNeto: number

  /** Ahorros y préstamos del socio. null si no se pudo leer. */
  EstadoCuenta: IEstadoCuenta | null

  /**
   * Lo que el socio debe HOY, neto de su ahorro: préstamos − ahorro.
   *
   * NO confundir con la `Exposicion` de la cooperativa, que es otra cosa: el
   * TOTAL A PAGAR del préstamo propuesto, capital más intereses. Esta dice
   * cómo está hoy; aquella, cuánto costaría lo que se está por aprobar.
   *
   * Puede dar cero o negativo: tiene más ahorrado que deuda.
   */
  DeudaNeta: number

  /**
   * Cuántas veces la liquidación cubre la exposición.
   *
   * null cuando la exposición es cero o negativa: ahí no hay nada que cubrir
   * y un número sería inventado.
   */
  VecesCubierto: number | null

  Plan: ICuotaPlan[]

  /** Sus cuentas de ahorro activas, una por fila. */
  Cuentas: ICuentaSocio[]

  /** Sus préstamos, vigentes y cancelados. */
  Prestamos: IPrestamoSocio[]

  /** Las tasas que el aprobador puede elegir, la de referencia primero. */
  Tasas: ITasaEmpresa[]
}

/** Una tasa de interés que el aprobador puede elegir. */
export type ITasaEmpresa = {
  TasaId: number

  /**
   * En porcentaje ANUAL: 18.00, no 0.18. Es como la espera el cálculo del
   * servidor; mandarla dividida daría un plan con una tasa cien veces menor
   * sin que nada avise.
   */
  Porcentaje: number

  /** La de referencia: con esta se cotizó la solicitud. */
  EsPrincipal: boolean

  Estado: number | null
  EmpresaId: number | null
}

/** Una cuenta de ahorro del socio. */
export type ICuentaSocio = {
  CuentaId: number
  ClienteId: number

  TipoCuenta: number | null

  /** null si no hay catálogo 'TipoCuenta'; se muestra el número. */
  TipoCuentaNombre: string | null

  /**
   * La fecha de la MIGRACIÓN, no la de apertura real: hoy es la misma para
   * todas las cuentas. La que sirve es `FechaCreacion`.
   */
  FechaApertura: string | null

  /** Desde cuándo ahorra de verdad. Es la que se muestra. */
  FechaCreacion: string | null

  SaldoInicial: number
  SaldoActual: number

  /** Lo que le descuentan de cada pago por esta cuenta. */
  Aporte: number | null

  MonedaId: string | null

  /** 0 planilla | 1 personal. */
  TipoDeCobro: number | null

  Estado: number | null
  EmpresaId: number | null
}

/** Un préstamo del socio, con lo que debe hoy. */
export type IPrestamoSocio = {
  PrestamoId: number

  /** null en los que no nacieron de una solicitud del app. */
  SolicitudId: number | null

  Monto: number

  /** La cantidad de cuotas. */
  Plazo: number

  FechaPrestamo: string | null
  MonedaId: string | null

  /** 0 Mensual | 1 Quincenal | 2 Semanal. */
  TipoPlazo: number | null

  /**
   * El pago periódico, tomado del PLAN y no de `Prestamo.Cuota`: en los
   * préstamos migrados esa columna guarda cuántas cuotas son, no de cuánto es
   * cada una.
   */
  Cuota: number | null

  /** Lo que debe hoy: el CAPITAL pendiente. */
  SaldoPendiente: number | null

  /**
   * Capital pendiente + el interés de la próxima cuota. Va aparte porque ese
   * interés todavía no se devengó: solo se cobra si refinancia ahora.
   */
  MontoRefinanciamiento: number | null

  ProximaCuota: number | null
  ProximoPago: string | null

  /** Cero = el préstamo no tiene plan de cuotas cargado. */
  CuotasTotal: number
  CuotasPagadas: number

  /** Ya terminó de pagarlo. */
  Cancelado: boolean

  Estado: number | null
}

/**
 * Una cuota del plan de pagos.
 *
 * Sale de la misma función con la que el servidor calculó el interés total de
 * la opción, llamada con los mismos argumentos: la suma de estas filas cuadra
 * con el total que se le mostró al socio. No son dos cálculos parecidos, es el
 * mismo.
 */
export type ICuotaPlan = {
  NumeroCuota: number

  /**
   * Capital + interés de ESTA cuota, no la cuota nivelada fija: la última
   * absorbe el residuo de todos los redondeos y suele diferir de las demás.
   */
  Cuota: number

  InteresCuota: number
  CapitalCuota: number

  /** Lo que se debía ANTES de pagar esta cuota. */
  SaldoAnterior: number

  /** Lo que queda debiendo DESPUÉS de esta cuota. */
  MontoPrestamo: number

  FechaPago: string | null

  /**
   * 'Calendario' | 'Proyectado' | 'Aritmetica'.
   *
   * 'Aritmetica' significa que el calendario de planilla no cubría el plazo y
   * las fechas son estimadas, no las reales de pago.
   */
  OrigenFecha: string | null
}

/**
 * Lo que quedó guardado al crear la solicitud.
 *
 * El servidor vuelve a resolver la cuota al guardar, con la misma función con
 * la que calculó las opciones. Normalmente coincide con la que el socio eligió,
 * pero si en el medio cambió algo — la tasa, el saldo del préstamo que arrastra
 * — lo que vale es esto, no lo que decía la pantalla.
 */
export type ICrearSolicitudResult = {
  Success: boolean
  Mensaje: string | null

  /**
   * Se creó igual, pero hay algo que el socio debería saber: por ejemplo que
   * la cuota quedó fuera del tramo porque el tramo es solo informativo.
   */
  Aviso: string | null

  SolicitudId: number | null

  /** Monto + lo que arrastra el préstamo que se refinancia. */
  MontoTotal: number | null

  /** Cuántas cuotas quedaron. */
  Plazo: number | null

  /** 0 Mensual | 1 Quincenal | 2 Semanal. */
  TipoPlazo: number | null

  /** La cuota que de verdad quedó. */
  CuotaCotizada: number | null

  EsRefinanciamiento: boolean | null
  PrestamoIdRefinanciar: number | null

  /** Cuántas firmas necesita para aprobarse. */
  AprobacionesMinimas: number | null
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

  /** El tipo de empleado al que corresponde el rango. */
  TipoEmpleado?: string | null

  /**
   * Si el rango es una sugerencia y no un límite a exigir.
   *
   * Lo guarda así la cooperativa. Con `true` la pantalla muestra el rango pero
   * no bloquea el monto.
   */
  Informativo?: boolean
}

/**
 * La ficha del socio en Cooperativa.dbo.Cliente.
 *
 * Sale de CooInter.SP_GetClientePorCodigo, en la base de Cooperativa. Que la
 * respuesta traiga esto o venga en null es lo que decide qué muestra la
 * pantalla: su información, o el "quiero ser socio".
 */
export type IClienteCooperativa = {
  ClienteId: number
  Codigo: string | null
  NIT: string | null

  PrimerNombre: string | null
  SegundoNombre: string | null
  PrimerApellido: string | null
  SegundoApellido: string | null

  /** Los cuatro nombres ya pegados por el SP. */
  NombreCompleto: string | null

  Direccion: string | null
  FechaIngreso: string | null
  FechaNacimiento: string | null
  Telefono1: string | null
  Telefono2: string | null
  Correo: string | null
  EmpresaId: number | null
  MonedaId: string | null
  TipoPlanilla: string | null

  /** Administrativo, Directo o Indirecto. */
  TipoEmpleado: string | null

  /**
   * 1 = activa la ficha.
   *
   * Un socio dado de baja SÍ existe, así que no se le puede ofrecer afiliarse
   * de nuevo: terminaría en un alta duplicada.
   */
  Estado: number | null

  /**
   * En qué situación está como socio: Activo, Liquidado, lo que la cooperativa
   * tenga en su catálogo.
   *
   * NO es lo mismo que `Estado`. Un socio puede tener la ficha activa y estar
   * liquidado — mostrar solo el primero diría que está todo bien.
   */
  EstadoSocio: number | null

  /**
   * El nombre del estado, ya resuelto por el servidor contra el catálogo.
   *
   * Se usa este y no un mapa en la pantalla: si la cooperativa agrega un
   * estado, aparece con su nombre sin tocar el app.
   */
  EstadoSocioNombre: string | null

  EstadoSocioCodigo: string | null
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

  // ----------------------------------------------------------------------
  // Refinanciamiento
  //
  // `Monto` (arriba) sigue siendo EL TOTAL: SaldoAnterior + MontoAdicional.
  // Estos campos son el desglose, y son una FOTO del día que lo pidió — el
  // saldo baja con cada descuento, así que consultarlo al aprobar daría un
  // número distinto del que se pidió y del que se aprobó.
  // ----------------------------------------------------------------------

  /** false en una solicitud normal. */
  EsRefinanciamiento: boolean
  /** El PrestamoId de Cooperativa que se reemplaza. */
  PrestamoAnteriorId: number | null
  PrestamoAnteriorMonto: number | null
  PrestamoAnteriorFecha: string | null
  PrestamoAnteriorCuotasTotal: number | null
  PrestamoAnteriorCuotasPagadas: number | null
  /** Meses que llevaba con el anterior AL PEDIRLO, no hasta hoy. */
  PrestamoAnteriorMeses: number | null
  /** Lo que debía al pedirlo. Es lo que arrastra el préstamo nuevo. */
  SaldoAnterior: number | null
  /** Lo que pide de más sobre ese saldo. */
  MontoAdicional: number | null

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
  /** Lo que debe hoy: el CAPITAL pendiente. */
  SaldoPendiente: number | null
  /**
   * Lo que se trasladaría si refinancia: el capital pendiente más el interés
   * de la próxima cuota que se debe.
   *
   * Va aparte de SaldoPendiente porque son dos cosas distintas y la pantalla
   * muestra las dos. Ese interés todavía no se devengó — solo se cobra si
   * refinancia ahora — así que incluirlo en SaldoPendiente diría que debe más
   * de lo que debe.
   */
  MontoRefinanciamiento: number | null
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

  /**
   * En un refinanciamiento, lo único del monto que se puede cambiar. El saldo
   * arrastrado no: el servidor recalcula el total con el que ya tiene guardado.
   */
  MontoAdicional?: number
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
