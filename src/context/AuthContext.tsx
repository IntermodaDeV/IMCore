import React, { createContext, useContext, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { UsersDTO, IDefaultCompany } from '../api/modules/security/security.types'
import { securityService } from '../api/modules/security/security.service'
import { sessionManager } from '../api/core/sessionManager'
import { registerForUser, unregisterCurrent, setOnForceLogout } from '../services/pushNotifications'

type AuthContextType = {
  user: UsersDTO | null
  defaultCompany: IDefaultCompany | null
  companyId: number | null
  setCompanyId: (companyId: number | null) => Promise<void>
  login: (user: UsersDTO) => Promise<void>
  refreshUser: () => Promise<void>
  logout: () => Promise<void>
  isAuthenticated: boolean
  theme: 'light' | 'dark'
  setTheme: (theme: 'light' | 'dark') => Promise<void>
  loading: boolean
  transitioning: boolean
  setTransitioning: (value: boolean) => void
  transitionMessage: string | null
  setTransitionMessage: (value: string | null) => void
  sessionExpired: boolean
  setSessionExpired: (value: boolean) => void
  sessionClosedByAdmin: boolean
  setSessionClosedByAdmin: (value: boolean) => void
}

const AuthContext = createContext<AuthContextType>(
  {} as AuthContextType
)

export const AuthProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const [user, setUser] = useState<UsersDTO | null>(null)
  const [defaultCompany, setDefaultCompany] = useState<IDefaultCompany | null>(null)
  const [companyId, setCompanyIdState] = useState<number | null>(null)
  const [themeState, setThemeState] = useState<'light' | 'dark'>('light')
  const [loading, setLoading] = useState(true)
  const [transitioning, setTransitioning] = useState(false)
  const [transitionMessage, setTransitionMessage] = useState<string | null>(null)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [sessionClosedByAdmin, setSessionClosedByAdmin] = useState(false)

  useEffect(() => {
    const loadSession = async () => {
      try {
        // Si un admin cerró la sesión mientras la app estaba en 2.º plano/cerrada,
        // el handler de background dejó esta marca: mostramos la pantalla y no
        // restauramos la sesión.
        const forced = await AsyncStorage.getItem('forcedLogout')
        if (forced === '1') {
          await Promise.all([
            AsyncStorage.removeItem('forcedLogout'),
            AsyncStorage.removeItem('accessToken'),
            AsyncStorage.removeItem('refreshToken'),
            AsyncStorage.removeItem('user'),
          ])
          setSessionExpired(false)
          setSessionClosedByAdmin(true)
          setLoading(false)
          return
        }

        const savedUser = await AsyncStorage.getItem('user')
        const savedTheme = await AsyncStorage.getItem('theme')
        const savedCompanyId = await AsyncStorage.getItem('companyId')

        if (savedUser) {
          const parsedUser = JSON.parse(savedUser)
          setUser(parsedUser)

          const dc = parsedUser?.DefaultCompany?.[0] ?? null
          setDefaultCompany(dc)

          if (savedCompanyId != null) {
            setCompanyIdState(Number(savedCompanyId))
          } else if (dc?.Id != null) {
            setCompanyIdState(dc.Id)
          }
        }

        if (
          savedTheme === 'dark' ||
          savedTheme === 'light'
        ) {
          setThemeState(savedTheme)
        }
      } catch (e) {
        console.log('Error restoring session', e)
      } finally {
        setLoading(false)
      }
    }

    loadSession()
  }, [])

  useEffect(() => {
    const unsubscribe = sessionManager.subscribe(() => {
      setSessionExpired(true)
    })

    return unsubscribe
  }, [])

  // Cierre forzado por admin detectado por el httpClient (401 con motivo 'forced').
  useEffect(() => {
    const unsubscribe = sessionManager.subscribeForced(async () => {
      try {
        await Promise.all([
          AsyncStorage.removeItem('accessToken'),
          AsyncStorage.removeItem('refreshToken'),
        ])
      } catch {}
      setSessionExpired(false)
      setSessionClosedByAdmin(true)
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    if (user?.Code) registerForUser(user.Code)
  }, [user?.Code])

  // Cierre de sesión forzado por un admin recibido en PRIMER PLANO: limpia los
  // tokens y muestra la pantalla "sesión cerrada por administrador".
  useEffect(() => {
    setOnForceLogout(async () => {
      try {
        await Promise.all([
          AsyncStorage.removeItem('accessToken'),
          AsyncStorage.removeItem('refreshToken'),
        ])
      } catch {}
      setSessionExpired(false)
      setSessionClosedByAdmin(true)
    })
    return () => setOnForceLogout(null)
  }, [])

  const setTheme = async (
    newTheme: 'light' | 'dark'
  ) => {
    try {
      setThemeState(newTheme)

      await AsyncStorage.setItem(
        'theme',
        newTheme
      )
    } catch (error) {
      console.log('Theme error', error)
    }
  }

  const setCompanyId = async (newCompanyId: number | null) => {
    try {
      setCompanyIdState(newCompanyId)

      if (newCompanyId == null) {
        await AsyncStorage.removeItem('companyId')
      } else {
        await AsyncStorage.setItem('companyId', String(newCompanyId))
      }
    } catch (error) {
      console.log('CompanyId error', error)
    }
  }

  const login = async (userData: UsersDTO) => {
    try {
      setSessionExpired(false)

      setUser(userData)

      const dc = userData?.DefaultCompany?.[0] ?? null
      setDefaultCompany(dc)
      setCompanyIdState(dc?.Id ?? null)

      const userTheme =
        userData?.Theme === 'dark'
          ? 'dark'
          : 'light'

      setThemeState(userTheme)

      await AsyncStorage.setItem(
        'user',
        JSON.stringify(userData)
      )

      await AsyncStorage.setItem(
        'theme',
        userTheme
      )

      if (dc?.Id != null) {
        await AsyncStorage.setItem('companyId', String(dc.Id))
      } else {
        await AsyncStorage.removeItem('companyId')
      }

      setTransitionMessage('Iniciando sesión...')
      setTransitioning(true)
      // El registro de push lo dispara el useEffect sobre user.Code (cubre login
      // y restauración de sesión), así no se duplica aquí.
    } catch (error) {
      console.log('Login error', error)
    }
  }

  // Re-obtiene la sesión (Access/Roles frescos) del usuario actual sin re-loguear,
  // usando la misma fuente que el login (InfoUser de Security.Login_User opción 2),
  // para que los permisos otorgados/quitados se reflejen al instante en la UI.
  const refreshUser = async () => {
    if (!user?.Code) return
    try {
      const resp = await securityService.getSessionInfo()
      if (!resp?.Success || !resp.Data) return
      const fresh = JSON.parse(resp.Data) as UsersDTO
      if (!fresh?.Code) return
      setUser(fresh)
      await AsyncStorage.setItem('user', JSON.stringify(fresh))
    } catch (e) {
      console.log('refreshUser error', e)
    }
  }

  const logout = async () => {
    try {
      setTransitionMessage('Cerrando sesión...')
      setTransitioning(true)

      // Da de baja el token de notificaciones (best-effort, antes de limpiar)
      try {
        await unregisterCurrent()
      } catch {}

      if (user?.Code) {
        try {
          await securityService.logout(user.Code)
        } catch (serverError) {
          console.log(
            'Error logout en servidor (continuando con limpieza local)',
            serverError
          )
        }
      }

      setUser(null)
      setDefaultCompany(null)
      setCompanyIdState(null)

      await Promise.all([
        AsyncStorage.removeItem('user'),
        AsyncStorage.removeItem('theme'),
        AsyncStorage.removeItem('menu'),
        AsyncStorage.removeItem('accessToken'),
        AsyncStorage.removeItem('refreshToken'),
        AsyncStorage.removeItem('companyId'),
      ])
    } catch (e) {
      console.log('Error logout', e)
      setUser(null)
      setCompanyIdState(null)
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        defaultCompany,
        companyId,
        setCompanyId,
        login,
        refreshUser,
        logout,
        isAuthenticated: !!user,
        theme: themeState,
        setTheme,
        loading,
        transitioning,
        setTransitioning,
        transitionMessage,
        setTransitionMessage,
        sessionExpired,
        setSessionExpired,
        sessionClosedByAdmin,
        setSessionClosedByAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)