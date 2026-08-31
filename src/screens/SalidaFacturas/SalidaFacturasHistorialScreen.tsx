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
import { ISalidaFacturaHistorial } from '../../api/modules/salidaFacturas/salidaFacturas.types'
import { ACCENT, EstadoBadge, fmtCantidad, fmtFechaHora } from './components'

/**
 * Historial del Control de Salida: qué facturas se revisaron, cuáles ya salieron
 * y quién las atendió. Sirve para dos preguntas de la puerta —«¿esta factura ya
 * salió?» y «¿quién la revisó?»— y para ver las que quedaron a medias.
 *
 * El servidor devuelve las 200 más recientes; los filtros bajan a la BD (no se
 * filtra en el teléfono) para que buscar una factura vieja sí la encuentre.
 */
export default function SalidaFacturasHistorialScreen() {
  usePageHeader({
    center: <Text fontSize="$4" fontWeight="700" color="$text">Historial de salidas</Text>,
  })

  const theme = useTheme()
  const { showToast } = useShowToast()

  const [factura, setFactura] = useState('')
  const [cliente, setCliente] = useState('')
  const [fecha, setFecha] = useState<string | null>(null)

  const [filas, setFilas] = useState<ISalidaFacturaHistorial[]>([])
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)

  // Los filtros se leen por ref, no por dependencia del callback: si `cargar`
  // cambiara de identidad con cada tecla, el useFocusEffect se volvería a
  // disparar y habría una consulta por letra escrita.
  const filtrosRef = useRef({ factura: '', cliente: '', fecha: null as string | null })
  filtrosRef.current = { factura, cliente, fecha }

  const cargar = useCallback(async (filtros?: { factura?: string; cliente?: string; fecha?: string | null }) => {
    const f = filtros ?? filtrosRef.current
    try {
      const res = await salidaFacturasService.historial({
        factura: f.factura?.trim() || undefined,
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
    setFactura(''); setCliente(''); setFecha(null)
    setCargando(true)
    cargar({ factura: '', cliente: '', fecha: null })
  }

  const hayFiltros = !!(factura.trim() || cliente.trim() || fecha)

  const resumen = useMemo(() => ({
    total: filas.length,
    salidas: filas.filter(f => (f.Estado ?? '').toUpperCase() === 'COMPLETADA').length,
  }), [filas])

  const renderItem = ({ item }: { item: ISalidaFacturaHistorial }) => {
    const completada = (item.Estado ?? '').toUpperCase() === 'COMPLETADA'
    // El nombre del guardia va guardado en el registro (no se resuelve al leer:
    // el historial vive en IMDesarrollos y Security.Users en IMCore, otro servidor).
    const guardia = completada ? item.GuardiaSalida : item.GuardiaInicio
    return (
      <YStack backgroundColor="$backgroundElevated" borderRadius="$4" borderWidth={1} borderColor="$border"
        padding="$3.5" marginBottom="$3" gap="$1.5" {...shadows.sm}>
        <XStack alignItems="center" gap="$2" flexWrap="wrap">
          <FileText size={18} color={ACCENT} />
          <Text fontSize="$5" fontWeight="900" color="$text">{item.InvoiceId}</Text>
          <EstadoBadge estado={item.Estado} />
        </XStack>

        <Text fontSize="$3" color="$text" numberOfLines={2}>{item.Cliente || 'Sin cliente'}</Text>

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
            : `En revisión desde ${fmtFechaHora(item.FechaInicio)}`}
          {guardia ? ` · ${guardia}` : ''}
        </Text>
      </YStack>
    )
  }

  return (
    <View flex={1} backgroundColor="$background">
      {/* Filtros */}
      <YStack paddingHorizontal={16} paddingTop={12} gap="$2" width="100%" maxWidth={1000} alignSelf="center">
        <XStack gap="$2">
          <View flex={1}>
            <AppInput label="Factura" value={factura} onChangeText={setFactura}
              autoCapitalize="none" returnKeyType="search" onSubmitEditing={buscar} />
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
            {resumen.total} {resumen.total === 1 ? 'factura' : 'facturas'} · {resumen.salidas} ya salieron
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
          keyExtractor={f => `${f.DataAreaId}-${f.InvoiceId}`}
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
                  ? 'Ninguna factura coincide con la búsqueda.'
                  : 'Todavía no se ha revisado ninguna factura.'}
              </Text>
            </YStack>
          }
        />
      )}
    </View>
  )
}
