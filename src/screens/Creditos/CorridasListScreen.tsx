import React, { useCallback, useState } from 'react'
import { FlatList, RefreshControl } from 'react-native'
import { Spinner, Text, View, XStack, YStack, useTheme } from 'tamagui'
import { ChevronRight, PackageSearch } from 'lucide-react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'

import { usePageHeader } from '../../hooks/usePageHeader'
import { useShowToast } from '../../utils/useShowToast'
import { administracionPaquetesService as svc } from '../../api/modules/creditos/administracionPaquetes.service'
import { ICorrida } from '../../api/modules/creditos/administracionPaquetes.types'
import { shadows } from '../../theme/shadows'
import {
  ACCENT, BarraCobertura, EstadoChip, ModoChip, PROCESO, cobertura, colorCobertura,
  fmtDuracion, fmtFecha, fmtNum,
} from './components'

// «¿En qué quedó la corrida?» — esa es la única pregunta que contesta esta
// pantalla, y por eso lo primero de cada tarjeta es el resultado y no la fecha.
//
// SOLO CONSULTA. La corrida se arma y se calcula en el web: son cientos de
// clientes, pesos que ajustar y un archivo que descargar. Acá no hay nada que
// tocar, lo que además evita que alguien dispare una carga de AX de tres
// minutos sin querer desde el teléfono.
export default function CorridasListScreen() {
  const theme = useTheme()
  const navigation = useNavigation<any>()
  const { showToast } = useShowToast()

  usePageHeader({
    center: <Text fontSize="$4" fontWeight="700" color="$text">Administración de Paquetes</Text>,
  })

  const [items, setItems] = useState<ICorrida[]>([])
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const res = await svc.getCorridas()
      if (res.Success) setItems(res.Data ?? [])
      else showToast('error', 'No se pudo cargar', res.ErrorMessage || 'Intentá de nuevo')
    } catch (e: any) {
      showToast('error', 'Error', e?.message || 'No se pudieron cargar las corridas')
    } finally {
      setCargando(false)
      setRefrescando(false)
    }
    // showToast es estable; se deja fuera igual para que la lista no dependa de
    // la identidad de una función y se recargue en bucle contra la API.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  const onRefresh = useCallback(() => { setRefrescando(true); cargar() }, [cargar])

  const render = ({ item }: { item: ICorrida }) => {
    const pct = cobertura(item)
    const proc = item.ProcesoEstado ? PROCESO[item.ProcesoEstado] : null
    const fallo = item.ProcesoEstado === 'ERROR'

    return (
      <View
        onPress={() => navigation.navigate('creditosCorridaDetalle', { id: item.Id })}
        pressStyle={{ opacity: 0.85 }}
        backgroundColor="$backgroundElevated"
        borderRadius="$4"
        borderWidth={1}
        borderColor={fallo ? 'rgba(239,68,68,0.45)' : '$border'}
        padding="$3.5"
        marginBottom="$3"
        {...shadows.sm}
      >
        <XStack alignItems="flex-start" gap="$3">
          <YStack flex={1} gap="$2">
            <XStack alignItems="center" gap="$2" flexWrap="wrap">
              <Text fontSize="$4" fontWeight="800" color="$text">{item.CodigoPaquete}</Text>
              <Text fontSize="$2" color="$textMuted">#{item.Id}</Text>
              <ModoChip modo={item.Modo} />
              <EstadoChip estado={item.Estado} />
            </XStack>

            {/* El resultado va PRIMERO cuando existe. Una corrida sin calcular no
                tiene cobertura que mostrar, así que en su lugar va en qué anda. */}
            {pct !== null ? (
              <YStack gap="$1.5" marginTop="$1">
                <XStack alignItems="baseline" justifyContent="space-between">
                  <Text fontSize="$2" color="$textMuted">Cobertura</Text>
                  <XStack alignItems="baseline" gap="$1.5">
                    <Text fontSize="$5" fontWeight="800" color={colorCobertura(pct)}>{pct}%</Text>
                    <Text fontSize="$2" color="$textMuted">
                      {fmtNum(item.TotalUnidadesAdmin)} de {fmtNum(item.TotalUnidadesMeta)} u
                    </Text>
                  </XStack>
                </XStack>
                <BarraCobertura pct={pct} />
              </YStack>
            ) : proc ? (
              <Text fontSize="$3" color={proc.fg} fontWeight="600">{proc.txt}</Text>
            ) : (
              <Text fontSize="$3" color="$textMuted">Sin calcular</Text>
            )}

            {/* Lo que costó lograrlo, en letra chica: cuántos clientes se tocaron
                y cuánto tardó la carga de AX (que es el paso lento del módulo). */}
            <Text fontSize="$2" color="$textMuted">
              {item.TotalClientesAfect != null
                ? `${fmtNum(item.TotalClientesAfect)} de ${fmtNum(item.TotalClientesSel)} clientes`
                : `${fmtNum(item.TotalClientesSel)} clientes`}
              {item.TotalLineasTocadas != null && ` · ${fmtNum(item.TotalLineasTocadas)} líneas`}
              {item.ProcesoSegundos != null && ` · carga ${fmtDuracion(item.ProcesoSegundos)}`}
            </Text>

            <Text fontSize="$2" color="$textMuted">
              {fmtFecha(item.Creation_Date)} · {item.Create_By}
              {item.Descripcion ? ` · ${item.Descripcion}` : ''}
            </Text>
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
      <FlatList
        data={items}
        keyExtractor={c => String(c.Id)}
        renderItem={render}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} tintColor={ACCENT} />}
        ListEmptyComponent={
          <YStack alignItems="center" paddingTop="$8" gap="$2">
            <PackageSearch size={40} color={theme.textMuted?.val} />
            <Text color="$textMuted" textAlign="center">Todavía no hay corridas.</Text>
            <Text color="$textMuted" fontSize="$2" textAlign="center" paddingHorizontal="$6">
              Las corridas se crean desde el sistema web. Acá se consulta en qué quedaron.
            </Text>
          </YStack>
        }
      />
    </YStack>
  )
}
