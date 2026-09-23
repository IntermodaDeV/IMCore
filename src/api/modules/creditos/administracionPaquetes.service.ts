import { httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'
import { ICorrida, IEstadoEnvioAx } from './administracionPaquetes.types'

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

  /** Cuántas líneas confirmó AX y cuántas faltan. */
  getEstadoEnvio: (id: number): Res<IEstadoEnvioAx> =>
    httpClient.get(`${schema}/Corridas/${id}/EnvioAX`),

  /**
   * RETOMA EL ENVÍO desde el teléfono. Es lo único que la app puede disparar en
   * este módulo, y va contra la regla de «acá no se toca nada» a propósito: no
   * crea trabajo nuevo —eso sigue siendo del web—, continúa uno que ya se
   * autorizó. Cuando el lote se corta y a alguien le llega el aviso, lo normal es
   * que esté lejos de la computadora.
   *
   * Manda solo lo pendiente, y repetirlo no recorta dos veces: AX asigna la
   * cantidad de la línea, no la resta.
   */
  enviarAX: (id: number): Res<unknown> =>
    httpClient.post(`${schema}/Corridas/${id}/EnviarAX`, {}),
}
