import React, { createContext, useContext, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { MenuDTO } from '../api/modules/security/security.types'
import { securityService } from '../api/modules/security/security.service'
import { ExecutionResponse } from '../api/modules/response.type'

type MenuContextType = {
  menu: MenuDTO[]
  setMenu: (menu: MenuDTO[]) => void
  refreshMenu: (userCode: string) => Promise<void>
  loading: boolean
}

const MenuContext = createContext<MenuContextType>({} as MenuContextType)

export const MenuProvider = ({ children }: { children: React.ReactNode }) => {
  const [menu, setMenu] = useState<MenuDTO[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadMenu = async () => {
      try {
        const savedMenu = await AsyncStorage.getItem('menu')

        if (savedMenu) {
          setMenu(JSON.parse(savedMenu))
        }
      } catch (e) {
        console.log(e)
      } finally {
        setLoading(false)
      }
    }

    loadMenu()
  }, [])

  const refreshMenu = async (userCode: string) => {
    const data: ExecutionResponse<MenuDTO[]> = await securityService.getMenuByUser(userCode)
    setMenu(data.Data)
    await AsyncStorage.setItem('menu', JSON.stringify(data.Data))
  }

  return (
    <MenuContext.Provider value={{ menu, setMenu, refreshMenu, loading }}>
      {children}
    </MenuContext.Provider>
  )
}
export const useMenu = () => useContext(MenuContext)