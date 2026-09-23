import React, { useCallback, useEffect, useState } from 'react'
import { RefreshControl, FlatList } from 'react-native'
import { Text, XStack, YStack, View, useTheme } from 'tamagui'
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native'
import {
  ArrowLeft, Package, User, IdCard, Boxes, RotateCcw, LogOut, TriangleAlert,
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
import { ACCENT, ACCENT_BG, PRESS_CARD, estadoVisual, fmtFecha } from '../pasesSalida.helpers'
import { pasesService } from '../../../api/modules/pasesSalida/pases.service'
import { IPaseSalidaManual } from '../../../api/modules/pasesSalida/pases.types'

/**
 * Buscar un pase sin escanearlo.
 *
 * ES EL CAMINO ALTERNO, no un atajo. El QR es la prueba de que quien llegó a la
 * puerta traía el pase; saltárselo se concede aparte con el acceso
 * PSSalidaManual, y por eso a esta pantalla solo se llega desde un botón que no
 * existe para quien no lo tiene.
 *
 * SOLO BUSCA. Al elegir un pase se abre la MISMA pantalla de verificación del
 * escaneo, que decide si toca salida o regreso según el estado y aplica todas
 * las validaciones. Un segundo camino para registrar sería un segundo lugar
 * donde se pueden olvidar las reglas.
 *
 * Trae dos cosas a la vez, y cada una se acota distinto:
 *   · lo aprobado con fecha del día — es la agenda de lo que toca sacar,
 *   · todo lo que está AFUERA, sin importar cuándo salió: un préstamo de hace
 *     tres semanas puede volver hoy, y filtrarlo por fecha lo escondería justo
 *     cuando hace falta.
 */

const HOY = () => dayjs().format('YYYY-MM-DD')

export default function SalidaManualScreen() {
  const theme = useTheme()
  const navigation = useNavigation<any>()
  const route = useRoute<any>()

  // La fecha llega de Control de salida: si el guardia estaba mirando otro día,
  // no tiene por qué volver a elegirlo acá.
  const [fecha, setFecha] = useState<string>(route.params?.fecha ?? HOY())
  const [items, setItems] = useState<IPaseSalidaManual[]>([])
  // SearchInput filtra contra `items` y devuelve el resultado acá.
  const [filtered, setFiltered] = useState<IPaseSalidaManual[]>([])
  const [loading, setLoading] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [error, setError] = useState<AppError | null>(null)

  const cargar = useCallback(async () => {
    try {
      const r = await pasesService.getPasesSalidaManual(fecha)
      const data = r.Data ?? []
      setItems(data); setFiltered(data)
      setError(null)
    } catch (e) {
      setItems([]); setFiltered([])
      setError(handleError(e))
    }
  }, [fecha])

  useEffect(() => { (async () => { setLoading(true); await cargar(); setLoading(false) })() }, [cargar])
  // Al volver de registrar el movimiento, el pase cambió de estado y ya no
  // corresponde mostrarlo igual.
  useFocusEffect(useCallback(() => { cargar() }, [cargar]))
  const onRefresh = useCallback(async () => { setRefrescando(true); await cargar(); setRefrescando(false) }, [cargar])

  usePageHeader({
    left: <ArrowLeft color={theme.text?.val} onPress={() => navigation.goBack()} />,
    center: <Text fontSize="$4" fontWeight="700" color="$text">Salida manual</Text>,
  })

  return (
    <View flex={1} backgroundColor="$background">
      <YStack paddingHorizontal="$3" paddingTop="$3">
        {/* Que se esté saltando el escaneo tiene que estar a la vista: es una
            excepción, y verla recordada evita que se vuelva la costumbre. */}
        <XStack alignItems="flex-start" gap="$2" marginBottom="$2.5"
          backgroundColor="rgba(245, 158, 11, 0.15)" borderWidth={1} borderColor="#f59e0b"
          borderRadius="$3" paddingHorizontal="$2.5" paddingVertical={6}>
          <TriangleAlert size={12} color="#f59e0b" />
          <Text flex={1} fontSize={10} color="#f59e0b" fontWeight="700">
            Estás registrando sin escanear el QR. Verificá el pase y la identidad de quien retira antes de continuar.
          </Text>
        </XStack>

        <XStack alignItems="flex-start" gap="$2.5">
          <YStack flex={1}>
            <AppDatePicker
              label="Salidas del día"
              value={fecha}
              onChange={(v: string | null) => setFecha(v ?? HOY())}
            />
          </YStack>
          {fecha === HOY() ? null : (
            <YStack paddingTop={8} marginBottom="$2">
              <View onPress={() => setFecha(HOY())} pressStyle={{ opacity: 0.8 }}
                borderWidth={1} borderColor={ACCENT} backgroundColor={ACCENT_BG}
                borderRadius={6} height={44} paddingHorizontal="$3.5"
                alignItems="center" justifyContent="center">
                <Text fontSize={13} fontWeight="800" color={ACCENT}>Hoy</Text>
              </View>
            </YStack>
          )}
        </XStack>

        {/* Las claves son las que alguien usa cuando NO tiene el correlativo:
            de quién es, quién lo retira, qué grupo y qué materiales lleva. */}
        <SearchInput
          data={items}
          searchKeys={[
            'Correlativo', 'Solicitante', 'Responsable',
            'TipoSalida', 'Grupo', 'Materiales', 'EnviadoA',
          ]}
          onResults={setFiltered}
          placeholder="Correlativo, solicitante, material, grupo..."
        />
        <RecordCount count={filtered.length} label="Pases" />
      </YStack>

      {loading ? (
        <SkeletonList />
      ) : error ? (
        <ErrorState
          type={error.type}
          title={error.title}
          message={error.message}
          errorCode={error.status}
          onRetry={async () => { setLoading(true); await cargar(); setLoading(false) }}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => String(p.Id)}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 12, paddingBottom: 40, flexGrow: 1 }}
          ItemSeparatorComponent={() => <View height={10} />}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} tintColor={ACCENT} />}
          ListEmptyComponent={
            <EmptyState
              title={items.length ? 'Sin resultados' : 'Nada por registrar'}
              message={items.length
                ? 'Ningún pase coincide con la búsqueda.'
                : `No hay pases aprobados para el ${dayjs(fecha).format('DD/MM/YYYY')} ni material pendiente de regresar.`}
            />
          }
          renderItem={({ item: p }) => {
            const est = estadoVisual(p.Estado)
            const esRegreso = p.Accion === 'REGRESO'
            return (
              <YStack backgroundColor="$backgroundElevated" borderRadius="$4"
                borderLeftWidth={4} borderLeftColor={est.color}
                borderWidth={1} borderColor="$border"
                paddingVertical="$3" paddingHorizontal="$4" gap="$2" {...shadows.sm}
                /* Se navega a la MISMA pantalla del escaneo: ahí se decide si
                   toca salida o regreso y se validan vigencia, horario y
                   estado. Acá no se registra nada. */
                onPress={() => navigation.navigate('pasesSalidaVerificarSalida',
                  { id: p.Id, correlativo: p.Correlativo })}
                pressStyle={PRESS_CARD}>

                <XStack alignItems="center" gap="$2">
                  <Text flex={1} fontSize={14} fontWeight="900" color="$text">{p.Correlativo}</Text>
                  {/* Qué se va a hacer con este pase, no en qué estado está: es
                      lo que el guardia necesita decidir de un vistazo. */}
                  <XStack alignItems="center" gap={5}
                    backgroundColor={esRegreso ? ACCENT_BG : 'rgba(34, 197, 94, 0.18)'}
                    borderWidth={1} borderColor={esRegreso ? ACCENT : '#22c55e'}
                    borderRadius="$3" paddingHorizontal="$2" paddingVertical={3}>
                    {esRegreso
                      ? <RotateCcw size={11} color={ACCENT} />
                      : <LogOut size={11} color="#22c55e" />}
                    <Text fontSize={10} fontWeight="800" color={esRegreso ? ACCENT : '#22c55e'}>
                      {esRegreso ? 'Regresa' : 'Sale'}
                    </Text>
                  </XStack>
                </XStack>

                <XStack alignItems="center" gap="$2" flexWrap="wrap">
                  <View backgroundColor={ACCENT} borderRadius="$3"
                    paddingHorizontal="$2.5" paddingVertical={3}>
                    <Text fontSize={11} fontWeight="900" color="#fff">{p.TipoSalida}</Text>
                  </View>
                  {p.Grupo ? (
                    <XStack alignItems="center" gap={5}>
                      <Boxes size={12} color={theme.textMuted?.val} />
                      <Text fontSize={11} color="$textMuted">{p.Grupo}</Text>
                    </XStack>
                  ) : null}
                  {esRegreso && p.DiasAfuera != null ? (
                    <Text fontSize={10} fontWeight="800"
                      color={p.DiasAfuera >= 30 ? '#ef4444' : '$textMuted'}>
                      {p.DiasAfuera === 0 ? 'Salió hoy' : `${p.DiasAfuera} días afuera`}
                    </Text>
                  ) : null}
                </XStack>

                {p.Responsable ? (
                  <XStack alignItems="center" gap="$1.5">
                    <IdCard size={13} color={ACCENT} />
                    <Text fontSize={12} fontWeight="800" color="$text">{p.Responsable}</Text>
                    <Text fontSize={10} color="$textMuted">retira</Text>
                  </XStack>
                ) : null}

                <XStack alignItems="center" gap="$3" flexWrap="wrap">
                  <XStack alignItems="center" gap="$1.5">
                    <User size={12} color={theme.textMuted?.val} />
                    <Text fontSize={11} color="$textMuted">{p.Solicitante || p.Create_By}</Text>
                  </XStack>
                  {!esRegreso && p.FechaSalida ? (
                    <Text fontSize={11} color="$textMuted">Sale {fmtFecha(p.FechaSalida)}</Text>
                  ) : null}
                </XStack>

                {/* Los materiales son la razón por la que alguien encuentra el
                    pase buscando "taladro": si se puede buscar por ellos, se
                    tienen que poder leer. */}
                {p.Materiales ? (
                  <XStack alignItems="flex-start" gap="$1.5">
                    <Package size={12} color={theme.textMuted?.val} style={{ marginTop: 2 }} />
                    <Text flex={1} fontSize={11} color="$textMuted" numberOfLines={2}>
                      {p.Materiales}
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
