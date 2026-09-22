import { httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'
import { IArea, IOperacion, ITipoParo, IMotivoPausa } from './tickets.types'

// CRUD de catálogos de mantenimiento (api/Catalogos). El acceso lo gobierna el
// permiso de menú de cada pantalla; el backend solo exige autenticación.
const schema = 'Catalogos'

export interface ITipoFallaAdmin { Id: number; Operacion_Id: number; Modelo: string; Name: string; Status_Id: number }
export interface ICausaFallaAdmin { Id: number; TipoFalla_Id: number; Name: string; Status_Id: number }
export interface ITipoFallaManage { Id?: number; Operacion_Id?: number; Modelo?: string; Name: string; Status_Id?: number }
export interface ICausaFallaManage { Id?: number; TipoFalla_Id?: number; Name: string; Status_Id?: number }
export interface IModelo { Modelo: string }

// Status_Id 1 = TITULAR (operando) · 2 = EXTRA (de respaldo) · 3 = DADA DE BAJA.
// Confirmado = alguien la validó en piso; en false la máquina todavía está en la
// cola de validación del tablero, sin importar su Status_Id.
export interface IMaquina { Id: number; CodigoActivo?: string | null; TipoMaquina?: string | null; Ubicacion?: string | null; Modelo?: string | null; Marca?: string | null; NumeroSerie?: string | null; Area_Id?: number | null; Area?: string | null; Status_Id: number; Confirmado?: boolean; StatusPrevio_Id?: number | null }
// Tickets sin cerrar de una máquina: se consulta antes de darla de baja, para avisar.
export interface IMaquinaTicketsAbiertos { Id: number; CodigoActivo?: string | null; Abiertos: number }
export interface IMaquinaManage { Id?: number; CodigoActivo?: string | null; TipoMaquina?: string | null; Modelo?: string | null; Marca?: string | null; NumeroSerie?: string | null; Area_Id?: number | null; Status_Id?: number }

export interface IAreaPrincipal { Id: number; Name: string; PermiteMaquinas: boolean; Orden: number; Status_Id: number }
export interface IAreaPrincipalManage { Id?: number; Name: string; PermiteMaquinas: boolean; Status_Id?: number }
export interface IAreaManage { Id?: number; Name: string; AreaPrincipal_Id: number; Status_Id?: number }
export interface IOperacionManage { Id?: number; Area_Id: number; Name: string; Orden?: number; Status_Id?: number }
export interface ITipoParoManage { Id?: number; Name: string }
export interface IMotivoPausaManage { Id?: number; Name: string }

export const catalogosService = {
  // ── Áreas principales ─────────────────────────────────────────────────────
  getAreasPrincipales: (onlyActive = false) =>
    httpClient.get<ExecutionResponse<IAreaPrincipal[]>>(`${schema}/AreasPrincipales`, { onlyActive }),
  crearAreaPrincipal: (data: IAreaPrincipalManage) =>
    httpClient.post<ExecutionResponse<null>, IAreaPrincipalManage>(`${schema}/AreasPrincipales`, data),
  editarAreaPrincipal: (data: IAreaPrincipalManage) =>
    httpClient.put<ExecutionResponse<null>, IAreaPrincipalManage>(`${schema}/AreasPrincipales`, data),
  toggleAreaPrincipal: (id: number) =>
    httpClient.post<ExecutionResponse<null>>(`${schema}/AreasPrincipales/Toggle?id=${id}`),

  // ── Áreas ───────────────────────────────────────────────────────────────
  getAreas: (onlyActive = false, areaPrincipalId?: number, soloMaquinas?: boolean) =>
    httpClient.get<ExecutionResponse<IArea[]>>(`${schema}/Areas`, { onlyActive, areaPrincipal_Id: areaPrincipalId, soloMaquinas }),
  crearArea: (data: IAreaManage) =>
    httpClient.post<ExecutionResponse<null>, IAreaManage>(`${schema}/Areas`, data),
  editarArea: (data: IAreaManage) =>
    httpClient.put<ExecutionResponse<null>, IAreaManage>(`${schema}/Areas`, data),
  toggleArea: (id: number) =>
    httpClient.post<ExecutionResponse<null>>(`${schema}/Areas/Toggle?id=${id}`),

  // ── Operaciones ───────────────────────────────────────────────────────────
  getOperaciones: (areaId: number, onlyActive = false) =>
    httpClient.get<ExecutionResponse<IOperacion[]>>(`${schema}/Operaciones`, { area_Id: areaId, onlyActive }),
  crearOperacion: (data: IOperacionManage) =>
    httpClient.post<ExecutionResponse<null>, IOperacionManage>(`${schema}/Operaciones`, data),
  editarOperacion: (data: IOperacionManage) =>
    httpClient.put<ExecutionResponse<null>, IOperacionManage>(`${schema}/Operaciones`, data),
  toggleOperacion: (id: number) =>
    httpClient.post<ExecutionResponse<null>>(`${schema}/Operaciones/Toggle?id=${id}`),
  // Reordenar operaciones de un área: ids en el orden deseado → backend fija Orden 1..N.
  reordenarOperaciones: (areaId: number, ids: number[]) =>
    httpClient.post<ExecutionResponse<null>, { Area_Id: number; Ids: number[] }>(
      `${schema}/Operaciones/Reordenar`, { Area_Id: areaId, Ids: ids }),

  // ── Máquinas ────────────────────────────────────────────────────────────────
  // baja = true trae SOLO las dadas de baja. Con el default (false) el backend las
  // excluye de todas partes, así que ninguna otra pantalla tuvo que cambiar.
  getMaquinas: (search?: string, areaId?: number, onlyActive = false, baja = false) =>
    httpClient.get<ExecutionResponse<IMaquina[]>>(`${schema}/Maquinas`, { search, area_Id: areaId, onlyActive, baja }),
  // Búsqueda por código de activo (escaneo): acepta AF-######## o solo dígitos.
  getMaquinaPorCodigo: (codigo: string) =>
    httpClient.get<ExecutionResponse<IMaquina>>(`${schema}/Maquinas/PorCodigo`, { codigo }),
  crearMaquina: (data: IMaquinaManage) =>
    httpClient.post<ExecutionResponse<null>, IMaquinaManage>(`${schema}/Maquinas`, data),
  editarMaquina: (data: IMaquinaManage) =>
    httpClient.put<ExecutionResponse<null>, IMaquinaManage>(`${schema}/Maquinas`, data),
  // Alterna TITULAR (1) <-> EXTRA (2). No es «activar/desactivar»: la máquina sigue
  // en el tablero y en los cálculos. Para sacarla de circulación está la baja.
  toggleMaquina: (id: number) =>
    httpClient.post<ExecutionResponse<null>>(`${schema}/Maquinas/Toggle?id=${id}`),
  // Dar de baja (3) o recuperar (0). Guarda de dónde venía la máquina para devolverla
  // a lo que era. NO toca tickets ni indicadores históricos: solo la saca de listas
  // y selectores de aquí en adelante.
  darDeBajaMaquina: (id: number, statusId: 0 | 3) =>
    httpClient.put<ExecutionResponse<null>, { Id: number; Status_Id: number }>(
      `${schema}/Maquinas/Baja`, { Id: id, Status_Id: statusId }),
  // Cuántos tickets sin cerrar tiene, para avisar antes de la baja. Recibe una lista
  // separada por comas (el web da de baja varias; acá siempre va una).
  maquinasTicketsAbiertos: (ids: number[]) =>
    httpClient.get<ExecutionResponse<IMaquinaTicketsAbiertos[]>>(`${schema}/Maquinas/TicketsAbiertos`, { ids: ids.join(',') }),

  // ── Modelos por operación (maestro de fallas) ───────────────────────────────
  getModelos: (operacionId: number) =>
    httpClient.get<ExecutionResponse<IModelo[]>>(`${schema}/Modelos`, { operacion_Id: operacionId }),

  // ── Tipos de falla (maestro) ────────────────────────────────────────────────
  getTiposFalla: (operacionId: number, modelo: string, onlyActive = false) =>
    httpClient.get<ExecutionResponse<ITipoFallaAdmin[]>>(`${schema}/TiposFalla`, { operacion_Id: operacionId, modelo, onlyActive }),
  crearTipoFalla: (data: ITipoFallaManage) =>
    httpClient.post<ExecutionResponse<null>, ITipoFallaManage>(`${schema}/TiposFalla`, data),
  editarTipoFalla: (data: ITipoFallaManage) =>
    httpClient.put<ExecutionResponse<null>, ITipoFallaManage>(`${schema}/TiposFalla`, data),
  toggleTipoFalla: (id: number) =>
    httpClient.post<ExecutionResponse<null>>(`${schema}/TiposFalla/Toggle?id=${id}`),

  // ── Causas de falla (maestro) ───────────────────────────────────────────────
  getCausas: (tipoFallaId: number, onlyActive = false) =>
    httpClient.get<ExecutionResponse<ICausaFallaAdmin[]>>(`${schema}/Causas`, { tipoFalla_Id: tipoFallaId, onlyActive }),
  crearCausa: (data: ICausaFallaManage) =>
    httpClient.post<ExecutionResponse<null>, ICausaFallaManage>(`${schema}/Causas`, data),
  editarCausa: (data: ICausaFallaManage) =>
    httpClient.put<ExecutionResponse<null>, ICausaFallaManage>(`${schema}/Causas`, data),
  toggleCausa: (id: number) =>
    httpClient.post<ExecutionResponse<null>>(`${schema}/Causas/Toggle?id=${id}`),

  // ── Tipos de paro ─────────────────────────────────────────────────────────
  getTiposParo: (onlyActive = false) =>
    httpClient.get<ExecutionResponse<ITipoParo[]>>(`${schema}/TiposParo`, { onlyActive }),
  crearTipoParo: (data: ITipoParoManage) =>
    httpClient.post<ExecutionResponse<null>, ITipoParoManage>(`${schema}/TiposParo`, data),
  editarTipoParo: (data: ITipoParoManage) =>
    httpClient.put<ExecutionResponse<null>, ITipoParoManage>(`${schema}/TiposParo`, data),
  toggleTipoParo: (id: number) =>
    httpClient.post<ExecutionResponse<null>>(`${schema}/TiposParo/Toggle?id=${id}`),

  // ── Motivos de pausa ──────────────────────────────────────────────────────
  getMotivosPausa: (onlyActive = false) =>
    httpClient.get<ExecutionResponse<IMotivoPausa[]>>(`${schema}/MotivosPausa`, { onlyActive }),
  crearMotivoPausa: (data: IMotivoPausaManage) =>
    httpClient.post<ExecutionResponse<null>, IMotivoPausaManage>(`${schema}/MotivosPausa`, data),
  editarMotivoPausa: (data: IMotivoPausaManage) =>
    httpClient.put<ExecutionResponse<null>, IMotivoPausaManage>(`${schema}/MotivosPausa`, data),
  toggleMotivoPausa: (id: number) =>
    httpClient.post<ExecutionResponse<null>>(`${schema}/MotivosPausa/Toggle?id=${id}`),
}
