import { httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'

const schema = 'Notifications'

export interface IRegisterDevice {
  User_Code: string
  Token: string
  Platform?: string
}

// Categoría de la notificación (para diferenciar visualmente en la bandeja).
export type NotificationCategory = 'visita_acceso' | 'solicitud_compra' | string

// Una notificación de la bandeja (resultado de Notifications/List).
export interface INotification {
  Id: number
  Category: NotificationCategory
  Title: string
  Body?: string | null
  Data?: string | null        // JSON con metadatos (ej. {"visitaId":14,"reason":"entrada"})
  Status_Id: number           // 1 = no leída, 2 = leída
  IsRead: boolean
  Creation_Date: string
  ReadAt?: string | null
  UnreadCount: number
  TotalCount: number
}

export interface INotificationList {
  Items: INotification[]
  UnreadCount: number
  TotalCount: number
}

export interface IListParams {
  skip?: number
  take?: number
  onlyUnread?: boolean
}

// Registro de dispositivo (FCM) + bandeja de notificaciones.
export const notificationsService = {
  // --- Dispositivo (token FCM) ---
  registerDevice: (data: IRegisterDevice) =>
    httpClient.post(`${schema}/RegisterDevice`, data),

  unregister: (token: string) =>
    httpClient.post(`${schema}/Unregister`, { Token: token }),

  // --- Bandeja (centro de notificaciones) ---
  // El usuario sale del token (claim Code); no se envía en el request.
  getNotifications: (params: IListParams = {}) =>
    httpClient.get<ExecutionResponse<INotificationList>>(`${schema}/List`, {
      skip: params.skip ?? 0,
      take: params.take ?? 50,
      onlyUnread: params.onlyUnread ?? false,
    }),

  getUnreadCount: () =>
    httpClient.get<ExecutionResponse<number>>(`${schema}/UnreadCount`),

  markRead: (id: number) =>
    httpClient.post<ExecutionResponse<number>>(`${schema}/MarkRead`, { Id: id }),

  markAllRead: () =>
    httpClient.post<ExecutionResponse<number>>(`${schema}/MarkAllRead`),
}
