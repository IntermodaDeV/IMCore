import React, { useCallback, useEffect, useState } from 'react'
import { Alert, RefreshControl, useWindowDimensions } from 'react-native'
import { ScrollView, Text, XStack, YStack, View, Spinner, useTheme } from 'tamagui'
import { ArrowLeft, Wrench, MapPin, User, Clock, AlertTriangle, Ban } from 'lucide-react-native'
import { useNavigation, useRoute } from '@react-navigation/native'

import { usePageHeader } from '../../../hooks/usePageHeader'
import { useAuth } from '../../../context/AuthContext'
import { useShowToast } from '../../../utils/useShowToast'
import { ticketsService } from '../../../api/modules/mantenimiento/tickets.service'
import { ITicket } from '../../../api/modules/mantenimiento/tickets.types'
import { colorEstado, colorPrioridad, ACCENT } from '../mantenimiento.helpers'

const fmtFecha = (iso: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' })
}

const fmtMin = (m: number | null): string => {
  if (m == null) return '—'
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60), mm = m % 60
  return mm ? `${h} h ${mm} min` : `${h} h`
}

export default function TicketDetailScreen() {
  const theme = useTheme()
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const { user } = useAuth()
  const { showToast } = useShowToast()
  const id: number = route.params?.id
  const { width } = useWindowDimensions()
  const MAX = 760
  const [cancelando, setCancelando] = useState(false)

  usePageHeader({
    left: <ArrowLeft color={theme.text?.val} onPress={() => navigation.goBack()} />,
    center: <Text fontSize="$4" fontWeight="700" color="$text">Detalle del ticket</Text>,
  })

  const [t, setT] = useState<ITicket | null>(null)
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const res = await ticketsService.getTicketById(id)
      if (!res.Success || !res.Data) { setError(res.ErrorMessage || 'No se encontró el ticket'); setT(null); return }
      setT(res.Data)
    } catch (e: any) {
      setError(e?.message || 'Error de conexión'); setT(null)
    }
  }, [id])

  useEffect(() => { (async () => { setCargando(true); await cargar(); setCargando(false) })() }, [cargar])

  const onRefresh = useCallback(async () => { setRefrescando(true); await cargar(); setRefrescando(false) }, [cargar])

  if (cargando) {
    return (
      <YStack flex={1} backgroundColor="$background" alignItems="center" justifyContent="center" gap="$3">
        <Spinner size="large" color={ACCENT} /><Text color="$textMuted">Cargando ticket…</Text>
      </YStack>
    )
  }
  if (error || !t) {
    return (
      <YStack flex={1} backgroundColor="$background" alignItems="center" justifyContent="center" gap="$2" padding="$6">
        <AlertTriangle size={30} color={theme.textMuted?.val} />
        <Text fontSize="$4" fontWeight="700" color="$text">No se pudo cargar</Text>
        <Text color="$textMuted" textAlign="center">{error}</Text>
      </YStack>
    )
  }

  const esArea = t.TipoDestino === 'AREA'
  const estadoC = colorEstado(t.Estado ?? '')
  const prioC = colorPrioridad(t.Prioridad ?? '')
  const orden = t.EstadoOrden ?? 1
  const cancelado = t.EstadoCode === 'CANCELADO'

  // Cancelar: solo Pendiente, por el creador o un Administrador
  const esCreador = !!user?.Code && t.Create_By === user.Code
  const esAdmin = (user?.Roles ?? []).some(r => r.RoleName === 'Administrador')
  const puedeCancelar = t.EstadoCode === 'PENDIENTE' && (esCreador || esAdmin)

  const doCancelar = async () => {
    setCancelando(true)
    try {
      const res = await ticketsService.cancelar(id)
      if (res.Success && res.Data?.Success) {
        showToast('success', 'Ticket cancelado', t.CodigoTicket)
        await cargar()
      } else {
        showToast('error', 'No se pudo cancelar', res.Data?.ErrorMessage || res.ErrorMessage || 'Intenta de nuevo')
      }
    } catch (e: any) {
      showToast('error', 'Error', e?.message || 'No se pudo cancelar')
    } finally {
      setCancelando(false)
    }
  }
  const confirmarCancelar = () => {
    Alert.alert(
      'Cancelar ticket',
      `¿Seguro que deseas cancelar el ticket ${t.CodigoTicket}? Esta acción no se puede deshacer.`,
      [{ text: 'No', style: 'cancel' }, { text: 'Sí, cancelar', style: 'destructive', onPress: doCancelar }],
    )
  }

  return (
    <View flex={1} backgroundColor="$background">
      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} tintColor={ACCENT} />}
      >
        <YStack width="100%" maxWidth={MAX} alignSelf="center" gap="$3">

          {/* Encabezado */}
          <YStack backgroundColor="$backgroundHover" borderRadius="$5" borderLeftWidth={4} borderLeftColor={estadoC} padding="$4" gap="$2">
            <XStack alignItems="center" justifyContent="space-between">
              <Text fontSize="$6" fontWeight="900" color="$text">{t.CodigoTicket}</Text>
              <View backgroundColor={estadoC} borderRadius="$10" paddingHorizontal="$3" paddingVertical="$1.5">
                <Text fontSize="$2" fontWeight="800" color="#fff">{t.Estado}</Text>
              </View>
            </XStack>
            <XStack alignItems="center" gap="$3" flexWrap="wrap">
              <Chip icon={esArea ? <MapPin size={13} color={theme.textMuted?.val} /> : <Wrench size={13} color={theme.textMuted?.val} />}
                text={esArea ? 'Área / General' : 'Máquina'} />
              {!!t.Prioridad && (
                <XStack alignItems="center" gap="$1.5">
                  <View width={9} height={9} borderRadius={5} backgroundColor={prioC} />
                  <Text fontSize="$2" color="$textMuted">Prioridad {t.Prioridad}</Text>
                </XStack>
              )}
            </XStack>
            <Text fontSize="$2" color="$textMuted">Reportado: {fmtFecha(t.Fecha)}</Text>
          </YStack>

          {/* Seguimiento (timeline) */}
          <Section title="Seguimiento">
            <Step label="Reportado" date={fmtFecha(t.Fecha)} color={ACCENT} done />
            {cancelado ? (
              <Step label="Cancelado" date={fmtFecha(t.Modification_Date)} color={colorEstado('Cancelado')} done last />
            ) : (
              <>
                <Step label="En Proceso" date={fmtFecha(t.HoraInicio)} color={colorEstado('En Proceso')} done={orden >= 2} />
                <Step label="Completado" date={fmtFecha(t.HoraFinal)} color={colorEstado('Completado')} done={orden >= 3} last />
                <XStack gap="$4" marginTop="$2" paddingTop="$2" borderTopWidth={1} borderTopColor="$border">
                  <TimeStat label="T. respuesta" value={fmtMin(t.TiempoRespuestaMin)} />
                  <TimeStat label="T. resolución" value={fmtMin(t.TiempoResolucionMin)} />
                </XStack>
              </>
            )}
          </Section>

          {/* Detalle */}
          <Section title="Detalle">
            <InfoRow label="Área" value={t.Area} />
            {esArea ? (
              <InfoRow label="¿Qué reparar?" value={t.Objeto} />
            ) : (
              <>
                <InfoRow label="Operación" value={t.Operacion} />
                <InfoRow label="Modelo" value={t.Modelo} />
                <InfoRow label="N° de máquina" value={t.NumeroMaquina} />
                <InfoRow label="Tipo de paro" value={t.TipoParo} />
                <InfoRow label="ID operador" value={t.IdOperador != null ? String(t.IdOperador) : null} />
              </>
            )}
            {!!t.TipoFalla && <InfoRow label="Tipo de falla" value={t.TipoFalla} />}
            {!!t.Causa && <InfoRow label="Causa" value={t.Causa} />}
          </Section>

          {/* Asignación */}
          <Section title="Asignación">
            <XStack alignItems="center" gap="$2">
              <User size={16} color={theme.textMuted?.val} />
              <Text fontSize="$3" color="$text">
                {t.Mecanico && t.Mecanico.trim() ? t.Mecanico : <Text color="$textMuted">Sin asignar</Text>}
              </Text>
            </XStack>
          </Section>

          {/* Observaciones */}
          {!!t.Observaciones && (
            <Section title="Observaciones">
              <Text fontSize="$3" color="$text" lineHeight={20}>{t.Observaciones}</Text>
            </Section>
          )}

          {/* Cancelar ticket (solo Pendiente; creador o admin) */}
          {puedeCancelar && (
            <View onPress={cancelando ? undefined : confirmarCancelar} pressStyle={{ opacity: 0.85 }}
              opacity={cancelando ? 0.6 : 1} marginTop="$2" borderWidth={1.5}
              borderColor={colorEstado('Cancelado')} borderRadius="$4" height={50}
              alignItems="center" justifyContent="center" flexDirection="row" gap="$2">
              {cancelando ? <Spinner color={colorEstado('Cancelado')} /> : <Ban size={20} color={colorEstado('Cancelado')} />}
              <Text color={colorEstado('Cancelado')} fontWeight="800" fontSize="$4">
                {cancelando ? 'Cancelando…' : 'Cancelar ticket'}
              </Text>
            </View>
          )}

          <Text fontSize="$1" color="$textMuted" textAlign="center" marginTop="$2">
            Reportado por {t.Create_By ?? '—'}
          </Text>
        </YStack>
      </ScrollView>
    </View>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <YStack backgroundColor="$backgroundHover" borderRadius="$5" padding="$4" gap="$3">
      <Text fontSize="$2" fontWeight="800" color="$textMuted" textTransform="uppercase" letterSpacing={0.5}>{title}</Text>
      {children}
    </YStack>
  )
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <XStack justifyContent="space-between" alignItems="flex-start" gap="$3">
      <Text fontSize="$3" color="$textMuted">{label}</Text>
      <Text fontSize="$3" color="$text" fontWeight="600" flex={1} textAlign="right">{value && value.trim() ? value : '—'}</Text>
    </XStack>
  )
}

function Step({ label, date, color, done, last }: { label: string; date: string; color: string; done?: boolean; last?: boolean }) {
  return (
    <XStack gap="$3">
      <YStack alignItems="center">
        <View width={16} height={16} borderRadius={8} backgroundColor={done ? color : 'transparent'} borderWidth={2} borderColor={color} />
        {!last && <View width={2} flex={1} minHeight={18} backgroundColor={done ? color : '$border'} />}
      </YStack>
      <YStack paddingBottom={last ? 0 : 8} flex={1}>
        <Text fontSize="$3" fontWeight="700" color={done ? '$text' : '$textMuted'}>{label}</Text>
        <Text fontSize="$2" color="$textMuted">{done ? date : 'Pendiente'}</Text>
      </YStack>
    </XStack>
  )
}

function TimeStat({ label, value }: { label: string; value: string }) {
  return (
    <XStack alignItems="center" gap="$1.5">
      <Clock size={14} color="#94A3B8" />
      <Text fontSize="$2" color="$textMuted">{label}: <Text color="$text" fontWeight="700">{value}</Text></Text>
    </XStack>
  )
}

function Chip({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <XStack alignItems="center" gap="$1.5" backgroundColor="$background" borderRadius="$10" paddingHorizontal="$2.5" paddingVertical="$1" borderWidth={1} borderColor="$border">
      {icon}
      <Text fontSize="$1" color="$textMuted" fontWeight="600">{text}</Text>
    </XStack>
  )
}
