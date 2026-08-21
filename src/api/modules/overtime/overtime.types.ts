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
  Clock_In: string | null
  Clock_Out: string | null

  // Encabezado
  Company_Code: string
  Correlative: string
  Calendar_Id: number
  Category_Id: number
  Date: string | null
  Comment: string
  Auth: boolean

  // Catálogos
  Category_Name: string
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
 * autorizaron en el primer flujo— sino la diferencia: aprobar reconoce las
 * horas del marcaje, rechazar deja las que se habían solicitado.
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

  /** JSON de IOvertimeConcept[] para cada grupo. */
  Requested_Concepts_Json: string | null
  Worked_Concepts_Json: string | null

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
export interface IOvertimeApprovalImpact {
  Es_Ultima_Entidad: boolean
  Ve_Costo: boolean

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
