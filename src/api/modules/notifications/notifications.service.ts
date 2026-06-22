import { httpClient } from '../../core/httpClient'

const schema = 'Notifications'

export interface IRegisterDevice {
  User_Code: string
  Token: string
  Platform?: string
}

// Registro/baja del token FCM del dispositivo en el backend.
export const notificationsService = {
  registerDevice: (data: IRegisterDevice) =>
    httpClient.post(`${schema}/RegisterDevice`, data),

  unregister: (token: string) =>
    httpClient.post(`${schema}/Unregister`, { Token: token }),
}
