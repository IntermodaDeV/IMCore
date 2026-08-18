import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { FlatList, Modal, RefreshControl, ScrollView, StyleSheet } from 'react-native'
import { YStack, XStack, Text, Card, View, Button, useTheme } from 'tamagui'
import { CalendarDays, Check, MessageSquareWarning, TrendingDown, TrendingUp, X } from 'lucide-react-native'

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
import { overtimeService } from '../../api/modules/overtime/overtime.service'
import { IOvertimeReviewToAuth, IUserEntity } from '../../api/modules/overtime/overtime.types'
import {
  DistribucionHoras,
  fmtFecha,
  fmtFechaHora,
  fmtHora,
  fmtHoras,
  nombreConCodigo,
  parseConceptos,
} from './Overtime.utils'

// Bandeja de autorización de la DIFERENCIA (segundo flujo).
//
// Cuando el reloj registra más horas de las que se habían solicitado, RRHH
// revisa. Si decide no resolverlo por su cuenta, manda la diferencia acá.
//
// Lo que se aprueba en esta pantalla NO son las horas de la solicitud —esas ya
// pasaron por el primer flujo— sino qué hacer con la diferencia:
//   · aprobar  → se le reconocen las horas del MARCAJE
//   · rechazar → se le pagan las horas SOLICITADAS
// Por eso la tarjeta muestra los dos grupos enfrentados: la decisión es elegir
// entre ellos, y sin ver ambos no hay con qué decidir.
//
// El dato vive en InterfazPayWeb, lo publica IMCoreProxy y lo reenvía IMCoreApi
// (api/Overtime/ReviewsToAuth) ya con JWT.

/** Verde si trabajó de más, rojo si de menos, ámbar si no hay marcaje. */
const colorDiferencia = (diff: number | null | undefined, theme: any): string => {
  if (diff === null || diff === undefined) return theme.warning?.val as string
  if (diff > 0) return theme.success?.val as string
  if (diff < 0) return theme.error?.val as string
  return theme.textSecondary?.val as string
}

const etiquetaDiferencia = (diff: number | null | undefined) => {
  if (diff === null || diff === undefined) return 'Sin marcaje'
  if (diff === 0) return '0h'
  return `${diff > 0 ? '+' : '-'}${fmtHoras(Math.abs(diff))}`
}

export default function RevisionHorasExtraScreen() {
  const { defaultCompany } = useAuth()
  const loader = useLoader()
  const theme = useTheme()
  const { showToast } = useShowToast()
  // El modal de rechazo centra su tarjeta; con el teclado abierto queda
  // debajo. Este alto la empuja hacia arriba, igual que en Aprobación de Gastos.
  const keyboardHeight = useKeyboardHeight()

  const [entidades, setEntidades] = useState<IUserEntity[]>([])
  const [entidad, setEntidad] = useState<string>('')
  const [data, setData] = useState<IOvertimeReviewToAuth[]>([])
  const [filtered, setFiltered] = useState<IOvertimeReviewToAuth[]>([])
  const [loading, setLoading] = useState(false)
  // Aparte de `loading`: el gesto de recargar no debe reemplazar la lista por
  // el esqueleto.
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<AppError | null>(null)

  // Decisión en curso. Aprobar se confirma y ya; rechazar pide el motivo, que
  // el procedimiento exige.
  const [aprobando, setAprobando] = useState<IOvertimeReviewToAuth | null>(null)
  const [rechazando, setRechazando] = useState<IOvertimeReviewToAuth | null>(null)
  const [motivo, setMotivo] = useState('')
  const [motivoError, setMotivoError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const companyCode = defaultCompany?.Code ?? ''

  usePageHeader({
    center: (
      <Text fontSize={16} fontWeight="700" color="$text">
        Revisión de Horas Extra
      </Text>
    ),
    right: <CountryFlag countryCode={defaultCompany?.CodeIcon ?? 'HN'} width={28} height={20} />,
  })

  // Las entidades de este flujo son propias: no son las mismas del proceso de
  // solicitudes, aunque las firme la misma persona.
  const loadEntidades = useCallback(async () => {
    if (!companyCode) return
    try {
      const res = await overtimeService.getReviewEntities(companyCode)
      const lista = res.Success ? res.Data ?? [] : []
      setEntidades(lista)

      setEntidad(prev => {
        const sigueValida = prev && lista.some(e => String(e.Id) === prev)
        return sigueValida ? prev : lista.length ? String(lista[0].Id) : ''
      })
    } catch (err) {
      setError(handleError(err))
    }
  }, [companyCode])

  /**
   * Trae la bandeja de la entidad activa.
   *
   * `silent` es el modo del gesto de recargar: sin loader a pantalla completa
   * ni esqueleto, solo el indicador propio de la lista.
   */
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

      const res = await overtimeService.getReviewsToAuth(companyCode, Number(entidad))

      // Sin esto, un error del backend (Success=false) se vería como bandeja vacía.
      if (!res.Success) throw new Error(res.ErrorMessage || 'No se pudieron cargar las revisiones')

      setData(res.Data ?? [])
      setFiltered(res.Data ?? [])
    } catch (err) {
      setError(handleError(err))
    } finally {
      setLoading(false)
      setRefreshing(false)
      loader.hide()
    }
    // `loader` queda fuera a propósito: el provider no memoiza su valor, así que
    // incluirlo cambiaría la identidad de loadData en cada render y el
    // useFocusEffect volvería a consultar sin parar.
  }, [companyCode, entidad])

  /**
   * Registra la decisión sobre la diferencia.
   *
   * Al resolverse, la revisión sale de la bandeja —el backend solo devuelve lo
   * pendiente— así que se quita de la lista en el acto en lugar de recargar
   * todo: la respuesta es inmediata y no se pierde la posición del scroll.
   */
  const enviarDecision = useCallback(
    async (revision: IOvertimeReviewToAuth, aprobar: boolean, comentario: string) => {
      try {
        setEnviando(true)
        loader.show()

        const res = await overtimeService.authorizeReview(companyCode, {
          SystemEntities_Id: Number(entidad),
          Auth: aprobar,
          Comment: comentario,
          Reviews: [revision.Id],
        })

        if (!res.Success) {
          showToast('error', 'Error', res.ErrorMessage || 'No se pudo registrar la decisión', 5000, 'top')
          return
        }

        const quitar = (lista: IOvertimeReviewToAuth[]) => lista.filter(r => r.Id !== revision.Id)
        setData(quitar)
        setFiltered(quitar)

        setAprobando(null)
        setRechazando(null)
        setMotivo('')

        showToast(
          'success',
          aprobar ? 'Diferencia aprobada' : 'Diferencia rechazada',
          aprobar
            ? `Se reconocen ${fmtHoras(revision.Worked_Overtime_Hours)} del marcaje`
            : `Se pagan ${fmtHoras(revision.Requested_Overtime_Hours)} solicitadas`,
          3500,
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

    // El SP lo exige y pide al menos 10 caracteres: mejor decirlo acá que dejar
    // que el error viaje hasta la base y vuelva.
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

  const opcionesEntidad = useMemo(
    () => entidades.map(e => ({ label: e.Name, value: String(e.Id) })),
    [entidades],
  )

  if (loading) return <SkeletonList />
  if (error) return <ErrorState title={error.title} message={error.message} onRetry={loadData} />

  const sinEntidades = !!companyCode && entidades.length === 0

  return (
    // Fragmento en la raíz: el Modal y el AlertDialog van FUERA del View de
    // Tamagui. Anidados dentro, el overlay del diálogo queda por debajo del
    // contenedor y los toques no llegan. Es la misma disposición que usan
    // DetalleGastoScreen y PaseAprobacionesScreen, que sí responden.
    <>
    <View flex={1} backgroundColor="$backgroundPage">
      <YStack paddingHorizontal="$4" paddingTop="$3" gap="$2">
        {/* Se muestra aunque haya una sola entidad. Escondiéndolo, quien
            tiene una sola cree que la pantalla no le deja cambiarla; así al
            menos ve cuál es y que no hay otra. */}
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
          searchKeys={['Employee_Name', 'Employee_Code', 'Correlative', 'Sent_To_Review_By', 'Comment']}
          onResults={setFiltered}
          placeholder="Buscar por empleado, correlativo o quien la envió"
        />
      </YStack>

      {/* La lista se monta siempre, incluso vacía, para que el gesto de
          recargar exista también cuando no hay nada pendiente. */}
      <FlatList
        data={filtered}
        keyExtractor={item => String(item.Id)}
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
              message="No participás en el flujo de revisión de horas extra de esta empresa."
            />
          ) : (
            <EmptyState
              title="Nada pendiente"
              message="No hay diferencias de horas esperando tu autorización."
            />
          )
        }
        renderItem={({ item }) => (
          <RevisionCard
            item={item}
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

      {/* Aprobar: el confirm dice explícitamente qué horas quedan, porque es lo
          que cambia y no se deduce del botón. */}
      <ConfirmDialog
        open={!!aprobando}
        onOpenChange={abierto => { if (!abierto) setAprobando(null) }}
        title="Aprobar diferencia"
        message={
          aprobando
            ? `Se le reconocerán ${fmtHoras(aprobando.Worked_Overtime_Hours)} del marcaje a ` +
              `${nombreConCodigo(aprobando.Employee_Name, aprobando.Employee_Code)}, ` +
              `en lugar de las ${fmtHoras(aprobando.Requested_Overtime_Hours)} solicitadas.`
            : ''
        }
        confirmLabel="Aprobar"
        confirmColor="#22C55E"
        loading={enviando}
        onConfirm={() => aprobando && enviarDecision(aprobando, true, '')}
        onCancel={() => setAprobando(null)}
      />

      {/* Rechazar: el motivo es obligatorio, así que no alcanza un confirm */}
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
                  Rechazar diferencia
                </Text>
                <Text fontSize={13} color="$textMuted" marginBottom="$3">
                  {rechazando
                    ? `Se le pagarán las ${fmtHoras(rechazando.Requested_Overtime_Hours)} solicitadas. Indica por qué.`
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
              placeholder="Ej: El marcaje no corresponde a trabajo autorizado..."
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

/**
 * Uno de los dos grupos de horas que se están comparando.
 *
 * Van con el mismo formato y el mismo alto para que se puedan leer en paralelo:
 * la decisión es elegir entre ellos, y cualquier asimetría visual empuja a
 * mirar uno más que el otro.
 */
function GrupoHoras({
  titulo,
  color,
  inicio,
  fin,
  total,
  conceptos,
  sinDato,
}: {
  titulo: string
  color: string
  inicio: string | null
  fin: string | null
  total: number | null
  conceptos: ReturnType<typeof parseConceptos>
  sinDato?: boolean
}) {
  return (
    <YStack
      flex={1}
      gap="$2"
      padding="$2.5"
      borderRadius={10}
      borderWidth={1}
      borderColor="$border"
      style={{ backgroundColor: `${color}14` }}
    >
      <Text fontSize={10} fontWeight="800" letterSpacing={0.4} style={{ color }}>
        {titulo.toUpperCase()}
      </Text>

      <Text fontSize={13} fontWeight="600" color="$text">
        {sinDato ? 'Sin marcaje' : `${fmtHora(inicio)} — ${fmtHora(fin)}`}
      </Text>

      <Text fontSize={18} fontWeight="800" color="$text">
        {sinDato ? '—' : fmtHoras(total)}
      </Text>

      <DistribucionHoras conceptos={conceptos} compacta />
    </YStack>
  )
}

function RevisionCard({
  item,
  onAprobar,
  onRechazar,
}: {
  item: IOvertimeReviewToAuth
  onAprobar: () => void
  onRechazar: () => void
}) {
  const theme = useTheme()

  const solicitados = useMemo(
    () => parseConceptos(item.Requested_Concepts_Json),
    [item.Requested_Concepts_Json],
  )
  const trabajados = useMemo(
    () => parseConceptos(item.Worked_Concepts_Json),
    [item.Worked_Concepts_Json],
  )

  const sinMarcaje = item.Worked_Overtime_Hours === null || item.Worked_Overtime_Hours === undefined
  const colorDiff = colorDiferencia(item.Hours_Difference, theme)
  const IconoDiff = (item.Hours_Difference ?? 0) < 0 ? TrendingDown : TrendingUp

  return (
    <Card
      backgroundColor="$backgroundElevated"
      borderRadius={14}
      padding="$3"
      borderWidth={1}
      borderColor="$border"
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

        {/* Los dos referentes de la decisión, enfrentados */}
        <XStack gap="$2" alignItems="stretch">
          <GrupoHoras
            titulo="Solicitado"
            color="#3B82F6"
            inicio={item.Start_Time}
            fin={item.End_Time}
            total={item.Requested_Overtime_Hours}
            conceptos={solicitados}
          />
          <GrupoHoras
            titulo="Marcaje"
            color="#F59E0B"
            inicio={item.Clock_In}
            fin={item.Clock_Out}
            total={item.Worked_Overtime_Hours}
            conceptos={trabajados}
            sinDato={sinMarcaje}
          />
        </XStack>

        {/* La diferencia: el número sobre el que se decide */}
        <XStack
          justifyContent="space-between"
          alignItems="center"
          paddingHorizontal="$3"
          paddingVertical="$2"
          borderRadius={10}
          backgroundColor="$backgroundSurface"
        >
          <XStack alignItems="center" gap="$2">
            <IconoDiff size={15} color={colorDiff} />
            <Text fontSize={12} fontWeight="700" color="$textSecondary">
              Diferencia
            </Text>
          </XStack>
          <Text fontSize={18} fontWeight="800" style={{ color: colorDiff }}>
            {etiquetaDiferencia(item.Hours_Difference)}
          </Text>
        </XStack>

        {/* Por qué llegó acá: sin esto la decisión se toma a ciegas */}
        <YStack gap="$1" borderTopWidth={1} borderTopColor="$border" paddingTop="$2">
          <XStack alignItems="center" gap="$2">
            <MessageSquareWarning size={13} color={theme.textMuted?.val as string} />
            <Text fontSize={11} color="$textMuted" flex={1} numberOfLines={1}>
              {nombreConCodigo(item.Sent_To_Review_By)} · {fmtFechaHora(item.Sent_To_Review_Date)}
            </Text>
          </XStack>

          <Text fontSize={12} color="$textSecondary">
            {item.Comment || 'Sin justificación registrada.'}
          </Text>

          <XStack justifyContent="space-between" alignItems="center" gap="$2" marginTop="$1">
            <Text fontSize={11} color="$textMuted" numberOfLines={1} flex={1}>
              {item.Category_Name || 'Sin motivo'}
            </Text>
            <Text fontSize={11} fontWeight="600" color="$textMuted">
              {item.Correlative}
            </Text>
          </XStack>
        </YStack>

        {/* La decisión, al pie: después de todo lo que hay que leer para tomarla */}
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
