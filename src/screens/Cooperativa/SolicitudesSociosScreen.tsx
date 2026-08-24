import React, { useCallback, useMemo, useState } from 'react'
import { RefreshControl } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { YStack, XStack, Text, Button, ScrollView, View, Spinner, AlertDialog, useTheme } from 'tamagui'
import {
  ClipboardList, Check, X, Clock, CheckCircle2, XCircle, CheckSquare, Square,
  IdCard, CalendarDays, Phone, Mail, MapPin, Building2, TriangleAlert, MessageSquare,
} from 'lucide-react-native'
import AppInput from '../../components/commons/AppInput'
import { cooperativaService } from '../../api/modules/cooperativa/cooperativa.service'
import { ISolicitudSocio, ESTADO_SOLICITUD } from '../../api/modules/cooperativa/cooperativa.types'
import { ExecutionResponse } from '../../api/modules/response.type'
import { usePageHeader } from '../../hooks/usePageHeader'
import { handleError } from '../../utils/errorHandler'
import { useShowToast } from '../../utils/useShowToast'
import { useKeyboardInset } from '../../hooks/useKeyboardInset'
import SkeletonForm from '../../components/Skeletons/SkeletonForm'
import { shadows } from '../../theme/shadows'

/**
 * Solicitudes de socios (ruta 'RequestSocio', menú 1045).
 *
 * Bandeja para aprobar o rechazar afiliaciones, de una o en lote. El endpoint
 * exige el acceso 'RequestSocio' — el mismo KeyVar que el Route de este menú.
 *
 * El lote va en UNA llamada con la lista de Ids: el procedimiento aplica todo o
 * nada. Igual que Horas Extra; mandarlas de a una dejaría el grupo a medio
 * resolver si algo falla en el camino.
 */

const TIPO_PLANILLA: Record<string, string> = {
  S: 'Semanal',
  Q: 'Quincenal',
  M: 'Mensual',
  X: 'Sin clasificar',
}

const FILTROS = [
  { label: 'Pendientes', code: ESTADO_SOLICITUD.PENDIENTE },
  { label: 'Aprobadas', code: ESTADO_SOLICITUD.APROBADO },
  { label: 'Rechazadas', code: ESTADO_SOLICITUD.RECHAZADO },
] as const

const formatFecha = (valor: string | null): string => {
  if (!valor) return '-'
  const fecha = new Date(valor)
  if (isNaN(fecha.getTime())) return '-'
  return fecha.toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const formatFechaHora = (valor: string | null): string => {
  if (!valor) return '-'
  const fecha = new Date(valor)
  if (isNaN(fecha.getTime())) return '-'
  return `${fecha.toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${fecha.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' })}`
}

const nombreCompleto = (s: ISolicitudSocio): string =>
  [s.PrimerNombre, s.SegundoNombre, s.PrimerApellido, s.SegundoApellido]
    .map(p => p?.trim())
    .filter(Boolean)
    .join(' ')

function Dato({
  icono: Icono,
  etiqueta,
  valor,
}: {
  icono: React.ComponentType<any>
  etiqueta: string
  valor: string | null
}) {
  return (
    <XStack gap="$2.5" alignItems="flex-start">
      <View marginTop={2}>
        <Icono size={14} color="#94A3B8" />
      </View>
      <Text fontSize={13} color="$textMuted" width={110}>
        {etiqueta}
      </Text>
      <Text fontSize={13} color="$text" flex={1}>
        {valor && valor.trim() ? valor : '-'}
      </Text>
    </XStack>
  )
}

/** Acción esperando confirmación: las solicitudes y si es aprobación. */
type Pendiente = { solicitudes: ISolicitudSocio[]; aprobar: boolean }

export default function SolicitudesSociosScreen() {
  const theme = useTheme()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filtro, setFiltro] = useState<string>(ESTADO_SOLICITUD.PENDIENTE)
  const [solicitudes, setSolicitudes] = useState<ISolicitudSocio[]>([])
  const [error, setError] = useState<string | null>(null)
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set())
  const [confirmar, setConfirmar] = useState<Pendiente | null>(null)
  const [motivo, setMotivo] = useState('')
  const [motivoError, setMotivoError] = useState('')
  const [resolviendo, setResolviendo] = useState(false)
  const { showToast } = useShowToast()
  // El diálogo del motivo vive en un Portal, así que se sube lo que tape el teclado.
  const { inset: keyboardInset, onLayout: onDialogLayout } = useKeyboardInset()

  usePageHeader({
    center: (
      <Text fontSize={16} fontWeight="700" color="$text">
        Solicitudes de socios
      </Text>
    ),
  })

  const consultar = useCallback(async (statusCode: string) => {
    try {
      const response: ExecutionResponse<ISolicitudSocio[]> =
        await cooperativaService.getSolicitudes(statusCode)

      if (response?.Success) {
        const filas = response.Data ?? []
        setSolicitudes(filas)
        setError(null)
        // Lo que ya no está en la lista no puede seguir marcado.
        setSeleccionados(prev => {
          const vigentes = new Set(filas.map(f => f.Id))
          return new Set([...prev].filter(id => vigentes.has(id)))
        })
      } else {
        setSolicitudes([])
        setSeleccionados(new Set())
        setError(response?.ErrorMessage || 'No se pudieron cargar las solicitudes.')
      }
    } catch (err) {
      const e = handleError(err)
      setSolicitudes([])
      setSeleccionados(new Set())
      setError(e.message)
    }
  }, [])

  // useFocusEffect y no useEffect: el navegador mantiene las pantallas
  // montadas, asi que al volver a entrar se veria la bandeja vieja — justo lo
  // que no debe pasar en una lista de pendientes.
  useFocusEffect(
    useCallback(() => {
      ;(async () => {
        setLoading(true)
        await consultar(filtro)
        setLoading(false)
      })()
    }, [consultar, filtro]),
  )

  const onRefresh = async () => {
    setRefreshing(true)
    await consultar(filtro)
    setRefreshing(false)
  }

  const esPendiente = filtro === ESTADO_SOLICITUD.PENDIENTE

  // Solo las pendientes se pueden marcar: las resueltas no tienen acción.
  const marcables = useMemo(
    () => solicitudes.filter(s => s.Status_Code === ESTADO_SOLICITUD.PENDIENTE),
    [solicitudes],
  )

  const seleccion = useMemo(
    () => marcables.filter(s => seleccionados.has(s.Id)),
    [marcables, seleccionados],
  )

  const alternar = useCallback((id: number) => {
    setSeleccionados(prev => {
      const copia = new Set(prev)
      if (copia.has(id)) copia.delete(id)
      else copia.add(id)
      return copia
    })
  }, [])

  const alternarTodas = useCallback(() => {
    setSeleccionados(prev => {
      const todas = marcables.length > 0 && marcables.every(s => prev.has(s.Id))
      return todas ? new Set() : new Set(marcables.map(s => s.Id))
    })
  }, [marcables])

  const abrir = (solicitudesAccion: ISolicitudSocio[], aprobar: boolean) => {
    setMotivo('')
    setMotivoError('')
    setConfirmar({ solicitudes: solicitudesAccion, aprobar })
  }

  const resolver = async () => {
    if (!confirmar) return

    const { solicitudes: lote, aprobar } = confirmar

    if (!aprobar && !motivo.trim()) {
      setMotivoError('Escribí el motivo del rechazo')
      return
    }

    setResolviendo(true)
    try {
      const estado = aprobar ? ESTADO_SOLICITUD.APROBADO : ESTADO_SOLICITUD.RECHAZADO
      const response = await cooperativaService.resolverSolicitudes(
        lote.map(s => s.Id),
        estado,
        aprobar ? undefined : motivo.trim(),
      )

      if (!response?.Success) {
        showToast('error', 'Error', response?.ErrorMessage || 'No se pudo resolver', 5000, 'top')
      } else {
        showToast('success', aprobar ? 'Aprobado' : 'Rechazado', response.SuccessMessage || '', 3500, 'top')
      }

      setConfirmar(null)
      setMotivo('')
      setMotivoError('')
      // Se relee siempre: si falló porque alguien más resolvió parte del lote,
      // la lista tiene que reflejar el estado real.
      await consultar(filtro)
    } catch (err) {
      const e = handleError(err)
      showToast('error', 'Error', e.message, 5000, 'top')
    } finally {
      setResolviendo(false)
    }
  }

  const todasMarcadas = marcables.length > 0 && marcables.every(s => seleccionados.has(s.Id))

  return (
    <>
      <YStack flex={1} backgroundColor="$backgroundPage">
        <YStack paddingHorizontal="$4" paddingTop="$4" gap="$2">
          {/* Filtros por estado */}
          <XStack gap="$2">
            {FILTROS.map(f => {
              const activo = filtro === f.code
              return (
                <Button
                  key={f.code}
                  flex={1}
                  height={36}
                  borderRadius="$10"
                  fontSize={13}
                  fontWeight="600"
                  backgroundColor={activo ? '$primary' : '$buttonSecondary'}
                  color={activo ? '#FFFFFF' : '$textSecondary'}
                  pressStyle={{ opacity: 0.85 }}
                  onPress={() => setFiltro(f.code)}
                >
                  {f.label}
                </Button>
              )
            })}
          </XStack>

          {/* Barra de lote: aparece solo con tarjetas marcadas. */}
          {seleccion.length > 0 && (
            <XStack
              alignItems="center"
              gap="$2"
              paddingHorizontal="$3"
              paddingVertical="$2"
              borderRadius={12}
              backgroundColor="$primaryOpacity"
              borderWidth={1}
              borderColor="$primary"
            >
              <Text fontSize={13} fontWeight="700" color="$text" flex={1}>
                {seleccion.length} seleccionada(s)
              </Text>

              <Button
                height={36}
                borderRadius={10}
                paddingHorizontal="$3"
                backgroundColor="$backgroundSurface"
                borderWidth={1}
                borderColor="$border"
                pressStyle={{ opacity: 0.7 }}
                onPress={() => abrir(seleccion, false)}
              >
                <X size={16} color={(theme.error?.val as string) ?? '#EF4444'} />
              </Button>

              <Button
                height={36}
                borderRadius={10}
                paddingHorizontal="$3"
                backgroundColor="$success"
                pressStyle={{ opacity: 0.85 }}
                onPress={() => abrir(seleccion, true)}
              >
                <XStack alignItems="center" gap="$1.5">
                  <Check size={16} color="white" />
                  <Text fontSize={13} fontWeight="700" color="white">
                    Aprobar
                  </Text>
                </XStack>
              </Button>
            </XStack>
          )}

          {/* Marcar o desmarcar lo que se está viendo */}
          {marcables.length > 0 && (
            <XStack
              alignItems="center"
              gap="$2"
              paddingVertical="$1"
              pressStyle={{ opacity: 0.6 }}
              onPress={alternarTodas}
            >
              <CheckSquare size={15} color="#94A3B8" />
              <Text fontSize={12} color="$textMuted">
                {todasMarcadas ? 'Quitar selección' : 'Seleccionar todas'}
              </Text>
            </XStack>
          )}
        </YStack>

        {loading ? (
          <YStack flex={1} padding="$4">
            <SkeletonForm />
          </YStack>
        ) : (
          <ScrollView
            flex={1}
            contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 32, gap: 12 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          >
            {error ? (
              <YStack
                gap="$3"
                padding="$4"
                borderRadius="$4"
                backgroundColor="$backgroundSurface"
                borderWidth={1}
                borderColor="$border"
                alignItems="center"
              >
                <TriangleAlert size={26} color="#94A3B8" />
                <Text fontSize={14} color="$text" textAlign="center" lineHeight={20}>
                  {error}
                </Text>
              </YStack>
            ) : solicitudes.length === 0 ? (
              <YStack gap="$2" padding="$6" alignItems="center">
                <ClipboardList size={30} color="#94A3B8" />
                <Text fontSize={15} color="$textMuted" textAlign="center">
                  {esPendiente
                    ? 'No hay solicitudes pendientes.'
                    : 'No hay solicitudes en este estado.'}
                </Text>
              </YStack>
            ) : (
              solicitudes.map(s => {
                const aprobada = s.Status_Code === ESTADO_SOLICITUD.APROBADO
                const rechazada = s.Status_Code === ESTADO_SOLICITUD.RECHAZADO
                const pendiente = s.Status_Code === ESTADO_SOLICITUD.PENDIENTE
                const marcada = seleccionados.has(s.Id)

                return (
                  <YStack
                    key={s.Id}
                    gap="$3"
                    padding="$4"
                    borderRadius="$4"
                    backgroundColor="$backgroundElevated"
                    borderWidth={1}
                    borderColor={marcada ? '$primary' : '$border'}
                    {...shadows.sm}
                  >
                    {/* Encabezado. Con casilla solo si sigue pendiente. */}
                    <XStack gap="$2" alignItems="center">
                      {pendiente && (
                        <XStack pressStyle={{ opacity: 0.6 }} onPress={() => alternar(s.Id)}>
                          {marcada
                            ? <CheckSquare size={20} color={(theme.primary?.val as string) ?? '#FF551A'} />
                            : <Square size={20} color="#94A3B8" />}
                        </XStack>
                      )}

                      {!pendiente && (aprobada
                        ? <CheckCircle2 size={18} color="#22C55E" />
                        : <XCircle size={18} color="#EF4444" />)}

                      <YStack flex={1}>
                        <Text fontSize={15} fontWeight="700" color="$text">
                          {nombreCompleto(s) || s.User_Code || 'Empleado'}
                        </Text>
                        <Text fontSize={12} color="$textMuted">
                          {s.Status_Name || s.Status_Code} · solicitada el {formatFecha(s.Creation_Date)}
                        </Text>
                      </YStack>

                      {pendiente && <Clock size={16} color="#f59e0b" />}
                    </XStack>

                    {/* Datos */}
                    <YStack gap="$2">
                      <Dato icono={IdCard} etiqueta="Identidad" valor={s.NIT} />
                      <Dato icono={IdCard} etiqueta="Código" valor={s.Codigo} />
                      <Dato icono={CalendarDays} etiqueta="Nacimiento" valor={formatFecha(s.FechaNacimiento)} />
                      <Dato icono={CalendarDays} etiqueta="Ingreso" valor={formatFecha(s.FechaIngreso)} />
                      <Dato
                        icono={Building2}
                        etiqueta="Planilla"
                        valor={TIPO_PLANILLA[s.TipoPlanilla ?? ''] ?? s.TipoPlanilla}
                      />
                      <Dato icono={Phone} etiqueta="Teléfono" valor={s.Telefono1} />
                      <Dato icono={Mail} etiqueta="Correo" valor={s.Correo} />
                      <Dato icono={MapPin} etiqueta="Dirección" valor={s.Direccion} />
                    </YStack>

                    {/* Huella de la resolución */}
                    {!!s.Resolution_Date && (
                      <YStack gap="$2" paddingTop="$2" borderTopWidth={1} borderTopColor="$border">
                        <XStack gap="$2" alignItems="center">
                          <CalendarDays size={13} color="#94A3B8" />
                          <Text fontSize={12} color="$textMuted" flex={1}>
                            {aprobada ? 'Aprobada' : 'Rechazada'} por {s.Resolved_By || '-'} el{' '}
                            {formatFechaHora(s.Resolution_Date)}
                          </Text>
                        </XStack>

                        {!!s.Rejection_Reason && (
                          <XStack gap="$2" alignItems="flex-start">
                            <View marginTop={2}>
                              <MessageSquare size={13} color="#94A3B8" />
                            </View>
                            <Text fontSize={12} color="$text" flex={1} lineHeight={17}>
                              {s.Rejection_Reason}
                            </Text>
                          </XStack>
                        )}
                      </YStack>
                    )}

                    {/* Acciones individuales */}
                    {pendiente && (
                      <XStack gap="$2" paddingTop="$1">
                        <Button
                          flex={1}
                          height={42}
                          borderRadius="$4"
                          fontSize={14}
                          fontWeight="600"
                          backgroundColor="$success"
                          color="#FFFFFF"
                          icon={<Check size={18} color="#FFFFFF" />}
                          pressStyle={{ opacity: 0.85 }}
                          onPress={() => abrir([s], true)}
                        >
                          Aprobar
                        </Button>
                        <Button
                          flex={1}
                          height={42}
                          borderRadius="$4"
                          fontSize={14}
                          fontWeight="600"
                          backgroundColor="$buttonSecondary"
                          color="$error"
                          icon={<X size={18} color="#EF4444" />}
                          pressStyle={{ opacity: 0.85 }}
                          onPress={() => abrir([s], false)}
                        >
                          Rechazar
                        </Button>
                      </XStack>
                    )}
                  </YStack>
                )
              })
            )}
          </ScrollView>
        )}
      </YStack>

      {/* Confirmación. Al rechazar, además pide el motivo. */}
      <AlertDialog
        open={confirmar !== null}
        onOpenChange={value => { if (!resolviendo && !value) setConfirmar(null) }}
      >
        <AlertDialog.Portal paddingBottom={keyboardInset} onLayout={onDialogLayout}>
          <AlertDialog.Overlay
            key="overlay"
            enterStyle={{ opacity: 0 }}
            exitStyle={{ opacity: 0 }}
            opacity={0.6}
            backgroundColor="black"
          />
          <AlertDialog.Content
            elevate
            key="content"
            width="88%"
            alignSelf="center"
            enterStyle={{ y: -12, opacity: 0, scale: 0.94 }}
            exitStyle={{ y: 8, opacity: 0, scale: 0.96 }}
            backgroundColor="$backgroundElevated"
            borderRadius="$6"
            paddingHorizontal="$5"
            paddingVertical="$5"
            marginHorizontal="$5"
            x={0} y={0} scale={1} opacity={1}
            {...shadows.lg}
          >
            <YStack gap="$4">
              <YStack gap="$2" alignItems="center">
                <YStack
                  width={56}
                  height={56}
                  borderRadius={28}
                  backgroundColor={confirmar?.aprobar ? 'rgba(34, 197, 94, 0.10)' : 'rgba(239, 68, 68, 0.10)'}
                  justifyContent="center"
                  alignItems="center"
                >
                  {confirmar?.aprobar
                    ? <Check size={26} color="#22C55E" />
                    : <TriangleAlert size={26} color="#EF4444" />}
                </YStack>

                <Text fontSize={17} fontWeight="700" color="$text" textAlign="center">
                  {confirmar?.aprobar ? '¿Aprobar la solicitud?' : '¿Rechazar la solicitud?'}
                </Text>

                <Text fontSize={14} color="$textMuted" textAlign="center" lineHeight={20}>
                  {confirmar && confirmar.solicitudes.length === 1
                    ? (nombreCompleto(confirmar.solicitudes[0]) || confirmar.solicitudes[0].User_Code)
                    : `${confirmar?.solicitudes.length ?? 0} solicitudes`}
                  {confirmar?.aprobar
                    ? confirmar.solicitudes.length === 1
                      ? ' quedará registrado como socio.'
                      : ' quedarán registradas como socios.'
                    : ''}
                </Text>
              </YStack>

              {/* Motivo, obligatorio al rechazar */}
              {confirmar && !confirmar.aprobar && (
                <YStack gap="$2">
                  <AppInput
                    label="Motivo del rechazo"
                    multiline
                    minLines={4}
                    placeholder="Ej: Los datos de identidad no coinciden con tu documento."
                    value={motivo}
                    onChangeText={(v: string) => { setMotivo(v); setMotivoError('') }}
                    error={motivoError}
                    style={{ height: 120 }}
                    autoFocus
                  />

                  {/* Se avisa explícitamente para que el texto se escriba
                      pensando en el solicitante y no como nota interna. */}
                  <XStack gap="$2" alignItems="flex-start">
                    <View marginTop={2}>
                      <MessageSquare size={13} color="#94A3B8" />
                    </View>
                    <Text fontSize={12} color="$textMuted" flex={1} lineHeight={17}>
                      Este mensaje se le mostrará al solicitante
                      {confirmar.solicitudes.length > 1 ? ' de las solicitudes seleccionadas' : ''}, y le
                      llegará en la notificación. Podrá corregir y volver a enviar su solicitud.
                    </Text>
                  </XStack>
                </YStack>
              )}

              <XStack gap="$2">
                <Button
                  flex={1}
                  height={44}
                  borderRadius="$4"
                  backgroundColor="$buttonSecondary"
                  color="$textSecondary"
                  fontWeight="600"
                  disabled={resolviendo}
                  onPress={() => setConfirmar(null)}
                >
                  Cancelar
                </Button>
                <Button
                  flex={1}
                  height={44}
                  borderRadius="$4"
                  backgroundColor={confirmar?.aprobar ? '$success' : '$error'}
                  color="#FFFFFF"
                  fontWeight="600"
                  disabled={resolviendo}
                  icon={resolviendo ? <Spinner color="#FFFFFF" /> : undefined}
                  onPress={resolver}
                >
                  {resolviendo ? 'Guardando...' : confirmar?.aprobar ? 'Aprobar' : 'Rechazar'}
                </Button>
              </XStack>
            </YStack>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog>
    </>
  )
}
