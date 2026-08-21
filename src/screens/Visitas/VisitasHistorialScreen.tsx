import React, { useEffect, useRef, useState } from 'react'
import { Modal, RefreshControl, Platform, PermissionsAndroid } from 'react-native'
import { YStack, XStack, Text, View, ScrollView, Spinner, Button } from 'tamagui'
import { Users, ClipboardList, Clock, CheckCircle2, CalendarDays, Eye, X, Share2, Download, LogIn, LogOut, DoorOpen, Repeat, Timer, AlarmClockOff, Moon, Bot } from 'lucide-react-native'
import QRCode from 'react-native-qrcode-svg'
import Share from 'react-native-share'
import ViewShot, { captureRef } from 'react-native-view-shot'
import { CameraRoll } from '@react-native-camera-roll/camera-roll'
import Page from '../../components/commons/Page'
import SearchInput from '../../components/commons/SearchInput'
import { useFocusEffect } from '@react-navigation/native'
import { usePageHeader } from '../../hooks/usePageHeader'
import { useAuth } from '../../context/AuthContext'
import { useShowToast } from '../../utils/useShowToast'
import { NotificationBell } from '../../components/notifications/NotificationBell'
import { subscribeOpenPass } from '../../services/passNavigation'
import { visitasService } from '../../api/modules/visitas/visitas.service'
import { IHistorial, IVentanaPase, IVisitaAcceso } from '../../api/modules/visitas/visitas.types'
import { handleError } from '../../utils/errorHandler'
import { fmtDuracion } from './horarios'

const LOGO = require('../../assets/logo.png')

const prettyDate = (iso?: string | null) => {
  const [y, m, d] = (iso ?? '').split('-')
  return y && m && d ? `${d}/${m}/${y}` : (iso ?? '')
}

// Vigencia legible: rango si es recurrente con varios días, si no el día único
const vigenciaTexto = (h: IHistorial) => {
  if (h.IsRecurrent && h.StartDate && h.EndDate && h.StartDate !== h.EndDate) {
    return `${prettyDate(h.StartDate)} – ${prettyDate(h.EndDate)}`
  }
  return prettyDate(h.StartDate || h.EntryDate)
}

// Estilo del estado del pase (por ventana de vigencia)
const estadoStyle = (h: IHistorial) => {
  switch (h.EstadoPase) {
    case 'finalizado':
      return { color: '#64748B', bg: 'rgba(100,116,139,0.16)', label: 'Finalizado', Icon: CheckCircle2 }
    case 'pendiente':
      return { color: '#FF551A', bg: 'rgba(255,85,26,0.12)', label: 'Pendiente', Icon: Clock }
    default:
      return { color: '#2E9E5B', bg: 'rgba(46,158,91,0.14)', label: 'Vigente', Icon: CalendarDays }
  }
}

const fmtDateTime = (iso?: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('es-HN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// Ventana legible. Si cruza medianoche se agrega la fecha del cierre, para que
// no parezca que cierra el mismo día.
const fmtVentanaCorta = (ini?: string | null, fin?: string | null) => {
  if (!ini || !fin) return ''
  const a = new Date(ini)
  const b = new Date(fin)
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return ''
  const mismoDia = a.toDateString() === b.toDateString()
  return mismoDia
    ? `${fmtTime(ini)} – ${fmtTime(fin)}`
    : `${fmtTime(ini)} – ${fmtTime(fin)} +1d`
}

const fmtTime = (iso?: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' })
}

export default function VisitasHistorialScreen() {
  const { user } = useAuth()
  const { showToast } = useShowToast()

  const [data, setData] = useState<IHistorial[]>([])
  const [filtered, setFiltered] = useState<IHistorial[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [selected, setSelected] = useState<IHistorial | null>(null)
  const [accesos, setAccesos] = useState<IVisitaAcceso[]>([])
  // Ventanas del pase: el snapshot del horario con el que se generó.
  const [ventanas, setVentanas] = useState<IVentanaPase[]>([])
  const [loadingAccesos, setLoadingAccesos] = useState(false)
  const [busyAction, setBusyAction] = useState<'share' | 'save' | null>(null)
  const viewShotRef = useRef<any>(null)

  usePageHeader({
    center: (
      <Text fontSize="$4" fontWeight="700" color="$text">
        Historial
      </Text>
    ),
    right: <NotificationBell size={20} />,
  })

  const load = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const resp = await visitasService.getHistorial(user?.Code ?? '')
      if (resp.Success) setData(resp.Data ?? [])
    } catch (err) {
      showToast('error', 'Error', handleError(err).message, 4000, 'bottom')
    }
    setLoading(false)
    setRefreshing(false)
  }

  // Recarga el historial cada vez que la pantalla gana foco (ej. al volver
  // desde Validar tras registrar entrada/salida). La 1ra vez muestra spinner;
  // las siguientes recargan en silencio para no parpadear.
  const firstLoad = useRef(true)
  useFocusEffect(
    React.useCallback(() => {
      load(!firstLoad.current)
      firstLoad.current = false
    }, [])
  )

  // Mantener la lista filtrada en sync cuando se recarga la data
  useEffect(() => {
    setFiltered(data)
  }, [data])

  // Abrir el detalle de un pase cuando se solicita desde una notificación.
  // Se trae el pase por Id directamente (funciona aunque el destinatario no sea
  // el creador y aunque la pantalla ya esté montada/enfocada). Siempre abre,
  // sin importar si la notificación estaba leída.
  useEffect(() => {
    const unsubscribe = subscribeOpenPass(async (visitaId) => {
      try {
        const resp = await visitasService.getVisitaById(visitaId)
        if (resp?.Success && resp.Data) setSelected(resp.Data)
      } catch {
        /* noop */
      }
    })
    return unsubscribe
  }, [])

  // Cargar los movimientos (entradas/salidas) del pase seleccionado
  useEffect(() => {
    if (!selected) {
      setAccesos([])
      setVentanas([])
      return
    }
    ;(async () => {
      setLoadingAccesos(true)
      try {
        const [respAcc, respVen] = await Promise.all([
          visitasService.getAccesos(selected.Id),
          visitasService.getVentanasDePase(selected.Id),
        ])
        if (respAcc.Success) setAccesos(respAcc.Data ?? [])
        if (respVen.Success) setVentanas(respVen.Data ?? [])
      } catch {
        setAccesos([])
        setVentanas([])
      }
      setLoadingAccesos(false)
    })()
  }, [selected])

  const capturarQr = async (): Promise<string | null> => {
    try {
      const ref: any = viewShotRef.current
      const capturePromise: Promise<string> = ref?.capture
        ? ref.capture()
        : captureRef(viewShotRef, { format: 'png', quality: 1, result: 'tmpfile' })
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000))
      return await Promise.race([capturePromise, timeout])
    } catch {
      return null
    }
  }

  const compartir = async () => {
    if (!selected || busyAction) return
    setBusyAction('share')
    try {
      const uri = await capturarQr()
      if (!uri) {
        showToast('error', 'Error', 'No se pudo generar la imagen del QR', 4000, 'bottom')
        return
      }
      // El "uso único" no aplica a los recurrentes, y el horario es lo que el
      // visitante más necesita saber.
      const fechaLinea = selected.IsRecurrent
        ? `📅 Vigencia: ${vigenciaTexto(selected)}`
        : `📅 Fecha: ${prettyDate(selected.EntryDate)}`
      const horarioLinea = selected.Horario ? `\n🕐 Horario: ${selected.Horario}` : ''
      const message = `🔐 Pase de acceso para: ${selected.Personas ?? ''}\n${fechaLinea}${horarioLinea}`
      await Share.open({ title: 'Pase de Acceso QR', message, url: uri, type: 'image/png', failOnCancel: false })
    } catch {
      // cancelar la hoja de compartir no es error
    } finally {
      setBusyAction(null)
    }
  }

  const guardar = async () => {
    if (!selected || busyAction) return
    setBusyAction('save')
    try {
      if (Platform.OS === 'android' && Number(Platform.Version) <= 29) {
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE)
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          showToast('error', 'Permiso', 'No se otorgó permiso para guardar', 4000, 'bottom')
          return
        }
      }
      const uri = await capturarQr()
      if (!uri) throw new Error('No se pudo generar la imagen')
      await CameraRoll.save(uri, { type: 'photo', album: 'INTERMODA' })
      showToast('success', 'Guardado', 'Pase guardado en tu galería', 4000, 'bottom')
    } catch (e: any) {
      showToast('error', 'Error', 'No se pudo guardar: ' + (e?.message ?? ''), 5000, 'bottom')
    } finally {
      setBusyAction(null)
    }
  }

  const renderEstadoBadge = (h: IHistorial) => {
    const e = estadoStyle(h)
    return (
      <XStack alignItems="center" gap="$1.5">
        {h.DentroAhora && (
          <XStack backgroundColor="rgba(46,158,91,0.16)" paddingHorizontal="$2" paddingVertical="$1" borderRadius="$10" alignItems="center" gap="$1">
            <DoorOpen size={11} color="#2E9E5B" />
            <Text fontSize={10} fontWeight="700" color="#2E9E5B">Dentro</Text>
          </XStack>
        )}
        <XStack backgroundColor={e.bg} paddingHorizontal="$2.5" paddingVertical="$1" borderRadius="$10" alignItems="center" gap="$1">
          <e.Icon size={12} color={e.color} />
          <Text fontSize={10} fontWeight="700" color={e.color}>{e.label}</Text>
        </XStack>
      </XStack>
    )
  }

  return (
    <Page>
      <YStack flex={1} backgroundColor="$backgroundPage">
        {loading ? (
          <YStack flex={1} justifyContent="center" alignItems="center">
            <Spinner size="large" color="$primary" />
          </YStack>
        ) : (
          <ScrollView
            flex={1}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true)
                  load(true)
                }}
                tintColor="#FF551A"
              />
            }
          >
            <YStack padding="$4" gap="$3">
              {data.length > 0 && (
                <SearchInput
                  data={data}
                  searchKeys={['Personas', 'VisitTo']}
                  onResults={setFiltered}
                  placeholder="Buscar por visitante o a quién visita..."
                />
              )}
              {data.length === 0 ? (
                <YStack alignItems="center" paddingVertical="$10" gap="$3">
                  <ClipboardList size={48} color="#94A3B8" />
                  <Text color="$textMuted" fontSize={14}>
                    Aún no hay pases generados
                  </Text>
                </YStack>
              ) : filtered.length === 0 ? (
                <YStack alignItems="center" paddingVertical="$10" gap="$3">
                  <ClipboardList size={48} color="#94A3B8" />
                  <Text color="$textMuted" fontSize={14}>
                    Sin resultados para la búsqueda
                  </Text>
                </YStack>
              ) : (
                filtered.map((h) => {
                  const motivo = h.Motivo === 'Otros' && h.VisitReasonOther ? h.VisitReasonOther : h.Motivo
                  return (
                    <YStack
                      key={h.Id}
                      backgroundColor="$backgroundElevated"
                      borderRadius="$4"
                      padding="$4"
                      gap="$2"
                      overflow="hidden"
                      shadowColor="#000"
                      shadowOffset={{ width: 0, height: 2 }}
                      shadowOpacity={0.07}
                      shadowRadius={6}
                      elevation={2}
                    >
                      <XStack justifyContent="space-between" alignItems="flex-start" gap="$2">
                        <XStack flex={1} alignItems="center" gap="$2">
                          <Users size={16} color="#94A3B8" />
                          <Text fontWeight="700" fontSize={14} color="$text" flexShrink={1}>
                            {h.Personas || '—'}
                          </Text>
                        </XStack>
                        <XStack alignItems="center" gap="$2">
                          {renderEstadoBadge(h)}
                          <View onPress={() => setSelected(h)} pressStyle={{ opacity: 0.6 }} padding="$1">
                            <Eye size={20} color="#FF551A" />
                          </View>
                        </XStack>
                      </XStack>

                      <Row label="Visita a" value={h.VisitTo} />
                      <Row label="Motivo" value={motivo} />
                      <Row
                        label={h.IsRecurrent ? 'Vigencia' : 'Fecha'}
                        value={vigenciaTexto(h) + (h.IsRecurrent && (h.DiasCount ?? 0) > 1 ? ` · ${h.DiasCount} días` : '')}
                      />
                      <Row label="Horario" value={h.Horario ?? 'Día completo'} />
                      {(h.AccesosCount ?? 0) > 0 && (
                        <Row label="Movimientos" value={`${h.AccesosCount}`} />
                      )}
                      {/* Tiempo adentro: el indicador que motiva toda la función */}
                      {h.MinutosDentroTotal != null && (
                        <Row label="Tiempo adentro" value={fmtDuracion(h.MinutosDentroTotal)} />
                      )}
                      {/* Incumplimiento de horario, visible desde la lista */}
                      {(h.MovimientosConExceso ?? 0) > 0 && (
                        <XStack alignItems="center" gap="$1.5" marginTop="$1">
                          <AlarmClockOff size={13} color="#E58E26" />
                          <Text fontSize={11} color="#E58E26" fontWeight="700" flexShrink={1}>
                            Se pasó del horario {h.MovimientosConExceso} vez(ces) ·{' '}
                            {fmtDuracion(h.MinutosExcesoTotal)} en total
                          </Text>
                        </XStack>
                      )}
                    </YStack>
                  )
                })
              )}
            </YStack>
          </ScrollView>
        )}
      </YStack>

      {/* Detalle del pase */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View flex={1} backgroundColor="rgba(0,0,0,0.5)" justifyContent="flex-end">
          <YStack backgroundColor="$backgroundPage" borderTopLeftRadius="$6" borderTopRightRadius="$6" padding="$4" gap="$3" maxHeight="92%">
            <XStack justifyContent="space-between" alignItems="center">
              <Text fontSize={16} fontWeight="800" color="$text">
                Detalle del pase
              </Text>
              <View onPress={() => setSelected(null)} pressStyle={{ opacity: 0.6 }} padding="$1">
                <X size={22} color="#94A3B8" />
              </View>
            </XStack>

            {selected && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <YStack alignItems="center" gap="$3" paddingBottom="$4">
                  <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1, result: 'tmpfile' }}>
                    <YStack backgroundColor="white" paddingVertical={18} paddingHorizontal={16} borderRadius="$4" alignItems="center" gap={10} collapsable={false}>
                      <Text color="#1A1A2E" fontWeight="800" fontSize={20} letterSpacing={3}>
                        INTERMODA
                      </Text>
                      <QRCode value={selected.Token} size={210} logo={LOGO} logoSize={44} logoBackgroundColor="white" logoBorderRadius={8} quietZone={6} />
                      <Text color="#1A1A2E" fontWeight="700" fontSize={15}>
                        {selected.IsRecurrent ? 'Vigencia: ' : 'Ingreso: '}{vigenciaTexto(selected)}
                      </Text>
                      {/* El horario va en la tarjeta que se comparte: el visitante
                          necesita leerlo antes de venir. */}
                      {!!selected.Horario && (
                        <Text color="#1A1A2E" fontWeight="600" fontSize={12} textAlign="center">
                          {selected.Horario}
                        </Text>
                      )}
                      {selected.IsRecurrent && (
                        <Text color="#FF551A" fontWeight="700" fontSize={11} letterSpacing={1}>
                          PASE RECURRENTE
                        </Text>
                      )}
                    </YStack>
                  </ViewShot>

                  {/* Banner de estado (por ventana de vigencia) */}
                  {(() => {
                    const e = estadoStyle(selected)
                    return (
                      <XStack
                        width="100%"
                        backgroundColor={e.bg}
                        borderRadius="$4"
                        padding="$3"
                        alignItems="center"
                        gap="$2"
                      >
                        <e.Icon size={18} color={e.color} />
                        <Text fontWeight="800" fontSize={14} color={e.color}>
                          {selected.DentroAhora ? 'Dentro ahora' : e.label}
                        </Text>
                      </XStack>
                    )
                  })()}

                  <YStack width="100%" gap="$1.5">
                    <Row label="Personas" value={selected.Personas} />
                    <Row label="Visita a" value={selected.VisitTo} />
                    <Row label="Motivo" value={selected.Motivo === 'Otros' && selected.VisitReasonOther ? selected.VisitReasonOther : selected.Motivo} />
                    <Row label={selected.IsRecurrent ? 'Vigencia' : 'Fecha'} value={vigenciaTexto(selected)} />
                    {selected.IsRecurrent && (
                      <Row label="Días habilitados" value={`${selected.DiasCount ?? 0}`} />
                    )}
                    <Row label="Horario" value={selected.Horario ?? 'Día completo'} />
                    {(selected.VentanasCount ?? 0) > 0 && (
                      <Row label="Ventanas" value={`${selected.VentanasCount}`} />
                    )}
                    {selected.MinutosDentroTotal != null && (
                      <Row label="Tiempo adentro (total)" value={fmtDuracion(selected.MinutosDentroTotal)} />
                    )}
                    {(selected.MinutosExcesoTotal ?? 0) > 0 && (
                      <Row label="Fuera de horario" value={fmtDuracion(selected.MinutosExcesoTotal)} highlight />
                    )}
                  </YStack>

                  {/* ── Ventanas del pase (snapshot del horario al generarlo) ── */}
                  {ventanas.length > 0 && (
                    <YStack width="100%" gap="$2" marginTop="$1">
                      <XStack alignItems="center" gap="$2">
                        <Clock size={15} color="#94A3B8" />
                        <Text fontSize={13} fontWeight="800" color="$text">Horario autorizado</Text>
                      </XStack>
                      {ventanas.map((v) => (
                        <XStack
                          key={v.Id}
                          backgroundColor="$backgroundElevated"
                          borderRadius="$3"
                          padding="$2.5"
                          justifyContent="space-between"
                          alignItems="center"
                          gap="$2"
                        >
                          <Text fontSize={12} fontWeight="700" color="$text">{prettyDate(v.Dia)}</Text>
                          <XStack alignItems="center" gap="$2">
                            {v.CruzaMedianoche && <Moon size={12} color="#2563EB" />}
                            <Text fontSize={11} color="$textMuted">
                              {fmtVentanaCorta(v.VentanaInicio, v.VentanaFin)}
                            </Text>
                            <Text fontSize={11} color="$textMuted">
                              · {fmtDuracion(v.DuracionMinutos)}
                            </Text>
                          </XStack>
                        </XStack>
                      ))}
                    </YStack>
                  )}

                  {/* Movimientos (entradas/salidas por día) */}
                  <YStack width="100%" gap="$2" marginTop="$1">
                    <XStack alignItems="center" gap="$2">
                      <CalendarDays size={15} color="#94A3B8" />
                      <Text fontSize={13} fontWeight="800" color="$text">Entradas y salidas</Text>
                    </XStack>
                    {loadingAccesos ? (
                      <Spinner color="$primary" />
                    ) : accesos.length === 0 ? (
                      <Text fontSize={12} color="$textMuted">Aún sin registros de acceso.</Text>
                    ) : (
                      accesos.map((a) => {
                        const exceso = a.MinutosExceso ?? 0
                        return (
                          <YStack
                            key={a.Id}
                            backgroundColor="$backgroundElevated"
                            borderRadius="$3"
                            padding="$2.5"
                            gap="$1.5"
                          >
                            <XStack justifyContent="space-between" alignItems="center" gap="$2">
                              <Text fontSize={12} fontWeight="700" color="$text">{prettyDate(a.AccessDate)}</Text>
                              <XStack gap="$3" alignItems="center">
                                <XStack alignItems="center" gap="$1">
                                  <LogIn size={13} color="#2E9E5B" />
                                  <Text fontSize={11} color="#2E9E5B">{fmtTime(a.EntradaAt)}</Text>
                                </XStack>
                                <XStack alignItems="center" gap="$1">
                                  <LogOut size={13} color={a.SalidaAt ? '#2563EB' : '#94A3B8'} />
                                  <Text fontSize={11} color={a.SalidaAt ? '#2563EB' : '#94A3B8'}>
                                    {a.SalidaAt ? fmtTime(a.SalidaAt) : 'dentro'}
                                  </Text>
                                </XStack>
                              </XStack>
                            </XStack>

                            <XStack alignItems="center" gap="$2" flexWrap="wrap">
                              {/* Tiempo adentro del movimiento */}
                              {a.MinutosDentro != null && (
                                <XStack alignItems="center" gap="$1">
                                  <Timer size={11} color="#94A3B8" />
                                  <Text fontSize={10} color="$textMuted">{fmtDuracion(a.MinutosDentro)}</Text>
                                </XStack>
                              )}
                              {/* Ventana que autorizó la entrada */}
                              {!!a.VentanaInicio && (
                                <Text fontSize={10} color="$textMuted">
                                  ventana {fmtVentanaCorta(a.VentanaInicio, a.VentanaFin)}
                                </Text>
                              )}
                              {/* Exceso: se pasó del horario */}
                              {exceso > 0 && (
                                <XStack
                                  backgroundColor="rgba(229,142,38,0.14)"
                                  paddingHorizontal="$2"
                                  paddingVertical="$0.5"
                                  borderRadius="$10"
                                  alignItems="center"
                                  gap="$1"
                                >
                                  <AlarmClockOff size={10} color="#E58E26" />
                                  <Text fontSize={10} fontWeight="700" color="#E58E26">
                                    +{fmtDuracion(exceso)} fuera de horario
                                  </Text>
                                </XStack>
                              )}
                              {/* Salida inferida por el sistema, no escaneada: hay que
                                  poder distinguirla del dato real. */}
                              {a.CierreAuto && (
                                <XStack
                                  backgroundColor="rgba(100,116,139,0.16)"
                                  paddingHorizontal="$2"
                                  paddingVertical="$0.5"
                                  borderRadius="$10"
                                  alignItems="center"
                                  gap="$1"
                                >
                                  <Bot size={10} color="#64748B" />
                                  <Text fontSize={10} fontWeight="700" color="#64748B">
                                    cierre automático
                                  </Text>
                                </XStack>
                              )}
                            </XStack>
                          </YStack>
                        )
                      })
                    )}
                  </YStack>

                  {/* Acciones mientras el pase siga vigente (no finalizado) */}
                  {selected.EstadoPase !== 'finalizado' && (
                    <XStack width="100%" gap="$3">
                      <Button
                        flex={1}
                        height={46}
                        backgroundColor="#25D366"
                        borderRadius="$4"
                        pressStyle={{ opacity: 0.85 }}
                        onPress={compartir}
                        icon={busyAction === 'share' ? <Spinner color="white" /> : <Share2 size={17} color="white" />}
                      >
                        <Text color="white" fontWeight="700" fontSize={13}>Compartir</Text>
                      </Button>
                      <Button
                        flex={1}
                        height={46}
                        backgroundColor="$primary"
                        borderRadius="$4"
                        pressStyle={{ opacity: 0.85 }}
                        onPress={guardar}
                        icon={busyAction === 'save' ? <Spinner color="white" /> : <Download size={17} color="white" />}
                      >
                        <Text color="white" fontWeight="700" fontSize={13}>Guardar</Text>
                      </Button>
                    </XStack>
                  )}
                </YStack>
              </ScrollView>
            )}
          </YStack>
        </View>
      </Modal>
    </Page>
  )
}

function Row({ label, value, highlight }: { label: string; value?: string | null; highlight?: boolean }) {
  return (
    <XStack justifyContent="space-between" gap="$2">
      <Text fontSize={12} color="$textMuted">
        {label}
      </Text>
      <Text fontSize={12} color={highlight ? '#E53935' : '$text'} fontWeight={highlight ? '700' : '600'} flexShrink={1} textAlign="right">
        {value || '—'}
      </Text>
    </XStack>
  )
}
