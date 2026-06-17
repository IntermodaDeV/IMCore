import { httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'
import { IGenerarVisita, IHistorial, IMotivo, IValidarResult, IVisitaResult } from './visitas.types'

const schema = 'Visitas'

export const visitasService = {
  // Motivos
  getMotivos: (onlyActive: boolean = true) =>
    httpClient.get<ExecutionResponse<IMotivo[]>>(`${schema}/Motivos?onlyActive=${onlyActive}`),

  saveMotivo: (data: IMotivo) =>
    httpClient.post<ExecutionResponse<any>, IMotivo>(`${schema}/Motivos`, data),

  changeStatusMotivo: (data: IMotivo) =>
    httpClient.put<ExecutionResponse<any>, IMotivo>(`${schema}/Motivos`, data),

  // Pases
  generar: (data: IGenerarVisita) =>
    httpClient.post<ExecutionResponse<IVisitaResult>, IGenerarVisita>(`${schema}/Generar`, data),

  getHistorial: (userCode: string) =>
    httpClient.get<ExecutionResponse<IHistorial[]>>(`${schema}/Historial?user_Code=${userCode}`),

  validar: (token: string, userCode: string) =>
    httpClient.post<ExecutionResponse<IValidarResult>, { Token: string; Create_By: string }>(
      `${schema}/Validar`,
      { Token: token, Create_By: userCode }
    ),
}
