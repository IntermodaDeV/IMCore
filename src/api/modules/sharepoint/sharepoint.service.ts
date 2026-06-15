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
export const sharepointService = {
  getItems: () =>
    httpClient.get<SharePointResponse<SharePointItem[]>>('SharePoint/items'),
  getSiteId: () =>
    httpClient.get<SharePointResponse<string>>('SharePoint/site-id'),
  // Registros del período + opciones de filtros para el dashboard de mantenimiento.
  getMantenimiento: (params?: MantenimientoParams) =>
    httpClient.get<ExecutionResponse<MantenimientoPeriodo>>(
      'SharePoint/mantenimiento',
      params,
    ),
}
