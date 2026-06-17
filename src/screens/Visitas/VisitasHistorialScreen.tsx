import React, { useEffect, useRef, useState } from 'react'
import { Modal, RefreshControl, Platform, PermissionsAndroid } from 'react-native'
import { YStack, XStack, Text, View, ScrollView, Spinner, Button } from 'tamagui'
import { Users, ClipboardList, Clock, TriangleAlert, Eye, X, Share2, Download } from 'lucide-react-native'
import QRCode from 'react-native-qrcode-svg'
import Share from 'react-native-share'
import ViewShot, { captureRef } from 'react-native-view-shot'
import { CameraRoll } from '@react-native-camera-roll/camera-roll'
import Page from '../../components/commons/Page'
import SearchInput from '../../components/commons/SearchInput'
import { usePageHeader } from '../../hooks/usePageHeader'
import { useAuth } from '../../context/AuthContext'
import { useShowToast } from '../../utils/useShowToast'
import { visitasService } from '../../api/modules/visitas/visitas.service'
import { IHistorial } from '../../api/modules/visitas/visitas.types'
import { handleError } from '../../utils/errorHandler'

const LOGO = require('../../assets/logo.png')

const prettyDate = (iso: string) => {
  const [y, m, d] = (iso ?? '').split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}

const fmtDateTime = (iso?: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('es-HN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function VisitasHistorialScreen() {
  const { user } = useAuth()
  const { showToast } = useShowToast()

  const [data, setData] = useState<IHistorial[]>([])
  const [filtered, setFiltered] = useState<IHistorial[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [selected, setSelected] = useState<IHistorial | null>(null)
  const [busyAction, setBusyAction] = useState<'share' | 'save' | null>(null)
  const viewShotRef = useRef<any>(null)

  usePageHeader({
    center: (
      <Text fontSize="$4" fontWeight="700" color="$text">
        Historial
      </Text>
    ),
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

  useEffect(() => {
    load()
  }, [])

  // Mantener la lista filtrada en sync cuando se recarga la data
  useEffect(() => {
    setFiltered(data)
  }, [data])

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
      const message = `🔐 Pase de acceso para: ${selected.Personas ?? ''}\n📅 Fecha: ${prettyDate(selected.EntryDate)}\n⚠️ Código de uso único`
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
    if (h.Used) {
      return (
        <XStack backgroundColor="rgba(229,57,53,0.14)" paddingHorizontal="$2.5" paddingVertical="$1" borderRadius="$10" alignItems="center" gap="$1">
          <TriangleAlert size={12} color="#E53935" />
          <Text fontSize={10} fontWeight="700" color="#E53935">Pase usado</Text>
        </XStack>
      )
    }
    return (
      <XStack backgroundColor="rgba(255,85,26,0.12)" paddingHorizontal="$2.5" paddingVertical="$1" borderRadius="$10" alignItems="center" gap="$1">
        <Clock size={12} color="#FF551A" />
        <Text fontSize={10} fontWeight="700" color="#FF551A">Pendiente</Text>
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
                      <Row label="Fecha de ingreso" value={prettyDate(h.EntryDate)} />
                      {h.Used && (
                        <Row label="Ingresó" value={fmtDateTime(h.UsedAt)} highlight />
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
                        Ingreso: {prettyDate(selected.EntryDate)}
                      </Text>
                    </YStack>
                  </ViewShot>

                  {/* Banner de estado */}
                  {selected.Used ? (
                    <YStack
                      width="100%"
                      backgroundColor="rgba(229,57,53,0.12)"
                      borderColor="#E53935"
                      borderWidth={1}
                      borderRadius="$4"
                      padding="$3"
                      gap="$1"
                    >
                      <XStack alignItems="center" gap="$2">
                        <TriangleAlert size={18} color="#E53935" />
                        <Text fontWeight="800" fontSize={14} color="#E53935">
                          Pase usado
                        </Text>
                      </XStack>
                      <Text fontSize={12} color="#E53935">
                        La persona ya ingresó el {fmtDateTime(selected.UsedAt)}
                      </Text>
                    </YStack>
                  ) : (
                    <XStack
                      width="100%"
                      backgroundColor="rgba(255,85,26,0.10)"
                      borderRadius="$4"
                      padding="$3"
                      alignItems="center"
                      gap="$2"
                    >
                      <Clock size={18} color="#FF551A" />
                      <Text fontWeight="700" fontSize={14} color="$primary">
                        Pendiente de ingreso
                      </Text>
                    </XStack>
                  )}

                  <YStack width="100%" gap="$1.5">
                    <Row label="Personas" value={selected.Personas} />
                    <Row label="Visita a" value={selected.VisitTo} />
                    <Row label="Motivo" value={selected.Motivo === 'Otros' && selected.VisitReasonOther ? selected.VisitReasonOther : selected.Motivo} />
                    <Row label="Fecha de ingreso" value={prettyDate(selected.EntryDate)} />
                  </YStack>

                  {/* Acciones solo si el pase sigue pendiente */}
                  {!selected.Used && (
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
