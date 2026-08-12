import { httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'
import { IRegistrationRequestItem } from './registration.types'

const schema = 'PepeB2B/Registration'

export const registrationService = {
  // Solicitudes pendientes. El SP devuelve Clientes como JSON (string); se parsea aquí.
  getRegistrationRequests: async (): Promise<ExecutionResponse<IRegistrationRequestItem[]>> => {
    const response = await httpClient.get<ExecutionResponse<IRegistrationRequestItem[]>>(`${schema}/requests`)
    if (response?.Data) {
      response.Data = response.Data.map((r) => {
        const raw = (r as any).Clientes
        let Clientes = raw
        if (typeof raw === 'string' && raw.trim() !== '') {
          try { Clientes = JSON.parse(raw) } catch { Clientes = [] }
        }
        return { ...r, Clientes: Array.isArray(Clientes) ? Clientes : [] }
      })
    }
    return response
  },

  approveRegistration: (data: { User_Code: string; Approved_By?: string }) =>
    httpClient.post<ExecutionResponse<null>>(`${schema}/approve`, data),

  rejectRegistration: (data: { User_Code: string; Rejected_By?: string }) =>
    httpClient.post<ExecutionResponse<null>>(`${schema}/reject`, data),
}
