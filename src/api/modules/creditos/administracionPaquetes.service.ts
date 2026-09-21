import { httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'
import { ICorrida } from './administracionPaquetes.types'

// api/AdministracionPaquetes. baseUrl (API_URL) ya incluye /api/.
//
// SOLO LECTURA a propósito: la app no crea, no calcula y no aplica corridas.
// El permiso es el MISMO del web — la opción de menú 'creditosAdministracionPaquetes',
// que la API valida contra la BD en cada llamada. Por eso no hace falta pedir
// un acceso aparte para el teléfono.
const schema = 'AdministracionPaquetes'

type Res<T> = Promise<ExecutionResponse<T>>

export const administracionPaquetesService = {
  /** Las corridas, más nueva primero. `paquete` filtra por código (ej. '7326F'). */
  getCorridas: (paquete?: string): Res<ICorrida[]> =>
    httpClient.get(`${schema}/Corridas`, { paquete }),

  getCorrida: (id: number): Res<ICorrida> => httpClient.get(`${schema}/Corridas/${id}`),
}
