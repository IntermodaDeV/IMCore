import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { FlatList, RefreshControl } from 'react-native'
import { YStack, XStack, Text, Card, View, useTheme } from 'tamagui'
import { CalendarDays, CheckCircle2, ShieldCheck, UserRound, XCircle } from 'lucide-react-native'

import { useAuth } from '../../context/AuthContext'
import { usePageHeader } from '../../hooks/usePageHeader'
import { useLoader } from '../../providers/LoaderProvider'
import { handleError, AppError } from '../../utils/errorHandler'
import ErrorState from '../AdmSys/ErrorState'
import EmptyState from '../AdmSys/EmptyState'
import SkeletonList from '../../components/Skeletons/SkeletonList'
import SearchInput from '../../components/commons/SearchInput'
import AppSelect from '../../components/commons/AppSelect'
import { NotificationBell } from '../../components/notifications/NotificationBell'
import { subscribeOpenHistorialHoraExtra } from '../../services/overtimeNavigation'
import { overtimeService } from '../../api/modules/overtime/overtime.service'
import { IOvertimeHistoryRow } from '../../api/modules/overtime/overtime.types'
import { fmtFecha, fmtFechaHora, fmtHoras, nombreConCodigo } from './Overtime.utils'

// Historial de autorizaciones de horas extra.
//
// A diferencia de las dos bandejas, este dato SÍ vive en IMCore: es la bitácora
// local que se escribe cuando PayWeb confirma una decisión. Por eso no lleva
// empresa ni entidad — se consulta por usuario.
//
// Quién ve qué lo decide el servidor: sin el acceso 'HistoryHours' solo devuelve
// lo propio; con él, el de todos y con el nombre de quien autorizó. Acá no se
// evalúa el permiso, solo se usa la bandera que viene resuelta en las filas.

type Filtro = 'todos' | 'solicitud' | 'revision'

const OPCIONES_FILTRO = [
  { label: 'Todo', value: 'todos' },
  { label: 'Solicitudes', value: 'solicitud' },
  { label: 'Revisiones', value: 'revision' },
]

export default function HistorialHorasExtraScreen() {
  const { defaultCompany } = useAuth()
  const loader = useLoader()
  const theme = useTheme()

  const [data, setData] = useState<IOvertimeHistoryRow[]>([])
  const [buscadas, setBuscadas] = useState<IOvertimeHistoryRow[]>([])
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<AppError | null>(null)

  // Solicitud a resaltar al llegar desde el aviso de rechazo. Se apaga sola:
  // es una pista para ubicarla, no un estado del registro.
  const [resaltadaId, setResaltadaId] = useState<number | null>(null)
  const listaRef = useRef<FlatList<IOvertimeHistoryRow> | null>(null)

  usePageHeader({
    center: (
      <Text fontSize={16} fontWeight="700" color="$text">
        Historial de Horas Extra
      </Text>
    ),
    right: <NotificationBell size={18} />,
  })

  const loadData = useCallback(async (silent = false) => {
    try {
      if (silent) {
        setRefreshing(true)
      } else {
        loader.show()
        setLoading(true)
      }
      setError(null)

      const res = await overtimeService.getHistorial()

      // Sin esto, un error del backend (Success=false) se vería como historial vacío.
      if (!res.Success) throw new Error(res.ErrorMessage || 'No se pudo cargar el historial')

      setData(res.Data ?? [])
      setBuscadas(res.Data ?? [])
    } catch (err) {
      setError(handleError(err))
    } finally {
      setLoading(false)
      setRefreshing(false)
      loader.hide()
    }
    // `loader` queda fuera a propósito: el provider no memoiza su valor, así que
    // incluirlo haría que el useFocusEffect consultara sin parar.
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadData()
    }, [loadData]),
  )

  /**
   * Llegada desde el aviso de rechazo: recarga, DESPLAZA hasta la fila y la
   * resalta un momento.
   *
   * Sin el desplazamiento el resaltado no sirve: el historial trae hasta 60
   * registros y la solicitud rechazada puede quedar fuera de la pantalla, así
   * que el resaltado se apagaría sin que nadie lo viera.
   */
  useEffect(() => {
    const unsub = subscribeOpenHistorialHoraExtra(requestId => {
      setResaltadaId(requestId)
      loadData(true)

      setTimeout(() => {
        const indice = filasRef.current.findIndex(r => r.Request_Id === requestId)
        if (indice >= 0) {
          listaRef.current?.scrollToIndex({ index: indice, animated: true, viewPosition: 0 })
        }
      }, 350)

      setTimeout(() => setResaltadaId(null), 2600)
    })
    return unsub
  }, [loadData])

  // El filtro por flujo se aplica DESPUÉS de la búsqueda: SearchInput trabaja
  // sobre el conjunto completo, y encadenarlo al revés dejaría fuera resultados
  // que sí coinciden pero están en la otra pestaña.
  const filas = useMemo(() => {
    if (filtro === 'todos') return buscadas
    const esRevision = filtro === 'revision'
    return buscadas.filter(r => r.Is_Review === esRevision)
  }, [buscadas, filtro])

  // El callback del bus se registra una sola vez, así que leería una lista
  // vieja. La ref siempre tiene la actual.
  const filasRef = useRef(filas)
  useEffect(() => { filasRef.current = filas }, [filas])

  // La bandera viene por fila; con el historial vacío no hay de dónde leerla,
  // pero tampoco hay nada que mostrar.
  const veTodo = data.length > 0 && data[0].Can_See_All

  const resumen = useMemo(() => {
    const aprobadas = filas.filter(r => r.Is_Approved).length
    const horas = filas
      .filter(r => r.Is_Approved)
      .reduce((acc, r) => acc + (r.Approved_Hours ?? 0), 0)
    return { aprobadas, rechazadas: filas.length - aprobadas, horas }
  }, [filas])

  if (loading) return <SkeletonList />
  if (error) return <ErrorState title={error.title} message={error.message} onRetry={loadData} />

  return (
    <View flex={1} backgroundColor="$backgroundPage">
      <YStack paddingHorizontal="$4" paddingTop="$3" gap="$2">
        <AppSelect
          label="Proceso"
          value={filtro}
          options={OPCIONES_FILTRO}
          onValueChange={v => setFiltro(String(v) as Filtro)}
        />

        <SearchInput
          data={data}
          searchKeys={['Employee_Name', 'Employee_Code', 'Correlative', 'Authorized_By', 'Comment']}
          onResults={setBuscadas}
          placeholder="Buscar por empleado, correlativo o comentario"
        />

        {filas.length > 0 && (
          <XStack justifyContent="space-between" alignItems="center" paddingHorizontal="$1">
            <XStack gap="$3">
              <Text fontSize={12} color="$textMuted">
                <Text fontSize={12} fontWeight="700" color="$success">{resumen.aprobadas}</Text> aprobadas
              </Text>
              <Text fontSize={12} color="$textMuted">
                <Text fontSize={12} fontWeight="700" color="$error">{resumen.rechazadas}</Text> rechazadas
              </Text>
            </XStack>
            <Text fontSize={12} fontWeight="700" color="$text">
              {fmtHoras(resumen.horas)}
            </Text>
          </XStack>
        )}

        {/* Se dice explícitamente cuando la vista es la completa: cambia el
            significado de la lista y no se deduce de mirarla. */}
        {veTodo && (
          <XStack alignItems="center" gap="$2" paddingHorizontal="$1">
            <ShieldCheck size={12} color={theme.info?.val as string} />
            <Text fontSize={11} color="$textMuted">
              Viendo las autorizaciones de todos los usuarios
            </Text>
          </XStack>
        )}
      </YStack>

      <FlatList
        ref={listaRef}
        data={filas}
        keyExtractor={item => String(item.Id)}
        // Las tarjetas tienen alto variable, así que scrollToIndex puede fallar
        // si el destino aún no se midió: se aproxima y se reintenta.
        onScrollToIndexFailed={info => {
          listaRef.current?.scrollToOffset({
            offset: info.averageItemLength * info.index,
            animated: true,
          })
          setTimeout(() => {
            listaRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0 })
          }, 250)
        }}
        contentContainerStyle={
          filas.length === 0
            ? { flexGrow: 1 }
            : { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40, gap: 10 }
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadData(true)}
            colors={[theme.primary?.val as string]}
            tintColor={theme.primary?.val as string}
          />
        }
        ListEmptyComponent={
          <EmptyState
            title="Sin registros"
            message={
              filtro === 'todos'
                ? 'Todavía no hay horas extra que hayas pedido ni resuelto.'
                : 'No hay registros de este proceso.'
            }
          />
        }
        renderItem={({ item }) => (
          <HistorialCard
            item={item}
            veTodo={veTodo}
            resaltada={item.Request_Id === resaltadaId}
          />
        )}
      />
    </View>
  )
}

function HistorialCard({
  item,
  veTodo,
  resaltada,
}: {
  item: IOvertimeHistoryRow
  veTodo: boolean
  /** Llegó por notificación: se marca un momento para poder ubicarla. */
  resaltada?: boolean
}) {
  const theme = useTheme()

  const colorEstado = item.Is_Approved
    ? (theme.success?.val as string)
    : (theme.error?.val as string)
  const IconoEstado = item.Is_Approved ? CheckCircle2 : XCircle

  // El proceso se distingue por color y por texto, no solo por color: en una
  // lista mezclada hay que poder decir de cuál es sin comparar con el vecino.
  const colorProceso = item.Is_Review
    ? (theme.warning?.val as string)
    : (theme.info?.val as string)

  return (
    <Card
      // El resaltado toca el fondo y el borde, no solo el borde: en una lista
      // de tarjetas iguales un borde de 2px se pierde al pasar la vista.
      backgroundColor={resaltada ? '$primaryOpacity2' : '$backgroundElevated'}
      borderRadius={14}
      padding="$3"
      borderWidth={resaltada ? 2 : 1}
      borderColor={resaltada ? '$primary' : '$border'}
    >
      <YStack gap="$2.5">
        {/* De qué proceso es y en qué terminó: es el titular de la fila */}
        <XStack justifyContent="space-between" alignItems="center" gap="$2">
          <XStack
            paddingHorizontal={8}
            paddingVertical={3}
            borderRadius={20}
            alignItems="center"
            gap="$1"
            style={{ backgroundColor: `${colorProceso}1f` }}
          >
            <Text fontSize={11} fontWeight="800" style={{ color: colorProceso }}>
              {item.Is_Review ? 'REVISIÓN' : 'SOLICITUD'}
            </Text>
          </XStack>

          <XStack alignItems="center" gap="$1.5">
            {/* 'Mi solicitud' marca las filas donde el usuario es el que pidió,
                no el que firmó: sin eso se leen como decisiones suyas. */}
            {!item.Is_Mine && (
              <Text fontSize={10} fontWeight="700" color="$textMuted">
                MI SOLICITUD ·
              </Text>
            )}
            <IconoEstado size={15} color={colorEstado} />
            <Text fontSize={12} fontWeight="700" style={{ color: colorEstado }}>
              {item.Is_Approved ? 'Aprobada' : 'Rechazada'}
            </Text>
          </XStack>
        </XStack>

        {/* Sobre quién */}
        <YStack gap="$1">
          <Text fontSize={15} fontWeight="700" color="$text" numberOfLines={2}>
            {nombreConCodigo(item.Employee_Name, item.Employee_Code)}
          </Text>

          <XStack alignItems="center" gap="$2">
            <CalendarDays size={12} color={theme.textMuted?.val as string} />
            <Text fontSize={12} color="$textMuted">
              Horas del {fmtFecha(item.Request_Date)} · {item.Correlative}
            </Text>
          </XStack>
        </YStack>

        {/* Cuántas horas quedaron. En un rechazo de solicitud no hay ninguna:
            se dice, en vez de mostrar un cero que se leería como "cero horas
            aprobadas". */}
        <XStack
          justifyContent="space-between"
          alignItems="center"
          paddingHorizontal="$3"
          paddingVertical="$2"
          borderRadius={10}
          // Transparente cuando la fila está resaltada: si se queda gris, tapa
          // el naranja justo en el centro de la tarjeta y el resaltado no se
          // lee. Es lo mismo que hace el histórico de SC.
          backgroundColor={resaltada ? 'transparent' : '$backgroundSurface'}
        >
          <Text fontSize={12} fontWeight="600" color="$textSecondary">
            {item.Is_Approved ? 'Horas aprobadas' : 'Horas a pagar'}
          </Text>
          <Text fontSize={17} fontWeight="800" color="$text">
            {item.Approved_Hours === null || item.Approved_Hours === undefined
              ? 'Ninguna'
              : fmtHoras(item.Approved_Hours)}
          </Text>
        </XStack>

        {!!item.Comment && (
          <Text fontSize={12} color="$textSecondary" numberOfLines={3}>
            {item.Comment}
          </Text>
        )}

        {/* Cuándo se decidió y, si aplica, quién.
            Se muestra el autor siempre que la decisión NO sea del usuario: en
            la vista completa porque son de todos, y en la propia porque ahí
            aparecen también las solicitudes que él pidió y le resolvieron
            otros. Ocultarlo dejaría un rechazo sin responsable visible. */}
        <YStack gap="$1" borderTopWidth={1} borderTopColor="$border" paddingTop="$2">
          {(veTodo || !item.Is_Mine) && (
            <XStack alignItems="center" gap="$2">
              <UserRound size={12} color={theme.textMuted?.val as string} />
              <Text fontSize={11} color="$textMuted" numberOfLines={1}>
                {item.Is_Mine ? '' : `${item.Is_Approved ? 'Aprobó' : 'Rechazó'} `}
                {item.Authorized_By || item.User_Code}
              </Text>
            </XStack>
          )}

          <Text fontSize={11} color="$textMuted">
            {fmtFechaHora(item.Creation_Date)}
          </Text>
        </YStack>
      </YStack>
    </Card>
  )
}
