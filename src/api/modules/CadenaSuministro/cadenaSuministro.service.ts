import { httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'
import { ISolicitudCompraUsuario} from './cadenaSuministro.types.ts'

export const cadenaSuministroService = {
  getSolicitudesCompras: (User_Code: string) => httpClient.get<ExecutionResponse<ISolicitudCompraUsuario[]>>(`ImCadenaSuministro?usuario=${User_Code}`),
}