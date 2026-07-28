import { httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'
import { IDiario, ILinea, IAxResult, ICrearDiario, IAgregarLinea, ICosto, ICostoPorTicket } from './repuestos.types'

// Consume los endpoints de api/Repuestos. baseUrl (API_URL) ya incluye /api/,
// por eso las rutas van como 'Repuestos/...'. Todo requiere sesión (JWT).
const schema = 'Repuestos'

// El AX puede tardar (net.tcp interno): subimos el timeout de las escrituras.
const AX_TIMEOUT = 60000

export const repuestosService = {
  // Diarios del usuario autenticado (desde IMCore).
  getDiarios: () =>
    httpClient.get<ExecutionResponse<IDiario[]>>(`${schema}/Diarios`),

  // Líneas del diario (AX) enriquecidas con el ticket local.
  getLineas: (journalId: string, company = 'IMHN') =>
    httpClient.get<ExecutionResponse<ILinea[]>>(
      `${schema}/Diarios/${encodeURIComponent(journalId)}/Lineas`,
      { company },
      { timeoutMs: AX_TIMEOUT },
    ),

  // Crea un diario (AX + persistencia local). Devuelve AxResult con el JournalId real.
  crearDiario: (data: ICrearDiario, company = 'IMHN') =>
    httpClient.post<ExecutionResponse<IAxResult>, ICrearDiario>(
      `${schema}/Diarios?company=${company}`,
      data,
      { timeoutMs: AX_TIMEOUT },
    ),

  // Agrega una línea (repuesto escaneado) ligada a un ticket. Regla del backend:
  // local-PENDIENTE → AX → CONFIRMADO (o revertir); si AX no responde queda PENDIENTE.
  agregarLinea: (journalId: string, data: IAgregarLinea, company = 'IMHN') =>
    httpClient.post<ExecutionResponse<IAxResult>, IAgregarLinea>(
      `${schema}/Diarios/${encodeURIComponent(journalId)}/Lineas?company=${company}`,
      data,
      { timeoutMs: AX_TIMEOUT },
    ),

  // Borra una línea del diario (AX + local). Requiere el itemId (SKU resuelto) y el LineNum.
  borrarLinea: (journalId: string, itemId: string, lineNum: number, company = 'IMHN') =>
    httpClient.delete<ExecutionResponse<IAxResult>>(
      `${schema}/Diarios/${encodeURIComponent(journalId)}/Lineas`,
      { itemId, lineNum, company },
      { timeoutMs: AX_TIMEOUT },
    ),

  // Postea el diario (ejecuta la rebaja en AX). Cuerpo vacío {} para garantizar
  // Content-Length (IIS lo exige en POST sin body).
  postear: (journalId: string, company = 'IMHN') =>
    httpClient.post<ExecutionResponse<IAxResult>, {}>(
      `${schema}/Diarios/${encodeURIComponent(journalId)}/Postear?company=${company}`,
      {},
      { timeoutMs: AX_TIMEOUT },
    ),

  // Costo unitario de referencia (promedio AX) por barcode. Degrada si el proxy aún no lo expone.
  getCosto: (barcode: string, company = 'IMHN') =>
    httpClient.get<ExecutionResponse<ICosto>>(`${schema}/Costo`, { barcode, company }, { timeoutMs: AX_TIMEOUT }),

  // Costo total de repuestos por ticket (opcional: por diario / solo míos).
  getCostosPorTicket: (journalId?: string, soloMios = false) =>
    httpClient.get<ExecutionResponse<ICostoPorTicket[]>>(`${schema}/Costos/PorTicket`, { journalId, soloMios }),
}
