import { httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'
import { IAdvertenciaMonitor, ICapaMonitor, IFuenteMonitor, IMedicionMonitor, IProcesoMonitor } from './monitorCargas.types'

// api/MonitorCargas, los mismos endpoints del web. SOLO CONSULTA en la app: ejecutar,
// reintentar, corridas, gráficas y conexiones son del web. El permiso es la opción de menú
// 'itMonitorCargas', que la API valida contra la BD en cada llamada.
const schema = 'MonitorCargas'

export const monitorCargasService = {
  procesos: () => httpClient.get<ExecutionResponse<IProcesoMonitor[]>>(`${schema}/Procesos`),

  fuentes: () => httpClient.get<ExecutionResponse<IFuenteMonitor[]>>(`${schema}/Fuentes`),

  /** La app pide solo la última hora: le basta el último atraso de la réplica (vigilancia cada 15 min). */
  mediciones: (horas = 1) => httpClient.get<ExecutionResponse<IMedicionMonitor[]>>(`${schema}/Mediciones`, { horas }),

  capas: () => httpClient.get<ExecutionResponse<ICapaMonitor[]>>(`${schema}/Capas`),

  advertencias: (dias = 7) => httpClient.get<ExecutionResponse<IAdvertenciaMonitor[]>>(`${schema}/Advertencias`, { dias }),
}
