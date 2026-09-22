import React from 'react'
import { Text, XStack, YStack, View } from 'tamagui'

import { estadoVisual, fmtFechaHora } from '../pasesSalida.helpers'
import { IPaseSalidaEstado } from '../../../api/modules/pasesSalida/pases.types'

/**
 * El movimiento del pase: por dónde fue pasando y quién lo movió.
 *
 * ES OTRA COSA QUE LA BITÁCORA DE FIRMAS, y por eso es otro componente. La de
 * firmas muestra la RUTA —incluidos los pasos que todavía no ocurrieron— y su
 * gracia es decir qué falta. Esta muestra solo HECHOS, en orden, y su gracia es
 * decir qué pasó y cuándo. Mezclarlas daría una línea donde conviven cosas que
 * pasaron con cosas que quizá no pasen.
 *
 * Cada parada toma el color de SU estado (el mismo de los badges de toda la
 * app), así que el recorrido se lee de un vistazo: ámbar mientras esperaba
 * firmas, verde al aprobarse, azul al salir.
 *
 * El hilo que une las paradas es gris siempre: acá todas ya ocurrieron, no hay
 * un "hasta acá llegó" que marcar.
 */

const GRIS = '#94a3b8'
const HILO = 16
const NODO = 12

type Props = {
  movimientos: IPaseSalidaEstado[]
  /** Formateador de fecha. Por omisión, fecha con hora. */
  fmtFecha?: (iso?: string | null) => string
}

export default function LineaEstados({ movimientos, fmtFecha = fmtFechaHora }: Props) {
  if (!movimientos.length) return null

  return (
    <YStack>
      {movimientos.map((m, i) => {
        const est = estadoVisual(m.Estado)
        const ultimo = i === movimientos.length - 1

        return (
          <XStack key={m.Id} gap="$2.5" alignItems="flex-start">
            <YStack alignItems="center" width={NODO}>
              <View
                width={NODO} height={NODO} borderRadius={NODO / 2}
                backgroundColor={est.color}
                borderWidth={1} borderColor={est.color}
                marginTop={2}
              />
              {!ultimo ? <View width={2} height={HILO} backgroundColor={GRIS} /> : null}
            </YStack>

            <YStack flex={1} paddingBottom={ultimo ? 0 : 4} gap={1}>
              <XStack alignItems="center" gap="$1.5" flexWrap="wrap">
                <Text fontSize={11} fontWeight="800" color={est.color}>
                  {m.EstadoNombre || est.label}
                </Text>
                {/* Una fecha reconstruida de datos viejos puede no ser exacta, y
                    no decirlo sería presentar una estimación como un hecho. */}
                {m.Origen === 'BACKFILL' ? (
                  <Text fontSize={9} color="$textMuted">· aprox.</Text>
                ) : null}
              </XStack>
              <Text fontSize={10} color="$textMuted">
                {[fmtFecha(m.Fecha), m.Usuario || m.User_Code].filter(Boolean).join('  ·  ')}
              </Text>
            </YStack>
          </XStack>
        )
      })}
    </YStack>
  )
}
