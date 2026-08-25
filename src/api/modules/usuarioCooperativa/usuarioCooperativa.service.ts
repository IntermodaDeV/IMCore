import { httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'
import {
  IEmpleadoUsuario,
  ICodigoDisponible,
  ICrearUsuarioCooperativa,
  ICrearUsuarioCooperativaResult,
} from './usuarioCooperativa.types'

const schema = 'UsuarioCooperativa'

/**
 * Los tres endpoints exigen el acceso 'userCooperativa' del lado del servidor.
 * Esconder el botón en la pantalla es comodidad, no permiso.
 */
export const usuarioCooperativaService = {
  /** Empleados que coinciden con el filtro. Sin filtro, los primeros. */
  buscarEmpleados: (filtro?: string) =>
    httpClient.get<ExecutionResponse<IEmpleadoUsuario[]>>(
      `${schema}/Empleados${filtro ? `?filtro=${encodeURIComponent(filtro)}` : ''}`,
    ),

  /** ¿El código de empleado sigue libre? */
  verificarCodigo: (employeeCode: string) =>
    httpClient.get<ExecutionResponse<ICodigoDisponible>>(
      `${schema}/VerificarCodigo?employeeCode=${encodeURIComponent(employeeCode)}`,
    ),

  /** Alta completa: usuario, rol, compañía y códigos de planilla. */
  crear: (data: ICrearUsuarioCooperativa) =>
    httpClient.post<ExecutionResponse<ICrearUsuarioCooperativaResult>>(schema, data),
}
