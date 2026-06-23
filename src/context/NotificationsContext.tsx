import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react'
import { AppState } from 'react-native'
import { useAuth } from './AuthContext'
import {
  notificationsService,
  INotification,
} from '../api/modules/notifications/notifications.service'
import { setOnPushReceived } from '../services/pushNotifications'

type NotificationsContextType = {
  items: INotification[]
  unreadCount: number
  loading: boolean
  refreshing: boolean
  refresh: (silent?: boolean) => Promise<void>
  refreshUnreadCount: () => Promise<void>
  markRead: (id: number) => Promise<void>
  markAllRead: () => Promise<void>
}

const NotificationsContext = createContext<NotificationsContextType>({
  items: [],
  unreadCount: 0,
  loading: false,
  refreshing: false,
  refresh: async () => {},
  refreshUnreadCount: async () => {},
  markRead: async () => {},
  markAllRead: async () => {},
})

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [items, setItems] = useState<INotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // Conteo de no leídas (ligero, para el badge).
  const refreshUnreadCount = useCallback(async () => {
    if (!user) return
    try {
      const resp = await notificationsService.getUnreadCount()
      if (resp?.Success) setUnreadCount(resp.Data ?? 0)
    } catch {
      // silencioso: el badge no debe romper la app
    }
  }, [user])

  // Lista completa de la bandeja (+ conteos).
  const refresh = useCallback(
    async (silent = false) => {
      if (!user) return
      if (!silent) setLoading(true)
      else setRefreshing(true)
      try {
        const resp = await notificationsService.getNotifications({ skip: 0, take: 50 })
        if (resp?.Success && resp.Data) {
          setItems(resp.Data.Items ?? [])
          setUnreadCount(resp.Data.UnreadCount ?? 0)
        }
      } catch {
        // silencioso
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [user]
  )

  const markRead = useCallback(
    async (id: number) => {
      // Optimista: marca local y ajusta el conteo
      setItems((prev) =>
        prev.map((n) => (n.Id === id && !n.IsRead ? { ...n, IsRead: true, Status_Id: 2 } : n))
      )
      try {
        const resp = await notificationsService.markRead(id)
        if (resp?.Success) setUnreadCount(resp.Data ?? 0)
        else refreshUnreadCount()
      } catch {
        refreshUnreadCount()
      }
    },
    [refreshUnreadCount]
  )

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev.map((n) => ({ ...n, IsRead: true, Status_Id: 2 })))
    setUnreadCount(0)
    try {
      const resp = await notificationsService.markAllRead()
      if (resp?.Success) setUnreadCount(resp.Data ?? 0)
    } catch {
      refreshUnreadCount()
    }
  }, [refreshUnreadCount])

  // Al iniciar sesión: carga el conteo. Al cerrar: limpia.
  useEffect(() => {
    if (user) {
      refreshUnreadCount()
    } else {
      setItems([])
      setUnreadCount(0)
    }
  }, [user, refreshUnreadCount])

  // Push en primer plano -> refresca el conteo (y la lista si hay datos cargados).
  useEffect(() => {
    setOnPushReceived(() => {
      refreshUnreadCount()
      refresh(true)
    })
    return () => setOnPushReceived(null)
  }, [refreshUnreadCount, refresh])

  // Al volver la app a primer plano, sincroniza el conteo.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshUnreadCount()
    })
    return () => sub.remove()
  }, [refreshUnreadCount])

  return (
    <NotificationsContext.Provider
      value={{
        items,
        unreadCount,
        loading,
        refreshing,
        refresh,
        refreshUnreadCount,
        markRead,
        markAllRead,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  )
}

export const useNotifications = () => useContext(NotificationsContext)
