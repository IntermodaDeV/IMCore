// Aprobación de horas extra. El dato NO vive en IMCore: está en el esquema
// Overtime de InterfazPayWeb, lo publica IMCoreProxy y lo reenvía IMCoreApi
// (api/Overtime/*) ya con JWT.
//
// La API responde en PascalCase (PropertyNamingPolicy = null en .NET), igual
// que el resto de módulos.

/** Entidad del flujo asignada al usuario (Solicitante, Autoriza Jefe, ...). */
export interface IUserEntity {
  Id: number
  Entities_Code: string
  Name: string
  User: string

  /** Posición de la etapa dentro del flujo. */
  Order: number

  /**
   * Es la ÚLTIMA etapa del proceso: la que compromete el dinero.
   *
   * Lo resuelve el servidor. La pantalla solo recibe las entidades DEL
   * USUARIO, así que no tiene con qué saber cuál es la última del proceso, y
   * reconocerla por el nombre —'Autoriza Gerente'— se rompería con cualquier
   * renombre en AdmSys.
   */
  Es_Ultima: boolean

  /**
   * Es la PRIMERA etapa del proceso.
   *
   * En el flujo de revisión es la única que revisa a qué hora se fue de verdad
   * el empleado: las posteriores no lo revisan a él sino a esa decisión, y su
   * respuesta es sí o no. Lo resuelve el servidor por la misma razón que
   * Es_Ultima.
   */
  Es_Primera: boolean
}

/**
 * Reparto de las horas por concepto: cuántas caen en cada porcentaje de
 * recargo. Viaja serializado dentro de ConceptsJson.
 */
export interface IOvertimeConcept {
  concepto: string
  descripcion: string
  porcentaje: number | null // 0.25, 0.5, 0.75, 1 …
  hours: number
}

/**
 * Un renglón de la bandeja: el detalle de UN empleado dentro de una solicitud.
 *
 * La aprobación es por empleado y no por solicitud completa, así que dos
 * empleados del mismo correlativo son dos decisiones independientes.
 */
export interface IOvertimeRequestDetail {
  // Detalle
  Id: number
  Request_Id: number
  Employee_Code: string
  Shift_Id: number | null
  Start_Time: string | null
  End_Time: string | null
  Total_Overtime_Hours: number | null
  /**
   * Justificación escrita a mano del renglón. Dejó de capturarse cuando el
   * motivo pasó al catálogo; sigue viniendo para poder ver lo que se escribió
   * mientras el campo existió.
   */
  Detail_Comment: string | null
  Clock_In: string | null
  Clock_Out: string | null

  /**
   * Motivo. Es del DETALLE: en un mismo lote cada empleado se queda por una
   * razón distinta. En las solicitudes anteriores al cambio cae al motivo del
   * encabezado, que era donde vivía.
   */
  Category_Id: number | null

  // Encabezado
  Company_Code: string
  Correlative: string
  Calendar_Id: number
  Date: string | null
  Comment: string
  Auth: boolean

  // Catálogos
  Category_Name: string
  /** Concepto de PayRoll del motivo, cuando lo tiene configurado. */
  Category_ConceptoPR: string | null
  Employee_Name: string
  Posicion: string
  Departamento: string
  Centro_Costos: string
  Jefe_Name: string
  Cod_Planilla: string

  // Auditoría
  Create_By: string
  Solicitante: string
  Creation_Date: string | null
  Modified_By: string
  Modification_Date: string | null

  /** JSON de IOvertimeConcept[]: el reparto por porcentaje. */
  ConceptsJson: string | null
  auditJson: string | null

  /**
   * Columnas de autorización: [Entidad], Status_*, DateAuth_*, UserAuth_* y
   * Comment_*. Son dinámicas porque hay una por cada entidad configurada en el
   * proceso, así que no se pueden declarar acá.
   */
  DynamicColumns: Record<string, any>
}

/** Decisión de una entidad sobre uno o varios detalles. */
export interface IAuthorizeRequest {
  SystemEntities_Id: number
  Auth: boolean
  Comment?: string
  /** Ids de detalle sobre los que se aplica la decisión. */
  Details: number[]
}

/**
 * Un renglón de la bandeja del SEGUNDO flujo: la diferencia entre lo que se
 * solicitó y lo que registró el reloj, que RRHH decidió no resolver y mandó a
 * autorizar.
 *
 * Lo que se aprueba acá no son las horas de la solicitud —esas ya se
 * autorizaron en el primer flujo— sino la diferencia, y hay TRES horarios en
 * juego: lo solicitado, lo que dice el reloj, y lo que la primera entidad
 * revisó que de verdad pasó.
 *
 *   Primera entidad — aprueba: vale el horario que revisó (sin escribir uno,
 *                     el marcaje). rechaza: se paga lo solicitado y cierra.
 *   Segunda entidad — aprueba: confirma ese horario.
 *                     rechaza: lo descarta y vale el marcaje.
 *
 * La segunda solo interviene cuando la primera reconoce bastantes más horas de
 * las que se habían solicitado; cuántas de más se toleran lo dice
 * Tolerancia_Segunda_Firma.
 */
export interface IOvertimeReviewToAuth {
  Id: number
  RequestDetails_Id: number

  // Contexto de la solicitud original
  Request_Id: number
  Correlative: string
  Date: string | null
  Employee_Code: string
  Employee_Name: string
  Posicion: string
  Departamento: string
  Category_Name: string
  Solicitante: string

  // Lo que se pidió
  Start_Time: string | null
  End_Time: string | null
  Requested_Overtime_Hours: number | null

  // Lo que dice el reloj, congelado al momento de mandarla a autorizar
  Clock_In: string | null
  Clock_Out: string | null
  Worked_Overtime_Hours: number | null

  /** Positiva = trabajó de más; negativa = de menos; null = sin marcaje. */
  Hours_Difference: number | null

  /**
   * Lo que la PRIMERA entidad revisó que el empleado realmente se quedó. En
   * null mientras esa firma no exista.
   *
   * Son las mismas columnas que llena RRHH cuando resuelve una revisión sin
   * mandarla a autorizar: el horario real de un empleado es uno solo. Acá, en
   * una revisión todavía abierta, quieren decir 'esto es lo revisado y falta
   * confirmarlo'.
   *
   * Es el tercer número de la decisión de la segunda entidad: no elige entre
   * solicitado y marcaje, elige entre lo que revisó su colega y el reloj.
   */
  Real_Start_Time: string | null
  Real_End_Time: string | null
  Real_Overtime_Hours: number | null

  /**
   * Cuántas horas de MÁS sobre lo solicitado se pueden reconocer sin la
   * segunda firma.
   *
   * Llega el número y no un sí/no calculado: lo que escala la revisión no es el
   * marcaje sino el horario que la primera entidad está eligiendo en ese
   * momento, así que la pantalla tiene que poder avisarlo mientras lo ajusta.
   *
   * El valor sigue viviendo en un solo lugar —la configuración del backend—;
   * acá solo se compara contra él.
   */
  Tolerancia_Segunda_Firma: number

  /** JSON de IOvertimeConcept[] para cada grupo. */
  Requested_Concepts_Json: string | null
  Worked_Concepts_Json: string | null
  Real_Concepts_Json: string | null

  // Quién la mandó a autorizar y por qué
  Sent_To_Review_By: string
  Sent_To_Review_Date: string | null
  Comment: string

  auditJson: string | null
  DynamicColumns: Record<string, any>
}

/** Decisión de una entidad sobre una o varias diferencias. */
export interface IAuthorizeReview {
  SystemEntities_Id: number
  Auth: boolean
  Comment?: string
  /** Ids de revisión sobre los que se aplica la decisión. */
  Reviews: number[]
  /**
   * El horario que esta entidad revisó, revisión por revisión.
   *
   * Es OPCIONAL y solo lo puede mandar la PRIMERA entidad del flujo: las
   * etapas posteriores no revisan al empleado sino la decisión de esa primera,
   * y su respuesta es sí o no. El backend lo rechaza si no.
   *
   * Sin horario, aprobar significa reconocer el marcaje, así el lote —donde no
   * hay un horario que escribir por cada empleado— sigue teniendo un
   * significado claro.
   */
  Real_Hours?: IReviewRealHours[]
}

/**
 * El horario que una entidad determina para UNA revisión.
 *
 * Real_Start_Time va aparte aunque hoy nunca cambie —el inicio de la hora
 * extra es el fin de la jornada— porque la pantalla de RRHH sí permite moverlo.
 *
 * Real_Overtime_Hours lo manda quien firma y no se recalcula del otro lado: es
 * el mismo total que vio en pantalla.
 */
export interface IReviewRealHours {
  Reviews_Id: number
  Real_Start_Time?: string | null
  Real_End_Time: string
  Real_Overtime_Hours: number
}

/** Sobre qué revisiones se pregunta el impacto, y con qué horario. */
export interface IReviewImpactRequest {
  Reviews: number[]
  Real_Hours: IReviewRealHours[]
}

/**
 * Una fila del historial de autorizaciones.
 *
 * A diferencia del resto del módulo, este dato SÍ vive en IMCore: es la
 * bitácora local que se escribe cuando PayWeb confirma una decisión.
 *
 * Trae los dos flujos juntos porque para quien consulta es la misma pregunta:
 * qué he autorizado. Los distingue Is_Review.
 */
export interface IOvertimeHistoryRow {
  Id: number

  Type_Id: number
  /** 'Solicitud aprobada', 'Revisión rechazada', ... */
  Type_Name: string
  /** true = es del flujo de revisión de la diferencia. */
  Is_Review: boolean
  /** true = se aprobó; false = se rechazó. */
  Is_Approved: boolean

  User_Code: string
  /** Nombre de quien decidió. */
  Authorized_By: string
  /** Código de quien pidió la solicitud. */
  Requested_By: string
  /**
   * true = la decisión la tomó quien consulta. false = se la tomaron a él,
   * sobre algo que pidió. Cambia cómo se lee la fila.
   */
  Is_Mine: boolean

  SystemEntities_Id: number | null
  Creation_Date: string | null
  Company_Code: string

  RequestDetails_Id: number
  Request_Id: number | null
  Correlative: string
  /** Día de las horas extra, no el de la decisión. */
  Request_Date: string | null

  Employee_Code: string
  Employee_Name: string
  Approved_Hours: number | null
  Comment: string

  /**
   * ¿El usuario tiene el acceso 'HistoryHours'? Viene resuelto del servidor
   * para no repetir la consulta de permisos solo para decidir si se muestra
   * quién autorizó.
   */
  Can_See_All: boolean
}

// ── Dashboard de presupuesto ─────────────────────────────────────────────────

/**
 * Un área con lo que tiene presupuestado y lo que lleva gastado en horas extra.
 *
 * El nivel lo decide la pestaña: unidad de negocios, departamento o centro de
 * costos. Solo llegan las áreas que el usuario tiene configuradas en sus
 * parámetros; no las ve todas por tener el acceso a la pantalla.
 */
export interface IOvertimeBudgetRow {
  Nivel: string
  Codigo: string
  Nombre: string

  Empleados: number
  Solicitudes: number
  Detalles: number

  /** Horas PEDIDAS del período, sin importar en qué etapa del flujo van. */
  Horas: number
  /** Horas por el precio de la hora de cada empleado. */
  Costo: number
  /** Presupuesto del período consultado. */
  Presupuesto: number
  /** Presupuesto menos costo. Negativo = se pasó. */
  Disponible: number
  /** Cero cuando no hay presupuesto: se distingue mirando Presupuesto. */
  Porcentaje_Consumido: number
}

/**
 * Lo gastado en un día del período.
 *
 * El total de la semana dice cuánto se gastó; esto dice CUÁNDO. Un mismo total
 * puede ser cuatro días parejos o un martes desbocado, y solo lo segundo es un
 * problema que se puede ir a mirar.
 */
export interface IOvertimeDayTotal {
  Fecha: string
  Empleados: number
  Solicitudes: number
  Horas: number
  Costo: number

  /**
   * Quién puso el mayor gasto de ese día, en cada nivel.
   *
   * Los tres se calculan por separado y no bajando por el árbol: el
   * departamento que más gasta no siempre está dentro de la unidad que más
   * gasta. Vienen en null los días sin gasto.
   */
  Top_Unidad: string | null
  Top_Unidad_Costo: number | null
  Top_Departamento: string | null
  Top_Departamento_Costo: number | null
  Top_Centro: string | null
  Top_Centro_Costo: number | null
}

export interface IOvertimeBudgetDashboard {
  UnidadesNegocio: IOvertimeBudgetRow[]
  Departamentos: IOvertimeBudgetRow[]
  CentrosCosto: IOvertimeBudgetRow[]

  Total_Horas: number
  Total_Costo: number
  Total_Presupuesto: number
  Total_Disponible: number
  Total_Porcentaje_Consumido: number

  Total_Empleados: number
  Total_Solicitudes: number

  /** Las horas del período abiertas por banda de recargo. */
  Conceptos: IOvertimeConceptTotal[]

  /**
   * El gasto día por día. Solo vienen los días CON movimiento: la pantalla
   * conoce el rango de la semana y dibuja el hueco.
   */
  Dias: IOvertimeDayTotal[]

  /**
   * El usuario no tiene áreas configuradas. Hay que distinguirlo de "sí tiene
   * pero no hubo movimiento": los dos casos llegan con las listas vacías y el
   * mensaje que corresponde mostrar es distinto.
   */
  Sin_Areas_Configuradas: boolean
}

/**
 * Un empleado dentro del desglose de un área: qué lleva consumido del
 * presupuesto. Es el "quién" detrás de cada barra del tablero.
 */
export interface IOvertimeBudgetEmployee {
  Employee_Code: string
  Employee_Name: string
  Posicion: string
  Departamento: string
  Centro_Costos: string

  Solicitudes: number
  Detalles: number
  /** Horas ya aprobadas por todas las entidades. */
  Horas: number
  /** Costo con el recargo de cada banda ya aplicado. */
  Costo: number
  /**
   * JSON de IOvertimeConcept[] con el reparto del empleado en el período, ya
   * sumado sobre todas sus solicitudes. Se lee con parseConceptos, el mismo
   * parser de las otras pantallas.
   */
  ConceptsJson: string | null
}

/**
 * Lo que pasaría con el presupuesto de una unidad de negocios si se aprueba el
 * lote que se está por firmar.
 *
 * Solo tiene sentido mostrarlo cuando Es_Ultima_Entidad es true: hasta esa firma
 * la solicitud no compromete dinero.
 *
 * Los montos llegan en null si el usuario no tiene el acceso 'CostoHE'; los
 * porcentajes siempre vienen. Ese recorte lo hace la base, no la pantalla.
 */
/**
 * Lo que cuesta resolver una diferencia, en los dos escenarios.
 *
 * Mientras la revisión está abierta el presupuesto YA tiene contadas las horas
 * solicitadas, así que rechazar no lo mueve —no es que no cueste, es que ya
 * está contado— y aprobar lo mueve en (marcaje − solicitado).
 */
export interface IOvertimeReviewImpact {
  Es_Ultima_Entidad: boolean
  Ve_Costo: boolean
  /** La fila del presupuesto completo del usuario. */
  Es_Total: boolean

  Area_Codigo: string
  Area_Nombre: string

  Semana_Inicio: string | null
  Semana_Fin: string | null

  Empleados: number
  Horas_Solicitadas: number
  Horas_Marcaje: number
  /**
   * Las horas que quedarían reconocidas si se aprueba: el horario que revisó
   * la primera entidad, o el marcaje si no revisó ninguno.
   */
  Horas_A_Reconocer: number

  Presupuesto: number | null
  Consumido: number | null

  /** Lo que esas horas ya le cuestan al presupuesto. */
  Costo_Actual: number | null
  /** Lo que costarían al reconocer el horario revisado. */
  Costo_Si_Aprueba: number | null

  Consumido_Si_Rechaza: number | null
  Consumido_Si_Aprueba: number | null

  Porcentaje_Antes: number
  Porcentaje_Si_Aprueba: number

  /** JSON con correlativo, empleado, horas y costo de cada revisión. */
  Revisiones_Json: string | null
}

export interface IOvertimeApprovalImpact {
  Es_Ultima_Entidad: boolean
  Ve_Costo: boolean
  /** La fila del total: el presupuesto completo del usuario, no el de un área. */
  Es_Total: boolean

  /** Centro de costos del empleado: donde vive el presupuesto. */
  Area_Codigo: string
  Area_Nombre: string

  Semana_Inicio: string | null
  Semana_Fin: string | null

  Empleados: number
  Horas_Nuevas: number

  Presupuesto: number | null
  Consumido: number | null
  /** Lo que cuesta el lote que se está por firmar. */
  Costo_Nuevo: number | null
  Consumido_Despues: number | null

  Porcentaje_Antes: number
  Porcentaje_Despues: number

  /** JSON con employee_Code, employee_Name, horas y costo. */
  Empleados_Json: string | null
}

/**
 * Una banda de recargo con lo que acumuló en el período.
 *
 * Son las MISMAS horas del total del tablero, abiertas por concepto: las horas
 * de todas las bandas suman el total.
 */
export interface IOvertimeConceptTotal {
  Concepto: string
  Descripcion: string
  /** Fracción, no entero: 0.25 es 25%. */
  Porcentaje: number | null
  Horas: number
  Costo: number
}

/**
 * Una semana del calendario de PLANILLA, que no coincide con la natural: es la
 * que define el período de horas extra y la misma que usan las pantallas web.
 */
export interface IPayWebWeek {
  Year: number
  Month: number
  MonthName: string
  WeekNumber: number
  SemesterNumber: number
  InitialDate: string | null
  FinalDate: string | null
  IsCurrentWeek: boolean
  IsPastWeek: boolean
  IsFutureWeek: boolean
}

// ── Crear una solicitud ─────────────────────────────────────────────────────
//
// Lo que necesita PEDIR horas extra, que es otra cosa que aprobarlas: hay que
// ofrecer el catálogo de motivos, la gente a cargo, el horario del turno de
// cada uno —para saber a qué hora empieza la hora extra— y las bandas de
// recargo con las que se reparte.
//
// La empresa y el usuario NO viajan en ningún cuerpo: salen del token del lado
// del servidor, igual que en el resto del módulo.

/** Motivo del catálogo. Se elige uno POR EMPLEADO y es obligatorio. */
export interface IOvertimeReason {
  Id: number
  Company_Code: string
  Name: string
  Description: string | null
  /** Concepto de PayRoll con el que se paga este motivo. Opcional. */
  Cod_ConceptoPR: string | null
  IsActive: boolean
}

/**
 * Un empleado que se puede meter en la solicitud.
 *
 * Sirve para las dos listas —los que están a cargo y los prestados de la
 * unidad— porque son la misma forma con distinta procedencia. Turno_Id es la
 * llave del horario: sin él no se sabe a qué hora termina su jornada, que es
 * donde empieza su hora extra.
 */
export interface IOvertimeEmployee {
  Company_Code: string
  Employee_Code: string
  Code_Alterno: string
  Employee_Name: string
  Name: string

  Unidad_Negocios: string
  Business_Unit: string
  Departamento: string
  cod_Departamento: string
  Centro_Costos: string
  cod_c_costos: string
  Posicion: string
  cod_Posicion: string
  Jefe_Code: string
  Jefe_Name: string

  /** Parte de la llave de las bandas de recargo. */
  Cod_Planilla: string
  Planilla: string
  Turno_Id: number | null
  Nivel: number

  /** Solo lo llena la lista de prestados, que es donde se agrupa por módulo. */
  Modulo_Id: number | null
  Modulo_Nombre: string | null
}

/**
 * Empleado que ya tiene horas extra pedidas para una fecha.
 *
 * Un empleado no puede estar en dos solicitudes del mismo día. Esto existe
 * para avisarlo al elegir la gente, y no cuando el guardado falla después de
 * haber capturado todas las horas.
 */
export interface IOvertimeEmployeeWithRequest {
  Employee_Code: string
  Correlative: string
  /** Quién hizo esa solicitud, para saber a quién reclamarle. */
  Solicitante: string
}

/**
 * Horario de un turno para un día de la semana. ScheduleDay: 0=Lunes … 6=Domingo.
 *
 * Las horas vienen como texto ('16:30:00'). IsLaborable es 'S'/'N': un día no
 * laborable es el caso en que la hora de inicio la captura el usuario, en lugar
 * de tomarla del fin de la jornada.
 */
export interface IOvertimeShiftSchedule {
  ShiftId: number
  ShiftDescription: string
  CompanyCode: string
  IsActive: boolean
  /** TurnoDetalleId: la otra mitad de la llave de las bandas. */
  ShiftScheduleId: number
  ScheduleDay: number
  ShiftStart: string | null
  ShiftEnd: string | null
  LunchStart: string | null
  LunchEnd: string | null
  ScheduleHours: number | null
  IsLaborable: string | null
  RequiresClocking: boolean
}

/**
 * Banda de recargo: el tramo de horas al que corresponde un concepto y su
 * porcentaje. Los nombres en minúscula son los del procedimiento.
 */
export interface IOvertimeParameter {
  ParametroId: number
  CodEmpresa: string
  horaEntrada: string | null
  horaSalida: string | null
  concepto: string
  descripcion: string
  cod_tip_planilla: string
  porcentaje: number | null
  tiempoAjuste: number | null
  /** A qué combinación de turno pertenece la banda. Lo rellena el servidor. */
  TurnoId: number
  TurnoDetalleId: number
}

/** Planilla + turno + detalle de turno: la llave con la que se piden las bandas. */
export interface IShiftParameterKey {
  Planilla: string
  TurnoId: number
  TurnoDetalleId: number
}

export interface ISaveOvertimeConcept {
  Concepto: string | null
  Descripcion: string | null
  Porcentaje: number | null
  Hours: number
  ParametroId: number | null
}

/** Un empleado con su rango de horas extra. */
export interface ISaveOvertimeDetail {
  Employee_Code: string
  /** Motivo de ESTA hora extra. Obligatorio; lo valida el servidor. */
  Category_Id: number | null
  Shift_Id: number | null
  /**
   * Fecha y hora completas, no hora sola: una hora extra que cruza la
   * medianoche termina el día siguiente.
   */
  Start_Time: string
  End_Time: string
  Total_Overtime_Hours: number | null
  Concepts: ISaveOvertimeConcept[]
}

export interface ISaveOvertimeHeader {
  /** 0 o menos = nueva. Mayor que 0 = edita esa solicitud. */
  Id: number
  Date: string
  Comment: string | null
  /**
   * El solicitante autoriza al crear: con esto la solicitud arranca el flujo y
   * deja de ser editable.
   */
  Auth: boolean
  /** Entidad con la que actúa: la de Solicitante. */
  SystemEntities_Id: number | null
}

export interface ISaveOvertimeRequest {
  Header: ISaveOvertimeHeader
  Details: ISaveOvertimeDetail[]
}

/** Además del sobre habitual, qué solicitud quedó guardada. */
export interface ISaveOvertimeRequestResult {
  Request_Id: number
  Correlative: string
  Success: boolean
  SuccessMessage: string
  ErrorMessage: string
}

/**
 * Un parámetro del usuario.
 *
 * A la pantalla de creación le importan OT_DAYS_BEFORE_CREATE y
 * OT_DAYS_AFTER_CREATE: el rango de fechas en el que puede pedir. Sin el
 * parámetro configurado NO hay restricción — la ausencia es "sin límite", no
 * cero.
 */
export interface IOvertimeUserParameter {
  Id: number
  Company_Code: string
  User_Code: string
  Category: string
  KeyVar: string
  Name: string
  Value: string
  ValueStr: string | null
  IsActive: boolean
}
