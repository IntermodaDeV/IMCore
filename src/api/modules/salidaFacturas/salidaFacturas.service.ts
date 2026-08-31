import { httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'
import {
  ISalidaFactura,
  ISalidaFacturaAvance,
  ISalidaFacturaFiltros,
  ISalidaFacturaHistorial,
  ISalidaFacturaResultado,
} from './salidaFacturas.types'

// Consume api/SalidaFacturas. baseUrl (API_URL) ya incluye /api/, por eso las
// rutas van como 'SalidaFacturas/...'. Todo requiere sesión (JWT): el guardia
// que escanea es el usuario autenticado.
const schema = 'SalidaFacturas'

// El escaneo puede pegarle a AX (CUSTINVOICETRANS por INVOICEID no es barato):
// la app vieja veía 30-40 s en la primera lectura de una factura. Más vale que
// el guardia espere con el spinner que cortarle la consulta a los 30 s por
// defecto y dejarlo sin poder abrir la factura.
const ESCANEO_TIMEOUT = 120000

export const salidaFacturasService = {
  // Resuelve el código escaneado (o escrito) y devuelve la factura a revisar.
  // Si ya salió del CD, Data.Bloqueada = true y no trae artículos.
  escanear: (codigo: string) =>
    httpClient.get<ExecutionResponse<ISalidaFactura>>(
      `${schema}/Factura/${encodeURIComponent(codigo)}`,
      undefined,
      { timeoutMs: ESCANEO_TIMEOUT },
    ),

  // Marca / desmarca un artículo. Devuelve el avance (revisados / total).
  marcarLinea: (invoiceId: string, lineNum: number, revisado: boolean) =>
    httpClient.post<ExecutionResponse<ISalidaFacturaAvance>, { Revisado: boolean }>(
      `${schema}/Factura/${encodeURIComponent(invoiceId)}/Linea/${lineNum}`,
      { Revisado: revisado },
    ),

  // Confirma la salida. El servidor rechaza si falta algún artículo por revisar
  // o si la factura ya salió.
  completar: (invoiceId: string) =>
    httpClient.post<ExecutionResponse<ISalidaFacturaResultado>, {}>(
      `${schema}/Factura/${encodeURIComponent(invoiceId)}/Completar`,
      {},
    ),

  // Historial de facturas revisadas / salidas (tope 200 en el servidor).
  historial: (filtros: ISalidaFacturaFiltros = {}) =>
    httpClient.get<ExecutionResponse<ISalidaFacturaHistorial[]>>(`${schema}/Historial`, {
      factura: filtros.factura || undefined,
      cliente: filtros.cliente || undefined,
      fecha: filtros.fecha || undefined,
    }),
}
