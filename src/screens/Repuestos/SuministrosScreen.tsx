import React, { useCallback, useMemo, useState } from 'react'
import { FlatList, RefreshControl, useWindowDimensions } from 'react-native'
import { Text, XStack, YStack, View, Spinner, useTheme } from 'tamagui'
import { ChevronLeft, ChevronRight, PackageOpen, TriangleAlert } from 'lucide-react-native'
import { useFocusEffect } from '@react-navigation/native'

import { usePageHeader } from '../../hooks/usePageHeader'
import { repuestosService } from '../../api/modules/repuestos/repuestos.service'
import { ISuministroPorCentroCosto } from '../../api/modules/repuestos/repuestos.types'
import { ACCENT, Periodo, rango, toParam, fmtL } from './components'

// Consumo de suministros por centro de costo.
//
// Es un KPI APARTE del de repuestos, y no un filtro más del mismo: un repuesto se
// consume en una máquina concreta (y por eso alimenta el costo por activo), mientras
// que un suministro es gasto de planta que se carga a un centro de costo. Mezclarlos
// inflaría el costo de mantenimiento con guantes y limpieza.
export default function SuministrosScreen() {
  usePageHeader({
    center: <Text fontSize="$4" fontWeight="700" color="$text">Suministros por centro de costo</Text>,
  })

  const theme = useTheme()
  const { width } = useWindowDimensions()
  const CONTENT_MAX = 1000
  const ancho = Math.min(width, CONTENT_MAX)

  const [filas, setFilas] = useState<ISuministroPorCentroCosto[]>([])
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [periodo, setPeriodo] = useState<Periodo>('semana')
  const [offset, setOffset] = useState(0)   // 0 = actual, negativo = anteriores
  const { desde, hasta, label } = useMemo(() => rango(periodo, offset), [periodo, offset])

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const r = await repuestosService.getSuministrosPorCentroCosto(toParam(desde), toParam(hasta))
      if (r.Success) setFilas(r.Data ?? [])
      else setError(r.ErrorMessage || 'No se pudo cargar el consumo')
    } catch (e: any) {
      setError(e?.message || 'No se pudo cargar el consumo')
    } finally {
      setCargando(false)
    }
  }, [desde, hasta])

  useFocusEffect(useCallback(() => { setCargando(true); cargar() }, [cargar]))
  const refrescar = useCallback(async () => { setRefrescando(true); await cargar(); setRefrescando(false) }, [cargar])

  const totalPeriodo = useMemo(() => filas.reduce((s, f) => s + (f.CostoTotal || 0), 0), [filas])
  // Los que aún no traen centro de costo en AX: no se esconden, se muestran para ir
  // a registrarlos. Es la misma idea del repuesto sin costo.
  const sinCentro = useMemo(() => filas.find(f => f.CentroCosto === '(sin centro de costo)'), [filas])

  const cambiarPeriodo = (p: Periodo) => { setPeriodo(p); setOffset(0) }
  const TABS: { p: Periodo; txt: string }[] = [
    { p: 'semana', txt: 'Semana' }, { p: 'mes', txt: 'Mes' }, { p: 'anio', txt: 'Año' },
  ]

  const Fila = ({ item }: { item: ISuministroPorCentroCosto }) => {
    const esSinCentro = item.CentroCosto === '(sin centro de costo)'
    const pct = totalPeriodo > 0 ? (item.CostoTotal / totalPeriodo) * 100 : 0
    return (
      <View marginHorizontal={16} marginBottom="$2" padding="$3" borderWidth={1}
        borderColor={esSinCentro ? '#f59e0b' : '$border'} borderRadius={12}
        backgroundColor="$backgroundElevated" gap="$2">
        <XStack alignItems="center" gap="$2">
          {esSinCentro
            ? <TriangleAlert size={18} color="#f59e0b" />
            : <PackageOpen size={18} color={ACCENT} />}
          <YStack flex={1}>
            <Text fontSize="$4" fontWeight="800" color="$text">
              {item.CentroCostoNombre || item.CentroCosto}
            </Text>
            {/* El código solo si aporta: con nombre se muestran los dos, si no sobra. */}
            {!!item.CentroCostoNombre && (
              <Text fontSize="$1" color="$textMuted">{item.CentroCosto}</Text>
            )}
          </YStack>
          <Text fontSize="$5" fontWeight="900" color={ACCENT}>{fmtL(item.CostoTotal)}</Text>
        </XStack>

        {/* Barra de participación: de un vistazo, quién se está llevando el gasto. */}
        {totalPeriodo > 0 && (
          <View height={5} borderRadius={3} backgroundColor="$border" overflow="hidden">
            <View height="100%" width={`${Math.max(2, pct)}%`}
              backgroundColor={esSinCentro ? '#f59e0b' : ACCENT} />
          </View>
        )}

        <XStack gap="$3" alignItems="center">
          <Text fontSize="$2" color="$textMuted">{item.Salidas} salida{item.Salidas === 1 ? '' : 's'}</Text>
          <Text fontSize="$2" color="$textMuted">·</Text>
          <Text fontSize="$2" color="$textMuted">{item.Unidades} unidad{item.Unidades === 1 ? '' : 'es'}</Text>
          {totalPeriodo > 0 && <>
            <Text fontSize="$2" color="$textMuted">·</Text>
            <Text fontSize="$2" color="$textMuted">{pct.toFixed(0)}%</Text>
          </>}
          {item.SinCosto > 0 && (
            <Text fontSize="$1" color="#f59e0b" marginLeft="auto">{item.SinCosto} sin costo</Text>
          )}
        </XStack>
      </View>
    )
  }

  return (
    <View flex={1} backgroundColor="$background">
      {/* Filtro de período: el MISMO cálculo de rango que el listado de diarios. */}
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

      {/* Aviso accionable: hay consumo que AX no puede atribuir a nadie. */}
      {!cargando && !!sinCentro && (
        <XStack marginHorizontal={16} marginTop="$2" padding="$2.5" gap="$2" borderRadius={10}
          backgroundColor="rgba(245,158,11,0.10)" borderWidth={1} borderColor="#f59e0b" alignItems="center">
          <TriangleAlert size={16} color="#f59e0b" />
          <Text fontSize="$1" color="$text" flex={1}>
            {sinCentro.Salidas} salida{sinCentro.Salidas === 1 ? '' : 's'} sin centro de costo: esos artículos
            no lo tienen registrado en AX.
          </Text>
        </XStack>
      )}

      {cargando ? (
        <YStack flex={1} alignItems="center" justifyContent="center" gap="$3">
          <Spinner size="large" color={ACCENT} />
          <Text color="$textMuted">Cargando consumo…</Text>
        </YStack>
      ) : error ? (
        <YStack flex={1} alignItems="center" justifyContent="center" gap="$2" paddingHorizontal="$6">
          <Text color="#ef4444" fontWeight="700">No se pudo cargar</Text>
          <Text color="$textMuted" fontSize="$2" textAlign="center">{error}</Text>
        </YStack>
      ) : filas.length === 0 ? (
        <YStack flex={1} alignItems="center" justifyContent="center" gap="$2" paddingHorizontal="$6">
          <PackageOpen size={40} color={theme.textMuted?.val} />
          <Text color="$text" fontWeight="700">Sin suministros en el período</Text>
          <Text color="$textMuted" fontSize="$2" textAlign="center">
            Aquí aparece el consumo de planta despachado a un centro de costo.
          </Text>
        </YStack>
      ) : (
        <FlatList
          data={filas}
          keyExtractor={f => f.CentroCosto}
          renderItem={Fila}
          contentContainerStyle={{ paddingTop: 12, paddingBottom: 24, width: ancho, alignSelf: 'center' }}
          refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} tintColor={ACCENT} />}
        />
      )}
    </View>
  )
}
