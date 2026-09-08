import { useCallback, useMemo, useRef } from 'react'
import { useToastController } from '@tamagui/toast'
import { useToastPosition } from '../context/ToastPositionContext'

export type ToastType =
  | 'success'
  | 'error'
  | 'warning'
  | 'info'

type ToastPosition = 'top' | 'bottom'

/**
 * Muestra un toast.
 *
 * `showToast` tiene identidad ESTABLE entre renders, y eso importa: media app lo
 * mete en las dependencias de un useEffect / useCallback ("cargar"). Cuando la
 * función se recreaba en cada render, esas dependencias cambiaban siempre y el
 * efecto se volvía a ejecutar en bucle — se veía como una pantalla recargando
 * sola contra la API, y como un valor por defecto que pisaba lo que el usuario
 * acababa de escoger.
 *
 * El controlador y setPosition se leen por ref para que la identidad no dependa
 * de que ellos sean estables.
 */
export const useShowToast = () => {
  const toast = useToastController()
  const { setPosition } = useToastPosition()

  const vivo = useRef({ toast, setPosition })
  vivo.current = { toast, setPosition }

  const showToast = useCallback(
    (
      type: ToastType,
      title: string,
      message?: string,
      duration: number = 4000,
      position: ToastPosition = 'bottom'
    ) => {
      vivo.current.setPosition(position)

      return vivo.current.toast.show(title, {
        message,
        duration,
        customData: {
          type,
        },
      })
    },
    []
  )

  // El objeto también se memoiza: hay pantallas que se quedan con él entero.
  return useMemo(() => ({ showToast }), [showToast])
}
