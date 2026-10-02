import { HttpError, httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'
import {
  IDashboard, IFinalizarResult, ILecturaServidor, ILote, ILoteResult, IMiAsignacion, IMiHistorico, IProximoInventario,
  IResumenCodigo, ISolicitudReapertura,
} from './inventarioImpulsadoras.types'

// Consume api/InventarioImpulsadoras/App/*. El usuario sale del token: nunca se manda.
const schema = 'InventarioImpulsadoras/App'

// Un lote viaja desde zonas con mala señal: si en 20 s no respondió, se da por
// perdido y se reintenta más tarde (el servidor no duplica por Uuid).
const LOTE_TIMEOUT = 20000

// El lote viaja en gzip (300 lecturas: ~55 KB → ~10 KB). Si un servidor no lo entiende
// (400/415) y el mismo lote SIN comprimir sí pasa, se deja de comprimir en esta sesión.
let loteEnGzip = true

async function enviarLote(lote: ILote) {
  const url = `${schema}/Lote`
  if (loteEnGzip) {
    try {
      return await httpClient.post<ExecutionResponse<ILoteResult>>(url, lote, { timeoutMs: LOTE_TIMEOUT, gzip: true })
    } catch (e) {
      if (!(e instanceof HttpError) || (e.status !== 400 && e.status !== 415)) throw e
      const r = await httpClient.post<ExecutionResponse<ILoteResult>>(url, lote, { timeoutMs: LOTE_TIMEOUT })
      loteEnGzip = false
      return r
    }
  }
  return httpClient.post<ExecutionResponse<ILoteResult>>(url, lote, { timeoutMs: LOTE_TIMEOUT })
}

export const inventarioImpulsadorasService = {
  // Mis asignaciones abiertas + el estado de las que el equipo tiene guardadas (ids).
  misAsignaciones: (idsLocales: number[]) =>
    httpClient.get<ExecutionResponse<IMiAsignacion[]>>(`${schema}/Asignaciones`,
      idsLocales.length ? { ids: idsLocales.join(',') } : undefined),

  enviarLote,

  // Lo que el servidor ya tiene de una asignación, por páginas (recuperar en otro equipo).
  bajarLecturas: (inventarioUsuarioId: number, desdeId: number, top = 2000) =>
    httpClient.get<ExecutionResponse<ILecturaServidor[]>>(
      `${schema}/Asignaciones/${inventarioUsuarioId}/Lecturas`, { desdeId, top }, { timeoutMs: 60000 }),

  // Histórico (últimos 90 días) y el detalle por código de una asignación: salen del SERVIDOR.
  historico: (dias = 90) =>
    httpClient.get<ExecutionResponse<IMiHistorico[]>>(`${schema}/Historico`, { dias }),

  resumen: (inventarioUsuarioId: number) =>
    httpClient.get<ExecutionResponse<IResumenCodigo[]>>(`${schema}/Asignaciones/${inventarioUsuarioId}/Resumen`),

  finalizar: (body: { InventarioUsuario_Id: number; Equipo: string; LecturasDeclaradas: number; PiezasDeclaradas: number }) =>
    httpClient.post<ExecutionResponse<IFinalizarResult>>(`${schema}/Finalizar`, body),

  // Pedir que me reabran mi parte (avisa a los admin del módulo) y arrepentirse.
  solicitarReapertura: (inventarioUsuarioId: number, motivo: string) =>
    httpClient.post<ExecutionResponse<ISolicitudReapertura>>(`${schema}/Reapertura`,
      { InventarioUsuario_Id: inventarioUsuarioId, Motivo: motivo }),

  cancelarReapertura: (solicitudId: number) =>
    httpClient.post<ExecutionResponse<{ Solicitud_Id: number; Estado: string }>>(`${schema}/Reapertura/${solicitudId}/Cancelar`),

  /** Dashboard (el mismo del web). No cuelga de App/: `mes` = 'YYYY-MM-01'. Permiso = menú invImpDashboard. */
  dashboard: (f: { companyId?: number | null; mes?: string }) =>
    httpClient.get<ExecutionResponse<IDashboard>>('InventarioImpulsadoras/Dashboard',
      { empresa: f.companyId ?? undefined, mes: f.mes }, { timeoutMs: 60000 }),

  /** Próximos inventarios en 30/60/90 días según la periodicidad (solo consulta: se programan en el web). */
  proximos: (f: { companyId?: number | null; dias: number }) =>
    httpClient.get<ExecutionResponse<IProximoInventario[]>>('InventarioImpulsadoras/Dashboard/Proximos',
      { empresa: f.companyId ?? undefined, dias: f.dias }, { timeoutMs: 60000 }),
}

/** Mensaje legible de un error de la API (el HttpError de la app solo trae «HTTP 409»). */
export function mensajeDeError(e: any): string {
  // Un 500 trae el texto técnico (SQL, red interna): a la persona solo le sirve saber que se reintenta.
  if (e instanceof HttpError && e.status >= 500) return 'El servidor tuvo un problema; intenta de nuevo en un momento'
  try {
    const body = e?.response ? JSON.parse(e.response) : null
    if (body?.ErrorMessage) return body.ErrorMessage
  } catch { /* cuerpo no JSON */ }
  return e?.message || 'Error inesperado'
}
