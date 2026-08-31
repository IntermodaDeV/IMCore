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
  IPayWebWeek,
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
   * Pensado para la última etapa del segundo flujo. Los montos solo vienen con
   * el acceso 'CostoHE'.
   */
  getReviewImpact: (companyCode: string, entityId: number, reviews: number[]) =>
    httpClient.post<ExecutionResponse<IOvertimeReviewImpact[]>, number[]>(
      `${schema}/ReviewImpact?companyCode=${encodeURIComponent(companyCode)}&entityId=${entityId}`,
      reviews,
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
