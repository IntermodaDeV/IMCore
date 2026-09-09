import { httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'
import {
  IAuthorizeRequest,
  IAuthorizeReview,
  IOvertimeHistoryRow,
  IOvertimeRequestDetail,
  IOvertimeReviewToAuth,
  IOvertimeApprovalImpact,
  IOvertimeReviewImpact,
  IOvertimeBudgetDashboard,
  IOvertimeBudgetTotals,
  IOvertimeBudgetRow,
  IOvertimeDayTotal,
  IOvertimeMealAreaRow,
  IOvertimeMealBudget,
  IOvertimeMealDay,
  IOvertimeMealWeek,
  IOvertimeTopEmployee,
  IOvertimeTopEmployeeDay,
  IOvertimeTopRequester,
  IOvertimeMealEmployee,
  IOvertimeWeekRange,
  IOvertimeWeekTotal,
  IOvertimeBudgetEmployee,
  IOvertimeEmployee,
  IOvertimeEmployeeWithRequest,
  IOvertimeParameter,
  IOvertimeReason,
  IOvertimeShiftSchedule,
  IOvertimeUserParameter,
  IPayWebWeek,
  IReviewImpactRequest,
  IReviewRealHours,
  ISaveOvertimeRequest,
  ISaveOvertimeRequestResult,
  IShiftParameterKey,
  IUserEntity,
} from './overtime.types'

// Consume los endpoints de api/Overtime (IMCoreApi reenvía a IMCoreProxy → BD de
// InterfazPayWeb). baseUrl ya incluye /api/, por eso la ruta va como 'Overtime/…'.
//
// El usuario NO viaja: sale del token del lado del servidor. Solo se manda la
// empresa y la entidad con la que se está consultando.
const schema = 'Overtime'

export const overtimeService = {
  /** Entidades del usuario en el flujo de solicitudes. */
  getRequestEntities: (companyCode: string) =>
    httpClient.get<ExecutionResponse<IUserEntity[]>>(`${schema}/RequestEntities`, {
      companyCode,
    }),

  /**
   * Solicitudes pendientes de aprobar por la entidad indicada.
   * Es una cola de trabajo: no recibe fechas y no trae lo ya resuelto.
   */
  getRequestDetails: (companyCode: string, idAccess: number, canCompleteData = false) =>
    httpClient.get<ExecutionResponse<IOvertimeRequestDetail[]>>(`${schema}/Request`, {
      companyCode,
      idAccess,
      canCompleteData,
    }),

  // ── Solicitante: pedir horas extra ────────────────────────────────────────

  /**
   * La entidad con la que el usuario puede CREAR solicitudes: el Solicitante.
   *
   * Es justo la que getRequestEntities NO devuelve —ahí se entra a firmar y
   * acá a pedir—. Lista vacía = el usuario no puede crear solicitudes.
   */
  getRequestorEntities: (companyCode: string) =>
    httpClient.get<ExecutionResponse<IUserEntity[]>>(`${schema}/RequestorEntities`, {
      companyCode,
    }),

  /**
   * Las solicitudes de una semana con el estado de cada entidad.
   *
   * No es la bandeja de aprobación: filtra por semana y trae también lo
   * aprobado y lo rechazado, que es lo que hace falta para ver en qué quedó lo
   * que uno pidió. Entrando con la entidad de Solicitante, el servidor recorta
   * a lo creado por el propio usuario.
   */
  getMyRequests: (
    companyCode: string,
    idAccess: number,
    startDate?: string,
    finalDate?: string,
  ) =>
    httpClient.get<ExecutionResponse<IOvertimeRequestDetail[]>>(`${schema}/MyRequests`, {
      companyCode,
      idAccess,
      startDate,
      finalDate,
    }),

  /**
   * Motivos de horas extra. Se elige uno POR EMPLEADO y es obligatorio.
   *
   * Vienen también los inactivos, al final: una solicitud anterior puede
   * seguir amarrada a uno y sin él en la lista ese renglón se vería vacío.
   */
  getReasons: (companyCode: string) =>
    httpClient.get<ExecutionResponse<IOvertimeReason[]>>(`${schema}/Reasons`, {
      companyCode,
    }),

  /** Empleados a cargo del usuario, directos e indirectos. */
  getEmployeesInCharge: (companyCode: string) =>
    httpClient.get<ExecutionResponse<IOvertimeEmployee[]>>(`${schema}/EmployeesInCharge`, {
      companyCode,
    }),

  /**
   * Operarios de su unidad que NO están a su cargo: los prestados.
   *
   * Viene vacío sin el acceso 'OtrosEmpleados'. Ese recorte lo hace la base,
   * así que vacío es una respuesta válida y el paso simplemente no se ofrece.
   */
  getOtherEmployees: (companyCode: string) =>
    httpClient.get<ExecutionResponse<IOvertimeEmployee[]>>(`${schema}/OtherEmployees`, {
      companyCode,
    }),

  /**
   * Quiénes ya tienen horas extra pedidas para esa fecha.
   *
   * Un empleado no puede estar en dos solicitudes del mismo día. Sirve para
   * avisarlo al elegir la gente y no cuando el guardado falla, después de
   * haber capturado todas las horas.
   */
  getEmployeesWithRequest: (companyCode: string, date: string, requestId?: number) =>
    httpClient.get<ExecutionResponse<IOvertimeEmployeeWithRequest[]>>(
      `${schema}/EmployeesWithRequest`,
      { companyCode, date, requestId },
    ),

  /**
   * Horario de cada turno para un día de la semana (0=Lunes … 6=Domingo).
   *
   * Es lo que dice a qué hora empieza la hora extra: arranca donde termina la
   * jornada. Un día no laborable viene con IsLaborable distinto de 'S', y ahí
   * la hora de inicio la captura el usuario.
   */
  getShiftSchedules: (companyCode: string, scheduleDay: number) =>
    httpClient.get<ExecutionResponse<IOvertimeShiftSchedule[]>>(`${schema}/ShiftSchedules`, {
      companyCode,
      scheduleDay,
    }),

  /**
   * Bandas de recargo por planilla + turno + detalle de turno.
   *
   * Todas las combinaciones en una sola llamada: varios empleados comparten
   * turno y planilla, así que se pide una vez por combinación distinta.
   */
  getOvertimeParameters: (companyCode: string, keys: IShiftParameterKey[]) =>
    httpClient.post<ExecutionResponse<IOvertimeParameter[]>, { Keys: IShiftParameterKey[] }>(
      `${schema}/OvertimeParameters?companyCode=${encodeURIComponent(companyCode)}`,
      { Keys: keys },
    ),

  /**
   * Parámetros del usuario. Entre ellos el rango de fechas en el que puede
   * pedir (OT_DAYS_BEFORE_CREATE / OT_DAYS_AFTER_CREATE).
   *
   * Sin el parámetro configurado NO hay restricción: la ausencia es "sin
   * límite", no cero.
   */
  getMyParameters: (companyCode: string) =>
    httpClient.get<ExecutionResponse<IOvertimeUserParameter[]>>(`${schema}/MyParameters`, {
      companyCode,
    }),

  /**
   * Guarda la solicitud completa: encabezado, empleados y el reparto por
   * concepto de cada uno, en una sola transacción.
   *
   * Todas las validaciones son del servidor —empleados repetidos, horas que se
   * enciman con la jornada, motivo faltante, el rango de fechas del usuario,
   * el empleado que ya tiene solicitud ese día— y el motivo viene en
   * ErrorMessage. El correlativo lo genera él.
   */
  saveRequest: (companyCode: string, info: ISaveOvertimeRequest) =>
    httpClient.post<ISaveOvertimeRequestResult, ISaveOvertimeRequest>(
      `${schema}/SaveRequest?companyCode=${encodeURIComponent(companyCode)}`,
      info,
    ),

  /**
   * Quita a un empleado de la solicitud (baja lógica). Si era el último, el
   * encabezado también queda eliminado.
   */
  deleteRequestDetail: (companyCode: string, requestDetailsId: number) =>
    httpClient.put<ExecutionResponse<any>, { RequestDetails_Id: number }>(
      `${schema}/RequestDetail?companyCode=${encodeURIComponent(companyCode)}`,
      { RequestDetails_Id: requestDetailsId },
    ),

  /** Elimina la solicitud completa. Solo procede si ninguna entidad actuó. */
  deleteRequest: (companyCode: string, requestId: number) =>
    httpClient.put<ExecutionResponse<any>, { Id: number }>(
      `${schema}/DeleteRequest?companyCode=${encodeURIComponent(companyCode)}`,
      { Id: requestId },
    ),

  /**
   * detalles indicados.
   *
   * Pensado para la última etapa del flujo, que es la que compromete el dinero.
   * Los montos solo vienen con el acceso 'CostoHE'.
   */
  getApprovalImpact: (companyCode: string, entityId: number, details: number[]) =>
    httpClient.post<ExecutionResponse<IOvertimeApprovalImpact[]>, number[]>(
      `${schema}/ApprovalImpact?companyCode=${encodeURIComponent(companyCode)}&entityId=${entityId}`,
      details,
    ),

  /**
   * Lo que cuesta resolver una diferencia, en los dos escenarios.
   *
   * Solo trae números cuando la firma RESUELVE la revisión: si se queda
   * esperando otra etapa, todavía no compromete presupuesto. Los montos solo
   * vienen con el acceso 'CostoHE'.
   *
   * `realHours` es el horario que la primera entidad está escribiendo y que
   * todavía no se guardó. Sin él, el escenario 'si apruebas' costearía el
   * marcaje mientras la persona firma otra cosa.
   */
  getReviewImpact: (
    companyCode: string,
    entityId: number,
    reviews: number[],
    realHours: IReviewRealHours[] = [],
  ) =>
    httpClient.post<ExecutionResponse<IOvertimeReviewImpact[]>, IReviewImpactRequest>(
      `${schema}/ReviewImpact?companyCode=${encodeURIComponent(companyCode)}&entityId=${entityId}`,
      { Reviews: reviews, Real_Hours: realHours },
    ),

  /** Aprueba o rechaza los detalles indicados. */
  authorizeRequest: (companyCode: string, info: IAuthorizeRequest) =>
    httpClient.post<ExecutionResponse<any>, IAuthorizeRequest>(
      `${schema}/AuthorizeRequest?companyCode=${encodeURIComponent(companyCode)}`,
      info,
    ),

  // ── Segundo flujo: la diferencia contra el marcaje ─────────────────────────

  /** Entidades del usuario en el flujo de revisión. Son otras, no las del primero. */
  getReviewEntities: (companyCode: string) =>
    httpClient.get<ExecutionResponse<IUserEntity[]>>(`${schema}/ReviewEntities`, {
      companyCode,
    }),

  /**
   * Diferencias pendientes de autorizar por la entidad indicada.
   * Misma idea que el listado del primer flujo: cola de trabajo, sin fechas.
   */
  getReviewsToAuth: (companyCode: string, idAccess: number, canCompleteData = false) =>
    httpClient.get<ExecutionResponse<IOvertimeReviewToAuth[]>>(`${schema}/ReviewsToAuth`, {
      companyCode,
      idAccess,
      canCompleteData,
    }),

  /** Aprueba o rechaza las diferencias indicadas. */
  authorizeReview: (companyCode: string, info: IAuthorizeReview) =>
    httpClient.post<ExecutionResponse<any>, IAuthorizeReview>(
      `${schema}/AuthorizeReview?companyCode=${encodeURIComponent(companyCode)}`,
      info,
    ),

  // ── Historial ─────────────────────────────────────────────────────────────

  /**
   * Lo que el usuario ha autorizado, de los dos flujos.
   *
   * No lleva empresa: la bitácora es de IMCore y se filtra por usuario. Con el
   * acceso 'HistoryHours' el servidor devuelve el de todos; esa decisión no se
   * toma acá.
   */
  getHistorial: (startDate?: string, finalDate?: string) =>
    httpClient.get<ExecutionResponse<IOvertimeHistoryRow[]>>(`${schema}/History`, {
      startDate,
      finalDate,
    }),

  // ── Dashboard de presupuesto ──────────────────────────────────────────────

  /**
   * Gasto contra presupuesto de las áreas del usuario, en los tres niveles.
   *
   * Los tres vienen en una sola llamada a propósito: la pantalla los muestra en
   * pestañas y pedirlos por separado dejaría cada una mirando un momento
   * distinto del mismo período.
   */
  /**
   * Solo los totales del periodo: lo que dibuja la dona del presupuesto.
   *
   * Va aparte de getBudgetDashboard a proposito. Ese sobre trae los tres cortes
   * y cuesta cinco ejecuciones del procedimiento mas caro del modulo; la dona
   * necesita una. Cada tarjeta del tablero pide lo suyo y se refresca sola.
   */
  getBudgetTotals: (companyCode: string, startDate?: string, finalDate?: string) =>
    httpClient.get<ExecutionResponse<IOvertimeBudgetTotals>>(`${schema}/BudgetTotals`, {
      companyCode,
      startDate,
      finalDate,
    }),

  /**
   * El presupuesto por area de UN corte.
   *
   * La pantalla dibuja un corte a la vez, asi que traer los tres seria pagar
   * tres ejecuciones del procedimiento para mostrar una. Cambiar de pastilla
   * pide el que se necesita.
   */
  getBudgetAreas: (
    companyCode: string,
    level: string,
    startDate?: string,
    finalDate?: string,
  ) =>
    httpClient.get<ExecutionResponse<IOvertimeBudgetRow[]>>(`${schema}/BudgetAreas`, {
      companyCode,
      level,
      startDate,
      finalDate,
    }),

  /**
   * El gasto dia por dia del periodo, con el mayor aportante de cada dia.
   *
   * Solo vienen los dias CON movimiento: la pantalla conoce el rango de la
   * semana y dibuja el hueco.
   */
  getBudgetDays: (companyCode: string, startDate?: string, finalDate?: string) =>
    httpClient.get<ExecutionResponse<IOvertimeDayTotal[]>>(`${schema}/BudgetDays`, {
      companyCode,
      startDate,
      finalDate,
    }),

  /**
   * El comparativo por semana: cuanto se gasto en cada una de las que se pasan.
   *
   * Va por POST y no por GET porque el cuerpo es una lista de rangos: en la
   * query string tendria que ir como JSON codificado, que es peor de leer y de
   * depurar. Es una lectura: no cambia nada.
   */
  getBudgetWeeks: (companyCode: string, weeks: IOvertimeWeekRange[]) =>
    httpClient.post<ExecutionResponse<IOvertimeWeekTotal[]>, IOvertimeWeekRange[]>(
      `${schema}/BudgetWeeks?companyCode=${encodeURIComponent(companyCode)}`,
      weeks,
    ),

  /**
   * El presupuesto de ALIMENTACION del periodo y cuanto lleva gastado.
   *
   * Otra bolsa del mismo cubo: TipoCuenta 'ALIMENTACION'. Lo gastado son las
   * raciones otorgadas por el valor de la racion, que vive en la configuracion
   * del modulo del lado del servidor.
   */
  getMealBudget: (companyCode: string, startDate?: string, finalDate?: string) =>
    httpClient.get<ExecutionResponse<IOvertimeMealBudget>>(`${schema}/MealBudget`, {
      companyCode,
      startDate,
      finalDate,
    }),

  /**
   * El reparto de ALIMENTACION por area, de UN corte.
   *
   * Paralelo de getBudgetAreas sobre la otra bolsa, y por la misma razon pide
   * un corte a la vez: la pantalla dibuja uno.
   */
  getMealAreas: (
    companyCode: string,
    level: string,
    startDate?: string,
    finalDate?: string,
  ) =>
    httpClient.get<ExecutionResponse<IOvertimeMealAreaRow[]>>(`${schema}/MealAreas`, {
      companyCode,
      level,
      startDate,
      finalDate,
    }),

  /**
   * Quienes recibieron alimentacion en un rango.
   *
   * Sirve para un dia y para una semana: lo unico que cambia son las fechas. El
   * area es OPCIONAL; omitirla trae todas las del alcance.
   */
  getMealEmployees: (
    companyCode: string,
    startDate?: string,
    finalDate?: string,
    code?: string,
    level?: string,
  ) =>
    httpClient.get<ExecutionResponse<IOvertimeMealEmployee[]>>(`${schema}/MealEmployees`, {
      companyCode,
      startDate,
      finalDate,
      code: code || undefined,
      level,
    }),

  /** Las raciones de alimentacion de cada dia del periodo. */
  getMealDays: (companyCode: string, startDate?: string, finalDate?: string) =>
    httpClient.get<ExecutionResponse<IOvertimeMealDay[]>>(`${schema}/MealDays`, {
      companyCode,
      startDate,
      finalDate,
    }),

  /**
   * El comparativo de ALIMENTACION por semana.
   *
   * Por POST y no por GET por lo mismo que getBudgetWeeks: el cuerpo es una
   * lista de rangos. Es una lectura: no cambia nada.
   */
  getMealWeeks: (companyCode: string, weeks: IOvertimeWeekRange[]) =>
    httpClient.post<ExecutionResponse<IOvertimeMealWeek[]>, IOvertimeWeekRange[]>(
      `${schema}/MealWeeks?companyCode=${encodeURIComponent(companyCode)}`,
      weeks,
    ),

  /**
   * Los solicitantes con mas horas extra aprobadas del periodo.
   *
   * Vienen de mas a menos horas y vienen TODOS: la pantalla decide cuantos
   * dibuja.
   */
  getTopRequesters: (companyCode: string, startDate?: string, finalDate?: string) =>
    httpClient.get<ExecutionResponse<IOvertimeTopRequester[]>>(`${schema}/TopRequesters`, {
      companyCode,
      startDate,
      finalDate,
    }),

  /**
   * El empleado con mas horas extra de cada area del corte pedido.
   *
   * Solo las areas CON horas: donde nadie se quedo no hay a quien senalar. Es
   * distinto del tablero de presupuesto, donde un area sin gasto si es
   * informacion porque tiene presupuesto asignado.
   */
  getTopEmployeeByArea: (
    companyCode: string,
    level: string,
    startDate?: string,
    finalDate?: string,
  ) =>
    httpClient.get<ExecutionResponse<IOvertimeTopEmployee[]>>(`${schema}/TopEmployeeByArea`, {
      companyCode,
      level,
      startDate,
      finalDate,
    }),

  /**
   * El empleado con mas horas extra de cada dia del periodo.
   *
   * Vuelven TODOS los dias del rango, con movimiento o sin el: un dia vacio es
   * informacion. Esos llegan con el empleado en blanco.
   */
  getTopEmployeeByDay: (companyCode: string, startDate?: string, finalDate?: string) =>
    httpClient.get<ExecutionResponse<IOvertimeTopEmployeeDay[]>>(
      `${schema}/TopEmployeeByDay`,
      { companyCode, startDate, finalDate },
    ),

  getBudgetDashboard: (companyCode: string, startDate?: string, finalDate?: string) =>
    httpClient.get<ExecutionResponse<IOvertimeBudgetDashboard>>(`${schema}/BudgetDashboard`, {
      companyCode,
      startDate,
      finalDate,
    }),

  /**
   * Los empleados que consumen el presupuesto de un área.
   *
   * El área se valida contra el alcance del usuario en la base: mandar un
   * código ajeno devuelve vacío, no los datos de otra gente.
   */
  getBudgetEmployees: (
    companyCode: string,
    /**
     * Codigo del area. OMITIRLO = todas las del alcance del usuario, que es lo
     * que pide el desglose de un DIA: ahi la gente viene de varias areas y el
     * corte es la fecha.
     */
    code: string | undefined,
    level: string,
    startDate?: string,
    finalDate?: string,
  ) =>
    httpClient.get<ExecutionResponse<IOvertimeBudgetEmployee[]>>(`${schema}/BudgetEmployees`, {
      companyCode,
      // Vacia se manda como `undefined` y el parametro desaparece de la URL, en
      // lugar de viajar como `code=`. No es lo mismo: con el parametro presente
      // y vacio, el enlazador de .NET lo convierte a null y una firma no
      // anulable lo rechaza con 'The code field is required' antes de llegar al
      // controlador. Sin el parametro, el valor por omision entra limpio.
      code: code || undefined,
      level,
      startDate,
      finalDate,
    }),

  /**
   * Semanas del calendario de planilla, para el filtro del dashboard.
   *
   * Por omisión SIN semanas futuras, igual que PayWeb: un tablero de gasto
   * ejecutado sobre una semana que todavía no ocurre siempre daría cero.
   */
  getCalendarWeeks: (companyCode: string, year?: number, includeFutureWeeks = false) =>
    httpClient.get<ExecutionResponse<IPayWebWeek[]>>(`${schema}/CalendarWeeks`, {
      companyCode,
      year,
      includeFutureWeeks,
    }),
}
