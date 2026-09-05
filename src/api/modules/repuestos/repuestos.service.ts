import { httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'
import { IDiario, ILinea, IAxResult, ICrearDiario, IAgregarLinea, ICosto, ICostoPorTicket, ISuministroPorCentroCosto, IRepuestoPorActivo, IConsumoItem } from './repuestos.types'

// Consume los endpoints de api/Repuestos. baseUrl (API_URL) ya incluye /api/,
// por eso las rutas van como 'Repuestos/...'. Todo requiere sesión (JWT).
const schema = 'Repuestos'

// El AX puede tardar (net.tcp interno): subimos el timeout de las escrituras.
const AX_TIMEOUT = 60000
// Lecturas: fallar más rápido para no dejar la pantalla "cargando" ante un
// tropiezo intermitente de AX dev; el usuario reintenta.
const READ_TIMEOUT = 30000

export const repuestosService = {
  // Diarios del usuario autenticado (desde IMCore). Filtro opcional por rango de creación
  // (ISO local 'YYYY-MM-DDTHH:mm:ss'): @Desde inclusivo, @Hasta exclusivo.
  getDiarios: (desde?: string, hasta?: string) =>
    httpClient.get<ExecutionResponse<IDiario[]>>(`${schema}/Diarios`, { desde, hasta }),

  // Líneas del diario (AX) enriquecidas con el ticket local.
  getLineas: (journalId: string, company = 'IMHN') =>
    httpClient.get<ExecutionResponse<ILinea[]>>(
      `${schema}/Diarios/${encodeURIComponent(journalId)}/Lineas`,
      { company },
      { timeoutMs: READ_TIMEOUT },
    ),

  // Consumo de repuestos por activo (maquina) en el periodo.
  getRepuestosPorActivo: (desde?: string, hasta?: string) =>
    httpClient.get<ExecutionResponse<IRepuestoPorActivo[]>>(
      `${schema}/Repuestos/PorActivo`, { desde, hasta }, { timeoutMs: READ_TIMEOUT }),

  // Consumo por articulo. tipo = 'REPUESTO' | 'SUMINISTRO'. "Mas consumido" se mide
  // en UNIDADES que salieron del almacen; el costo es referencia.
  getConsumoPorItem: (tipo: 'REPUESTO' | 'SUMINISTRO', desde?: string, hasta?: string) =>
    httpClient.get<ExecutionResponse<IConsumoItem[]>>(
      `${schema}/Consumo/PorItem`, { tipo, desde, hasta }, { timeoutMs: READ_TIMEOUT }),

  // Consumo de suministros por centro de costo en un periodo (KPI aparte del de
  // repuestos). Fechas ISO local 'YYYY-MM-DDTHH:mm:ss': desde inclusivo, hasta exclusivo.
  getSuministrosPorCentroCosto: (desde?: string, hasta?: string) =>
    httpClient.get<ExecutionResponse<ISuministroPorCentroCosto[]>>(
      `${schema}/Suministros/PorCentroCosto`,
      { desde, hasta },
      { timeoutMs: READ_TIMEOUT },
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
