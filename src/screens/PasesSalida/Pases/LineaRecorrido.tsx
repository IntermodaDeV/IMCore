import React from 'react'
import { Text, XStack, YStack, View } from 'tamagui'
import { LogOut, LogIn, Eye, ArrowRightLeft, HandHeart } from 'lucide-react-native'

import { fmtFechaHora } from '../pasesSalida.helpers'
import { IPaseBitacora } from '../../../api/modules/pasesSalida/pases.types'

/**
 * El recorrido del pase por los portones.
 *
 * ES LA TERCERA LÍNEA DE TIEMPO DEL PASE, y las tres dicen cosas distintas:
 *
 *   LineaFirmas      la RUTA de aprobación — incluye lo que todavía no pasó
 *   LineaEstados     por qué ESTADOS fue pasando el pase
 *   LineaRecorrido   por dónde pasó FÍSICAMENTE el material            ← esta
 *
 * Existe porque el recibo lo pide. A quien le toca dar por recibido no le sirve
 * saber que el pase está en "Retornado": necesita ver que salió por el andén a
 * las 7:40, que seguridad principal lo dejó pasar a las 7:52, y que volvió por
 * ahí mismo ayer a las 4:10 con dos martillos. Firmar contra eso es distinto de
 * firmar contra un badge de color.
 *
 * CADA TIPO TIENE SU ÍCONO Y SU COLOR porque son hechos de distinta naturaleza:
 * un cruce que solo se miró no vale lo mismo que uno donde el material pasó, y
 * una entrega con cantidades no vale lo mismo que un recibo.
 */

const HILO = 16
const NODO = 12
const GRIS = '#94a3b8'

/**
 * Lo que cada tipo de evento es, de un vistazo.
 *
 * `enLugar` decide qué va al lado del título: el PORTÓN o la PERSONA.
 *
 * Los eventos del portón hablan de LUGARES —ahí lo que importa es por dónde
 * pasó el material; quién lo atendió baja con la fecha—. El recibo habla de una
 * PERSONA: es una firma, y una firma sin nombre no es nada.
 *
 * ENTREGA y REGRESO se titulan IGUAL porque son el mismo hecho: el material
 * entró. Solo cambia que la entrega trae cantidades y el regreso no —un pase de
 * Camión no tiene nada que contar—. Titularlos distinto haría parecer que son
 * dos cosas, y leído en fila daba la impresión de que el pase se recibió varias
 * veces.
 */
const PINTA: Record<
  IPaseBitacora['Tipo'],
  { icon: any; color: string; titulo: string; enLugar: boolean }
> = {
  SALIDA:   { icon: LogOut,         color: '#3b82f6', titulo: 'Salió por',   enLugar: true },
  PASO:     { icon: ArrowRightLeft, color: '#3b82f6', titulo: 'Cruzó por',   enLugar: true },
  /* Gris a propósito: mirar no es mover. Si se pintara como los demás, un pase
     que un guardia revisó sin dejarlo pasar parecería haber avanzado. */
  VERIFICO: { icon: Eye,            color: GRIS,      titulo: 'Revisado en', enLugar: true },
  REGRESO:  { icon: LogIn,          color: '#14b8a6', titulo: 'Entró por',   enLugar: true },
  ENTREGA:  { icon: LogIn,          color: '#14b8a6', titulo: 'Entró por',   enLugar: true },
  /* El recibo de verdad: quien pidió el material firma que lo tiene. Es el
     único evento que no ocurre en un portón. */
  RECIBO:   { icon: HandHeart,      color: '#22c55e', titulo: 'Recibido por', enLugar: false },
}

type Props = {
  eventos: IPaseBitacora[]
  fmtFecha?: (iso?: string | null) => string
}

export default function LineaRecorrido({ eventos, fmtFecha = fmtFechaHora }: Props) {
  if (!eventos.length) return null

  return (
    <YStack>
      {eventos.map((e, i) => {
        const p = PINTA[e.Tipo] ?? { icon: ArrowRightLeft, color: GRIS, titulo: e.Tipo, enLugar: true }
        const Icon = p.icon
        const ultimo = i === eventos.length - 1

        const quien = e.Usuario || e.User_Code

        /* Lo que acompaña al título: el portón en los cruces, la persona en la
           entrega y el recibo. */
        const protagonista = p.enLugar ? e.Puesto : quien

        /* Abajo va lo que sobró: en los eventos del portón, quién lo atendió;
           en el recibo, nada — no ocurre en ningún portón y la persona ya está
           en el título. */
        const bajo = [fmtFecha(e.Fecha), p.enLugar ? quien : null].filter(Boolean)

        return (
          <XStack key={`${e.Fecha}-${e.Tipo}-${i}`} gap="$2.5" alignItems="flex-start">
            <YStack alignItems="center" width={NODO}>
              <View
                width={NODO} height={NODO} borderRadius={NODO / 2}
                backgroundColor={p.color} borderWidth={1} borderColor={p.color}
                marginTop={2}
              />
              {!ultimo ? <View width={2} height={HILO} backgroundColor={GRIS} /> : null}
            </YStack>

            <YStack flex={1} paddingBottom={ultimo ? 0 : 6} gap={1}>
              <XStack alignItems="center" gap="$1.5" flexWrap="wrap">
                <Icon size={11} color={p.color} />
                <Text fontSize={11} fontWeight="800" color={p.color}>{p.titulo}</Text>
                {protagonista ? (
                  <Text fontSize={11} fontWeight="800" color="$text">{protagonista}</Text>
                ) : null}
              </XStack>

              {/* Qué volvió en esa entrega. Es el dato contra el que se cuenta
                  la caja, así que va completo y no recortado. */}
              {e.Detalle ? (
                <Text fontSize={11} color="$text">{e.Detalle}</Text>
              ) : null}

              <Text fontSize={10} color="$textMuted">{bajo.join('  ·  ')}</Text>
            </YStack>
          </XStack>
        )
      })}
    </YStack>
  )
}
