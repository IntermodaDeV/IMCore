import { useHeader } from '../context/HeaderContext'

export function useUpdatePageHeader() {
  const { setHeader } = useHeader()

  const updateHeader = (config: any) => {
    setHeader((prev: any) => ({
      ...prev,
      ...config,
    }))
  }

  return { updateHeader }
}