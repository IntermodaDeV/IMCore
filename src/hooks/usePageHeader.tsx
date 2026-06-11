import { useFocusEffect } from '@react-navigation/native'
import { useCallback } from 'react'
import { useHeader } from '../context/HeaderContext'

export function usePageHeader(config: any) {
  const { setHeader } = useHeader()

  useFocusEffect(
    useCallback(() => {
      setHeader(config)
    }, [])
  )
}