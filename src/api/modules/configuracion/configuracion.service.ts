import { httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'

// Bandera global del sistema (AdmSys.Configuracion). El backend valida el permiso.
export interface IConfiguracion {
  Clave: string
  Valor: string | null
  Descripcion?: string | null
  Modified_By?: string | null
  Modification_Date?: string | null
}

const schema = 'Configuracion'

export const configuracionService = {
  getAll: () => httpClient.get<ExecutionResponse<IConfiguracion[]>>(`${schema}`),
  set: (clave: string, valor: string) =>
    httpClient.put<ExecutionResponse<any>, { Clave: string; Valor: string }>(`${schema}`, { Clave: clave, Valor: valor }),
}
