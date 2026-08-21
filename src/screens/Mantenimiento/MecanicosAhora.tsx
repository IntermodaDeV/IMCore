import React, { useEffect, useMemo, useState } from 'react'
import { Spinner, Text, View, XStack, YStack } from 'tamagui'
import { useNavigation } from '@react-navigation/native'

import { ticketsService } from '../../api/modules/mantenimiento/tickets.service'
import { IMecanico } from '../../api/modules/mantenimiento/tickets.types'
import { ACCENT, fmtDetenido } from './mantenimiento.helpers'
import { SectionCard } from './components'
import {
  ESTADO_MEC,
  clasificarMecanicos,
  totalesMecanicos,
  type EstadoMecanico,
  type MecanicoAhora,
} from './mecanicosAhora.helpers'
import type { TicketsAbiertos } from './MaquinasMalas'

// La otra mitad de la pregunta de piso: ya sé qué máquina está mala, ahora quién la
// puede atender. Los tickets abiertos llegan del Resumen (useTicketsAbiertos), los
// mismos que usa el panel de máquinas malas, así que no agrega una llamada.
//
// El criterio de los cuatro estados vive en mecanicosAhora.helpers.ts, junto con el
// de por qué los supervisores de mantenimiento se cuentan aparte.

const TITULO = '🧰 Mecánicos ahora'
const ORDEN: EstadoMecanico[] = ['trabajando', 'pausa', 'cola', 'libre']
const FUERA_PADRON = '(fuera del padrón)'

export function MecanicosAhora({ abiertos }: { abiertos: TicketsAbiertos }) {
  const navigation = useNavigation<any>()
  const [padron, setPadron] = useState<IMecanico[]>([])
  const [cargandoPadron, setCargandoPadron] = useState(true)

  useEffect(() => {
    if (!abiertos.habilitado) {
      setCargandoPadron(false)
      return
    }
    let vivo = true
    ;(async () => {
      try {
        const resp = await ticketsService.getMecanicos()
        if (vivo) setPadron(resp.Data ?? [])
      } catch {
        // Sin padrón solo se pierden los que no tienen nada abierto; los ocupados
        // salen igual porque vienen de los tickets.
      } finally {
        if (vivo) setCargandoPadron(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [abiertos.habilitado, abiertos.recarga])

  const { operativos, supervisores } = useMemo(
    () => clasificarMecanicos(padron, abiertos.filas),
    [padron, abiertos.filas],
  )

  if (!abiertos.habilitado) return null
  if (abiertos.cargando || cargandoPadron) {
    return (
      <SectionCard titulo={TITULO}>
        <YStack height={100} alignItems="center" justifyContent="center">
          <Spinner size="large" color={ACCENT} />
        </YStack>
      </SectionCard>
    )
  }
  if (abiertos.error) {
    return (
      <SectionCard titulo={TITULO}>
        <Text fontSize={12} color="$textMuted">
          {abiertos.error}
        </Text>
      </SectionCard>
    )
  }

  const t = totalesMecanicos(operativos)
  // Los supervisores solo se mencionan si tienen algo en la mano: libres no son
  // capacidad de taller y ensucian el número.
  const supOcupados = supervisores.filter(s => s.estado !== 'libre')
  const sinRol = padron.length > 0 && padron.every(m => !m.Rol)

  return (
    <SectionCard
      titulo={TITULO}
      subtitulo={
        `${t.trabajando} trabajando · ${t.pausa} en pausa · ${t.cola} con cola · ` +
        `${t.libre} libres de ${t.total}`
      }
      ejeX="Libre = sin nada abierto en el sistema · toca a alguien para abrir su ticket"
    >
      <YStack gap="$2.5">
        {ORDEN.map(estado => {
          const e = ESTADO_MEC[estado]
          const gente = operativos.filter(m => m.estado === estado)
          return (
            <YStack key={estado} gap={1}>
              <XStack
                alignItems="center"
                gap="$2"
                paddingBottom={3}
                borderBottomWidth={1}
                borderBottomColor="$border"
              >
                <View width={8} height={8} borderRadius={2} backgroundColor={e.color} />
                <Text fontSize={13} fontWeight="800" color="$text" flex={1}>
                  {e.label}
                </Text>
                <Text fontSize={12} fontWeight="800" color="$textMuted">
                  {gente.length}
                </Text>
              </XStack>

              {gente.length === 0 ? (
                <Text fontSize={11} color="$textMuted" paddingVertical={3}>
                  Ninguno.
                </Text>
              ) : estado === 'libre' ? (
                /* En el celular, nueve nombres en nueve renglones es scroll de gusto:
                   van corridos, que es como se leen igual. */
                <Text fontSize={12} color="$text" lineHeight={18} paddingVertical={3}>
                  {gente.map(m => m.nombre).join(' · ')}
                </Text>
              ) : (
                gente.map(m => (
                  <FilaMecanico
                    key={m.code}
                    m={m}
                    onPress={() =>
                      m.ticketId &&
                      navigation.navigate('mantenimientoTicketDetalle', { id: m.ticketId })
                    }
                  />
                ))
              )}
            </YStack>
          )
        })}
      </YStack>

      {supOcupados.length > 0 && (
        <Text fontSize={10} color="$textMuted" lineHeight={14}>
          Con trabajo en curso pero fuera del conteo de mecánicos:{' '}
          {supOcupados.map(s => `${s.nombre} (${ESTADO_MEC[s.estado].label.toLowerCase()})`).join(' · ')}.
        </Text>
      )}

      {sinRol && (
        <Text fontSize={10} color="$textMuted" lineHeight={14}>
          El padrón todavía no trae el rol (necesita el script 74 y la API desplegada), así que los
          supervisores de mantenimiento están contados como mecánicos.
        </Text>
      )}
    </SectionCard>
  )
}

// El color lo lleva el encabezado del bloque (uno por estado), así que la fila va en
// texto neutro: mismo criterio que el panel de máquinas malas.
function FilaMecanico({ m, onPress }: { m: MecanicoAhora; onPress: () => void }) {
  const detalle = [
    m.area,
    m.total > 1 ? `${m.total} tickets` : null,
    m.rol === FUERA_PADRON ? 'fuera del padrón' : null,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <YStack
      onPress={onPress}
      pressStyle={{ opacity: 0.55 }}
      paddingVertical={5}
      paddingHorizontal="$1"
      borderRadius="$2"
      gap={1}
    >
      <XStack alignItems="center" gap="$1.5">
        <Text fontSize={12} fontWeight="700" color="$text" flex={1} numberOfLines={1}>
          {m.nombre}
        </Text>
        {!!m.donde && (
          <Text fontSize={11} color="$textMuted">
            {m.donde}
          </Text>
        )}
        {m.desde != null && (
          <Text fontSize={12} fontWeight="700" color="$text">
            {fmtDetenido(Math.round((Date.now() - m.desde) / 60000))}
          </Text>
        )}
      </XStack>
      {!!detalle && (
        <Text fontSize={10} color="$textMuted" numberOfLines={1}>
          {detalle}
        </Text>
      )}
    </YStack>
  )
}
