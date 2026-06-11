// context/HeaderContext.tsx

import { createContext, useContext, useState } from 'react'

const HeaderContext = createContext<any>(null)

export function HeaderProvider({ children }: any) {
  const [header, setHeader] = useState({
    title: '',
    left: null,
    center: null,
    right: null,
  })

  return (
    <HeaderContext.Provider value={{ header, setHeader }}>
      {children}
    </HeaderContext.Provider>
  )
}

export const useHeader = () => useContext(HeaderContext)