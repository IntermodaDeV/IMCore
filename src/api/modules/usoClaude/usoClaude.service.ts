import { httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'
import { IUsoClaude } from './usoClaude.types'

// api/UsoClaude. SOLO CONSULTA en la app. El permiso es la opción de menú
// 'itUsoClaude', que la API valida contra la BD en cada llamada: la misma
// llave del web. Importar el CSV y administrar las cuentas es del web.
const schema = 'UsoClaude'

export const usoClaudeService = {
  /**
   * Uso por persona, lo importado de los CSV y los asientos entre dos meses
   * (yyyy-MM-dd; la API toma los meses completos). La app pide solo el mes que
   * muestra y el anterior, para la comparación: el payload viaja por datos móviles.
   */
  obtener: (desde: string, hasta: string) =>
    httpClient.get<ExecutionResponse<IUsoClaude>>(schema, { desde, hasta }),
}
