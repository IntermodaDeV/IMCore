import { HttpError, httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'
import { ICentroEncabezado, IConfirmarVariosRequest, IMiCentro, IPlaza, IPlazaRequest } from './presupuesto.types'

// Consume api/Presupuesto (IMCoreApi): lo mismo que «Mis centros de costo» del web. El usuario sale del token y la
// seguridad la hacen los SP: lo que no le toca vuelve vacío (lecturas) o con Success = false (escrituras).
const schema = 'Presupuesto'

type R<T> = Promise<ExecutionResponse<T>>

const centro = (corridaId: number, cc: string, grupo: number) =>
  `${schema}/Corridas/${corridaId}/Centro/${encodeURIComponent(cc)}/${grupo}`

export const presupuestoService = {
  misCentros: (corridaId?: number): R<IMiCentro[]> =>
    httpClient.get(`${schema}/MisCentros`, corridaId ? { corridaId } : undefined),
  encabezado: (corridaId: number, cc: string, grupo: number): R<ICentroEncabezado[]> =>
    httpClient.get(centro(corridaId, cc, grupo)),
  plazas: (corridaId: number, cc: string, grupo: number): R<IPlaza[]> => httpClient.get(`${centro(corridaId, cc, grupo)}/Plazas`),
  confirmar: (corridaId: number, cc: string, grupo: number, comentario: string | null): R<number> =>
    httpClient.post(`${centro(corridaId, cc, grupo)}/Confirmar`, { Comentario: comentario }),
  /** Ids vacío = todas las personas del centro. */
  marcarRevisado: (corridaId: number, cc: string, grupo: number, revisado: boolean, ids: number[]): R<number> =>
    httpClient.post(`${centro(corridaId, cc, grupo)}/Revisado`, { Revisado: revisado, Ids: ids }),
  confirmarVarios: (corridaId: number, data: IConfirmarVariosRequest): R<number> =>
    httpClient.post(`${schema}/Corridas/${corridaId}/ConfirmarVarios`, data),
  /** Guardar una fila también la deja revisada. */
  modificarPlaza: (id: number, data: IPlazaRequest): R<number> => httpClient.put(`${schema}/Plazas/${id}`, data),
  quitarVacante: (id: number): R<number> => httpClient.delete(`${schema}/Plazas/${id}`),
  excluirPlaza: (id: number, motivo: string): R<number> => httpClient.post(`${schema}/Plazas/${id}/Excluir`, { Comentario: motivo }),
  incluirPlaza: (id: number): R<number> => httpClient.post(`${schema}/Plazas/${id}/Incluir`, {}),
}

/** La API responde 200 aunque no se haya podido: el resultado viene en Success. */
export async function exigir<T>(p: R<T>, porDefecto = 'No se pudo completar la operación.') {
  const r = await p
  if (!r.Success) throw new Error(r.ErrorMessage || porDefecto)
  return r
}

export function mensajeDeError(e: any): string {
  // Un 500 trae el texto técnico (SQL, red interna): a la persona solo le sirve saber que se reintenta.
  if (e instanceof HttpError && e.status >= 500) return 'El servidor tuvo un problema; intenta de nuevo en un momento'
  try {
    const body = e?.response ? JSON.parse(e.response) : null
    if (body?.ErrorMessage) return body.ErrorMessage
  } catch { /* cuerpo no JSON */ }
  return e?.message || 'Error inesperado'
}
