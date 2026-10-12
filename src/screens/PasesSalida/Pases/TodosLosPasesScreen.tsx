import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshControl, FlatList } from 'react-native'
import { Text, XStack, YStack, View, useTheme } from 'tamagui'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import {
  ChevronRight, RotateCcw, Package, IdCard, CalendarDays, User, Send, Ban,
} from 'lucide-react-native'
import dayjs from 'dayjs'

import { usePageHeader } from '../../../hooks/usePageHeader'
import AppDatePicker from '../../../components/commons/AppDatePicker'
import SearchInput from '../../../components/commons/SearchInput'
import RecordCount from '../../../components/commons/RecordCount'
import SkeletonList from '../../../components/Skeletons/SkeletonList'
import ErrorState from '../../AdmSys/ErrorState'
import EmptyState from '../../AdmSys/EmptyState'
import { AppError, handleError } from '../../../utils/errorHandler'
import { shadows } from '../../../theme/shadows'
import {
  ACCENT, ESTADOS_ABIERTOS, ESTADOS_FILTRO, ETIQUETA_ESTADO, PRESS_CARD,
  estadoVisual, fmtCantidad, fmtFecha,
} from '../pasesSalida.helpers'
import { pasesService } from '../../../api/modules/pasesSalida/pases.service'
import { EstadoPase, IPaseSalida } from '../../../api/modules/pasesSalida/pases.types'

/**
 * Todos los pases, de todos los solicitantes, por rango de fechas.
 *
 * POR QUÉ EXISTE
 *   Las otras tres pantallas que listan pases muestran cada una un recorte: Mis
 *   pases solo los propios, Aprobaciones solo los que esperan mi firma, y
 *   Control de salida los de todos pero acotados a lo que seguridad necesita —
 *   hoy, pendientes de regreso, el mes. Ninguna contestaba «¿qué salió entre el
 *   1 y el 15?».
 *
 * ES SOLO INFORMATIVA
 *   No registra, no recibe, no cierra, no firma. Se mira y se abre el detalle.
 *   Las acciones viven donde están las responsabilidades: recibir y cerrar en
 *   Mis pases, firmar en Aprobaciones, registrar en Control de salida. Ponerlas
 *   también acá sería ofrecerle a un auditor botones que no le tocan.
 *
 * EL RANGO MANDA Y SE CONSULTA AL SERVIDOR
 *   La fecha es el único filtro que viaja: traerse el histórico completo para
 *   descartarlo en el teléfono no escala. El buscador y los chips de estado
 *   afinan sobre lo que ya llegó, que es barato y no cuesta otro viaje.
 *
 * ARRANCA EN LA SEMANA EN CURSO
 *   Es el rango con el que casi siempre se llega —«¿qué pasó esta semana?»— y
 *   deja ver algo de inmediato. Un rango vacío obligaría a elegir dos fechas
 *   antes de que la pantalla dijera nada.
 */

/** Lunes de la semana de hoy, en ISO. dayjs cuenta el domingo como 0. */
const lunesDeEstaSemana = () => {
  const hoy = dayjs()
  const dia = hoy.day()
  return hoy.subtract(dia === 0 ? 6 : dia - 1, 'day').format('YYYY-MM-DD')
}

const domingoDeEstaSemana = () =>
  dayjs(lunesDeEstaSemana()).add(6, 'day').format('YYYY-MM-DD')

export default function TodosLosPasesScreen() {
  const theme = useTheme()
  const navigation = useNavigation<any>()

  const [desde, setDesde] = useState<string | null>(lunesDeEstaSemana())
  const [hasta, setHasta] = useState<string | null>(domingoDeEstaSemana())

  const [items, setItems] = useState<IPaseSalida[]>([])
  const [filtered, setFiltered] = useState<IPaseSalida[]>([])
  const [estadoSel, setEstadoSel] = useState<EstadoPase | null>(null)
  const [loading, setLoading] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [error, setError] = useState<AppError | null>(null)

  usePageHeader({
    center: <Text fontSize="$4" fontWeight="700" color="$text">Todos los pases</Text>,
  })

  const cargar = useCallback(async () => {
    /* Sin las dos fechas no se consulta: media ventana traería «desde el lunes
       hasta siempre», que en una base con años de pases es otra pantalla. */
    if (!desde || !hasta) { setItems([]); setFiltered([]); return }
    try {
      const r = await pasesService.getPases({
        todos: true,
        desde,
        /* El SP corta con `Creation_Date < @Hasta`, así que el día final se
           incluye sumándole uno. Sin esto, elegir «hasta el 15» escondía todo
           lo creado el 15. */
        hasta: dayjs(hasta).add(1, 'day').format('YYYY-MM-DD'),
      })
      const data = r.Data ?? []
      setItems(data)
      setFiltered(data)
      setError(null)
    } catch (e) {
      setItems([]); setFiltered([])
      setError(handleError(e))
    }
  }, [desde, hasta])

  useEffect(() => { (async () => { setLoading(true); await cargar(); setLoading(false) })() }, [cargar])
  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  const onRefresh = useCallback(async () => {
    setRefrescando(true); await cargar(); setRefrescando(false)
  }, [cargar])

  const visibles = useMemo(
    () => (estadoSel ? filtered.filter(p => p.Estado === estadoSel) : filtered),
    [filtered, estadoSel],
  )

  /* Solo los estados que de verdad hay en lo que llegó. Ofrecer los diez
     siempre llenaría la fila de chips que dan listas vacías. */
  const estadosPresentes = useMemo(() => {
    const hay = new Set(items.map(p => p.Estado))
    return ESTADOS_FILTRO.filter(e => hay.has(e))
  }, [items])

  const abrir = (p: IPaseSalida) =>
    navigation.navigate('pasesSalidaPaseDetalle', { id: p.Id, correlativo: p.Correlativo })

  return (
    <View flex={1} backgroundColor="$background">
      <YStack paddingHorizontal="$3" paddingTop="$3">
        {/* El mismo componente de Control de salida, en modo rango: una sola
            caja para las dos fechas en vez de dos selectores que hay que
            mantener coherentes entre sí. */}
        <AppDatePicker
          label="Del — al"
          mode="range"
          startDate={desde}
          endDate={hasta}
          onRangeChange={(s, e) => { setDesde(s); setHasta(e) }}
        />

        <SearchInput
          data={items}
          searchKeys={['Correlativo', 'TipoSalida', 'EnviadoA', 'Responsable', 'Solicitante', 'Comentario']}
          onResults={setFiltered}
          placeholder="Buscar por código, solicitante, destino..."
        />

        {estadosPresentes.length > 1 ? (
          <XStack flexWrap="wrap" gap="$1.5" marginBottom="$2">
            <View onPress={() => setEstadoSel(null)} pressStyle={{ opacity: 0.7 }}
              backgroundColor={estadoSel === null ? ACCENT : 'transparent'}
              borderWidth={1} borderColor={estadoSel === null ? ACCENT : '$border'}
              borderRadius="$10" paddingHorizontal="$2.5" paddingVertical={4}>
              <Text fontSize={11} fontWeight="700"
                color={estadoSel === null ? '#fff' : '$textMuted'}>Todos</Text>
            </View>
            {estadosPresentes.map(e => {
              const v = estadoVisual(e)
              const sel = estadoSel === e
              return (
                <View key={e} onPress={() => setEstadoSel(sel ? null : e)} pressStyle={{ opacity: 0.7 }}
                  backgroundColor={sel ? v.color : 'transparent'}
                  borderWidth={1} borderColor={sel ? v.color : '$border'}
                  borderRadius="$10" paddingHorizontal="$2.5" paddingVertical={4}>
                  <Text fontSize={11} fontWeight="700" color={sel ? '#fff' : '$textMuted'}>
                    {ETIQUETA_ESTADO[e]}
                  </Text>
                </View>
              )
            })}
          </XStack>
        ) : null}

        <RecordCount count={visibles.length} />
      </YStack>

      {loading ? (
        <SkeletonList />
      ) : error ? (
        <ErrorState
          type={error.type} title={error.title} message={error.message} errorCode={error.status}
          onRetry={async () => { setLoading(true); await cargar(); setLoading(false) }}
        />
      ) : visibles.length === 0 ? (
        <EmptyState
          title="No hay pases en ese rango"
          message={desde && hasta
            ? `Entre el ${fmtFecha(desde)} y el ${fmtFecha(hasta)} nadie creó pases, o ninguno coincide con el filtro.`
            : 'Elija un rango de fechas para consultar.'}
        />
      ) : (
        <FlatList
          data={visibles}
          keyExtractor={p => String(p.Id)}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} tintColor={ACCENT} />}
          renderItem={({ item: p }) => {
            const est = estadoVisual(p.Estado)
            return (
              <YStack marginBottom="$2.5" backgroundColor="$backgroundElevated" borderRadius="$4"
                borderWidth={1} borderColor="$border" borderLeftWidth={4} borderLeftColor={est.color}
                padding="$3.5" gap="$2" {...shadows.sm}
                onPress={() => abrir(p)} pressStyle={PRESS_CARD}>

                <XStack alignItems="center" gap="$2">
                  <Text flex={1} fontSize={15} fontWeight="900" color="$text">{p.Correlativo}</Text>
                  <View backgroundColor={est.bg} borderWidth={1} borderColor={est.color}
                    paddingHorizontal="$2" paddingVertical={3} borderRadius="$10">
                    <Text fontSize={9} fontWeight="800" color={est.color}>
                      {p.EstadoNombre || est.label}
                    </Text>
                  </View>
                  <ChevronRight size={16} color={theme.textMuted?.val} />
                </XStack>

                <XStack alignItems="center" gap="$1.5" flexWrap="wrap">
                  <View backgroundColor={ACCENT} borderRadius="$2"
                    paddingHorizontal="$2" paddingVertical={2}>
                    <Text fontSize={10} fontWeight="800" color="#fff">{p.TipoSalida}</Text>
                  </View>
                  {p.Retorna ? (
                    <XStack alignItems="center" gap={3}>
                      <RotateCcw size={10} color={theme.textMuted?.val} />
                      <Text fontSize={10} color="$textMuted">Debe regresar</Text>
                    </XStack>
                  ) : (
                    <XStack alignItems="center" gap={3}>
                      <Send size={10} color={theme.textMuted?.val} />
                      <Text fontSize={10} color="$textMuted">Definitiva</Text>
                    </XStack>
                  )}
                  <Text fontSize={10} color="$textMuted">· {p.Lineas} lín.</Text>
                  <Text fontSize={10} color="$textMuted">
                    · {p.FirmasDadas}/{p.FirmasRequeridas} firmas
                  </Text>
                </XStack>

                {/* El solicitante va SIEMPRE y en primer lugar: es la columna
                    que esta pantalla agrega sobre Mis pases, donde el
                    solicitante es siempre el mismo y no hace falta decirlo. */}
                <XStack alignItems="center" gap="$1.5">
                  <User size={12} color={theme.textMuted?.val} />
                  <Text fontSize={11} fontWeight="600" color="$text">
                    {p.Solicitante || p.Create_By}
                  </Text>
                  {p.Empresa ? (
                    <Text fontSize={10} color="$textMuted">· {p.EmpresaCode || p.Empresa}</Text>
                  ) : null}
                </XStack>

                <XStack flexWrap="wrap" gap="$2.5">
                  {p.EnviadoA ? (
                    <XStack alignItems="center" gap="$1.5">
                      <Package size={11} color={theme.textMuted?.val} />
                      <Text fontSize={11} color="$textMuted">{p.EnviadoA}</Text>
                    </XStack>
                  ) : null}
                  {p.Responsable ? (
                    <XStack alignItems="center" gap="$1.5">
                      <IdCard size={11} color={theme.textMuted?.val} />
                      <Text fontSize={11} color="$textMuted">{p.Responsable}</Text>
                    </XStack>
                  ) : null}
                  <XStack alignItems="center" gap="$1.5">
                    <CalendarDays size={11} color={theme.textMuted?.val} />
                    <Text fontSize={11} color="$textMuted">
                      Creado {fmtFecha(p.Creation_Date)}
                    </Text>
                  </XStack>
                </XStack>

                {/* Lo que un auditor busca: cuánto sigue afuera y, si el pase se
                    cerró sin que volviera todo, por qué. */}
                {(p.UnidadesAfuera ?? 0) > 0 && ESTADOS_ABIERTOS.includes(p.Estado) ? (
                  <Text fontSize={11} color={ACCENT}>
                    {fmtCantidad(p.UnidadesAfuera)} sin volver
                  </Text>
                ) : null}

                {p.MotivoCierre ? (
                  <XStack alignItems="flex-start" gap="$1.5" paddingTop="$1.5"
                    borderTopWidth={1} borderTopColor="$border">
                    <Ban size={11} color="#f59e0b" style={{ marginTop: 2 }} />
                    <Text flex={1} fontSize={11} color="#f59e0b" numberOfLines={2}>
                      {p.MotivoCierre}
                    </Text>
                  </XStack>
                ) : null}
              </YStack>
            )
          }}
        />
      )}
    </View>
  )
}
