import React, { useCallback, useMemo, useState } from 'react'
import { RefreshControl, ScrollView } from 'react-native'
import { Text, XStack, YStack, View, Spinner, useTheme } from 'tamagui'
import { ChevronLeft, ChevronRight } from 'lucide-react-native'
import { useFocusEffect } from '@react-navigation/native'

import { usePageHeader } from '../../hooks/usePageHeader'
import { repuestosService } from '../../api/modules/repuestos/repuestos.service'
import {
  IConsumoItem,
  IRepuestoPorActivo,
  ISuministroPorCentroCosto,
} from '../../api/modules/repuestos/repuestos.types'
import { HBarList, KpiCard, TabBar } from '../Mantenimiento/components'
import { ESCALA_AZUL } from '../Mantenimiento/mantenimiento.helpers'
import { ACCENT, Periodo, rango, toParam, fmtL } from './components'

// Consumo de bodega del período: cuánto se está yendo y a dónde.
//
// Vive FUERA del despacho a propósito: despachar es una tarea de piso (Óscar con
// la PDA) y esto es de análisis (¿cuánto llevamos consumido?). Son dos permisos y
// dos momentos distintos, así que son dos pantallas.
//
// Los cuatro rankings van en PESTAÑAS y no apilados: en un teléfono, cuatro listas
// seguidas son un scroll interminable. Y sin listados de detalle, que en esta
// pantalla quitarían todo el espacio.

type Fila = { label: string; value: number }

const SIN_MAQUINA = '(sin máquina)'
const SIN_CENTRO = '(sin centro de costo)'
const fmtEnt = (n: number) => Math.round(n || 0).toLocaleString('es-HN')

export default function RepuestosDashboardScreen() {
  usePageHeader({
    center: <Text fontSize="$4" fontWeight="700" color="$text">Consumo de bodega</Text>,
  })

  const theme = useTheme()
  const [periodo, setPeriodo] = useState<Periodo>('semana')
  const [offset, setOffset] = useState(0)
  const { desde, hasta, label } = useMemo(() => rango(periodo, offset), [periodo, offset])

  const [tab, setTab] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [activos, setActivos] = useState<IRepuestoPorActivo[]>([])
  const [centros, setCentros] = useState<ISuministroPorCentroCosto[]>([])
  const [itemsRep, setItemsRep] = useState<IConsumoItem[]>([])
  const [itemsSum, setItemsSum] = useState<IConsumoItem[]>([])

  const cargar = useCallback(async () => {
    setError(null)
    const d = toParam(desde)
    const h = toParam(hasta)
    try {
      // Las cuatro en paralelo: son independientes y secuenciarlas cuadruplicaría
      // la espera en una pantalla que se abre para mirar de reojo.
      const [ra, cc, ir, is] = await Promise.all([
        repuestosService.getRepuestosPorActivo(d, h),
        repuestosService.getSuministrosPorCentroCosto(d, h),
        repuestosService.getConsumoPorItem('REPUESTO', d, h),
        repuestosService.getConsumoPorItem('SUMINISTRO', d, h),
      ])
      setActivos(ra.Data ?? [])
      setCentros(cc.Data ?? [])
      setItemsRep(ir.Data ?? [])
      setItemsSum(is.Data ?? [])
      if (!ra.Success || !cc.Success || !ir.Success || !is.Success)
        setError(ra.ErrorMessage || cc.ErrorMessage || ir.ErrorMessage || is.ErrorMessage || 'No se pudo cargar')
    } catch (e: any) {
      setError(e?.message || 'No se pudo cargar el consumo')
    } finally {
      setCargando(false)
    }
  }, [desde, hasta])

  useFocusEffect(useCallback(() => { setCargando(true); cargar() }, [cargar]))
  const refrescar = useCallback(async () => { setRefrescando(true); await cargar(); setRefrescando(false) }, [cargar])

  const totalRep = useMemo(() => activos.reduce((s, x) => s + (x.CostoTotal || 0), 0), [activos])
  const totalSum = useMemo(() => centros.reduce((s, x) => s + (x.CostoTotal || 0), 0), [centros])

  // Concentración: qué parte del costo de repuestos se va en las 5 máquinas más
  // caras. Alto = atacar esas rinde; bajo = el gasto está repartido.
  const concentracion = useMemo(() => {
    if (!totalRep) return null
    const top5 = activos.slice(0, 5).reduce((s, x) => s + x.CostoTotal, 0)
    return Math.round((top5 / totalRep) * 100)
  }, [activos, totalRep])

  // Cada ranking mantiene el criterio ya acordado: por DESTINO (máquina o centro de
  // costo) se mide en costo, porque ahí se mezclan artículos distintos; por
  // ARTÍCULO se mide en UNIDADES, porque siempre es el mismo artículo y "lo que más
  // se consume" es lo que más sale del almacén, no lo más caro.
  const etiquetaItem = (x: IConsumoItem) => x.Descripcion?.trim() || x.ItemId || '—'
  const TABS = ['Máquinas', 'Centros', 'Repuestos', 'Suministros']
  const vista: { datos: Fila[]; formato: (v: number) => string; nota: string; vacio: string } = useMemo(() => {
    switch (tab) {
      case 1:
        return {
          datos: centros.slice(0, 10).map(x => ({ label: x.CentroCostoNombre || x.CentroCosto, value: x.CostoTotal })),
          formato: fmtL,
          nota: 'Suministros por centro de costo, medido en costo del período.',
          vacio: 'Sin suministros en el período.',
        }
      case 2:
        return {
          datos: itemsRep.slice(0, 10).map(x => ({ label: etiquetaItem(x), value: x.Unidades })),
          formato: v => `${fmtEnt(v)} u`,
          nota: 'Repuestos que más salieron del almacén, en unidades. El costo no ordena acá.',
          vacio: 'Sin repuestos en el período.',
        }
      case 3:
        return {
          datos: itemsSum.slice(0, 10).map(x => ({ label: etiquetaItem(x), value: x.Unidades })),
          formato: v => `${fmtEnt(v)} u`,
          nota: 'Suministros que más salieron del almacén, en unidades.',
          vacio: 'Sin suministros en el período.',
        }
      default:
        return {
          datos: activos.slice(0, 10).map(x => ({ label: x.Activo, value: x.CostoTotal })),
          formato: fmtL,
          nota: 'Repuestos por máquina, medido en costo del período.',
          vacio: 'Sin repuestos en el período.',
        }
    }
  }, [tab, activos, centros, itemsRep, itemsSum])

  // Lo no atribuible se avisa en palabras: en una lista de barras no hay lugar para
  // un color que se explique solo, y esconderlo haría que el total no cuadre.
  const aviso = useMemo(() => {
    if (tab === 0) {
      const f = activos.find(x => x.Activo === SIN_MAQUINA)
      return f ? `${fmtL(f.CostoTotal)} en tickets sin número de máquina.` : null
    }
    if (tab === 1) {
      const f = centros.find(x => x.CentroCosto === SIN_CENTRO)
      return f ? `${fmtL(f.CostoTotal)} en artículos sin centro de costo en AX.` : null
    }
    return null
  }, [tab, activos, centros])

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12 }}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} tintColor={ACCENT} />}
    >
      {/* Período: mismo cálculo de rango que el listado de diarios. */}
      <YStack gap="$2">
        <XStack borderWidth={1} borderColor="$border" borderRadius="$4" padding="$1"
          backgroundColor="$backgroundElevated" gap="$1">
          {(['semana', 'mes', 'anio'] as Periodo[]).map((p, i) => (
            <View key={p} flex={1} onPress={() => { setPeriodo(p); setOffset(0) }} pressStyle={{ opacity: 0.85 }}
              backgroundColor={periodo === p ? ACCENT : 'transparent'} borderRadius="$3" height={34}
              alignItems="center" justifyContent="center">
              <Text fontWeight="800" fontSize="$2" color={periodo === p ? '#fff' : '$textMuted'}>
                {['Semana', 'Mes', 'Año'][i]}
              </Text>
            </View>
          ))}
        </XStack>
        <XStack alignItems="center" justifyContent="space-between">
          <View onPress={() => setOffset(o => o - 1)} pressStyle={{ opacity: 0.6 }} hitSlop={10} padding="$2">
            <ChevronLeft size={22} color={theme.text?.val} />
          </View>
          <Text fontSize="$4" fontWeight="800" color="$text">{label}</Text>
          <View onPress={() => setOffset(o => Math.min(0, o + 1))} pressStyle={{ opacity: 0.6 }} hitSlop={10}
            padding="$2" opacity={offset >= 0 ? 0.3 : 1}>
            <ChevronRight size={22} color={theme.text?.val} />
          </View>
        </XStack>
      </YStack>

      {cargando ? (
        <YStack paddingVertical="$8" alignItems="center" gap="$3">
          <Spinner size="large" color={ACCENT} />
          <Text color="$textMuted">Cargando consumo…</Text>
        </YStack>
      ) : error ? (
        <YStack paddingVertical="$8" alignItems="center" gap="$2">
          <Text color="#ef4444" fontWeight="700">No se pudo cargar</Text>
          <Text color="$textMuted" fontSize="$2" textAlign="center">{error}</Text>
        </YStack>
      ) : (
        <>
          <XStack flexWrap="wrap" gap="$2">
            <KpiCard titulo="Costo del período" valor={fmtL(totalRep + totalSum)} hint="repuestos + suministros"
              info="Todo lo que salió de bodega y ya tiene costo de AX. Los diarios abiertos aún no suman: el costo se congela al postear." />
            <KpiCard titulo="Repuestos" valor={fmtL(totalRep)} hint="a máquinas, vía ticket"
              info="Consumo atribuible a una máquina concreta." />
            <KpiCard titulo="Suministros" valor={fmtL(totalSum)} hint="a centros de costo"
              info="Gasto de planta. No pertenece a ninguna máquina, por eso no entra al costo de mantenimiento." />
            <KpiCard titulo="Concentración" valor={concentracion == null ? '—' : `${concentracion}%`}
              hint="del costo, en 5 activos"
              info="Qué parte del costo de repuestos se va en las 5 máquinas más caras. Alto = atacar esas máquinas rinde; bajo = el gasto está repartido." />
          </XStack>

          {/* Un ranking a la vez: cuatro listas apiladas no entran en un teléfono. */}
          <TabBar tabs={TABS} activo={tab} onChange={setTab} />

          <YStack gap="$2" padding="$3" borderWidth={1} borderColor="$border" borderRadius={12}
            backgroundColor="$backgroundElevated">
            <Text fontSize="$1" color="$textMuted">{vista.nota}</Text>
            {!!aviso && <Text fontSize="$1" color="#f59e0b">{aviso}</Text>}
            <HBarList datos={vista.datos} escala={ESCALA_AZUL} formato={vista.formato} vacioMsg={vista.vacio} />
          </YStack>
        </>
      )}
    </ScrollView>
  )
}
