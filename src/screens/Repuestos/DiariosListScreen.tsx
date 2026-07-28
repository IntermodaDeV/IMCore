import React, { useCallback, useState } from 'react'
import { FlatList, RefreshControl, useWindowDimensions } from 'react-native'
import { Text, XStack, YStack, View, Spinner, useTheme } from 'tamagui'
import { Plus, Package, ChevronRight, ClipboardList } from 'lucide-react-native'
import { useNavigation, useFocusEffect } from '@react-navigation/native'

import { usePageHeader } from '../../hooks/usePageHeader'
import { useShowToast } from '../../utils/useShowToast'
import { repuestosService } from '../../api/modules/repuestos/repuestos.service'
import { IDiario } from '../../api/modules/repuestos/repuestos.types'
import { shadows } from '../../theme/shadows'
import { ACCENT } from './components'

export default function DiariosListScreen() {
  usePageHeader({
    center: <Text fontSize="$4" fontWeight="700" color="$text">Despacho de Repuestos</Text>,
  })

  const theme = useTheme()
  const navigation = useNavigation<any>()
  const { showToast } = useShowToast()
  const { width } = useWindowDimensions()
  const CONTENT_MAX = 1000

  const [diarios, setDiarios] = useState<IDiario[]>([])
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const res = await repuestosService.getDiarios()
      if (res.Success) setDiarios(res.Data ?? [])
      else showToast('error', 'No se pudo cargar', res.ErrorMessage || 'Intenta de nuevo')
    } catch (e: any) {
      showToast('error', 'Error', e?.message || 'No se pudieron cargar los diarios')
    } finally {
      setCargando(false)
    }
  }, [showToast])

  // Recarga al enfocar (al volver de crear/detalle se refresca solo).
  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  const onRefresh = useCallback(async () => {
    setRefrescando(true)
    await cargar()
    setRefrescando(false)
  }, [cargar])

  const irANuevo = () => navigation.navigate('repuestosNuevo')
  const irADetalle = (d: IDiario) =>
    navigation.navigate('repuestosDetalle', { journalId: d.JournalId, descripcion: d.Descripcion, estado: d.Estado })

  const renderItem = ({ item }: { item: IDiario }) => {
    const posteado = (item.Estado || '').toUpperCase() === 'POSTEADO'
    return (
    <View
      onPress={() => irADetalle(item)}
      pressStyle={{ opacity: 0.85 }}
      backgroundColor="$backgroundElevated"
      borderRadius="$4"
      borderWidth={1}
      borderColor="$border"
      padding="$3.5"
      marginBottom="$3"
      {...shadows.sm}
    >
      <XStack alignItems="center" gap="$3">
        <View width={42} height={42} borderRadius={21} alignItems="center" justifyContent="center"
          backgroundColor="rgba(255,85,26,0.10)">
          <Package size={20} color={ACCENT} />
        </View>
        <YStack flex={1} gap="$1">
          <XStack alignItems="center" gap="$2" flexWrap="wrap">
            <Text fontSize="$5" fontWeight="900" color="$text">{item.JournalId}</Text>
            <View borderRadius={6} paddingHorizontal="$2" paddingVertical={2}
              backgroundColor={posteado ? 'rgba(107,114,128,0.15)' : 'rgba(34,197,94,0.15)'}>
              <Text fontSize="$1" fontWeight="800" color={posteado ? '#6b7280' : '#16a34a'}>
                {posteado ? 'POSTEADO' : 'ABIERTO'}
              </Text>
            </View>
          </XStack>
          <Text fontSize="$3" color="$textMuted" numberOfLines={2}>
            {item.Descripcion || 'Sin descripción'}
          </Text>
          <Text fontSize="$2" color={ACCENT} fontWeight="700">
            {item.NumeroLineas} {item.NumeroLineas === 1 ? 'línea' : 'líneas'}
          </Text>
        </YStack>
        <ChevronRight size={20} color={theme.textMuted?.val} />
      </XStack>
    </View>
    )
  }

  if (cargando) {
    return (
      <YStack flex={1} backgroundColor="$background" alignItems="center" justifyContent="center" gap="$3">
        <Spinner size="large" color={ACCENT} />
        <Text color="$textMuted">Cargando diarios…</Text>
      </YStack>
    )
  }

  return (
    <View flex={1} backgroundColor="$background">
      <FlatList
        data={diarios}
        keyExtractor={d => d.JournalId}
        renderItem={renderItem}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 96,
          width: '100%',
          maxWidth: CONTENT_MAX,
          alignSelf: 'center',
        }}
        refreshControl={
          <RefreshControl refreshing={refrescando} onRefresh={onRefresh}
            colors={[ACCENT]} tintColor={ACCENT} />
        }
        ListEmptyComponent={
          <YStack alignItems="center" justifyContent="center" paddingTop="$10" gap="$3">
            <ClipboardList size={48} color={theme.textMuted?.val} />
            <Text color="$textMuted" textAlign="center">
              No tienes diarios todavía.{'\n'}Crea uno para empezar a despachar repuestos.
            </Text>
          </YStack>
        }
      />

      {/* FAB nuevo diario */}
      <View
        position="absolute"
        right={20}
        bottom={24}
        onPress={irANuevo}
        pressStyle={{ opacity: 0.85 }}
        backgroundColor={ACCENT}
        borderRadius={28}
        height={56}
        paddingHorizontal="$4"
        flexDirection="row"
        alignItems="center"
        gap="$2"
        {...shadows.md}
      >
        <Plus size={22} color="#fff" />
        <Text color="#fff" fontWeight="800" fontSize="$4">Nuevo diario</Text>
      </View>
    </View>
  )
}
