import { httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'
import { IApprovalHistory, ISolicitud, ISolicitudCompraUsuario} from './cadenaSuministro.types.ts'

export const cadenaSuministroService = {
  getSolicitudesCompras: (User_Code: string) => httpClient.get<ExecutionResponse<ISolicitudCompraUsuario[]>>(`ImCadenaSuministro?usuario=${User_Code}`),
  getSolicitudesHistorico: (User_Code: string) => httpClient.get<ExecutionResponse<ISolicitudCompraUsuario[]>>(`ImCadenaSuministro/Historico?usuario=${User_Code}`),
  getHistorialAprobaciones: (User_Code: string) => httpClient.get<ExecutionResponse<IApprovalHistory[]>>(`ImCadenaSuministro/HistorialAprobaciones?usuario=${User_Code}`),
  aprobarSolicitud: (solicitud: ISolicitud) => httpClient.post<ExecutionResponse<ISolicitudCompraUsuario[]>>(`ImCadenaSuministro/AprobarRechazarSolicitud`, solicitud),
}