import { httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'
import {
  IAccionMonitorResult, IAdvertenciaMonitor, ICapaMonitor, IConexionEstado, IFuenteMonitor, IMedicionMonitor, IPasoMonitor,
  IProcesoMonitor, ISincronizacion,
} from './monitorCargas.types'

// api/MonitorCargas, los mismos endpoints del web. La app consulta y puede ejecutar un proceso
// (como «Ejecutar ahora» del web); reintentar, corridas, gráficas y conexiones son del web. Ver: la
// opción de menú 'itMonitorCargas'; ejecutar: además el acceso 'MonitorCargasEjecutar'. La API
// valida los dos contra la BD en cada llamada.
const schema = 'MonitorCargas'

export const monitorCargasService = {
  procesos: () => httpClient.get<ExecutionResponse<IProcesoMonitor[]>>(`${schema}/Procesos`),

  fuentes: () => httpClient.get<ExecutionResponse<IFuenteMonitor[]>>(`${schema}/Fuentes`),

  /** La app pide solo la última hora: le basta el último atraso de la réplica (vigilancia cada 15 min). */
  mediciones: (horas = 1) => httpClient.get<ExecutionResponse<IMedicionMonitor[]>>(`${schema}/Mediciones`, { horas }),

  capas: () => httpClient.get<ExecutionResponse<ICapaMonitor[]>>(`${schema}/Capas`),

  advertencias: (dias = 7) => httpClient.get<ExecutionResponse<IAdvertenciaMonitor[]>>(`${schema}/Advertencias`, { dias }),

  /** Si cada servidor responde (proceso CONEXIONES, cada 15 min). */
  conexionEstado: () => httpClient.get<ExecutionResponse<IConexionEstado[]>>(`${schema}/ConexionEstado`),
  /** Sincronización con IMCore: cada tabla publicada, IMAnalitica contra IMCore. */
  sincronizacion: () => httpClient.get<ExecutionResponse<ISincronizacion>>(`${schema}/Sincronizacion`),

  /** Pasos de una corrida; mientras corre, la pantalla los vuelve a pedir para mostrar el avance. */
  pasos: (corridaId: number) => httpClient.get<ExecutionResponse<IPasoMonitor[]>>(`${schema}/Corridas/${corridaId}/Pasos`),

  /** Responde enseguida: la corrida sigue en segundo plano y aparece en procesos. */
  ejecutar: (proceso: string) =>
    httpClient.post<ExecutionResponse<IAccionMonitorResult>>(`${schema}/Procesos/${encodeURIComponent(proceso)}/Ejecutar`),
}
