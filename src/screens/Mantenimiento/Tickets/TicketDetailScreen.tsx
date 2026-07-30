import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Modal, RefreshControl, useWindowDimensions } from 'react-native'
import { ScrollView, Text, XStack, YStack, View, Spinner, TextArea, useTheme } from 'tamagui'
import { ArrowLeft, Wrench, MapPin, User, Clock, AlertTriangle, Ban, Play, Pause, RotateCcw, CheckCircle2, ShieldCheck, XCircle, Eye, X, Pencil } from 'lucide-react-native'
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native'
import QRCode from 'react-native-qrcode-svg'

import { usePageHeader } from '../../../hooks/usePageHeader'
import { NotificationBell } from '../../../components/notifications/NotificationBell'
import { useAuth } from '../../../context/AuthContext'
import { useShowToast } from '../../../utils/useShowToast'
import AppSelect from '../../../components/commons/AppSelect'
import { ticketsService } from '../../../api/modules/mantenimiento/tickets.service'
import { catalogosService } from '../../../api/modules/mantenimiento/catalogos.service'
import { ITicket, IMecanico, ITicketEvento, IMotivoPausa } from '../../../api/modules/mantenimiento/tickets.types'
import { colorEstado, colorPrioridad, ACCENT, COLOR_ASIGNADO, estadoVisual, puedeOperarTicket, puedeDiagnosticar, puedeValidar, puedeConfigRecordatorio, puedeDespachar, puedeAutoasignar, puedeEditarTicket, puedeCancelarTicket } from '../mantenimiento.helpers'

const COLOR_VALIDADO = '#059669'   // sello de producción (esmeralda)

// Etiqueta legible de cada evento de la bitácora.
const EVENTO_LABEL: Record<string, string> = {
  INICIAR: 'Iniciado', PAUSAR: 'Pausado', REANUDAR: 'Reanudado', COMPLETAR: 'Completado',
  DIAGNOSTICO: 'Diagnóstico', VALIDAR: 'Validado', RECHAZAR: 'Rechazado',
}

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
  const [showQR, setShowQR] = useState(false)   // modal con el QR del ticket

  // Despachar = asignar a CUALQUIERA (Sup. Mtto/Admin o acceso 'AsignarTickets').
  // Autoasignar = tomarse el ticket para sí (rol Mecánico/Técnico).
  const puedeDespacharTicket = puedeDespachar(user?.Roles, user?.Access)
  const puedeAutoAsignar = puedeAutoasignar(user?.Roles)

  const [mecanicos, setMecanicos] = useState<IMecanico[]>([])
  const [selMec, setSelMec] = useState<string | undefined>()
  const [asignando, setAsignando] = useState(false)

  // Acciones del mecánico + bitácora
  const [eventos, setEventos] = useState<ITicketEvento[]>([])
  const [accionando, setAccionando] = useState(false)

  // Diagnóstico (tipo de falla + causa) — tickets de máquina
  const [tiposFalla, setTiposFalla] = useState<string[]>([])
  const [causas, setCausas] = useState<string[]>([])
  const [dxFalla, setDxFalla] = useState<string | undefined>()
  const [dxCausa, setDxCausa] = useState<string | undefined>()
  const [dxSaving, setDxSaving] = useState(false)
  const [showCompletar, setShowCompletar] = useState(false)
  const [cierreCausa, setCierreCausa] = useState('')
  const [cierreObs, setCierreObs] = useState('')

  // Validación de producción (validar / rechazar)
  const [validando, setValidando] = useState(false)
  const [showRechazar, setShowRechazar] = useState(false)
  const [rechazoMotivo, setRechazoMotivo] = useState('')

  // Recordatorio recurrente (config por ticket)
  const [recSaving, setRecSaving] = useState(false)

  // Pausa: motivo obligatorio (catálogo MotivoPausa, solo activos)
  const [showPausa, setShowPausa] = useState(false)
  const [motivosPausa, setMotivosPausa] = useState<IMotivoPausa[]>([])
  const [motivoPausaId, setMotivoPausaId] = useState<number | undefined>()

  usePageHeader({
    left: <ArrowLeft color={theme.text?.val} onPress={() => navigation.goBack()} />,
    center: <Text fontSize="$4" fontWeight="700" color="$text">Detalle del ticket</Text>,
    right: <NotificationBell size={20} />,
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
      setSelMec(res.Data.Mecanico_UserCode ?? undefined)
      ticketsService.getEventos(id).then(r => setEventos(r.Data ?? [])).catch(() => {})
    } catch (e: any) {
      setError(e?.message || 'Error de conexión'); setT(null)
    }
  }, [id])

  useEffect(() => { (async () => { setCargando(true); await cargar(); setCargando(false) })() }, [cargar])

  // Recarga silenciosa al volver a enfocar (p. ej. al entrar por una notificación
  // tras completar/iniciar el ticket); el mount ya hace la primera carga.
  const primerFoco = useRef(true)
  useFocusEffect(useCallback(() => {
    if (primerFoco.current) { primerFoco.current = false; return }
    cargar()
  }, [cargar]))

  const onRefresh = useCallback(async () => { setRefrescando(true); await cargar(); setRefrescando(false) }, [cargar])

  // Carga la lista de mecánicos/técnicos solo si el usuario puede despachar (picker).
  useEffect(() => {
    if (!puedeDespacharTicket) return
    ticketsService.getMecanicos().then(r => setMecanicos(r.Data ?? [])).catch(() => {})
  }, [puedeDespacharTicket])

  // Diagnóstico: inicializa desde el ticket y carga los tipos de falla (máquina).
  useEffect(() => {
    setDxFalla(t?.TipoFalla ?? undefined)
    setDxCausa(t?.Causa ?? undefined)
    if (t && t.TipoDestino !== 'AREA' && t.Operacion_Id != null && t.Modelo) {
      ticketsService.getTiposFalla(t.Operacion_Id, t.Modelo)
        .then(r => setTiposFalla((r.Data ?? []).map(x => x.TipoFalla))).catch(() => setTiposFalla([]))
    } else {
      setTiposFalla([])
    }
  }, [t?.Id, t?.Operacion_Id, t?.Modelo, t?.TipoFalla, t?.Causa])

  // Causas según modelo + tipo de falla seleccionado.
  useEffect(() => {
    if (t?.Modelo && dxFalla) {
      ticketsService.getCausas(t.Modelo, dxFalla)
        .then(r => setCausas((r.Data ?? []).map(x => x.Causa))).catch(() => setCausas([]))
    } else {
      setCausas([])
    }
  }, [t?.Modelo, dxFalla])

  const doDiagnosticar = async () => {
    if (!dxFalla || !dxCausa) { showToast('warning', 'Diagnóstico incompleto', 'Selecciona tipo de falla y causa'); return }
    setDxSaving(true)
    try {
      const res = await ticketsService.diagnosticar(id, { TipoFalla: dxFalla, Causa: dxCausa })
      if (res.Success && res.Data?.Success) { showToast('success', 'Diagnóstico guardado', t?.CodigoTicket ?? ''); await cargar() }
      else showToast('error', 'No se pudo guardar', res.Data?.ErrorMessage || res.ErrorMessage || 'Intenta de nuevo')
    } catch (e: any) {
      showToast('error', 'Error', e?.message || 'No se pudo guardar el diagnóstico')
    } finally {
      setDxSaving(false)
    }
  }

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
  const estadoVis = estadoVisual(t.EstadoCode, t.Estado, t.Mecanico_UserCode)
  const estadoC = estadoVis.color
  const prioC = colorPrioridad(t.Prioridad ?? '')
  const orden = t.EstadoOrden ?? 1
  const cancelado = t.EstadoCode === 'CANCELADO'

  // Estados abiertos donde rol/acceso pueden editar/cancelar.
  const estadoEditable = ['PENDIENTE', 'PAUSADO', 'EN_PROCESO'].includes(t.EstadoCode ?? '')
  // El creador puede editar/cancelar su propio ticket SOLO mientras esté Pendiente.
  const esCreador = !!user?.Code && t.Create_By === user.Code
  const creadorPendiente = esCreador && t.EstadoCode === 'PENDIENTE'
  // Editar: Admin/Sup. Mtto/acceso 'EditarTickets' (estados abiertos) o el creador en Pendiente.
  const puedeEditar = (estadoEditable && puedeEditarTicket(user?.Roles, user?.Access)) || creadorPendiente
  // Cancelar: Admin/Sup. Mtto/acceso 'CancelarTickets' (estados abiertos) o el creador en Pendiente.
  const puedeCancelar = (estadoEditable && puedeCancelarTicket(user?.Roles, user?.Access)) || creadorPendiente

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

  // Ticket abierto (no terminado): base para asignar / tomar.
  const ticketAbierto = t.EstadoCode !== 'COMPLETADO' && t.EstadoCode !== 'CANCELADO'
  // Despachar (picker): asignar a cualquiera mientras el ticket esté abierto.
  const puedeDespacharAqui = puedeDespacharTicket && ticketAbierto
  const mecOpts = mecanicos.map(m => ({ value: m.User_Code, label: m.Nombre || m.User_Code }))
  const asignar = async () => {
    if (!selMec) { showToast('warning', 'Selecciona', 'Elige a quién asignar'); return }
    setAsignando(true)
    try {
      const res = await ticketsService.asignar(id, selMec)
      if (res.Success && res.Data?.Success) { showToast('success', 'Asignado', t.CodigoTicket); await cargar() }
      else showToast('error', 'No se pudo asignar', res.Data?.ErrorMessage || res.ErrorMessage || 'Intenta de nuevo')
    } catch (e: any) {
      showToast('error', 'Error', e?.message || 'No se pudo asignar')
    } finally {
      setAsignando(false)
    }
  }

  // Tomar ticket (autoasignarse): solo mecánico/técnico que NO es despachador, con
  // el ticket abierto y LIBRE (el backend igual bloquea tomar el de otro técnico).
  const puedeTomar = puedeAutoAsignar && !puedeDespacharTicket && ticketAbierto && !t.Mecanico_UserCode
  const tomar = async () => {
    if (!user?.Code) return
    setAsignando(true)
    try {
      const res = await ticketsService.asignar(id, user.Code)
      if (res.Success && res.Data?.Success) { showToast('success', 'Ticket tomado', t.CodigoTicket); await cargar() }
      else showToast('error', 'No se pudo tomar', res.Data?.ErrorMessage || res.ErrorMessage || 'Intenta de nuevo')
    } catch (e: any) {
      showToast('error', 'Error', e?.message || 'No se pudo tomar')
    } finally {
      setAsignando(false)
    }
  }

  // ── Acciones del mecánico ──────────────────────────────────────────────────
  // Puede operar: el mecánico asignado, o un Administrador / Supervisor de Mtto.
  const puedeOperar = puedeOperarTicket(user?.Roles, user?.Code, t.Mecanico_UserCode)

  const doAccion = async (
    fn: (id: number) => Promise<any>,
    okMsg: string,
  ) => {
    setAccionando(true)
    try {
      const res = await fn(id)
      if (res.Success && res.Data?.Success) { showToast('success', okMsg, t.CodigoTicket); await cargar() }
      else showToast('error', 'No se pudo', res.Data?.ErrorMessage || res.ErrorMessage || 'Intenta de nuevo')
    } catch (e: any) {
      showToast('error', 'Error', e?.message || 'Operación fallida')
    } finally {
      setAccionando(false)
    }
  }

  const doCompletar = async () => {
    setAccionando(true)
    try {
      const res = await ticketsService.completar(id, {
        Causa: cierreCausa.trim() || null,
        Observaciones: cierreObs.trim() || null,
      })
      if (res.Success && res.Data?.Success) {
        showToast('success', 'Ticket completado', t.CodigoTicket)
        setShowCompletar(false); setCierreCausa(''); setCierreObs('')
        await cargar()
      } else {
        showToast('error', 'No se pudo completar', res.Data?.ErrorMessage || res.ErrorMessage || 'Intenta de nuevo')
      }
    } catch (e: any) {
      showToast('error', 'Error', e?.message || 'No se pudo completar')
    } finally {
      setAccionando(false)
    }
  }

  // Abre el modal de pausa cargando los motivos activos (dropdown obligatorio).
  const abrirPausa = async () => {
    setMotivoPausaId(undefined)
    setShowPausa(true)
    try { const r = await catalogosService.getMotivosPausa(true); setMotivosPausa(r.Data ?? []) }
    catch { setMotivosPausa([]) }
  }

  const doPausar = async () => {
    if (motivoPausaId == null) { showToast('warning', 'Falta el motivo', 'Selecciona por qué se pausa el ticket'); return }
    setAccionando(true)
    try {
      const res = await ticketsService.pausar(id, motivoPausaId)
      if (res.Success && res.Data?.Success) { showToast('success', 'Ticket pausado', t.CodigoTicket); setShowPausa(false); await cargar() }
      else showToast('error', 'No se pudo', res.Data?.ErrorMessage || res.ErrorMessage || 'Intenta de nuevo')
    } catch (e: any) { showToast('error', 'Error', e?.message || 'Operación fallida') }
    finally { setAccionando(false) }
  }

  const doValidar = async () => {
    setValidando(true)
    try {
      const res = await ticketsService.validar(id)
      if (res.Success && res.Data?.Success) { showToast('success', 'Ticket validado', t.CodigoTicket); await cargar() }
      else showToast('error', 'No se pudo validar', res.Data?.ErrorMessage || res.ErrorMessage || 'Intenta de nuevo')
    } catch (e: any) { showToast('error', 'Error', e?.message || 'No se pudo validar') }
    finally { setValidando(false) }
  }

  const doRechazar = async () => {
    if (!rechazoMotivo.trim()) { showToast('warning', 'Falta el motivo', 'Indica por qué se rechaza'); return }
    setValidando(true)
    try {
      const res = await ticketsService.rechazar(id, rechazoMotivo.trim())
      if (res.Success && res.Data?.Success) {
        showToast('success', 'Ticket rechazado', t.CodigoTicket)
        setShowRechazar(false); setRechazoMotivo('')
        await cargar()
      } else showToast('error', 'No se pudo rechazar', res.Data?.ErrorMessage || res.ErrorMessage || 'Intenta de nuevo')
    } catch (e: any) { showToast('error', 'Error', e?.message || 'No se pudo rechazar') }
    finally { setValidando(false) }
  }

  const doConfigRecordatorio = async (min: number) => {
    setRecSaving(true)
    try {
      const res = await ticketsService.configurarRecordatorio(id, min)
      if (res.Success && res.Data?.Success) { showToast('success', 'Recordatorio actualizado', min === 0 ? 'Sin aviso' : `Cada ${min} min`); await cargar() }
      else showToast('error', 'No se pudo', res.Data?.ErrorMessage || res.ErrorMessage || 'Intenta de nuevo')
    } catch (e: any) { showToast('error', 'Error', e?.message || 'No se pudo actualizar') }
    finally { setRecSaving(false) }
  }

  const estado = t.EstadoCode
  const mostrarAcciones = puedeOperar && (estado === 'PENDIENTE' || estado === 'EN_PROCESO' || estado === 'PAUSADO' || estado === 'RECHAZADO')

  // Recordatorio: editable salvo que el ticket esté cancelado o cerrado
  // (completado y validado). Default 0 (sin aviso).
  const puedeConfigRec = puedeConfigRecordatorio(user?.Roles, user?.Access)
  const ticketCerrado = estado === 'CANCELADO' || (estado === 'COMPLETADO' && !!t.ValidadoPor)
  const mostrarRecordatorio = !ticketCerrado
  const recMin = t.RecordatorioMin ?? 0

  // Validación de producción: sobre tickets COMPLETADOS y aún no validados.
  const puedeVal = puedeValidar(user?.Roles, user?.Access, user?.Code, t.Create_By)
  const estaValidado = !!t.ValidadoPor
  const mostrarValidacion = estado === 'COMPLETADO' && !estaValidado && puedeVal

  // Diagnóstico: solo tickets de máquina, con permiso, mientras no esté cerrado.
  const puedeDiag = puedeDiagnosticar(user?.Roles, user?.Access, user?.Code, t.Mecanico_UserCode)
  // Diagnóstico solo con el ticket iniciado (En Proceso/Pausado) — implica asignado.
  const mostrarDiagnostico = !esArea && puedeDiag && (estado === 'EN_PROCESO' || estado === 'PAUSADO')

  // Bitácora unificada: la asignación (FechaAsignacion) + los eventos del
  // mecánico (iniciar/pausar/reanudar/completar), en orden cronológico.
  type BitItem = { key: string; label: string; fecha: string | null; usuario?: string | null; comentario?: string | null; color: string }
  const bitacora: BitItem[] = [
    ...(t.Mecanico_UserCode
      ? [{
          key: 'asignado', label: 'Asignado', fecha: t.FechaAsignacion,
          comentario: t.Mecanico && t.Mecanico.trim() ? t.Mecanico : null,
          color: COLOR_ASIGNADO,
        } as BitItem]
      : []),
    ...eventos.map<BitItem>(ev => {
      // La reanudación se categoriza según el estado anterior (Pausado vs Rechazado).
      const catReanudar = ev.EstadoAnterior === 'Rechazado' ? 'Por ticket inválido' : 'Por pausa'
      return {
        key: `ev-${ev.Id}`,
        label: EVENTO_LABEL[ev.Evento ?? ''] ?? ev.Evento ?? '',
        fecha: ev.Fecha,
        usuario: ev.Usuario,
        comentario: ev.Evento === 'REANUDAR' ? catReanudar : ev.Comentario,
        color: colorEstado(ev.EstadoNuevo ?? ''),
      }
    }),
  ].sort((a, b) => new Date(a.fecha ?? 0).getTime() - new Date(b.fecha ?? 0).getTime())

  // Tiempo Completado → Validado (cliente): primer COMPLETAR de la bitácora → validación.
  // El reloj corre de corrido aunque haya habido rechazos/reprocesos en medio.
  const primerCompletar = eventos.find(e => e.Evento === 'COMPLETAR')?.Fecha
  const tValidacionMin = (t.FechaValidacion && primerCompletar)
    ? Math.max(0, Math.round((new Date(t.FechaValidacion).getTime() - new Date(primerCompletar).getTime()) / 60000))
    : null

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
              <XStack alignItems="center" gap="$2.5">
                {/* Ojo: muestra el QR del ticket (para validación de salida de repuestos) */}
                <View onPress={() => setShowQR(true)} pressStyle={{ opacity: 0.6 }} hitSlop={10}>
                  <Eye size={22} color={theme.textMuted?.val} />
                </View>
                <View backgroundColor={estadoC} borderRadius="$10" paddingHorizontal="$3" paddingVertical="$1.5">
                  <Text fontSize="$2" fontWeight="800" color="#fff">{estadoVis.label}</Text>
                </View>
              </XStack>
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
              <>
                {!!t.Mecanico_UserCode && (
                  <Step label="Asignado" date={fmtFecha(t.FechaAsignacion)} color={COLOR_ASIGNADO} done />
                )}
                <Step label="Cancelado" date={fmtFecha(t.Modification_Date)} color={colorEstado('Cancelado')} done last />
              </>
            ) : (
              <>
                <Step label="Asignado" date={fmtFecha(t.FechaAsignacion)} color={COLOR_ASIGNADO} done={!!t.Mecanico_UserCode} />
                <Step label="En Proceso" date={fmtFecha(t.HoraInicio)} color={colorEstado('En Proceso')} done={orden >= 2} />
                {estado === 'RECHAZADO' && (
                  <Step label="Rechazado" date={fmtFecha(t.Modification_Date)} color={colorEstado('Rechazado')} done />
                )}
                <Step label="Completado" date={fmtFecha(t.HoraFinal)} color={colorEstado('Completado')} done={estado === 'COMPLETADO'} />
                <Step label="Validado" date={fmtFecha(t.FechaValidacion)} color={COLOR_VALIDADO} done={estaValidado} last />
              </>
            )}
          </Section>

          {/* Tiempos del ticket */}
          {!cancelado && (
            <Section title="Tiempos">
              <YStack gap="$2.5">
                <TiempoRow label="Respuesta" hint="Reportado → En proceso" value={fmtMin(t.TiempoRespuestaMin)} />
                <TiempoRow label="Resolución" hint="En proceso → Completado (sin pausas)" value={fmtMin(t.TiempoNetoMin)} />
                <TiempoRow
                  label="Total"
                  hint="Respuesta + Resolución"
                  value={fmtMin(t.TiempoRespuestaMin != null && t.TiempoNetoMin != null ? t.TiempoRespuestaMin + t.TiempoNetoMin : null)}
                  bold
                />
                {tValidacionMin != null && (
                  <TiempoRow label="Validación" hint="Completado → Validado" value={fmtMin(tValidacionMin)} />
                )}
              </YStack>
            </Section>
          )}

          {/* Detalle */}
          <Section title="Detalle">
            <InfoRow label="Área" value={t.Area} />
            {esArea ? (
              <>
                <InfoRow label="Operación" value={t.Operacion} />
                {!!t.Objeto && <InfoRow label="Detalle" value={t.Objeto} />}
              </>
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

          {/* Asignación (primer paso del flujo: asignar → iniciar → diagnosticar → completar) */}
          <Section title="Asignación">
            <XStack alignItems="center" gap="$2">
              <User size={16} color={theme.textMuted?.val} />
              <Text fontSize="$3" color="$text">
                {t.Mecanico && t.Mecanico.trim() ? t.Mecanico : <Text color="$textMuted">Sin asignar</Text>}
              </Text>
            </XStack>

            {puedeDespacharAqui && (
              <YStack gap="$2.5" marginTop="$2" paddingTop="$3" borderTopWidth={1} borderTopColor="$border">
                <Text fontSize="$2" color="$textMuted">Asignar a un mecánico / técnico / supervisor:</Text>
                <AppSelect label="" placeholder="Selecciona mecánico/técnico/supervisor"
                  value={selMec} options={mecOpts} onValueChange={v => setSelMec(v ? String(v) : undefined)} />
                <View onPress={asignando ? undefined : asignar} pressStyle={{ opacity: 0.85 }}
                  opacity={asignando ? 0.6 : 1} backgroundColor={ACCENT} borderRadius="$4" height={46}
                  alignItems="center" justifyContent="center" flexDirection="row" gap="$2">
                  {asignando ? <Spinner color="#fff" /> : <User size={18} color="#fff" />}
                  <Text color="#fff" fontWeight="800" fontSize="$3">
                    {asignando ? 'Asignando…' : (t.Mecanico_UserCode ? 'Reasignar' : 'Asignar')}
                  </Text>
                </View>
              </YStack>
            )}

            {/* Autoasignación: el mecánico/técnico se toma el ticket libre. */}
            {puedeTomar && (
              <YStack gap="$2.5" marginTop="$2" paddingTop="$3" borderTopWidth={1} borderTopColor="$border">
                <Text fontSize="$2" color="$textMuted">Este ticket está sin asignar. Puedes tomarlo para trabajarlo tú.</Text>
                <View onPress={asignando ? undefined : tomar} pressStyle={{ opacity: 0.85 }}
                  opacity={asignando ? 0.6 : 1} backgroundColor={COLOR_ASIGNADO} borderRadius="$4" height={46}
                  alignItems="center" justifyContent="center" flexDirection="row" gap="$2">
                  {asignando ? <Spinner color="#fff" /> : <User size={18} color="#fff" />}
                  <Text color="#fff" fontWeight="800" fontSize="$3">{asignando ? 'Tomando…' : 'Tomar ticket'}</Text>
                </View>
              </YStack>
            )}
          </Section>

          {/* Recordatorio recurrente (config por ticket, debajo de Asignación) */}
          {mostrarRecordatorio && (
            <Section title="Recordatorio">
              <Text fontSize="$2" color="$textMuted">
                Aviso al asignado cada cierto tiempo mientras el ticket esté En Proceso (por si olvida pausarlo o completarlo).
              </Text>
              {puedeConfigRec ? (
                <XStack gap="$2" flexWrap="wrap">
                  {[0, 15, 30, 60].map(m => {
                    const on = recMin === m
                    return (
                      <View key={m} onPress={recSaving ? undefined : () => doConfigRecordatorio(m)} pressStyle={{ opacity: 0.8 }}
                        backgroundColor={on ? ACCENT : '$backgroundHover'} borderRadius="$10"
                        paddingHorizontal="$3.5" paddingVertical="$2" borderWidth={1} borderColor={on ? ACCENT : '$border'}>
                        <Text fontSize="$2" fontWeight="700" color={on ? '#fff' : '$text'}>{m === 0 ? 'Sin aviso' : `${m} min`}</Text>
                      </View>
                    )
                  })}
                </XStack>
              ) : (
                <XStack alignItems="center" gap="$2">
                  <Clock size={16} color={theme.textMuted?.val} />
                  <Text fontSize="$3" color="$text" fontWeight="700">{recMin === 0 ? 'Sin aviso' : `Cada ${recMin} min`}</Text>
                </XStack>
              )}
            </Section>
          )}

          {/* Acciones del mecánico (tras la asignación; Iniciar requiere asignado) */}
          {mostrarAcciones && (
            <Section title="Acciones">
              <XStack gap="$2.5" flexWrap="wrap">
                {estado === 'PENDIENTE' && !!t.Mecanico_UserCode && (
                  <ActionBtn icon={<Play size={18} color="#fff" />} label="Iniciar" color={colorEstado('En Proceso')}
                    loading={accionando} onPress={() => doAccion(ticketsService.iniciar, 'Ticket iniciado')} />
                )}
                {estado === 'EN_PROCESO' && (
                  <ActionBtn icon={<Pause size={18} color="#fff" />} label="Pausar" color={colorEstado('Pausado')}
                    loading={accionando} onPress={abrirPausa} />
                )}
                {(estado === 'PAUSADO' || estado === 'RECHAZADO') && (
                  <ActionBtn icon={<RotateCcw size={18} color="#fff" />} label="Reanudar" color={colorEstado('En Proceso')}
                    loading={accionando} onPress={() => doAccion(ticketsService.reanudar, 'Ticket reanudado')} />
                )}
                {(estado === 'EN_PROCESO' || estado === 'PAUSADO') && (
                  <ActionBtn icon={<CheckCircle2 size={18} color="#fff" />} label="Completar" color={colorEstado('Completado')}
                    loading={accionando} onPress={() => setShowCompletar(true)} />
                )}
              </XStack>
              {estado === 'PENDIENTE' && !t.Mecanico_UserCode && (
                <Text fontSize="$2" color="$textMuted">Asigna un mecánico / técnico / supervisor antes de iniciar.</Text>
              )}
            </Section>
          )}

          {/* Diagnóstico (máquina): tipo de falla + causa. Requerido para completar. */}
          {mostrarDiagnostico && (
            <Section title="Diagnóstico">
              <Text fontSize="$2" color="$textMuted">Requerido para poder completar el ticket.</Text>
              <AppSelect
                label="Tipo de falla"
                value={dxFalla}
                options={tiposFalla.map(f => ({ label: f, value: f }))}
                onValueChange={v => { setDxFalla(v ? String(v) : undefined); setDxCausa(undefined) }}
                placeholder={t.Modelo ? 'Selecciona el tipo de falla' : 'El ticket no tiene modelo'}
              />
              <AppSelect
                label="Causa"
                value={dxCausa}
                options={causas.map(c => ({ label: c, value: c }))}
                onValueChange={v => setDxCausa(v ? String(v) : undefined)}
                placeholder={dxFalla ? 'Selecciona la causa' : 'Primero el tipo de falla'}
              />
              <View onPress={dxSaving ? undefined : doDiagnosticar} pressStyle={{ opacity: 0.85 }}
                opacity={dxSaving ? 0.6 : 1} backgroundColor={ACCENT} borderRadius="$4" height={46}
                alignItems="center" justifyContent="center" flexDirection="row" gap="$2" marginTop="$1">
                {dxSaving ? <Spinner color="#fff" /> : <CheckCircle2 size={18} color="#fff" />}
                <Text color="#fff" fontWeight="800" fontSize="$3">Guardar diagnóstico</Text>
              </View>
            </Section>
          )}

          {/* Sello de validación (visible para todos cuando el ticket ya fue validado) */}
          {estaValidado && (
            <Section title="Validación">
              <XStack alignItems="center" gap="$2">
                <ShieldCheck size={18} color={COLOR_VALIDADO} />
                <Text fontSize="$3" color="$text" fontWeight="700">
                  Validado por {t.ValidadoNombre && t.ValidadoNombre.trim() ? t.ValidadoNombre : (t.ValidadoPor ?? '—')}
                </Text>
              </XStack>
              <Text fontSize="$2" color="$textMuted">{fmtFecha(t.FechaValidacion)}</Text>
            </Section>
          )}

          {/* Validación de producción (ticket completado, aún sin validar) */}
          {mostrarValidacion && (
            <Section title="Validación de producción">
              <Text fontSize="$2" color="$textMuted">¿La reparación fue satisfactoria? Valida para cerrar, o rechaza para reabrir.</Text>
              <XStack gap="$2.5" flexWrap="wrap">
                <ActionBtn icon={<ShieldCheck size={18} color="#fff" />} label="Validar" color={COLOR_VALIDADO}
                  loading={validando} onPress={doValidar} />
                <ActionBtn icon={<XCircle size={18} color="#fff" />} label="Rechazar" color={colorEstado('Rechazado')}
                  loading={false} onPress={() => setShowRechazar(true)} />
              </XStack>
            </Section>
          )}

          {/* Observaciones */}
          {!!t.Observaciones && (
            <Section title="Observaciones">
              <Text fontSize="$3" color="$text" lineHeight={20}>{t.Observaciones}</Text>
            </Section>
          )}

          {/* Bitácora de acciones (asignación + eventos del mecánico) */}
          {bitacora.length > 0 && (
            <Section title="Bitácora">
              <YStack gap="$2.5">
                {bitacora.map((b, i) => (
                  <XStack key={b.key} gap="$3" alignItems="flex-start">
                    <YStack alignItems="center">
                      <View width={10} height={10} borderRadius={5} backgroundColor={b.color} marginTop={4} />
                      {i < bitacora.length - 1 && <View width={2} flex={1} minHeight={16} backgroundColor="$border" />}
                    </YStack>
                    <YStack flex={1} paddingBottom={i < bitacora.length - 1 ? 4 : 0}>
                      <XStack justifyContent="space-between" gap="$2">
                        <Text fontSize="$3" fontWeight="700" color="$text">{b.label}</Text>
                        <Text fontSize="$2" color="$textMuted">{fmtFecha(b.fecha)}</Text>
                      </XStack>
                      {!!b.usuario && b.usuario.trim() && <Text fontSize="$2" color="$textMuted">por {b.usuario}</Text>}
                      {!!b.comentario && b.comentario.trim() && <Text fontSize="$2" color="$text" marginTop="$1">{b.comentario}</Text>}
                    </YStack>
                  </XStack>
                ))}
              </YStack>
            </Section>
          )}

          {/* Editar ticket (info completa) — Admin/Sup. Mtto o acceso, en Pend/Pausado/Proceso */}
          {puedeEditar && (
            <View onPress={() => navigation.navigate('mantenimientoTicketNuevo', { edit: t })} pressStyle={{ opacity: 0.85 }}
              marginTop="$2" borderWidth={1.5} borderColor={ACCENT} borderRadius="$4" height={50}
              alignItems="center" justifyContent="center" flexDirection="row" gap="$2">
              <Pencil size={18} color={ACCENT} />
              <Text color={ACCENT} fontWeight="800" fontSize="$4">Editar ticket</Text>
            </View>
          )}

          {/* Cancelar ticket (Pendiente/Pausado/Proceso; creador, Admin, Sup. Mtto o acceso) */}
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

      {/* Modal de cierre al completar (datos opcionales) */}
      <Modal visible={showCompletar} transparent animationType="fade" onRequestClose={() => setShowCompletar(false)}>
        <View flex={1} backgroundColor="rgba(0,0,0,0.45)" alignItems="center" justifyContent="center" padding="$4">
          <YStack width="100%" maxWidth={480} backgroundColor="$background" borderRadius="$6" padding="$4" gap="$3">
            <Text fontSize="$5" fontWeight="900" color="$text">Completar ticket</Text>
            <Text fontSize="$2" color="$textMuted">Puedes registrar la causa y observaciones de la reparación (opcional).</Text>

            <YStack gap="$1.5">
              <Text fontSize="$2" color="$textMuted">Causa / solución</Text>
              <TextArea value={cierreCausa} onChangeText={setCierreCausa} placeholder="Ej. Se reemplazó el rodamiento"
                minHeight={70} backgroundColor="$backgroundHover" borderColor="$border" color="$text" />
            </YStack>
            <YStack gap="$1.5">
              <Text fontSize="$2" color="$textMuted">Observaciones</Text>
              <TextArea value={cierreObs} onChangeText={setCierreObs} placeholder="Notas adicionales"
                minHeight={70} backgroundColor="$backgroundHover" borderColor="$border" color="$text" />
            </YStack>

            <XStack gap="$2.5" marginTop="$1">
              <View flex={1} onPress={accionando ? undefined : () => setShowCompletar(false)} pressStyle={{ opacity: 0.85 }}
                borderWidth={1.5} borderColor="$border" borderRadius="$4" height={46} alignItems="center" justifyContent="center">
                <Text color="$text" fontWeight="800" fontSize="$3">Cancelar</Text>
              </View>
              <View flex={1} onPress={accionando ? undefined : doCompletar} pressStyle={{ opacity: 0.85 }}
                opacity={accionando ? 0.6 : 1} backgroundColor={colorEstado('Completado')} borderRadius="$4" height={46}
                alignItems="center" justifyContent="center" flexDirection="row" gap="$2">
                {accionando ? <Spinner color="#fff" /> : <CheckCircle2 size={18} color="#fff" />}
                <Text color="#fff" fontWeight="800" fontSize="$3">Completar</Text>
              </View>
            </XStack>
          </YStack>
        </View>
      </Modal>

      {/* Modal de pausa (motivo OBLIGATORIO, dropdown de motivos activos) */}
      <Modal visible={showPausa} transparent animationType="fade" onRequestClose={() => setShowPausa(false)}>
        <View flex={1} backgroundColor="rgba(0,0,0,0.45)" alignItems="center" justifyContent="center" padding="$4">
          <YStack width="100%" maxWidth={480} backgroundColor="$background" borderRadius="$6" padding="$4" gap="$3">
            <Text fontSize="$5" fontWeight="900" color="$text">Pausar ticket</Text>
            <Text fontSize="$2" color="$textMuted">Indica el motivo por el que se pausa. Queda registrado en la bitácora del ticket.</Text>

            <YStack gap="$1.5">
              <Text fontSize="$2" color="$textMuted">Motivo de la pausa *</Text>
              <AppSelect label="" placeholder="Selecciona un motivo"
                value={motivoPausaId != null ? String(motivoPausaId) : undefined}
                options={motivosPausa.map(m => ({ label: m.Name, value: String(m.Id) }))}
                onValueChange={v => setMotivoPausaId(v ? Number(v) : undefined)} />
            </YStack>

            <XStack gap="$2.5" marginTop="$1">
              <View flex={1} onPress={accionando ? undefined : () => setShowPausa(false)} pressStyle={{ opacity: 0.85 }}
                borderWidth={1.5} borderColor="$border" borderRadius="$4" height={46} alignItems="center" justifyContent="center">
                <Text color="$text" fontWeight="800" fontSize="$3">Cancelar</Text>
              </View>
              <View flex={1} onPress={(accionando || motivoPausaId == null) ? undefined : doPausar} pressStyle={{ opacity: 0.85 }}
                opacity={(accionando || motivoPausaId == null) ? 0.6 : 1} backgroundColor={colorEstado('Pausado')} borderRadius="$4" height={46}
                alignItems="center" justifyContent="center" flexDirection="row" gap="$2">
                {accionando ? <Spinner color="#fff" /> : <Pause size={18} color="#fff" />}
                <Text color="#fff" fontWeight="800" fontSize="$3">Pausar</Text>
              </View>
            </XStack>
          </YStack>
        </View>
      </Modal>

      {/* Modal de rechazo (motivo obligatorio) */}
      <Modal visible={showRechazar} transparent animationType="fade" onRequestClose={() => setShowRechazar(false)}>
        <View flex={1} backgroundColor="rgba(0,0,0,0.45)" alignItems="center" justifyContent="center" padding="$4">
          <YStack width="100%" maxWidth={480} backgroundColor="$background" borderRadius="$6" padding="$4" gap="$3">
            <Text fontSize="$5" fontWeight="900" color="$text">Rechazar ticket</Text>
            <Text fontSize="$2" color="$textMuted">El ticket se reabrirá y el mecánico será notificado para reanudarlo. Indica el motivo.</Text>

            <YStack gap="$1.5">
              <Text fontSize="$2" color="$textMuted">Motivo del rechazo *</Text>
              <TextArea value={rechazoMotivo} onChangeText={setRechazoMotivo} placeholder="Ej. La máquina sigue con la misma falla"
                minHeight={80} backgroundColor="$backgroundHover" borderColor="$border" color="$text" />
            </YStack>

            <XStack gap="$2.5" marginTop="$1">
              <View flex={1} onPress={validando ? undefined : () => setShowRechazar(false)} pressStyle={{ opacity: 0.85 }}
                borderWidth={1.5} borderColor="$border" borderRadius="$4" height={46} alignItems="center" justifyContent="center">
                <Text color="$text" fontWeight="800" fontSize="$3">Cancelar</Text>
              </View>
              <View flex={1} onPress={validando ? undefined : doRechazar} pressStyle={{ opacity: 0.85 }}
                opacity={validando ? 0.6 : 1} backgroundColor={colorEstado('Rechazado')} borderRadius="$4" height={46}
                alignItems="center" justifyContent="center" flexDirection="row" gap="$2">
                {validando ? <Spinner color="#fff" /> : <XCircle size={18} color="#fff" />}
                <Text color="#fff" fontWeight="800" fontSize="$3">Rechazar</Text>
              </View>
            </XStack>
          </YStack>
        </View>
      </Modal>

      {/* QR del ticket (para validación de salida de repuestos) */}
      <Modal visible={showQR} transparent animationType="fade" onRequestClose={() => setShowQR(false)}>
        <View flex={1} backgroundColor="rgba(0,0,0,0.6)" alignItems="center" justifyContent="center" padding="$4"
          onPress={() => setShowQR(false)}>
          <YStack backgroundColor="white" borderRadius="$6" padding="$5" alignItems="center" gap="$3"
            width="100%" maxWidth={340} onPress={() => {}}>
            <XStack width="100%" alignItems="center" justifyContent="space-between">
              <Text color="#1A1A2E" fontWeight="900" fontSize="$5">Ticket</Text>
              <View onPress={() => setShowQR(false)} hitSlop={10}><X size={22} color="#1A1A2E" /></View>
            </XStack>
            <QRCode value={t.CodigoTicket || String(t.Id)} size={230} quietZone={8} />
            <Text color="#1A1A2E" fontWeight="800" fontSize="$5" letterSpacing={1}>{t.CodigoTicket}</Text>
            <Text color="#6B7280" fontSize="$2" textAlign="center">
              Muéstralo al validador para la salida de repuestos.
            </Text>
          </YStack>
        </View>
      </Modal>
    </View>
  )
}

function ActionBtn({ icon, label, color, loading, onPress }: {
  icon: React.ReactNode; label: string; color: string; loading?: boolean; onPress: () => void
}) {
  return (
    <View onPress={loading ? undefined : onPress} pressStyle={{ opacity: 0.85 }} opacity={loading ? 0.6 : 1}
      backgroundColor={color} borderRadius="$4" height={48} flexGrow={1} flexBasis={120} minWidth={120}
      alignItems="center" justifyContent="center" flexDirection="row" gap="$2">
      {loading ? <Spinner color="#fff" /> : icon}
      <Text color="#fff" fontWeight="800" fontSize="$3">{label}</Text>
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

function TiempoRow({ label, hint, value, bold }: { label: string; hint?: string; value: string; bold?: boolean }) {
  return (
    <XStack alignItems="center" justifyContent="space-between" gap="$2">
      <YStack flex={1}>
        <Text fontSize="$3" fontWeight={bold ? '800' : '600'} color="$text">{label}</Text>
        {!!hint && <Text fontSize="$1" color="$textMuted">{hint}</Text>}
      </YStack>
      <Text fontSize="$4" fontWeight={bold ? '900' : '700'} color={bold ? ACCENT : '$text'}>{value}</Text>
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
