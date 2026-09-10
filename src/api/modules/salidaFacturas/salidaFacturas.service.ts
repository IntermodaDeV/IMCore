import { httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'
import {
  ISalidaCD,
  ISalidaCDFiltros,
  ISalidaCDHistorial,
  ISalidaFactura,
  ISalidaFacturaAvance,
  ISalidaFacturaFiltros,
  ISalidaFacturaHistorial,
  ISalidaFacturaResultado,
  TipoSalidaCD,
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

  // Valida (o desvalida) TODA la factura de un golpe. UNA llamada: una factura de
  // 371 líneas con marcarLinea serían 371 peticiones desde el teléfono. El
  // servidor NO pisa lo que ya estaba contado y devuelve cuántas líneas cambiaron.
  marcarTodas: (invoiceId: string, revisado: boolean) =>
    httpClient.post<ExecutionResponse<ISalidaFacturaAvance>, { Revisado: boolean }>(
      `${schema}/Factura/${encodeURIComponent(invoiceId)}/MarcarTodas`,
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

  // ── Salida del CD: la MISMA pantalla para facturas y diarios ──────────────
  //
  // Se manda el código tal cual y el SERVIDOR decide si era factura o diario.
  // Las escrituras sí necesitan el tipo, y lo saben porque el escaneo lo trajo.

  escanearCD: (codigo: string) =>
    httpClient.get<ExecutionResponse<ISalidaCD>>(
      `${schema}/Escanear/${encodeURIComponent(codigo)}`,
      undefined,
      { timeoutMs: ESCANEO_TIMEOUT },
    ),

  marcarLineaCD: (tipo: TipoSalidaCD, codigo: string, lineNum: number, revisado: boolean) =>
    httpClient.post<ExecutionResponse<ISalidaFacturaAvance>, { Revisado: boolean }>(
      `${schema}/${tipo === 'DIARIO' ? 'Diario' : 'Factura'}/${encodeURIComponent(codigo)}/Linea/${lineNum}`,
      { Revisado: revisado },
    ),

  marcarTodasCD: (tipo: TipoSalidaCD, codigo: string, revisado: boolean) =>
    httpClient.post<ExecutionResponse<ISalidaFacturaAvance>, { Revisado: boolean }>(
      `${schema}/${tipo === 'DIARIO' ? 'Diario' : 'Factura'}/${encodeURIComponent(codigo)}/MarcarTodas`,
      { Revisado: revisado },
    ),

  completarCD: (tipo: TipoSalidaCD, codigo: string) =>
    httpClient.post<ExecutionResponse<ISalidaFacturaResultado>, {}>(
      `${schema}/${tipo === 'DIARIO' ? 'Diario' : 'Factura'}/${encodeURIComponent(codigo)}/Completar`,
      {},
    ),

  // Descartar lo que se abrió por error. NO borra: queda DESCARTADA con el
  // motivo, que el servidor EXIGE. Se puede reabrir sin perder lo contado.
  descartar: (tipo: TipoSalidaCD, codigo: string, motivo: string) =>
    httpClient.post<ExecutionResponse<ISalidaFacturaResultado>, { Motivo: string }>(
      `${schema}/${tipo}/${encodeURIComponent(codigo)}/Descartar`,
      { Motivo: motivo },
    ),

  reabrir: (tipo: TipoSalidaCD, codigo: string) =>
    httpClient.post<ExecutionResponse<ISalidaFacturaResultado>, {}>(
      `${schema}/${tipo}/${encodeURIComponent(codigo)}/Reabrir`,
      {},
    ),

  // Detalle de SOLO LECTURA, para consultar en el historial lo que llevaba una
  // factura o un diario. NO es el endpoint de escaneo: ese daria de alta el
  // registro si no existiera, y en algo ya salido devuelve el bloqueo SIN las
  // lineas, que es justo lo que aca se quiere ver.
  detalleCD: (codigo: string, tipo?: TipoSalidaCD) =>
    httpClient.get<ExecutionResponse<ISalidaCD>>(
      `${schema}/Detalle/${encodeURIComponent(codigo)}`,
      { tipo: tipo || undefined },
    ),

  // Historial unificado: facturas y diarios, con el tope aplicado en el SERVIDOR
  // sobre el conjunto ya ordenado.
  historialCD: (filtros: ISalidaCDFiltros = {}) =>
    httpClient.get<ExecutionResponse<ISalidaCDHistorial[]>>(`${schema}/HistorialCD`, {
      tipo: filtros.tipo || undefined,
      codigo: filtros.codigo || undefined,
      cliente: filtros.cliente || undefined,
      estado: filtros.estado || undefined,
      fecha: filtros.fecha || undefined,
      desde: filtros.desde || undefined,
      hasta: filtros.hasta || undefined,
      top: filtros.top ?? undefined,
    }),
}
