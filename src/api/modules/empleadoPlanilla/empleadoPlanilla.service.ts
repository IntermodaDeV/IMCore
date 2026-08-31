import { httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'
import {
  IEmpleadoPlanilla,
  IEmpleadoVinculado,
  IVincularEmpleado,
  IVincularResult,
} from './empleadoPlanilla.types'

const schema = 'EmpleadoPlanilla'

/**
 * Los cuatro endpoints exigen del lado del servidor tener la opción de menú
 * 'usuarios'. Esconder la sección en la pantalla es comodidad, no permiso.
 */
export const empleadoPlanillaService = {
  /**
   * Empleados que coinciden con el filtro (código de personal o nombre).
   *
   * `paraUserCode` es el usuario que se está editando: sus propios códigos no
   * cuentan como tomados, si no su empleado actual aparecería bloqueado.
   */
  buscar: (filtro?: string, paraUserCode?: string) => {
    const params = new URLSearchParams()
    if (filtro) params.append('filtro', filtro)
    if (paraUserCode) params.append('paraUserCode', paraUserCode)
    const query = params.toString()

    return httpClient.get<ExecutionResponse<IEmpleadoPlanilla[]>>(
      `${schema}/Buscar${query ? `?${query}` : ''}`,
    )
  },

  /** A qué empleado está vinculado un usuario, resuelto contra planilla. */
  vinculado: (userCode: string) =>
    httpClient.get<ExecutionResponse<IEmpleadoVinculado>>(
      `${schema}/Vinculado?userCode=${encodeURIComponent(userCode)}`,
    ),

  /** Guarda los dos códigos del empleado en el usuario. */
  vincular: (data: IVincularEmpleado) =>
    httpClient.post<ExecutionResponse<IVincularResult>>(`${schema}/Vincular`, data),

  /** Suelta el vínculo (baja lógica de los dos códigos). */
  desvincular: (userCode: string) =>
    httpClient.post<ExecutionResponse<IVincularResult>>(
      `${schema}/Desvincular?userCode=${encodeURIComponent(userCode)}`,
      {},
    ),
}
