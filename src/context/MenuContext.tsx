import React, { createContext, useContext, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { MenuDTO } from '../api/modules/security/security.types'
import { securityService } from '../api/modules/security/security.service'
import { ExecutionResponse } from '../api/modules/response.type'
import { subscribeMenuRefresh } from '../services/menuRefresh'
import { useAuth } from './AuthContext'

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
  // MenuProvider va DENTRO de AuthProvider (ver App.tsx), asi que el usuario
  // esta disponible acá para saber de quién recargar el menú.
  const { user } = useAuth()

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

  /**
   * Refresco pedido desde fuera de React (handlers de notificaciones).
   *
   * Lo dispara, por ejemplo, la aprobación de la solicitud de socio: el
   * servidor le acaba de dar el menú del módulo y sin esto no lo vería hasta el
   * próximo inicio de sesión, porque el menú vive cacheado en AsyncStorage.
   */
  useEffect(() => {
    if (!user?.Code) return

    return subscribeMenuRefresh(() => {
      refreshMenu(user.Code).catch(e =>
        console.log('Error refrescando el menu', e),
      )
    })
  }, [user?.Code])

  return (
    <MenuContext.Provider value={{ menu, setMenu, refreshMenu, loading }}>
      {children}
    </MenuContext.Provider>
  )
}
export const useMenu = () => useContext(MenuContext)