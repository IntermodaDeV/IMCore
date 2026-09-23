import React from 'react'
import { YStack } from 'tamagui'

/**
 * Envuelve una tarjeta de pase y la resalta cuando llegó desde una
 * notificación.
 *
 * POR QUÉ UN ANILLO POR FUERA Y NO EL FONDO DE LA TARJETA
 *
 *   Antes el resaltado se hacía sobre la tarjeta misma: el fondo y el grosor
 *   del borde salían de un ternario. Eso la dejaba comportándose distinto a la
 *   tarjeta de Control de salida —que tiene las mismas props pero estáticas— y
 *   al presionarla la sombra de la elevación se asomaba por las orillas como un
 *   halo gris.
 *
 *   Con el anillo afuera, la tarjeta queda IDÉNTICA a la de Control de salida,
 *   props estáticas incluidas, y su pintura no depende de nada que cambie. Lo
 *   que varía vive en este contenedor, que no tiene elevación y por lo tanto no
 *   tiene ninguna sombra que se pueda colar.
 *
 * SIGUE TIÑENDO UN ÁREA, NO UNA LÍNEA
 *   En una lista de tarjetas iguales, un borde de 2 px se pierde al pasar la
 *   vista. Por eso el anillo lleva fondo y no solo contorno — es el mismo
 *   criterio del historial de horas extra.
 *
 * Sin resaltado NO envuelve nada: devuelve los hijos tal cual, así la lista no
 * gana un nivel de vistas por cada fila para nada.
 */
export default function TarjetaResaltable({
  resaltado,
  children,
}: {
  resaltado: boolean
  children: React.ReactNode
}) {
  if (!resaltado) return <>{children}</>

  return (
    <YStack
      backgroundColor="$primaryOpacity2"
      borderWidth={2}
      borderColor="$primary"
      borderRadius="$5"
      padding={3}
    >
      {children}
    </YStack>
  )
}
