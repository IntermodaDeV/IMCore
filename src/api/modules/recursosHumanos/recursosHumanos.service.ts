import Config from 'react-native-config'
import { httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'
import { IEmployee, ICompany } from './recursosHumanos.types'

// URL absoluta de la foto del empleado (servida por IMCoreApi desde el directorio
// configurado). Se usa directamente como `uri` de un <Image>. Devuelve '' si no hay código.
export const employeePhotoUrl = (code?: string) =>
  code ? `${Config.API_URL}PayWeb/EmployeePhoto?code=${encodeURIComponent(code)}` : ''

export const recursosHumanosService = {
  getEmployees: (Company_Code: string) => httpClient.get<ExecutionResponse<IEmployee[]>>(`PayWeb/Employees?vi_Company_Code=${Company_Code}`),
  getCompanies: (Country_Code: string) => httpClient.get<ExecutionResponse<ICompany[]>>(`PayWeb/Companies?Country_Code=${Country_Code}`),

  // Guarda/reemplaza la foto del empleado (imagen en base64, igual que el resto de la app).
  // User_Code = usuario que realiza el cambio (para el log).
  uploadEmployeePhoto: (Code: string, ImageBase64: string, Extension?: string, User_Code?: string) =>
    httpClient.post<ExecutionResponse<string>>(`PayWeb/EmployeePhoto`, { Code, ImageBase64, Extension, User_Code }),

  // Elimina la foto del empleado. user = usuario que realiza el cambio (para el log).
  deleteEmployeePhoto: (Code: string, User_Code?: string) =>
    httpClient.delete<ExecutionResponse<string>>(
      `PayWeb/EmployeePhoto?code=${encodeURIComponent(Code)}${User_Code ? `&user=${encodeURIComponent(User_Code)}` : ''}`
    ),
}
