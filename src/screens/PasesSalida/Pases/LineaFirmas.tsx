import React from 'react'
import { Text, XStack, YStack, View } from 'tamagui'
import { Check, X as Equis } from 'lucide-react-native'

import { ACCENT } from '../pasesSalida.helpers'
import { IPasoFirma } from '../../../api/modules/pasesSalida/pases.types'

/**
 * La ruta del pase como línea de tiempo vertical.
 *
 * Arranca en "Creado" —que siempre pasó— y sigue con una parada por firma. El
 * hilo que une las paradas se pinta naranja hasta donde llegó y gris de ahí en
 * adelante, así que se ve de un vistazo por dónde va sin leer nada.
 *
 * Vertical y no horizontal a propósito: cada parada lleva nombre y fecha
 * debajo, y en horizontal ese texto no cabe en un teléfono.
 *
 * Una parada se marca cumplida si CUALQUIERA de sus alternativas firmó — es la
 * definición de alternativa, no hace falta que firmen todas.
 */

const GRIS = '#94a3b8'
const ROJO = '#ef4444'

/** Alto del tramo de hilo entre dos paradas. */
const HILO = 18
const NODO = 16

type Props = {
  pasos: IPasoFirma[]
  /** El paso que espera ahora. Se muestra como la parada activa. */
  pasoActual?: number | null
  /** La parada inicial. Sin esto la línea arranca en la primera firma. */
  creadoPor?: string | null
  creadoEn?: string | null
  fmtFecha?: (iso?: string | null) => string
}

/** Una parada de la línea. */
function Parada({
  titulo, detalle, estado, ultimo,
}: {
  titulo: string
  detalle?: string | null
  estado: 'hecho' | 'actual' | 'pendiente' | 'rechazado'
  ultimo: boolean
}) {
  const color = estado === 'rechazado' ? ROJO : estado === 'pendiente' ? GRIS : ACCENT
  // El hilo hacia abajo sigue el color de ESTA parada: naranja mientras la ruta
  // ya pasó por acá, gris cuando todavía no llegó.
  const hilo = estado === 'hecho' ? ACCENT : GRIS

  return (
    <XStack gap="$2.5" alignItems="flex-start">
      <YStack alignItems="center" width={NODO}>
        <View
          width={NODO} height={NODO} borderRadius={NODO / 2}
          borderWidth={estado === 'actual' ? 3 : 1.5}
          borderColor={color}
          backgroundColor={estado === 'hecho' || estado === 'rechazado' ? color : 'transparent'}
          alignItems="center" justifyContent="center"
        >
          {estado === 'hecho' ? <Check size={9} color="#fff" /> : null}
          {estado === 'rechazado' ? <Equis size={9} color="#fff" /> : null}
        </View>
        {!ultimo ? <View width={2} height={HILO} backgroundColor={hilo} /> : null}
      </YStack>

      <YStack flex={1} paddingBottom={ultimo ? 0 : 4} gap={1}>
        <Text fontSize={11} fontWeight={estado === 'pendiente' ? '700' : '800'}
          color={estado === 'pendiente' ? '$textMuted' : '$text'}>
          {titulo}
        </Text>
        {detalle ? <Text fontSize={10} color="$textMuted">{detalle}</Text> : null}
      </YStack>
    </XStack>
  )
}

export default function LineaFirmas({ pasos, pasoActual, creadoPor, creadoEn, fmtFecha }: Props) {
  if (!pasos.length) return null

  const hayCreado = !!creadoPor || !!creadoEn

  return (
    <YStack>
      {hayCreado ? (
        <Parada
          titulo="Creado"
          detalle={[creadoPor, creadoEn && fmtFecha ? fmtFecha(creadoEn) : null]
            .filter(Boolean).join(' · ')}
          estado="hecho"
          ultimo={false}
        />
      ) : null}

      {pasos.map((p, i) => {
        const estado = p.Rechazado ? 'rechazado'
          : p.Firmado ? 'hecho'
            : pasoActual != null && p.Paso === pasoActual ? 'actual'
              : 'pendiente'

        const detalle = p.Firmado && p.FirmadoPor
          ? `Firmó ${p.FirmadoPor}${p.FechaAuth && fmtFecha ? ` · ${fmtFecha(p.FechaAuth)}` : ''}`
          : p.Rechazado ? 'Rechazado'
            : estado === 'actual' ? 'En espera de firma'
              : null

        return (
          <Parada
            key={p.Paso}
            titulo={p.Alternativas.join('  o  ') || `Firma ${p.Paso}`}
            detalle={detalle}
            estado={estado}
            ultimo={i === pasos.length - 1}
          />
        )
      })}
    </YStack>
  )
}
