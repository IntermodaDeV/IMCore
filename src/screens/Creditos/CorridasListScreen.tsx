import React, { useCallback, useRef, useState } from 'react'
import { FlatList, RefreshControl } from 'react-native'
import { Input, Spinner, Text, View, XStack, YStack, useTheme } from 'tamagui'
import { ChevronRight, PackageSearch, Search, X } from 'lucide-react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'

import { usePageHeader } from '../../hooks/usePageHeader'
import { useShowToast } from '../../utils/useShowToast'
import { administracionPaquetesService as svc } from '../../api/modules/creditos/administracionPaquetes.service'
import { ICorrida } from '../../api/modules/creditos/administracionPaquetes.types'
import { shadows } from '../../theme/shadows'
import {
  ACCENT, BarraCobertura, EstadoChip, ModoChip, chipProceso, cobertura, colorCobertura,
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

  /* Igual que en el detalle: si hay algo corriendo, el listado se refresca solo.
     La idea es dejar subiendo el lote desde el web y mirar el teléfono. Sondea
     únicamente cuando hay trabajo vivo y con la pantalla enfocada. */
  const hayTrabajo = items.some(c => c.ProcesoEstado === 'EN_CURSO')
  const cargarRef = useRef(cargar)
  cargarRef.current = cargar

  useFocusEffect(useCallback(() => {
    if (!hayTrabajo) return
    const t = setInterval(() => { cargarRef.current() }, 5000)
    return () => clearInterval(t)
  }, [hayTrabajo]))

  const onRefresh = useCallback(() => { setRefrescando(true); cargar() }, [cargar])

  /* FILTRAR EN EL TELÉFONO, NO EN LA API. La lista que llega son las últimas 200
     corridas y ya está en memoria: pedirle otra vez al servidor por cada letra
     tecleada sería un viaje por pulsación para volver a recibir casi lo mismo.
     Busca por paquete, por modo, por estado, por quién la corrió y por la
     descripción — que es donde la gente escribe con qué se distingue un intento
     de otro. */
  const [filtro, setFiltro] = useState('')

  const visibles = React.useMemo(() => {
    const q = filtro.trim().toLowerCase()
    if (!q) return items
    return items.filter(c =>
      [c.CodigoPaquete, c.Modo, c.Estado, c.Create_By, c.Descripcion, c.Empresas, `#${c.Id}`]
        .some(v => (v ?? '').toLowerCase().includes(q)))
  }, [items, filtro])

  const render = ({ item }: { item: ICorrida }) => {
    const pct = cobertura(item)
    const proc = chipProceso(item.ProcesoTipo, item.ProcesoEstado)
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

            {/* LO QUE ESTÁ CORRIENDO VA PRIMERO Y SIEMPRE. Antes el estado del
                proceso solo se mostraba cuando la corrida NO tenía resultado, así
                que en una corrida ya calculada —que es justo la que se manda a
                AX— el «Enviando a AX…» no aparecía nunca. La idea de mirar esto
                desde el teléfono se caía ahí mismo. */}
            {item.ProcesoEstado === 'EN_CURSO' && (
              <YStack gap="$1.5" marginTop="$1"
                backgroundColor="rgba(29,78,216,0.10)" borderRadius="$3" padding="$2.5">
                <XStack alignItems="center" gap="$2">
                  <Spinner size="small" color="#1d4ed8" />
                  <Text fontSize="$3" fontWeight="700" color="#1d4ed8" flex={1}>
                    {proc?.txt ?? 'Trabajando…'}
                  </Text>
                  {(item.ProcesoPasosTotal ?? 0) > 0 && (
                    <Text fontSize="$3" fontWeight="800" color="#1d4ed8">
                      {Math.round(((item.ProcesoPaso ?? 0) / (item.ProcesoPasosTotal ?? 1)) * 100)}%
                    </Text>
                  )}
                </XStack>
                {(item.ProcesoPasosTotal ?? 0) > 0 && (
                  <View height={5} borderRadius={3} backgroundColor="rgba(29,78,216,0.20)" overflow="hidden">
                    <View height={5} borderRadius={3} backgroundColor="#1d4ed8"
                      width={`${Math.round(((item.ProcesoPaso ?? 0) / (item.ProcesoPasosTotal ?? 1)) * 100)}%`} />
                  </View>
                )}
                {!!item.ProcesoFase && (
                  <Text fontSize="$2" color="$textMuted">{item.ProcesoFase}</Text>
                )}
              </YStack>
            )}

            {/* El resultado va después. Una corrida sin calcular no tiene cobertura
                que mostrar, así que en su lugar va en qué anda. */}
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
            ) : proc && item.ProcesoEstado !== 'EN_CURSO' ? (
              <Text fontSize="$3" color={proc.fg} fontWeight="600">{proc.txt}</Text>
            ) : item.ProcesoEstado === 'EN_CURSO' ? null : (
              <Text fontSize="$3" color="$textMuted">Sin calcular</Text>
            )}

            {/* Lo que costó lograrlo, en letra chica: cuántos clientes se tocaron
                y cuánto tardó la carga de AX (que es el paso lento del módulo). */}
            <Text fontSize="$2" color="$textMuted">
              {item.TotalClientesAfect != null
                ? `${fmtNum(item.TotalClientesAfect)} de ${fmtNum(item.TotalClientesSel)} clientes`
                : `${fmtNum(item.TotalClientesSel)} clientes`}
              {item.TotalLineasTocadas != null && ` · ${fmtNum(item.TotalLineasTocadas)} líneas`}
              {item.ProcesoSegundos != null && ` · ${item.ProcesoTipo === 'ENVIO_AX' ? 'envío' : 'carga'} ${fmtDuracion(item.ProcesoSegundos)}`}
            </Text>

            {/* Que YA SE MANDÓ es información de primera: es la diferencia entre una
                corrida que hay que subir y una que ya está en los pedidos. */}
            {item.ProcesoEstado !== 'EN_CURSO' && proc && item.ProcesoTipo === 'ENVIO_AX' && (
              <Text fontSize="$2" fontWeight="700" color={proc.fg}>{proc.txt}</Text>
            )}

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
      <XStack padding="$3" paddingBottom="$1" gap="$2" alignItems="center">
        <XStack flex={1} alignItems="center" gap="$2" paddingHorizontal="$3"
          backgroundColor="$backgroundElevated" borderRadius="$4"
          borderWidth={1} borderColor="$border">
          <Search size={16} color={theme.textMuted?.val} />
          <Input flex={1} unstyled value={filtro} onChangeText={setFiltro}
            placeholder="Paquete, modo, estado, quién la corrió…"
            placeholderTextColor={theme.textMuted?.val}
            color="$text" fontSize="$3" paddingVertical="$2.5"
            autoCapitalize="characters" autoCorrect={false} />
          {filtro.length > 0 && (
            <X size={16} color={theme.textMuted?.val} onPress={() => setFiltro('')} />
          )}
        </XStack>
        <Text fontSize="$2" color="$textMuted">
          {visibles.length === items.length
            ? `${items.length}`
            : `${visibles.length} de ${items.length}`}
        </Text>
      </XStack>

      <FlatList
        data={visibles}
        keyExtractor={c => String(c.Id)}
        renderItem={render}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} tintColor={ACCENT} />}
        ListEmptyComponent={
          <YStack alignItems="center" paddingTop="$8" gap="$2">
            <PackageSearch size={40} color={theme.textMuted?.val} />
            <Text color="$textMuted" textAlign="center">
              {filtro ? `Ninguna corrida coincide con «${filtro}».` : 'Todavía no hay corridas.'}
            </Text>
            <Text color="$textMuted" fontSize="$2" textAlign="center" paddingHorizontal="$6">
              {filtro
                ? 'Probá con el código del paquete o con el modo.'
                : 'Las corridas se crean desde el sistema web. Acá se consulta en qué quedaron.'}
            </Text>
          </YStack>
        }
      />
    </YStack>
  )
}
