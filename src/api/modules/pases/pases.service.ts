import { httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'
import {
  IAprobador,
  IAprobarLote,
  IAprobarLoteResult,
  IAprobarPase,
  ICrearPase,
  IEmpleado,
  IPase,
  IPaseCategoria,
  IPaseResult,
  IRegistrarAcceso,
  IPaseTablero,
  IRegistrarAccesoResult,
} from './pases.types'

const schema = 'Pases'

export const pasesService = {
  // Categorías (CRUD administrable)
  getCategorias: (onlyActive: boolean = true) =>
    httpClient.get<ExecutionResponse<IPaseCategoria[]>>(`${schema}/Categorias?onlyActive=${onlyActive}`),

  saveCategoria: (data: IPaseCategoria) =>
    httpClient.post<ExecutionResponse<any>, IPaseCategoria>(`${schema}/Categorias`, data),

  changeStatusCategoria: (data: IPaseCategoria) =>
    httpClient.put<ExecutionResponse<any>, IPaseCategoria>(`${schema}/Categorias`, data),

  // Empleados. Sin el acceso 'PasesDeTodos' devuelve SOLO al propio usuario:
  // el permiso es personal. Con el acceso, busca en toda la planilla.
  buscarEmpleados: (userCode: string, query: string = '') =>
    httpClient.get<ExecutionResponse<IEmpleado[]>>(
      `${schema}/Empleados?user_Code=${encodeURIComponent(userCode)}&query=${encodeURIComponent(query)}`
    ),

  /**
   * El empleado del propio usuario. Deja el formulario listo con la persona ya
   * elegida, que es el caso normal. Si el usuario no tiene código de planilla
   * vinculado, devuelve el error que hay que mostrarle.
   */
  getMiEmpleado: (userCode: string) =>
    httpClient.get<ExecutionResponse<IEmpleado>>(
      `${schema}/MiEmpleado?user_Code=${encodeURIComponent(userCode)}`
    ),

  /**
   * Candidatos a aprobador (rol "Aprobador de pases").
   *
   * Con el alterno del jefe que trae planilla, el servidor marca cuál es el
   * jefe REAL de la persona (`Sugerido` + `EsJefeReal`); si no lo resuelve,
   * marca el aprobador por defecto. La lista viene completa igual: el sugerido
   * es un valor inicial, no un candado.
   */
  getAprobadores: (query: string = '', jefeAlterno?: string | null) =>
    httpClient.get<ExecutionResponse<IAprobador[]>>(
      `${schema}/Aprobadores?query=${encodeURIComponent(query)}` +
      (jefeAlterno ? `&jefeAlterno=${encodeURIComponent(jefeAlterno)}` : '')
    ),

  // Pases
  crear: (data: ICrearPase) =>
    httpClient.post<ExecutionResponse<IPaseResult>, ICrearPase>(`${schema}/Crear`, data),

  getMisPases: (userCode: string) =>
    httpClient.get<ExecutionResponse<IPase[]>>(`${schema}/MisPases?user_Code=${encodeURIComponent(userCode)}`),

  /**
   * Historial global (todos los pases) — el alcance lo resuelve el SP.
   *
   * desde/hasta filtran por la FECHA DEL PASE y van al SERVIDOR, no al filtro de
   * la lista: el SP tiene tope, así que filtrando acá un período viejo se vería
   * vacío por culpa del tope y no porque no hubiera permisos.
   */
  getHistorialTodos: (userCode: string, desde?: string, hasta?: string) => {
    const q = [
      `user_Code=${encodeURIComponent(userCode)}`,
      desde ? `desde=${desde}` : '',
      hasta ? `hasta=${hasta}` : '',
    ].filter(Boolean).join('&')
    return httpClient.get<ExecutionResponse<IPase[]>>(`${schema}/Historial?${q}`)
  },

  /**
   * Las dos bandejas de autorización:
   *   'jefe' — lo que espera mi firma como jefe.
   *   'rh'   — lo que el jefe ya autorizó y espera a RR. HH. (exige el acceso
   *            'AutorizarPasesRH'; sin él vuelve vacía).
   */
  getPorAprobar: (userCode: string, modo: 'jefe' | 'rh' = 'jefe') =>
    httpClient.get<ExecutionResponse<IPase[]>>(
      `${schema}/PorAprobar?user_Code=${encodeURIComponent(userCode)}&modo=${modo}`
    ),

  /**
   * El TABLERO del día: una fila por permiso con su situación ya resuelta
   * (afuera / por salir / por entrar / esperando firma / completo). Es la
   * única fuente de esa pantalla. Sin fecha, hoy.
   */
  getTablero: (desde?: string, hasta?: string) => {
    const q = [desde ? `desde=${desde}` : '', hasta ? `hasta=${hasta}` : ''].filter(Boolean).join('&')
    return httpClient.get<ExecutionResponse<IPaseTablero[]>>(`${schema}/Tablero${q ? `?${q}` : ''}`)
  },

  getSeguridad: (fecha?: string) =>
    httpClient.get<ExecutionResponse<IPase[]>>(`${schema}/Seguridad${fecha ? `?fecha=${fecha}` : ''}`),

  /**
   * Detalle de un pase. El userCode define si viene el token del QR: solo si el
   * pase es de esa persona.
   */
  getDetalle: (id: number, userCode?: string) =>
    httpClient.get<ExecutionResponse<IPase>>(
      `${schema}/Detalle?id=${id}${userCode ? `&user_Code=${encodeURIComponent(userCode)}` : ''}`
    ),

  aprobar: (data: IAprobarPase) =>
    httpClient.post<ExecutionResponse<any>, IAprobarPase>(`${schema}/Aprobar`, data),

  // Segunda y última firma. Recién con esto el pase abre la puerta.
  aprobarRH: (data: IAprobarPase) =>
    httpClient.post<ExecutionResponse<any>, IAprobarPase>(`${schema}/AprobarRH`, data),

  /**
   * Varios permisos de una sola vez, en la instancia que diga Modo. Cada uno
   * pasa por las mismas validaciones que la firma individual.
   */
  aprobarLote: (data: IAprobarLote) =>
    httpClient.post<ExecutionResponse<IAprobarLoteResult>, IAprobarLote>(`${schema}/AprobarLote`, data),

  rechazar: (data: IAprobarPase) =>
    httpClient.post<ExecutionResponse<any>, IAprobarPase>(`${schema}/Rechazar`, data),

  // Seguridad: registrar el movimiento que toca. Por carnet, por el QR del pase
  // o eligiéndolo de la lista del día.
  registrarAcceso: (data: IRegistrarAcceso) =>
    httpClient.post<ExecutionResponse<IRegistrarAccesoResult>, IRegistrarAcceso>(`${schema}/RegistrarAcceso`, data),
}
