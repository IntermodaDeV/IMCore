import React, { createContext, useContext, useState } from 'react'

type ToastPosition = 'top' | 'bottom'

type ContextType = {
  position: ToastPosition
  setPosition: (pos: ToastPosition) => void
}

const ToastPositionContext = createContext<ContextType | null>(null)

export const ToastPositionProvider = ({ children }: any) => {
  const [position, setPosition] = useState<ToastPosition>('top')

  return (
    <ToastPositionContext.Provider value={{ position, setPosition }}>
      {children}
    </ToastPositionContext.Provider>
  )
}

export const useToastPosition = () => {
  const ctx = useContext(ToastPositionContext)
  if (!ctx) throw new Error('useToastPosition must be used inside provider')
  return ctx
}