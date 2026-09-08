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
    code: string,
    level: string,
    startDate?: string,
    finalDate?: string,
  ) =>
    httpClient.get<ExecutionResponse<IOvertimeBudgetEmployee[]>>(`${schema}/BudgetEmployees`, {
      companyCode,
      code,
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
