import { createContext, useContext, useState } from 'react'
import { PullLoader } from '../components/Skeletons/PullLoader'

const LoaderContext = createContext({
  show: () => {},
  hide: () => {},
})

export function LoaderProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false)

  return (
    <LoaderContext.Provider
      value={{
        show: () => setVisible(true),
        hide: () => setVisible(false),
      }}
    >
      {children}

      {visible && <PullLoader />}
    </LoaderContext.Provider>
  )
}

export const useLoader = () => useContext(LoaderContext)