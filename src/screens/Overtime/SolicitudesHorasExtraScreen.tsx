import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { FlatList, Modal, RefreshControl, ScrollView, StyleSheet } from 'react-native'
import { YStack, XStack, Text, Card, View, Button, useTheme } from 'tamagui'
import { CalendarDays, Check, Clock, UserRound, X } from 'lucide-react-native'
import dayjs from 'dayjs'

import { useAuth } from '../../context/AuthContext'
import { usePageHeader } from '../../hooks/usePageHeader'
import { useLoader } from '../../providers/LoaderProvider'
import { useKeyboardHeight } from '../../hooks/useKeyboardInset'
import { useShowToast } from '../../utils/useShowToast'
import { handleError, AppError } from '../../utils/errorHandler'
import ErrorState from '../AdmSys/ErrorState'
import EmptyState from '../AdmSys/EmptyState'
import SkeletonList from '../../components/Skeletons/SkeletonList'
import SearchInput from '../../components/commons/SearchInput'
import AppSelect from '../../components/commons/AppSelect'
import AppInput from '../../components/commons/AppInput'
import ConfirmDialog from '../../components/commons/ConfirmDialog'
import CountryFlag from '../../components/commons/CountryFlag'
import { subscribeOpenSolicitudHoraExtra } from '../../services/overtimeNavigation'
import { overtimeService } from '../../api/modules/overtime/overtime.service'
import { IOvertimeRequestDetail, IUserEntity } from '../../api/modules/overtime/overtime.types'
import {
  DistribucionHoras,
  fmtFecha,
  fmtHora,
  fmtHoras,
  nombreConCodigo,
  parseConceptos,
} from './Overtime.utils'


export default function SolicitudesHorasExtraScreen() {
  const { defaultCompany } = useAuth()
  const loader = useLoader()
  const theme = useTheme()
  const { showToast } = useShowToast()
  const keyboardHeight = useKeyboardHeight()

  const [entidades, setEntidades] = useState<IUserEntity[]>([])
  const [entidad, setEntidad] = useState<string>('')
  const [data, setData] = useState<IOvertimeRequestDetail[]>([])
  const [filtered, setFiltered] = useState<IOvertimeRequestDetail[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<AppError | null>(null)
  const [aprobando, setAprobando] = useState<IOvertimeRequestDetail | null>(null)
  const [rechazando, setRechazando] = useState<IOvertimeRequestDetail | null>(null)
  const [motivo, setMotivo] = useState('')
  const [motivoError, setMotivoError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [resaltadaId, setResaltadaId] = useState<number | null>(null)
  const listaRef = useRef<FlatList<IOvertimeRequestDetail> | null>(null)

  const companyCode = defaultCompany?.Code ?? ''

  usePageHeader({
    center: (
      <Text fontSize={16} fontWeight="700" color="$text">
        Solicitudes de Horas Extra
      </Text>
    ),
    right: <CountryFlag countryCode={defaultCompany?.CodeIcon ?? 'HN'} width={28} height={20} />,
  })

  const loadEntidades = useCallback(async () => {
    if (!companyCode) return
    try {
      const res = await overtimeService.getRequestEntities(companyCode)
      const lista = res.Success ? res.Data ?? [] : []
      setEntidades(lista)

      // Al cambiar de empresa la entidad anterior puede ya no existir.
      setEntidad(prev => {
        const sigueValida = prev && lista.some(e => String(e.Id) === prev)
        return sigueValida ? prev : lista.length ? String(lista[0].Id) : ''
      })
    } catch (err) {
      setError(handleError(err))
    }
  }, [companyCode])

  const loadData = useCallback(async (silent = false) => {
    if (!companyCode || !entidad) {
      setData([])
      setFiltered([])
      return
    }

    try {
      if (silent) {
        setRefreshing(true)
      } else {
        loader.show()
        setLoading(true)
      }
      setError(null)

      const res = await overtimeService.getRequestDetails(companyCode, Number(entidad))

      // Sin esto, un error del backend (Success=false) se vería como bandeja vacía.
      if (!res.Success) throw new Error(res.ErrorMessage || 'No se pudieron cargar las solicitudes')

      setData(res.Data ?? [])
      setFiltered(res.Data ?? [])
    } catch (err) {
      setError(handleError(err))
    } finally {
      setLoading(false)
      setRefreshing(false)
      loader.hide()
    }
  }, [companyCode, entidad])

  const enviarDecision = useCallback(
    async (detalle: IOvertimeRequestDetail, aprobar: boolean, comentario: string) => {
      try {
        setEnviando(true)
        loader.show()

        const res = await overtimeService.authorizeRequest(companyCode, {
          SystemEntities_Id: Number(entidad),
          Auth: aprobar,
          Comment: comentario,
          Details: [detalle.Id],
        })

        if (!res.Success) {
          showToast('error', 'Error', res.ErrorMessage || 'No se pudo registrar la decisión', 5000, 'top')
          return
        }

        const quitar = (lista: IOvertimeRequestDetail[]) => lista.filter(d => d.Id !== detalle.Id)
        setData(quitar)
        setFiltered(quitar)

        setAprobando(null)
        setRechazando(null)
        setMotivo('')

        showToast(
          'success',
          aprobar ? 'Aprobado' : 'Rechazado',
          `Horas extra de ${nombreConCodigo(detalle.Employee_Name, detalle.Employee_Code)}`,
          3000,
          'top',
        )
      } catch (err) {
        showToast('error', 'Error', handleError(err).message, 5000, 'top')
      } finally {
        setEnviando(false)
        loader.hide()
      }
    },
    [companyCode, entidad, loader, showToast],
  )

  const confirmarRechazo = useCallback(() => {
    if (!rechazando) return
    const texto = motivo.trim()
    if (texto.length < 10) {
      setMotivoError('Indica el motivo del rechazo (al menos 10 caracteres)')
      return
    }

    enviarDecision(rechazando, false, texto)
  }, [rechazando, motivo, enviarDecision])

  useEffect(() => {
    loadEntidades()
  }, [loadEntidades])

  useFocusEffect(
    useCallback(() => {
      loadData()
    }, [loadData]),
  )

  useEffect(() => {
    const unsub = subscribeOpenSolicitudHoraExtra(requestId => {
      setResaltadaId(requestId)
      loadData(true)

      // Se espera a que la recarga pinte la lista antes de buscar la posición.
      setTimeout(() => {
        const indice = filtradosRef.current.findIndex(d => d.Request_Id === requestId)
        if (indice >= 0) {
          listaRef.current?.scrollToIndex({ index: indice, animated: true, viewPosition: 0 })
        }
      }, 350)

      setTimeout(() => setResaltadaId(null), 2600)
    })
    return unsub
  }, [loadData])

  const opcionesEntidad = useMemo(
    () => entidades.map(e => ({ label: e.Name, value: String(e.Id) })),
    [entidades],
  )

  // El callback del bus se registra una sola vez, así que leería un `filtered`
  // viejo. La ref siempre tiene el actual.
  const filtradosRef = useRef(filtered)
  useEffect(() => { filtradosRef.current = filtered }, [filtered])

  // Los totales se calculan sobre lo FILTRADO: si no, el encabezado diría una
  // cosa y las tarjetas mostrarían otra.
  const resumen = useMemo(() => {
    const horas = filtered.reduce((acc, d) => acc + (d.Total_Overtime_Hours ?? 0), 0)
    const empleados = new Set(filtered.map(d => d.Employee_Code)).size
    return { horas, empleados }
  }, [filtered])

  if (loading) return <SkeletonList />
  if (error) return <ErrorState title={error.title} message={error.message} onRetry={loadData} />

  const sinEntidades = !!companyCode && entidades.length === 0

  return (
    <>
    <View flex={1} backgroundColor="$backgroundPage">
      <YStack paddingHorizontal="$4" paddingTop="$3" gap="$2">
        {opcionesEntidad.length > 0 && (
          <AppSelect
            label="Entidad"
            value={entidad}
            options={opcionesEntidad}
            onValueChange={v => setEntidad(String(v))}
            disabled={opcionesEntidad.length === 1}
          />
        )}

        <SearchInput
          data={data}
          searchKeys={['Employee_Name', 'Employee_Code', 'Correlative', 'Category_Name', 'Solicitante']}
          onResults={setFiltered}
          placeholder="Buscar por empleado, correlativo o motivo"
        />
      </YStack>

      <FlatList
        ref={listaRef}
        data={filtered}
        keyExtractor={item => String(item.Id)}
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
          filtered.length === 0
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
          sinEntidades ? (
            <EmptyState
              title="Sin entidades asignadas"
              message="No participás en el flujo de aprobación de horas extra de esta empresa."
            />
          ) : (
            <EmptyState
              title="Nada pendiente"
              message="No hay solicitudes de horas extra esperando tu aprobación."
            />
          )
        }
        renderItem={({ item }) => (
          <SolicitudCard
            item={item}
            resaltada={item.Request_Id === resaltadaId}
            onAprobar={() => setAprobando(item)}
            onRechazar={() => {
              setMotivo('')
              setMotivoError('')
              setRechazando(item)
            }}
          />
        )}
      />

    </View>
      <ConfirmDialog
        open={!!aprobando}
        onOpenChange={abierto => { if (!abierto) setAprobando(null) }}
        title="Aprobar horas extra"
        message={
          aprobando
            ? `¿Aprobar ${fmtHoras(aprobando.Total_Overtime_Hours)} de ${nombreConCodigo(
                aprobando.Employee_Name,
                aprobando.Employee_Code,
              )}?`
            : ''
        }
        confirmLabel="Aprobar"
        confirmColor="#22C55E"
        loading={enviando}
        onConfirm={() => aprobando && enviarDecision(aprobando, true, '')}
        onCancel={() => setAprobando(null)}
      />

      <Modal
        visible={!!rechazando}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setRechazando(null)}
      >
        <ScrollView
          style={styles.backdrop}
          contentContainerStyle={[styles.backdropContent, { paddingBottom: 24 + keyboardHeight }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.modalCard, { backgroundColor: theme.backgroundElevated?.val as string }]}>
            <XStack justifyContent="space-between" alignItems="flex-start" gap="$3">
              <YStack flex={1}>
                <Text fontSize={17} fontWeight="700" color="$text" marginBottom="$1">
                  Motivo de rechazo
                </Text>
                <Text fontSize={13} color="$textMuted" marginBottom="$3">
                  {rechazando
                    ? `Indica por qué rechazas las horas de ${nombreConCodigo(
                        rechazando.Employee_Name,
                        rechazando.Employee_Code,
                      )}`
                    : ''}
                </Text>
              </YStack>

              <View
                padding="$2"
                marginTop={-8}
                marginRight={-8}
                borderRadius={999}
                pressStyle={{ opacity: 0.6 }}
                onPress={() => setRechazando(null)}
              >
                <X size={20} color={theme.textMuted?.val as string} />
              </View>
            </XStack>

            <AppInput
              label="Motivo"
              multiline
              minLines={4}
              placeholder="Ej: No corresponde al turno, horas no autorizadas..."
              value={motivo}
              onChangeText={(v: string) => { setMotivo(v); setMotivoError('') }}
              error={motivoError}
              style={{ height: 140 }}
              autoFocus
            />

            <XStack gap="$3" marginTop={16}>
              <Button
                flex={1} height={44} borderRadius={10}
                backgroundColor="$backgroundSurface"
                borderWidth={1} borderColor="$border"
                pressStyle={{ opacity: 0.7 }}
                onPress={() => setRechazando(null)}
              >
                <Text color="$text" fontWeight="600">Cancelar</Text>
              </Button>
              <Button
                flex={1} height={44} borderRadius={10}
                backgroundColor="$error"
                pressStyle={{ opacity: 0.8 }}
                disabled={enviando}
                onPress={confirmarRechazo}
              >
                <Text color="white" fontWeight="700">Rechazar</Text>
              </Button>
            </XStack>
          </View>
        </ScrollView>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  backdropContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 24 },
  modalCard: { borderRadius: 16, padding: 20 },
})

function SolicitudCard({
  item,
  resaltada,
  onAprobar,
  onRechazar,
}: {
  item: IOvertimeRequestDetail
  resaltada?: boolean
  onAprobar: () => void
  onRechazar: () => void
}) {
  const theme = useTheme()
  const conceptos = useMemo(() => parseConceptos(item.ConceptsJson), [item.ConceptsJson])

  return (
    <Card
      backgroundColor={resaltada ? '$primaryOpacity2' : '$backgroundElevated'}
      borderRadius={14}
      padding="$3"
      borderWidth={resaltada ? 2 : 1}
      borderColor={resaltada ? '$primary' : '$border'}
    >
      <YStack gap="$3">
        {/* Quién y cuándo */}
        <XStack justifyContent="space-between" alignItems="flex-start" gap="$2">
          <YStack flex={1} gap="$1">
            <Text fontSize={15} fontWeight="700" color="$text" numberOfLines={2}>
              {nombreConCodigo(item.Employee_Name, item.Employee_Code)}
            </Text>
            {!!item.Departamento && (
              <Text fontSize={12} color="$textMuted" numberOfLines={1}>
                {item.Departamento}
              </Text>
            )}
          </YStack>

          <XStack
            paddingHorizontal={8}
            paddingVertical={3}
            borderRadius={20}
            alignItems="center"
            gap="$1"
            backgroundColor="$backgroundSurface"
          >
            <CalendarDays size={11} color={theme.textMuted?.val as string} />
            <Text fontSize={11} fontWeight="600" color="$textSecondary">
              {fmtFecha(item.Date)}
            </Text>
          </XStack>
        </XStack>

        {/* Las horas: el dato que se está aprobando */}
        <XStack justifyContent="space-between" alignItems="center" gap="$2">
          <XStack alignItems="center" gap="$2">
            <Clock size={15} color={theme.textMuted?.val as string} />
            <Text fontSize={14} fontWeight="600" color="$text">
              {fmtHora(item.Start_Time)} — {fmtHora(item.End_Time)}
            </Text>
          </XStack>
          <Text fontSize={20} fontWeight="800" color="$text">
            {fmtHoras(item.Total_Overtime_Hours)}
          </Text>
        </XStack>

        <DistribucionHoras conceptos={conceptos} />

        {/* Quién las pide y por qué */}
        <YStack gap="$1" borderTopWidth={1} borderTopColor="$border" paddingTop="$2">
          <XStack alignItems="center" gap="$2">
            <UserRound size={13} color={theme.textMuted?.val as string} />
            <Text fontSize={12} color="$textMuted" numberOfLines={1}>
              Solicita{' '}
              <Text fontSize={12} fontWeight="600" color="$textSecondary">
                {nombreConCodigo(item.Solicitante) || '—'}
              </Text>
            </Text>
          </XStack>

          <XStack justifyContent="space-between" alignItems="center" gap="$2">
            <Text fontSize={12} color="$textMuted" numberOfLines={1} flex={1}>
              {item.Category_Name || 'Sin motivo'}
            </Text>
            <Text fontSize={11} fontWeight="600" color="$textMuted">
              {item.Correlative}
            </Text>
          </XStack>
        </YStack>

        {/* La decisión. Va al pie de la tarjeta, después de todo lo que hay que
            leer para tomarla. */}
        <XStack gap="$2">
          <Button
            flex={1} height={40} borderRadius={10}
            backgroundColor="$backgroundSurface"
            borderWidth={1} borderColor="$border"
            pressStyle={{ opacity: 0.7 }}
            onPress={onRechazar}
          >
            <XStack alignItems="center" gap="$2">
              <X size={15} color={theme.error?.val as string} />
              <Text fontSize={13} fontWeight="700" color="$error">Rechazar</Text>
            </XStack>
          </Button>

          <Button
            flex={1} height={40} borderRadius={10}
            backgroundColor="$success"
            pressStyle={{ opacity: 0.85 }}
            onPress={onAprobar}
          >
            <XStack alignItems="center" gap="$2">
              <Check size={15} color="white" />
              <Text fontSize={13} fontWeight="700" color="white">Aprobar</Text>
            </XStack>
          </Button>
        </XStack>
      </YStack>
    </Card>
  )
}
