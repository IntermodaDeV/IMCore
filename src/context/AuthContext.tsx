import React, { createContext, useContext, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { UsersDTO } from '../api/modules/security/security.types'
import { securityService } from '../api/modules/security/security.service'
import { sessionManager } from '../api/core/sessionManager'

type AuthContextType = {
  user: UsersDTO | null
  companyId: number | null
  setCompanyId: (companyId: number | null) => Promise<void>
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
  const [companyId, setCompanyIdState] = useState<number | null>(null)
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
        const savedCompanyId = await AsyncStorage.getItem('companyId')

        if (savedUser) {
          const parsedUser = JSON.parse(savedUser)
          setUser(parsedUser)

          if (savedCompanyId != null) {
            setCompanyIdState(Number(savedCompanyId))
          } else if (parsedUser?.DefaultCompany != null) {
            setCompanyIdState(Number(parsedUser.DefaultCompany))
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

      const defaultCompany =
        userData?.DefaultCompany != null
          ? Number(userData.DefaultCompany)
          : null

      setCompanyIdState(defaultCompany)

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

      if (defaultCompany != null) {
        await AsyncStorage.setItem('companyId', String(defaultCompany))
      } else {
        await AsyncStorage.removeItem('companyId')
      }

      setTransitionMessage('Iniciando sesión...')
      setTransitioning(true)
    } catch (error) {
      console.log('Login error', error)
    }
  }

  const logout = async () => {
    try {
      setTransitionMessage('Cerrando sesión...')
      setTransitioning(true)

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
        companyId,
        setCompanyId,
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