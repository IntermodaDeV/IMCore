import { useToastController } from '@tamagui/toast'
import { useToastPosition } from '../context/ToastPositionContext'

export type ToastType =
  | 'success'
  | 'error'
  | 'warning'
  | 'info'

type ToastPosition = 'top' | 'bottom'

export const useShowToast = () => {
  const toast = useToastController()
  const { setPosition } = useToastPosition()

  const showToast = (
    type: ToastType,
    title: string,
    message?: string,
    duration: number = 4000,
    position: ToastPosition = 'bottom'
  ) => {
    setPosition(position)

    return toast.show(title, {
      message,
      duration,
      customData: {
        type,
      },
    })
  }

  return { showToast }
}