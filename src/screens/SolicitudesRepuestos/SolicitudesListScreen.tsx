import React, { useCallback, useMemo, useState } from 'react'
import { FlatList, RefreshControl } from 'react-native'
import { Spinner, Text, View, XStack, YStack, useTheme } from 'tamagui'
import { ChevronLeft, ChevronRight, ClipboardPlus, History, PackageCheck, Plus, TriangleAlert } from 'lucide-react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'

import { usePageHeader } from '../../hooks/usePageHeader'
import { useShowToast } from '../../utils/useShowToast'
import { solicitudesRepuestosService as svc } from '../../api/modules/solicitudesRepuestos/solicitudes.service'
import { ISolicitud } from '../../api/modules/solicitudesRepuestos/solicitudes.types'
import { shadows } from '../../theme/shadows'
import { Periodo, rango } from '../../utils/periodo'
import { ACCENT, BarraAvance, EstadoChip, fmtFecha } from './components'

// "¿Ya llegó mi repuesto?" — esa es la pregunta que contesta esta pantalla, y
// por eso lo PRIMERO que se ve de cada solicitud es en qué va, no cuándo se pidió.
//
// El alcance lo decide el servidor: el mecánico ve las suyas; quien gestiona, todas.
// No se filtra nada acá.
export default function SolicitudesListScreen() {
  const theme = useTheme()
  const navigation = useNavigation<any>()
  const { showToast } = useShowToast()

  usePageHeader({
    center: <Text fontSize="$4" fontWeight="700" color="$text">Solicitudes de repuestos</Text>,
  })

  const [items, setItems] = useState<ISolicitud[]>([])
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [offset, setOffset] = useState(0)   // 0 = período actual, negativo = anteriores

  const { desde, hasta, label } = useMemo(() => rango(periodo, offset), [periodo, offset])

  const cargar = useCallback(async () => {
    try {
      // Se pide TODO y el período se aplica acá, no en el servidor. Es a
      // propósito: así se puede calcular gratis cuántas siguen abiertas FUERA
      // del período elegido y avisarlo, que es lo que evita que una pieza
      // pedida hace tres meses desaparezca de la vista justo cuando más
      // importa. Los volúmenes lo permiten (un mecánico ve solo las suyas).
      // Si algún día crece, el filtro por fecha ya existe en el endpoint.
      const res = await svc.getSolicitudes()
      if (res.Success) setItems(res.Data ?? [])
      else showToast('error', 'No se pudo cargar', res.ErrorMessage || 'Intenta de nuevo')
    } catch (e: any) {
      showToast('error', 'Error', e?.message || 'No se pudieron cargar las solicitudes')
    } finally {
      setCargando(false)
      setRefrescando(false)
    }
    // showToast ya es estable, pero se deja fuera igual: si esta lista dependiera
    // de la identidad de una función se recargaría en bucle contra la API.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  const onRefresh = useCallback(() => { setRefrescando(true); cargar() }, [cargar])

  // Abierta = todavía puede llegar algo. Son las que no se deben perder de vista.
  const abierta = (s: ISolicitud) => s.Estado !== 'INGRESADO' && s.Estado !== 'CANCELADO'

  const delPeriodo = useMemo(() => {
    const d = desde.getTime(), h = hasta.getTime()
    return items.filter(s => {
      const t = new Date(s.Fecha).getTime()
      return t >= d && t < h
    })
  }, [items, desde, hasta])

  // Las abiertas de ANTES del período: no se muestran mezcladas (confundiría el
  // filtro), pero sí se avisa cuántas son y se puede saltar a ellas.
  const abiertasAntes = useMemo(
    () => items.filter(s => abierta(s) && new Date(s.Fecha).getTime() < desde.getTime()),
    [items, desde],
  )

  // Las que ya llegaron van ARRIBA con todo y marca: son las únicas que piden una
  // acción del mecánico (ir a bodega). Después las que siguen en curso, y de
  // últimas las cerradas.
  const ordenadas = useMemo(() => {
    const peso = (s: ISolicitud) =>
      s.Ingresadas > 0 && s.Estado !== 'CANCELADO' ? 0
      : s.Estado === 'CANCELADO' ? 2
      : 1
    return [...delPeriodo].sort((a, b) =>
      peso(a) - peso(b) || new Date(b.Fecha).getTime() - new Date(a.Fecha).getTime())
  }, [delPeriodo])

  // Salta al período de la abierta más vieja, que es a donde el mecánico quiere ir.
  const irALaMasVieja = () => {
    const masVieja = abiertasAntes.reduce((a, b) =>
      new Date(a.Fecha).getTime() <= new Date(b.Fecha).getTime() ? a : b)
    const f = new Date(masVieja.Fecha)
    const hoy = new Date()
    if (periodo === 'anio') setOffset(f.getFullYear() - hoy.getFullYear())
    else if (periodo === 'mes')
      setOffset((f.getFullYear() - hoy.getFullYear()) * 12 + (f.getMonth() - hoy.getMonth()))
    else setOffset(-Math.ceil((hoy.getTime() - f.getTime()) / (7 * 24 * 3600 * 1000)))
  }

  const TABS: { p: Periodo; txt: string }[] = [
    { p: 'semana', txt: 'Semana' }, { p: 'mes', txt: 'Mes' }, { p: 'anio', txt: 'Año' },
  ]

  const render = ({ item }: { item: ISolicitud }) => {
    const listo = item.Ingresadas > 0 && item.Estado !== 'CANCELADO'
    return (
      <View
        onPress={() => navigation.navigate('solicitudesRepuestosDetalle', { id: item.Id, numero: item.Numero })}
        pressStyle={{ opacity: 0.85 }}
        backgroundColor="$backgroundElevated"
        borderRadius="$4"
        borderWidth={1}
        borderColor={listo ? 'rgba(34,197,94,0.45)' : '$border'}
        padding="$3.5"
        marginBottom="$3"
        {...shadows.sm}
      >
        <XStack alignItems="flex-start" gap="$3">
          <YStack flex={1} gap="$1.5">
            <XStack alignItems="center" gap="$2" flexWrap="wrap">
              <Text fontSize="$3" fontWeight="800" color="$text">{item.Numero}</Text>
              <Text fontSize="$2" color="$textMuted">{fmtFecha(item.Fecha)}</Text>
              {listo && (
                <XStack alignItems="center" gap="$1">
                  <PackageCheck size={13} color="#16a34a" />
                  <Text fontSize={11} fontWeight="700" color="#16a34a">
                    {item.Ingresadas} en bodega
                  </Text>
                </XStack>
              )}
            </XStack>

            <Text fontSize="$3" color="$text">{item.Modelo}</Text>
            <Text fontSize="$2" color="$textMuted">
              {item.Lineas} repuesto{item.Lineas === 1 ? '' : 's'}
              {item.SinCodigo > 0 ? ` · ${item.SinCodigo} sin código` : ''}
            </Text>

            <XStack alignItems="center" gap="$2" marginTop="$1" flexWrap="wrap">
              <EstadoChip estado={item.Estado} />
              {item.SinBarcode > 0 && (
                <XStack alignItems="center" gap="$1">
                  <TriangleAlert size={12} color="#ea580c" />
                  <Text fontSize={11} color="#ea580c">sin código de barras</Text>
                </XStack>
              )}
            </XStack>
            <BarraAvance estado={item.Estado} />
          </YStack>
          <ChevronRight size={18} color={theme.textMuted?.val} />
        </XStack>
      </View>
    )
  }

  if (cargando) {
    return <YStack flex={1} alignItems="center" justifyContent="center"><Spinner size="large" color={ACCENT} /></YStack>
  }

  return (
    <YStack flex={1} backgroundColor="$background">
      {/* Filtro de período, igual que en Despacho de Repuestos y el dashboard */}
      <YStack paddingHorizontal={16} paddingTop={12} gap="$2">
        <XStack borderWidth={1} borderColor="$border" borderRadius="$4" padding="$1"
          backgroundColor="$backgroundElevated" gap="$1">
          {TABS.map(t => (
            <View key={t.p} flex={1} onPress={() => { setPeriodo(t.p); setOffset(0) }}
              pressStyle={{ opacity: 0.85 }}
              backgroundColor={periodo === t.p ? ACCENT : 'transparent'} borderRadius="$3" height={34}
              alignItems="center" justifyContent="center">
              <Text fontWeight="800" fontSize="$2" color={periodo === t.p ? '#fff' : '$textMuted'}>{t.txt}</Text>
            </View>
          ))}
        </XStack>

        <XStack alignItems="center" justifyContent="space-between">
          <View onPress={() => setOffset(o => o - 1)} pressStyle={{ opacity: 0.6 }} hitSlop={10} padding="$2">
            <ChevronLeft size={22} color={theme.text?.val} />
          </View>
          <YStack alignItems="center">
            <Text fontSize="$4" fontWeight="800" color="$text">{label}</Text>
            <Text fontSize="$2" color="$textMuted">
              {ordenadas.length === 0 ? 'sin solicitudes'
                : `${ordenadas.length} solicitud${ordenadas.length === 1 ? '' : 'es'}`}
            </Text>
          </YStack>
          {/* Hacia adelante se topa en el período actual: no hay futuro que ver. */}
          <View onPress={() => setOffset(o => Math.min(0, o + 1))} pressStyle={{ opacity: 0.6 }}
            hitSlop={10} padding="$2" opacity={offset >= 0 ? 0.3 : 1}>
            <ChevronRight size={22} color={theme.text?.val} />
          </View>
        </XStack>

        {/* Lo que sigue esperando de antes del período. Sin este aviso, un
            repuesto pedido hace meses que todavía no llega quedaría invisible
            justo cuando más hay que reclamarlo. */}
        {abiertasAntes.length > 0 && (
          <View onPress={irALaMasVieja} pressStyle={{ opacity: 0.85 }}
            backgroundColor="rgba(234,88,12,0.10)" borderRadius="$3"
            paddingHorizontal="$3" paddingVertical="$2.5">
            <XStack alignItems="center" gap="$2">
              <History size={15} color="#ea580c" />
              <Text flex={1} fontSize="$2" color="#9a3412">
                {abiertasAntes.length} solicitud{abiertasAntes.length === 1 ? '' : 'es'} de antes
                {' '}sigue{abiertasAntes.length === 1 ? '' : 'n'} esperando
              </Text>
              <Text fontSize="$2" fontWeight="800" color="#ea580c">Ver</Text>
            </XStack>
          </View>
        )}
      </YStack>

      <FlatList
        data={ordenadas}
        keyExtractor={s => String(s.Id)}
        renderItem={render}
        contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} tintColor={ACCENT} />}
        ListEmptyComponent={
          <YStack alignItems="center" paddingTop="$8" gap="$2">
            <ClipboardPlus size={40} color={theme.textMuted?.val} />
            {items.length === 0 ? (
              <>
                <Text color="$textMuted" textAlign="center">
                  Todavía no ha pedido ningún repuesto.
                </Text>
                <Text color="$textMuted" fontSize="$2" textAlign="center" paddingHorizontal="$6">
                  Cuando encuentre el número de parte en el manual, pídalo acá y va a poder
                  ver en qué va hasta que llegue a bodega.
                </Text>
              </>
            ) : (
              <Text color="$textMuted" fontSize="$3" textAlign="center" paddingHorizontal="$6">
                No hay solicitudes en {label}.{'\n'}Use la flecha para ver períodos anteriores.
              </Text>
            )}
          </YStack>
        }
      />

      <View
        position="absolute" bottom={24} right={20}
        onPress={() => navigation.navigate('solicitudesRepuestosNueva')}
        pressStyle={{ opacity: 0.85, scale: 0.97 }}
        backgroundColor={ACCENT} borderRadius={28} width={56} height={56}
        alignItems="center" justifyContent="center" {...shadows.md}
      >
        <Plus size={26} color="#fff" />
      </View>
    </YStack>
  )
}
