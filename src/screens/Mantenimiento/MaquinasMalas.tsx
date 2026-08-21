import React, { useEffect, useMemo, useState } from 'react'
import { Spinner, Text, View, XStack, YStack } from 'tamagui'
import { useNavigation } from '@react-navigation/native'

import { ticketsService } from '../../api/modules/mantenimiento/tickets.service'
import { ITicket } from '../../api/modules/mantenimiento/tickets.types'
import { ACCENT, colorPrioridad, fmtDetenido, fmtEntero } from './mantenimiento.helpers'
import { SectionCard } from './components'
import {
  CODES_MALA,
  SITUACION,
  agruparMaquinasMalas,
  esViejo,
  totalesMalas,
  type MaquinaMala,
} from './maquinasMalas.helpers'

// ¿Qué área tiene máquinas malas y las puedo ir a reparar? Es la primera pregunta
// del mecánico cuando entra al taller, así que este bloque se arma con lo que está
// ABIERTO ahora mismo y no con el período del dashboard (el criterio completo está
// en maquinasMalas.helpers.ts). Tocar una máquina abre su ticket.

// Tope por estado: hoy hay ~10 tickets abiertos en toda la planta. El tope existe
// para que un pico no baje miles de filas al celular, y si recorta se avisa.
const TOPE = 300

export interface TicketsAbiertos {
  filas: ITicket[]
  cargando: boolean
  error: string | null
  // El tope recortó: hay más tickets abiertos de los que se trajeron.
  recortado: boolean
  // Sin permiso de pool no se puede mostrar: ver el comentario del hook.
  habilitado: boolean
}

// Los tickets ABIERTOS de toda la planta. Lo piden dos bloques del Resumen — las
// máquinas malas y la carga por mecánico — así que se pide UNA vez y se reparte.
//
// `habilitado` es el permiso de pool: sin él el backend devuelve solo los tickets
// del usuario y los dos bloques mostrarían su carga personal disfrazada de estado
// de la planta. Mejor no mostrarlos que mostrarlos mal.
export function useTicketsAbiertos(recarga: number, habilitado: boolean): TicketsAbiertos {
  const [filas, setFilas] = useState<ITicket[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recortado, setRecortado] = useState(false)

  useEffect(() => {
    if (!habilitado) {
      setCargando(false)
      return
    }
    let vivo = true
    ;(async () => {
      setCargando(true)
      setError(null)
      try {
        // Los Id de estado salen del catálogo, no hardcodeados: no coinciden entre
        // Dev y Pro.
        const respEstados = await ticketsService.getEstados()
        const ids = (respEstados.Data ?? [])
          .filter(e => CODES_MALA.includes(e.Code))
          .map(e => e.Id)
        // Sin rango de fechas: un ticket abierto de hace tres semanas sigue
        // teniendo la máquina parada hoy.
        const resps = await Promise.all(
          ids.map(id => ticketsService.getTickets({ estado_Id: id, scope: 'todos', take: TOPE })),
        )
        if (!vivo) return
        const todas = resps.flatMap(r => r.Data ?? [])
        // TotalCount viene en cada fila (COUNT(*) OVER()): así se sabe si el tope
        // recortó, en vez de mostrar un número corto sin avisar.
        const total = resps.reduce((s, r) => s + (r.Data?.[0]?.TotalCount ?? 0), 0)
        setFilas(todas)
        setRecortado(total > todas.length)
      } catch (e: any) {
        if (vivo) setError(e?.message ?? 'No se pudieron cargar los tickets abiertos.')
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [habilitado, recarga])

  return { filas, cargando, error, recortado, habilitado }
}

const TITULO = '🔧 Máquinas malas ahora'

export function MaquinasMalas({ abiertos }: { abiertos: TicketsAbiertos }) {
  const navigation = useNavigation<any>()
  const areas = useMemo(() => agruparMaquinasMalas(abiertos.filas), [abiertos.filas])

  if (!abiertos.habilitado) return null
  if (abiertos.cargando) {
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
  if (!areas.length) {
    return (
      <SectionCard titulo={TITULO} subtitulo="Por área · no depende del período ni de la prioridad">
        <Text fontSize={12} color="$textMuted">
          Ninguna máquina con ticket abierto en este momento.
        </Text>
      </SectionCard>
    )
  }

  const { maquinas, libres, peor } = totalesMalas(areas)

  return (
    <SectionCard
      titulo={TITULO}
      subtitulo={
        `${fmtEntero(maquinas)} ${maquinas === 1 ? 'máquina' : 'máquinas'} en ` +
        `${areas.length} ${areas.length === 1 ? 'área' : 'áreas'} · ${libres} sin nadie · ` +
        `la peor ${fmtDetenido(peor)}`
      }
      ejeX="Ámbar = nadie la tomó · toca una máquina para abrir su ticket"
    >
      <YStack gap="$2.5">
        {areas.map(a => (
          <YStack key={a.area} gap={1}>
            {/* El encabezado no lleva color: el área no es un estado. La pastilla de
                colores que tenía competía con el punto de cada máquina. */}
            <XStack
              alignItems="flex-end"
              gap="$2"
              paddingBottom={3}
              borderBottomWidth={1}
              borderBottomColor="$border"
            >
              <Text fontSize={13} fontWeight="800" color="$text" flex={1} numberOfLines={1}>
                {a.area}
              </Text>
              <Text fontSize={10} color="$textMuted">
                {a.maquinas.length} {a.maquinas.length === 1 ? 'máquina' : 'máquinas'}
                {a.libres > 0 && a.libres < a.maquinas.length ? ` · ${a.libres} sin nadie` : ''}
              </Text>
            </XStack>
            {a.maquinas.map(m => (
              <FilaMaquina
                key={m.maquina}
                m={m}
                onPress={() =>
                  navigation.navigate('mantenimientoTicketDetalle', { id: m.ticketId })
                }
              />
            ))}
          </YStack>
        ))}
      </YStack>

      {abiertos.recortado && (
        <Text fontSize={10} color="$textMuted" lineHeight={14}>
          Se trajeron los primeros {TOPE} tickets por estado: hay más abiertos de los que caben acá.
        </Text>
      )}
    </SectionCard>
  )
}

// Una fila = una máquina, y UN solo portador de color: el punto de situación. El
// resto es texto neutro o tenue. Antes el punto, el tiempo y la prioridad iban los
// tres pintados y la lista se leía como un semáforo roto.
function FilaMaquina({ m, onPress }: { m: MaquinaMala; onPress: () => void }) {
  const s = SITUACION[m.situacion]
  // Segunda línea, toda tenue: en qué situación está (y quién la tiene), qué le pasa
  // y, si tiene más de un ticket abierto, cuántos.
  const detalle = [
    s.label + (m.mecanico ? ` · ${m.mecanico}` : ''),
    m.falla,
    m.tickets > 1 ? `${m.tickets} tickets` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  // La prioridad solo grita cuando es Alta; Media y Baja no necesitan color propio.
  const alta = m.prioridad === 'Alta'
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
        <View width={7} height={7} borderRadius={2} backgroundColor={s.color} />
        <Text fontSize={12} fontWeight="700" color="$text">
          {m.maquina}
        </Text>
        <Text fontSize={11} color="$textMuted" flex={1} numberOfLines={1}>
          {m.modelo ?? ''}
        </Text>
        {/* El tiempo solo se pinta si pasó de un día: así el color señala la máquina
            olvidada en vez de repetirse en cada fila. */}
        <Text fontSize={12} fontWeight="700" color={esViejo(m) ? s.color : '$text'}>
          {fmtDetenido(m.minMala)}
        </Text>
      </XStack>
      <XStack alignItems="center" gap="$1" paddingLeft={14}>
        {alta && (
          <Text fontSize={10} fontWeight="700" color={colorPrioridad('Alta')}>
            Alta ·
          </Text>
        )}
        <Text fontSize={10} color="$textMuted" flex={1} numberOfLines={1}>
          {alta ? '' : `${m.prioridad} · `}
          {detalle}
        </Text>
      </XStack>
    </YStack>
  )
}
