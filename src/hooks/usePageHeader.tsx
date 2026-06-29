import { useFocusEffect } from '@react-navigation/native'
import { useCallback } from 'react'
import { useHeader } from '../context/HeaderContext'

// `deps` permite que el header se re-aplique cuando cambian valores dinámicos
// (ej. una bandera que cambia con la selección). Por defecto [] => se fija una
// sola vez al enfocar (comportamiento anterior, sin afectar otras pantallas).
export function usePageHeader(config: any, deps: any[] = []) {
  const { setHeader } = useHeader()

  useFocusEffect(
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useCallback(() => {
      setHeader(config)
    }, deps)
  )
}