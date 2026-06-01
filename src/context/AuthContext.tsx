import React, { createContext, useContext, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { UsersDTO } from '../api/modules/security/security.types'

type AuthContextType = {
  user: UsersDTO | null
  login: (user: UsersDTO) => Promise<void>
  logout: () => Promise<void>
  isAuthenticated: boolean
  theme: 'light' | 'dark'
  setTheme: (theme: 'light' | 'dark') => Promise<void>
  loading: boolean
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
      setUser(userData)
      const userTheme = userData?.Theme === 'dark' ? 'dark' : 'light'
      setThemeState(userTheme)
      await AsyncStorage.setItem('user',JSON.stringify(userData))
      await AsyncStorage.setItem('theme',userTheme)
    } catch (error) {
      console.log('Login error', error)
    }
  }

  const logout = async () => {
    try {
      setUser(null)

      await Promise.all([
        AsyncStorage.removeItem('user'),
        AsyncStorage.removeItem('theme'),
        AsyncStorage.removeItem('menu'),
      ])
    } catch (e) {
      console.log('Error logout', e)
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
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)