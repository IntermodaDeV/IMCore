import { HttpError, httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'
import { IAgenda, IFotoResultado, ILoteMarcas, IMarcaResultado, IMiMarca } from './asistencia.types'

// Consume api/InventarioImpulsadoras/Asistencia/App/*. El usuario sale del token: nunca se manda.
const schema = 'InventarioImpulsadoras/Asistencia/App'

// Se marca desde tiendas con mala señal: si en 20 s no respondió, se da por perdido y se
// reintenta después (el servidor no duplica por Uuid).
const TIMEOUT = 20_000
// La foto pesa ~100-200 KB: se le da más tiempo, y si no alcanza se reintenta sola.
const TIMEOUT_FOTO = 45_000

// El lote viaja en gzip, como el del inventario. Si un servidor no lo entiende (400/415) y
// el mismo lote sin comprimir sí pasa, se deja de comprimir en esta sesión.
let enGzip = true

async function enviarMarcas(lote: ILoteMarcas) {
  const url = `${schema}/Marcas`
  if (enGzip) {
    try {
      return await httpClient.post<ExecutionResponse<IMarcaResultado[]>>(url, lote, { timeoutMs: TIMEOUT, gzip: true })
    } catch (e) {
      if (!(e instanceof HttpError) || (e.status !== 400 && e.status !== 415)) throw e
      const r = await httpClient.post<ExecutionResponse<IMarcaResultado[]>>(url, lote, { timeoutMs: TIMEOUT })
      enGzip = false
      return r
    }
  }
  return httpClient.post<ExecutionResponse<IMarcaResultado[]>>(url, lote, { timeoutMs: TIMEOUT })
}

export const asistenciaService = {
  agenda: () => httpClient.get<ExecutionResponse<IAgenda>>(`${schema}/Agenda`, undefined, { timeoutMs: TIMEOUT }),
  enviarMarcas,
  enviarFoto: (uuid: string, fotoBase64: string) =>
    httpClient.post<ExecutionResponse<IFotoResultado>>(`${schema}/Foto`, { Uuid: uuid, FotoBase64: fotoBase64 }, { timeoutMs: TIMEOUT_FOTO }),
  misMarcas: (dias = 30) => httpClient.get<ExecutionResponse<IMiMarca[]>>(`${schema}/MisMarcas`, { dias }),
}
