import { httpClient } from '../../core/httpClient'
import { SharePointResponse, SharePointItem } from './sharepoint.types'
import { ExecutionResponse } from '../response.type'
import { MantenimientoPeriodo } from './mantenimiento.types'

// Parámetros del dashboard. Si no se envían, el backend usa año/mes/semana actual;
// semana=0 fuerza el mes completo.
export interface MantenimientoParams {
  anio?: number
  mes?: number
  semana?: number
}

// Consume los endpoints de SharePoint de IMCoreApi.
// baseUrl (API_URL) ya incluye /api/, por eso las rutas van como 'SharePoint/...'.
//
// getItems y getMantenimiento procesan un año de datos de SharePoint y pueden
// tardar varios minutos, así que usan un timeout amplio (10 min) en lugar del
// default de 30 s. El resto de la app conserva el timeout corto.
const SHAREPOINT_TIMEOUT_MS = 10 * 60 * 1000

export const sharepointService = {
  getItems: () =>
    httpClient.get<SharePointResponse<SharePointItem[]>>(
      'SharePoint/items',
      undefined,
      { timeoutMs: SHAREPOINT_TIMEOUT_MS },
    ),
  getSiteId: () =>
    httpClient.get<SharePointResponse<string>>('SharePoint/site-id'),
  // Registros del período + opciones de filtros para el dashboard de mantenimiento.
  getMantenimiento: (params?: MantenimientoParams) =>
    httpClient.get<ExecutionResponse<MantenimientoPeriodo>>(
      'SharePoint/mantenimiento',
      params,
      { timeoutMs: SHAREPOINT_TIMEOUT_MS },
    ),
}
