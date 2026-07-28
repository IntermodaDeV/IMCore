import React, { useCallback, useMemo, useState } from 'react'
import { FlatList, RefreshControl, useWindowDimensions } from 'react-native'
import { Text, XStack, YStack, View, Spinner, useTheme } from 'tamagui'
import { Plus, Package, ChevronRight, ChevronLeft, ClipboardList } from 'lucide-react-native'
import { useNavigation, useFocusEffect } from '@react-navigation/native'

import { usePageHeader } from '../../hooks/usePageHeader'
import { useShowToast } from '../../utils/useShowToast'
import { repuestosService } from '../../api/modules/repuestos/repuestos.service'
import { IDiario } from '../../api/modules/repuestos/repuestos.types'
import { shadows } from '../../theme/shadows'
import { ACCENT } from './components'

type Periodo = 'semana' | 'mes' | 'anio'
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const MESES_L = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

const pad = (n: number) => String(n).padStart(2, '0')
// ISO local (sin zona) para que el rango coincida con Creation_Date del servidor.
const toParam = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
const fmtL = (n: number) => `L ${(n || 0).toFixed(2)}`

// Lunes 00:00 de la semana de `d`.
function inicioSemana(d: Date) {
  const x = new Date(d); x.setHours(0, 0, 0, 0)
  const dow = (x.getDay() + 6) % 7   // 0 = lunes
  x.setDate(x.getDate() - dow)
  return x
}

// Rango [desde, hasta) + etiqueta según período y desplazamiento (0 = actual, -1 = anterior).
function rango(periodo: Periodo, offset: number): { desde: Date; hasta: Date; label: string } {
  const now = new Date()
  if (periodo === 'semana') {
    const desde = inicioSemana(now); desde.setDate(desde.getDate() + offset * 7)
    const hasta = new Date(desde); hasta.setDate(desde.getDate() + 7)
    const fin = new Date(hasta); fin.setDate(hasta.getDate() - 1)
    const label = `${desde.getDate()} ${MESES[desde.getMonth()]} – ${fin.getDate()} ${MESES[fin.getMonth()]}`
    return { desde, hasta, label }
  }
  if (periodo === 'mes') {
    const desde = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    const hasta = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1)
    return { desde, hasta, label: `${MESES_L[desde.getMonth()]} ${desde.getFullYear()}` }
  }
  const desde = new Date(now.getFullYear() + offset, 0, 1)
  const hasta = new Date(now.getFullYear() + offset + 1, 0, 1)
  return { desde, hasta, label: `${desde.getFullYear()}` }
}

export default function DiariosListScreen() {
  usePageHeader({
    center: <Text fontSize="$4" fontWeight="700" color="$text">Despacho de Repuestos</Text>,
  })

  const theme = useTheme()
  const navigation = useNavigation<any>()
  const { showToast } = useShowToast()
  const { width } = useWindowDimensions()
  const CONTENT_MAX = 1000

  const [periodo, setPeriodo] = useState<Periodo>('semana')
  const [offset, setOffset] = useState(0)   // 0 = actual, negativo = anteriores

  const [diarios, setDiarios] = useState<IDiario[]>([])
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)

  const { desde, hasta, label } = useMemo(() => rango(periodo, offset), [periodo, offset])

  const cargar = useCallback(async () => {
    try {
      const res = await repuestosService.getDiarios(toParam(desde), toParam(hasta))
      if (res.Success) setDiarios(res.Data ?? [])
      else showToast('error', 'No se pudo cargar', res.ErrorMessage || 'Intenta de nuevo')
    } catch (e: any) {
      showToast('error', 'Error', e?.message || 'No se pudieron cargar los diarios')
    } finally {
      setCargando(false)
      setRefrescando(false)
    }
  }, [desde, hasta, showToast])

  // Recarga al enfocar y al cambiar el filtro (cargar cambia de identidad con el rango).
  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  const onRefresh = useCallback(() => { setRefrescando(true); cargar() }, [cargar])

  const cambiarPeriodo = (p: Periodo) => { setPeriodo(p); setOffset(0) }

  // Total de repuestos del período (suma de costos de los diarios listados).
  const totalPeriodo = useMemo(() => diarios.reduce((s, d) => s + (d.CostoTotal || 0), 0), [diarios])

  const irANuevo = () => navigation.navigate('repuestosNuevo')
  const irADetalle = (d: IDiario) =>
    navigation.navigate('repuestosDetalle', { journalId: d.JournalId, descripcion: d.Descripcion, estado: d.Estado })

  const renderItem = ({ item }: { item: IDiario }) => {
    const estado = (item.Estado || 'ABIERTO').toUpperCase()
    const badge = estado === 'ELIMINADO'
      ? { bg: 'rgba(239,68,68,0.15)', fg: '#dc2626', label: 'ELIMINADO' }
      : estado === 'POSTEADO'
        ? { bg: 'rgba(107,114,128,0.15)', fg: '#6b7280', label: 'POSTEADO' }
        : { bg: 'rgba(34,197,94,0.15)', fg: '#16a34a', label: 'ABIERTO' }
    return (
      <View onPress={() => irADetalle(item)} pressStyle={{ opacity: 0.85 }}
        backgroundColor="$backgroundElevated" borderRadius="$4" borderWidth={1} borderColor="$border"
        padding="$3.5" marginBottom="$3" {...shadows.sm}>
        <XStack alignItems="center" gap="$3">
          <View width={42} height={42} borderRadius={21} alignItems="center" justifyContent="center"
            backgroundColor="rgba(255,85,26,0.10)">
            <Package size={20} color={ACCENT} />
          </View>
          <YStack flex={1} gap="$1">
            <XStack alignItems="center" gap="$2" flexWrap="wrap">
              <Text fontSize="$5" fontWeight="900" color="$text">{item.JournalId}</Text>
              <View borderRadius={6} paddingHorizontal="$2" paddingVertical={2} backgroundColor={badge.bg}>
                <Text fontSize="$1" fontWeight="800" color={badge.fg}>{badge.label}</Text>
              </View>
            </XStack>
            <Text fontSize="$3" color="$textMuted" numberOfLines={2}>{item.Descripcion || 'Sin descripción'}</Text>
            <XStack gap="$3" flexWrap="wrap">
              <Text fontSize="$2" color={ACCENT} fontWeight="700">
                {item.NumeroLineas} {item.NumeroLineas === 1 ? 'línea' : 'líneas'}
              </Text>
              {item.CostoTotal > 0 && <Text fontSize="$2" color="$text" fontWeight="800">{fmtL(item.CostoTotal)}</Text>}
            </XStack>
          </YStack>
          <ChevronRight size={20} color={theme.textMuted?.val} />
        </XStack>
      </View>
    )
  }

  const TABS: { p: Periodo; txt: string }[] = [
    { p: 'semana', txt: 'Semana' }, { p: 'mes', txt: 'Mes' }, { p: 'anio', txt: 'Año' },
  ]

  return (
    <View flex={1} backgroundColor="$background">
      {/* Filtro de período */}
      <YStack paddingHorizontal={16} paddingTop={12} gap="$2" width="100%" maxWidth={CONTENT_MAX} alignSelf="center">
        <XStack borderWidth={1} borderColor="$border" borderRadius="$4" padding="$1" backgroundColor="$backgroundElevated" gap="$1">
          {TABS.map(t => (
            <View key={t.p} flex={1} onPress={() => cambiarPeriodo(t.p)} pressStyle={{ opacity: 0.85 }}
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
            {totalPeriodo > 0 && <Text fontSize="$2" color={ACCENT} fontWeight="700">Total {fmtL(totalPeriodo)}</Text>}
          </YStack>
          <View onPress={() => setOffset(o => Math.min(0, o + 1))} pressStyle={{ opacity: 0.6 }} hitSlop={10}
            padding="$2" opacity={offset >= 0 ? 0.3 : 1}>
            <ChevronRight size={22} color={theme.text?.val} />
          </View>
        </XStack>
      </YStack>

      {cargando ? (
        <YStack flex={1} alignItems="center" justifyContent="center" gap="$3">
          <Spinner size="large" color={ACCENT} />
          <Text color="$textMuted">Cargando diarios…</Text>
        </YStack>
      ) : (
        <FlatList
          data={diarios}
          keyExtractor={d => d.JournalId}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 96, width: '100%', maxWidth: CONTENT_MAX, alignSelf: 'center' }}
          refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} colors={[ACCENT]} tintColor={ACCENT} />}
          ListEmptyComponent={
            <YStack alignItems="center" justifyContent="center" paddingTop="$10" gap="$3">
              <ClipboardList size={48} color={theme.textMuted?.val} />
              <Text color="$textMuted" textAlign="center">
                No hay diarios en este período.{'\n'}Cambia el filtro o crea uno nuevo.
              </Text>
            </YStack>
          }
        />
      )}

      {/* FAB nuevo diario */}
      <View position="absolute" right={20} bottom={24} onPress={irANuevo} pressStyle={{ opacity: 0.85 }}
        backgroundColor={ACCENT} borderRadius={28} height={56} paddingHorizontal="$4"
        flexDirection="row" alignItems="center" gap="$2" {...shadows.md}>
        <Plus size={22} color="#fff" />
        <Text color="#fff" fontWeight="800" fontSize="$4">Nuevo diario</Text>
      </View>
    </View>
  )
}
