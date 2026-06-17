import React, { useEffect, useRef, useState } from 'react'
import { Platform, PermissionsAndroid } from 'react-native'
import { YStack, XStack, Text, Button, View, ScrollView, Spinner } from 'tamagui'
import { Plus, X, QrCode, Share2, RotateCcw, Users, TriangleAlert, Calendar, Download } from 'lucide-react-native'
import QRCode from 'react-native-qrcode-svg'
import Share from 'react-native-share'
import ViewShot, { captureRef } from 'react-native-view-shot'
import { CameraRoll } from '@react-native-camera-roll/camera-roll'
import DateTimePicker from '@react-native-community/datetimepicker'
import { useNavigation } from '@react-navigation/native'
import Page from '../../components/commons/Page'
import AppInput from '../../components/commons/AppInput'
import AppSelect from '../../components/commons/AppSelect'
import { usePageHeader } from '../../hooks/usePageHeader'
import { useAuth } from '../../context/AuthContext'
import { useShowToast } from '../../utils/useShowToast'
import { visitasService } from '../../api/modules/visitas/visitas.service'
import { IGenerarVisita, IMotivo } from '../../api/modules/visitas/visitas.types'
import { ExecutionResponse } from '../../api/modules/response.type'
import { handleError } from '../../utils/errorHandler'

const LOGO = require('../../assets/logo.png')

type Generated = {
  token: string
  personas: string[]
  visitTo: string
  motivo: string
  entryDate: string
}

const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// "YYYY-MM-DD" -> "DD/MM/YYYY"
const prettyDate = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}

export default function VisitasGenerarScreen() {
  const { user, theme } = useAuth()
  const { showToast } = useShowToast()
  const navigation = useNavigation()

  const [personas, setPersonas] = useState<string[]>([''])
  const [visitTo, setVisitTo] = useState('')
  const [motivoId, setMotivoId] = useState<number | undefined>(undefined)
  const [visitReasonOther, setVisitReasonOther] = useState('')
  const [entryDate, setEntryDate] = useState<Date>(new Date())
  const [showPicker, setShowPicker] = useState(false)
  const [motivos, setMotivos] = useState<IMotivo[]>([])
  const [loadingGen, setLoadingGen] = useState(false)
  const [result, setResult] = useState<Generated | null>(null)
  const [busyAction, setBusyAction] = useState<'share' | 'save' | null>(null)
  const viewShotRef = useRef<any>(null)

  usePageHeader({
    center: (
      <Text fontSize="$4" fontWeight="700" color="$text">
        Generar Pase
      </Text>
    ),
  })

  useEffect(() => {
    ;(async () => {
      try {
        const resp: ExecutionResponse<IMotivo[]> = await visitasService.getMotivos()
        if (resp.Success) setMotivos(resp.Data ?? [])
      } catch (err) {
        const e = handleError(err)
        showToast('error', 'Error', e.message, 4000, 'bottom')
      }
    })()
  }, [])

  const selectedMotivo = motivos.find((m) => m.Id === motivoId)
  const isOtros = (selectedMotivo?.Name ?? '').toLowerCase() === 'otros'

  // ── Personas ──────────────────────────────────────────────
  const addPersona = () => setPersonas((prev) => [...prev, ''])
  const updatePersona = (i: number, val: string) =>
    setPersonas((prev) => prev.map((p, idx) => (idx === i ? val : p)))
  const removePersona = (i: number) =>
    setPersonas((prev) => prev.filter((_, idx) => idx !== i))

  // ── Generar ───────────────────────────────────────────────
  const generar = async () => {
    const cleanPersonas = personas.map((p) => p.trim()).filter(Boolean)
    if (cleanPersonas.length === 0)
      return showToast('error', 'Validación', 'Agrega al menos una persona', 4000, 'bottom')
    if (!visitTo.trim())
      return showToast('error', 'Validación', 'Indica a quién visita', 4000, 'bottom')
    if (!motivoId)
      return showToast('error', 'Validación', 'Selecciona el motivo de la visita', 4000, 'bottom')
    if (isOtros && !visitReasonOther.trim())
      return showToast('error', 'Validación', 'Especifica el motivo de la visita', 4000, 'bottom')

    setLoadingGen(true)
    try {
      const payload: IGenerarVisita = {
        VisitTo: visitTo.trim(),
        Motivo_Id: motivoId,
        VisitReasonOther: isOtros ? visitReasonOther.trim() : null,
        EntryDate: fmtDate(entryDate),
        Create_By: user?.Code ?? '',
        Personas: cleanPersonas,
      }
      const resp = await visitasService.generar(payload)
      if (resp.Success && resp.Data?.Token) {
        setResult({
          token: resp.Data.Token,
          personas: cleanPersonas,
          visitTo: visitTo.trim(),
          motivo: isOtros ? visitReasonOther.trim() : selectedMotivo?.Name ?? '',
          entryDate: fmtDate(entryDate),
        })
      } else {
        showToast('error', 'Error', resp.ErrorMessage || 'No se pudo generar el pase', 5000, 'bottom')
      }
    } catch (err) {
      const e = handleError(err)
      showToast('error', 'Error', e.message, 5000, 'bottom')
    }
    setLoadingGen(false)
  }

  // Captura la tarjeta del QR a un archivo PNG temporal (imagen real).
  // Usa el método capture() del componente (más confiable en Android/Fabric) con
  // un timeout para que nunca quede colgado.
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

  // ── Compartir (hoja del SO: WhatsApp, Guardar imagen, etc.) ──
  const compartir = async () => {
    if (!result || busyAction) return
    setBusyAction('share')
    try {
      const uri = await capturarQr()
      if (!uri) {
        showToast('error', 'Error', 'No se pudo generar la imagen del QR', 4000, 'bottom')
        return
      }
      const personasList = result.personas.join(', ')
      const message = `🔐 Pase de acceso para: ${personasList}\n📅 Fecha: ${result.entryDate}\n⚠️ Código de uso único`
      await Share.open({ title: 'Pase de Acceso QR', message, url: uri, type: 'image/png', failOnCancel: false })
    } catch {
      // cancelar la hoja de compartir no es error
    } finally {
      setBusyAction(null)
    }
  }

  // ── Guardar en galería (CameraRoll) ──
  const guardar = async () => {
    if (!result || busyAction) return
    setBusyAction('save')
    try {
      if (Platform.OS === 'android' && Number(Platform.Version) <= 29) {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE
        )
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

  const nuevo = () => {
    setResult(null)
    setPersonas([''])
    setVisitTo('')
    setMotivoId(undefined)
    setVisitReasonOther('')
    setEntryDate(new Date())
  }

  // Cierra el resultado: limpia el formulario y regresa a la pantalla anterior
  const cerrar = () => {
    nuevo()
    if (navigation.canGoBack()) navigation.goBack()
  }

  // ════════════════════════ RESULTADO (QR) ════════════════════════
  if (result) {
    return (
      <Page>
        <ScrollView flex={1} showsVerticalScrollIndicator={false} backgroundColor="$backgroundPage">
          <YStack padding="$4" gap="$4" alignItems="center">
            <XStack width="100%" justifyContent="flex-end">
              <View
                onPress={cerrar}
                pressStyle={{ opacity: 0.6 }}
                width={36}
                height={36}
                borderRadius={18}
                backgroundColor="$backgroundElevated"
                justifyContent="center"
                alignItems="center"
              >
                <X size={20} color="#94A3B8" />
              </View>
            </XStack>
            <YStack
              backgroundColor="$backgroundElevated"
              borderRadius="$6"
              padding="$5"
              alignItems="center"
              gap="$4"
              width="100%"
              shadowColor="#000"
              shadowOffset={{ width: 0, height: 4 }}
              shadowOpacity={0.1}
              shadowRadius={12}
              elevation={4}
            >
              <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1, result: 'tmpfile' }}>
                <YStack
                  backgroundColor="white"
                  paddingVertical={18}
                  paddingHorizontal={16}
                  borderRadius="$4"
                  alignItems="center"
                  gap={10}
                  collapsable={false}
                >
                  <Text color="#1A1A2E" fontWeight="800" fontSize={20} letterSpacing={3}>
                    INTERMODA
                  </Text>
                  <QRCode
                    value={result.token}
                    size={220}
                    logo={LOGO}
                    logoSize={46}
                    logoBackgroundColor="white"
                    logoBorderRadius={8}
                    quietZone={6}
                  />
                  <Text color="#1A1A2E" fontWeight="700" fontSize={15}>
                    Ingreso: {prettyDate(result.entryDate)}
                  </Text>
                </YStack>
              </ViewShot>

              <YStack gap="$2" width="100%">
                <Text fontSize={12} fontWeight="700" color="$textMuted">
                  PERSONAS
                </Text>
                <XStack flexWrap="wrap" gap="$2">
                  {result.personas.map((p, i) => (
                    <View
                      key={i}
                      backgroundColor="rgba(255, 85, 26, 0.12)"
                      paddingHorizontal="$3"
                      paddingVertical="$1.5"
                      borderRadius="$10"
                    >
                      <Text fontSize={13} color="$primary" fontWeight="600">
                        {p}
                      </Text>
                    </View>
                  ))}
                </XStack>

                <InfoRow label="Visita a" value={result.visitTo} />
                <InfoRow label="Motivo" value={result.motivo} />
                <InfoRow label="Fecha de ingreso" value={result.entryDate} />

                <XStack alignItems="center" gap="$2" marginTop="$2">
                  <TriangleAlert size={15} color="#E53935" />
                  <Text fontSize={12} color="#E53935" fontWeight="700">
                    Código de uso único
                  </Text>
                </XStack>
              </YStack>
            </YStack>

            <Button
              width="100%"
              height={48}
              backgroundColor="#25D366"
              borderRadius="$4"
              pressStyle={{ opacity: 0.85 }}
              onPress={compartir}
              icon={busyAction === 'share' ? <Spinner color="white" /> : <Share2 size={18} color="white" />}
            >
              <Text color="white" fontWeight="700">
                Compartir
              </Text>
            </Button>

            <Button
              width="100%"
              height={48}
              backgroundColor="$primary"
              borderRadius="$4"
              pressStyle={{ opacity: 0.85 }}
              onPress={guardar}
              icon={busyAction === 'save' ? <Spinner color="white" /> : <Download size={18} color="white" />}
            >
              <Text color="white" fontWeight="700">
                Guardar en galería
              </Text>
            </Button>

            <Button
              width="100%"
              height={46}
              backgroundColor="$buttonSecondary"
              borderRadius="$4"
              pressStyle={{ opacity: 0.7 }}
              onPress={nuevo}
              icon={<RotateCcw size={17} color="#94A3B8" />}
            >
              <Text color="$text" fontWeight="700">
                Generar otro pase
              </Text>
            </Button>
          </YStack>
        </ScrollView>
      </Page>
    )
  }

  // ════════════════════════ FORMULARIO ════════════════════════
  return (
    <Page>
      <ScrollView flex={1} showsVerticalScrollIndicator={false} backgroundColor="$backgroundPage">
        <YStack padding="$4" gap="$3">
          {/* Personas */}
          <YStack gap="$2">
            <XStack alignItems="center" gap="$2">
              <Users size={16} color="#94A3B8" />
              <Text fontSize={13} fontWeight="700" color="$textMuted">
                Personas en el pase
              </Text>
            </XStack>
            {personas.map((p, i) => (
              <AppInput
                key={i}
                label={`Persona ${i + 1}`}
                value={p}
                onChangeText={(t: string) => updatePersona(i, t)}
                rightElement={
                  personas.length > 1 ? (
                    <View onPress={() => removePersona(i)} pressStyle={{ opacity: 0.6 }} padding="$2">
                      <X size={18} color="#E53935" />
                    </View>
                  ) : undefined
                }
              />
            ))}
            <Button
              alignSelf="flex-start"
              height={36}
              backgroundColor="transparent"
              borderWidth={1}
              borderColor="$primary"
              borderRadius="$3"
              pressStyle={{ opacity: 0.7 }}
              onPress={addPersona}
              icon={<Plus size={16} color="#FF551A" />}
            >
              <Text color="$primary" fontWeight="700" fontSize={13}>
                Agregar persona
              </Text>
            </Button>
          </YStack>

          <AppInput label="A quién visita" value={visitTo} onChangeText={setVisitTo} />

          <AppSelect
            label="Motivo de la visita"
            value={motivoId !== undefined ? String(motivoId) : undefined}
            onValueChange={(val) => setMotivoId(Number(val))}
            options={motivos.map((m) => ({ label: m.Name, value: String(m.Id) }))}
          />

          {isOtros && (
            <AppInput
              label="Especifica el motivo"
              value={visitReasonOther}
              onChangeText={setVisitReasonOther}
            />
          )}

          {/* Fecha de ingreso */}
          <YStack gap="$1">
            <View
              onPress={() => setShowPicker((s) => !s)}
              pressStyle={{ opacity: 0.7 }}
              backgroundColor="$background"
              borderWidth={1}
              borderColor="$border"
              borderRadius={6}
              height={46}
              paddingHorizontal="$3"
              flexDirection="row"
              alignItems="center"
              justifyContent="space-between"
            >
              <YStack>
                <Text fontSize={11} color="$textMuted">
                  Fecha de ingreso
                </Text>
                <Text fontSize={15} color="$text">
                  {entryDate.toLocaleDateString('es-HN')}
                </Text>
              </YStack>
              <Calendar size={18} color="#94A3B8" />
            </View>
            {showPicker && (
              <View backgroundColor="$backgroundElevated" borderRadius="$4" padding="$2" marginTop="$2">
                <DateTimePicker
                  value={entryDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  minimumDate={new Date()}
                  themeVariant={theme === 'dark' ? 'dark' : 'light'}
                  accentColor="#FF551A"
                  onChange={(_, d) => {
                    if (Platform.OS !== 'ios') setShowPicker(false)
                    if (d) setEntryDate(d)
                  }}
                />
                {Platform.OS === 'ios' && (
                  <Button
                    alignSelf="flex-end"
                    height={34}
                    backgroundColor="$primary"
                    borderRadius="$3"
                    pressStyle={{ opacity: 0.7 }}
                    onPress={() => setShowPicker(false)}
                  >
                    <Text color="white" fontWeight="700" fontSize={13}>
                      Listo
                    </Text>
                  </Button>
                )}
              </View>
            )}
          </YStack>

          <Button
            marginTop="$3"
            height={48}
            backgroundColor="$primary"
            borderRadius="$4"
            pressStyle={{ opacity: 0.7 }}
            onPress={generar}
            disabled={loadingGen}
            opacity={loadingGen ? 0.6 : 1}
            icon={loadingGen ? <Spinner color="white" /> : <QrCode size={18} color="white" />}
          >
            <Text color="white" fontWeight="700">
              {loadingGen ? 'Generando...' : 'Generar QR'}
            </Text>
          </Button>
        </YStack>
      </ScrollView>
    </Page>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <XStack justifyContent="space-between" marginTop="$1.5">
      <Text fontSize={13} color="$textMuted">
        {label}
      </Text>
      <Text fontSize={13} color="$text" fontWeight="600" flexShrink={1} textAlign="right">
        {value}
      </Text>
    </XStack>
  )
}
