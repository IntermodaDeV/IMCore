import React, { useCallback, useMemo, useRef, useState } from 'react'
import { FlatList, RefreshControl } from 'react-native'
import { Text, XStack, YStack, View, Spinner, useTheme } from 'tamagui'
import { FileText, Search, X, ClipboardList } from 'lucide-react-native'
import { useFocusEffect } from '@react-navigation/native'

import AppInput from '../../components/commons/AppInput'
import AppDatePicker from '../../components/commons/AppDatePicker'
import { usePageHeader } from '../../hooks/usePageHeader'
import { useShowToast } from '../../utils/useShowToast'
import { shadows } from '../../theme/shadows'
import { salidaFacturasService } from '../../api/modules/salidaFacturas/salidaFacturas.service'
import { ISalidaCDHistorial } from '../../api/modules/salidaFacturas/salidaFacturas.types'
import { ACCENT, EstadoBadge, fmtCantidad, fmtFechaHora } from './components'

/**
 * Historial del Control de Salida del CD: qué se revisó, qué ya salió y quién lo
 * atendió. Trae las DOS cosas que salen por esa puerta —facturas y diarios de
 * inventario— en un solo listado, porque son la misma revisión.
 *
 * Sirve para dos preguntas de la puerta —«¿esto ya salió?» y «¿quién lo
 * revisó?»— y para ver lo que quedó a medias.
 *
 * El servidor devuelve los 200 movimientos más recientes YA ORDENADOS entre los
 * dos tipos (el tope se aplica en SQL sobre el conjunto, no 200 de cada uno: así
 * no desaparecen las facturas cuando hay muchos diarios seguidos). Los filtros
 * bajan a la BD —no se filtra en el teléfono— para que buscar algo viejo sí lo
 * encuentre.
 */
export default function SalidaFacturasHistorialScreen() {
  usePageHeader({
    center: <Text fontSize="$4" fontWeight="700" color="$text">Historial de salidas</Text>,
  })

  const theme = useTheme()
  const { showToast } = useShowToast()

  const [codigo, setCodigo] = useState('')
  const [cliente, setCliente] = useState('')
  const [fecha, setFecha] = useState<string | null>(null)

  const [filas, setFilas] = useState<ISalidaCDHistorial[]>([])
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)

  // Los filtros se leen por ref, no por dependencia del callback: si `cargar`
  // cambiara de identidad con cada tecla, el useFocusEffect se volvería a
  // disparar y habría una consulta por letra escrita.
  const filtrosRef = useRef({ codigo: '', cliente: '', fecha: null as string | null })
  filtrosRef.current = { codigo, cliente, fecha }

  const cargar = useCallback(async (filtros?: { codigo?: string; cliente?: string; fecha?: string | null }) => {
    const f = filtros ?? filtrosRef.current
    try {
      const res = await salidaFacturasService.historialCD({
        codigo: f.codigo?.trim() || undefined,
        cliente: f.cliente?.trim() || undefined,
        fecha: f.fecha || undefined,
      })
      if (res.Success) setFilas(res.Data ?? [])
      else showToast('error', 'No se pudo cargar', res.ErrorMessage || 'Intenta de nuevo')
    } catch (e: any) {
      showToast('error', 'Error', e?.message || 'No se pudo cargar el historial')
    } finally {
      setCargando(false)
      setRefrescando(false)
    }
  }, [showToast])

  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  const buscar = () => { setCargando(true); cargar() }

  const limpiar = () => {
    setCodigo(''); setCliente(''); setFecha(null)
    setCargando(true)
    cargar({ codigo: '', cliente: '', fecha: null })
  }

  const hayFiltros = !!(codigo.trim() || cliente.trim() || fecha)

  const resumen = useMemo(() => ({
    total: filas.length,
    salidas: filas.filter(f => (f.Estado ?? '').toUpperCase() === 'COMPLETADA').length,
    diarios: filas.filter(f => f.Tipo === 'DIARIO').length,
  }), [filas])

  const renderItem = ({ item }: { item: ISalidaCDHistorial }) => {
    const estado = (item.Estado ?? '').toUpperCase()
    const completada = estado === 'COMPLETADA'
    const descartada = estado === 'DESCARTADA'
    const diario = item.Tipo === 'DIARIO'
    // El nombre del guardia va guardado en el registro (no se resuelve al leer:
    // el historial vive en IMDesarrollos y Security.Users en IMCore, otro servidor).
    const guardia = completada ? item.GuardiaSalida : item.GuardiaInicio
    return (
      <YStack backgroundColor="$backgroundElevated" borderRadius="$4" borderWidth={1} borderColor="$border"
        padding="$3.5" marginBottom="$3" gap="$1.5" {...shadows.sm}>
        <XStack alignItems="center" gap="$2" flexWrap="wrap">
          {diario ? <ClipboardList size={18} color={ACCENT} /> : <FileText size={18} color={ACCENT} />}
          <Text fontSize="$5" fontWeight="900" color="$text">{item.Codigo}</Text>
          <View borderRadius={6} paddingHorizontal="$2" paddingVertical={2}
            backgroundColor={diario ? 'rgba(147,51,234,0.15)' : 'rgba(59,130,246,0.15)'}>
            <Text fontSize="$1" fontWeight="800" color={diario ? '#9333ea' : '#3b82f6'}>
              {diario ? 'DIARIO' : 'FACTURA'}
            </Text>
          </View>
          <EstadoBadge estado={item.Estado} />
        </XStack>

        <Text fontSize="$3" color="$text" numberOfLines={2}>
          {(diario ? item.Descripcion : item.Cliente) || (diario ? 'Sin descripción' : 'Sin cliente')}
        </Text>

        {/* En un diario, el TIPO es el dato que dice si lo revisado corresponde:
            por eso va a la vista y no escondido. */}
        {diario && (!!item.TipoDiario || !!item.CategoriaNombre) && (
          <Text fontSize="$1" color="$textMuted">
            {[item.TipoDiario, item.CategoriaNombre].filter(Boolean).join(' · ')}
            {item.AlmacenOrigen
              ? ` · ${item.AlmacenOrigen}${item.AlmacenDestino ? ` → ${item.AlmacenDestino}` : ''}`
              : ''}
          </Text>
        )}

        <XStack gap="$3" flexWrap="wrap">
          <Text fontSize="$2" color="$textMuted">
            Artículos <Text fontWeight="800" color="$text">{item.LineasRevisadas}/{item.TotalLineas}</Text>
          </Text>
          <Text fontSize="$2" color="$textMuted">
            Piezas <Text fontWeight="800" color="$text">{fmtCantidad(item.TotalPiezas)}</Text>
          </Text>
          {!!item.PedidoVenta && <Text fontSize="$2" color="$textMuted">Pedido {item.PedidoVenta}</Text>}
        </XStack>

        <Text fontSize="$1" color="$textMuted">
          {completada
            ? `Salió ${fmtFechaHora(item.FechaSalida)}`
            : descartada
              ? `Descartada ${fmtFechaHora(item.FechaDescarte)}`
              : `En revisión desde ${fmtFechaHora(item.FechaInicio)}`}
          {guardia && !descartada ? ` · ${guardia}` : ''}
          {descartada && item.GuardiaDescarte ? ` · ${item.GuardiaDescarte}` : ''}
        </Text>

        {descartada && !!item.MotivoDescarte && (
          <Text fontSize="$1" color="$textMuted">Motivo: {item.MotivoDescarte}</Text>
        )}
      </YStack>
    )
  }

  return (
    <View flex={1} backgroundColor="$background">
      {/* Filtros */}
      <YStack paddingHorizontal={16} paddingTop={12} gap="$2" width="100%" maxWidth={1000} alignSelf="center">
        <XStack gap="$2">
          <View flex={1}>
            <AppInput label="Factura o diario" value={codigo} onChangeText={setCodigo}
              autoCapitalize="characters" autoCorrect={false} returnKeyType="search" onSubmitEditing={buscar} />
          </View>
          <View flex={1}>
            <AppInput label="Cliente" value={cliente} onChangeText={setCliente}
              returnKeyType="search" onSubmitEditing={buscar} />
          </View>
        </XStack>

        <AppDatePicker mode="single" label="Fecha" value={fecha} onChange={setFecha} direction="past" />

        <XStack gap="$2">
          <View flex={1} onPress={buscar} pressStyle={{ opacity: 0.85 }}
            backgroundColor={ACCENT} borderRadius="$4" height={44}
            flexDirection="row" alignItems="center" justifyContent="center" gap="$2">
            <Search size={18} color="#fff" />
            <Text color="#fff" fontWeight="800" fontSize="$3">Buscar</Text>
          </View>
          {hayFiltros && (
            <View onPress={limpiar} pressStyle={{ opacity: 0.85 }}
              borderWidth={1} borderColor="$border" borderRadius="$4" height={44} paddingHorizontal="$3"
              flexDirection="row" alignItems="center" justifyContent="center" gap="$2">
              <X size={18} color={theme.textMuted?.val} />
              <Text color="$textMuted" fontWeight="800" fontSize="$3">Limpiar</Text>
            </View>
          )}
        </XStack>

        {!cargando && filas.length > 0 && (
          <Text fontSize="$2" color="$textMuted">
            {resumen.total} {resumen.total === 1 ? 'movimiento' : 'movimientos'} · {resumen.salidas} ya salieron
            {resumen.diarios > 0 ? ` · ${resumen.diarios} ${resumen.diarios === 1 ? 'diario' : 'diarios'}` : ''}
          </Text>
        )}
      </YStack>

      {cargando ? (
        <YStack flex={1} alignItems="center" justifyContent="center" gap="$3">
          <Spinner size="large" color={ACCENT} />
          <Text color="$textMuted">Cargando historial…</Text>
        </YStack>
      ) : (
        <FlatList
          data={filas}
          keyExtractor={f => `${f.Tipo}-${f.DataAreaId}-${f.Codigo}`}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40, width: '100%', maxWidth: 1000, alignSelf: 'center' }}
          refreshControl={
            <RefreshControl refreshing={refrescando} colors={[ACCENT]} tintColor={ACCENT}
              onRefresh={() => { setRefrescando(true); cargar() }} />
          }
          ListEmptyComponent={
            <YStack alignItems="center" justifyContent="center" paddingTop="$10" gap="$3">
              <ClipboardList size={48} color={theme.textMuted?.val} />
              <Text color="$textMuted" textAlign="center">
                {hayFiltros
                  ? 'Nada coincide con la búsqueda.'
                  : 'Todavía no se ha revisado nada en el control de salida.'}
              </Text>
            </YStack>
          }
        />
      )}
    </View>
  )
}
