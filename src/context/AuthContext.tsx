import React, { createContext, useContext, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { UsersDTO } from '../api/modules/security/security.types'
import { securityService } from '../api/modules/security/security.service'
import { sessionManager } from '../api/core/sessionManager'
import { registerForUser, unregisterCurrent } from '../services/pushNotifications'

type AuthContextType = {
  user: UsersDTO | null
  login: (user: UsersDTO) => Promise<void>
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
  const [themeState, setThemeState] = useState<'light' | 'dark'>('light')
  const [loading, setLoading] = useState(true)
  const [transitioning, setTransitioning] = useState(false)
  const [transitionMessage, setTransitionMessage] = useState<string | null>(null)
  const [sessionExpired, setSessionExpired] = useState(false)

  useEffect(() => {
    const loadSession = async () => {
      try {
        const savedUser = await AsyncStorage.getItem('user')
        const savedTheme = await AsyncStorage.getItem('theme')

        if (savedUser) {
          setUser(JSON.parse(savedUser))
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

  const login = async (userData: UsersDTO) => {
    try {
      setSessionExpired(false)

      setUser(userData)

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

      setTransitionMessage('Iniciando sesión...')
      setTransitioning(true)

      // Registra el dispositivo para notificaciones push (best-effort)
      if (userData?.Code) {
        registerForUser(userData.Code)
      }
    } catch (error) {
      console.log('Login error', error)
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

      await Promise.all([
        AsyncStorage.removeItem('user'),
        AsyncStorage.removeItem('theme'),
        AsyncStorage.removeItem('menu'),
        AsyncStorage.removeItem('accessToken'),
        AsyncStorage.removeItem('refreshToken'),
      ])
    } catch (e) {
      console.log('Error logout', e)
      setUser(null)
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
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
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)