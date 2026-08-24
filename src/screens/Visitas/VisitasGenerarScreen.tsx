import React, { useEffect, useRef, useState } from 'react'
import { Platform, PermissionsAndroid, KeyboardAvoidingView, Keyboard, ScrollView as RNScrollView, Dimensions } from 'react-native'
import { YStack, XStack, Text, Button, View, ScrollView, Spinner } from 'tamagui'
import { Plus, X, QrCode, Share2, RotateCcw, Users, TriangleAlert, Calendar, Download, Repeat, CalendarRange, Clock, Moon, IdCard } from 'lucide-react-native'
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
import { IGenerarVisita, IHorario, IHorarioDetalle, IMotivo } from '../../api/modules/visitas/visitas.types'
import { ExecutionResponse } from '../../api/modules/response.type'
import { handleError } from '../../utils/errorHandler'
import {
  contarVentanas,
  cruzaMedianoche,
  diasHabilitadosPorHorario,
  duracionVentana,
  etiquetaDias,
  fmtDuracion,
  fmtHora,
  horaADate,
  horaAMinutos,
  resumenHorario,
} from './horarios'
import { NIVEL_QR, cargarLogosEmpresa, logoDe, tamanoLogo } from './logoEmpresa'

// El logo del QR ya NO es fijo: sale del catálogo, según la empresa del pase
// (ver logoEmpresa.ts). El parque tiene más de una empresa.

type Generated = {
  token: string
  personas: string[]
  visitTo: string
  motivo: string
  entryDate: string
  isRecurrent: boolean
  dias: string[]
  /** Nombre del horario aplicado; null = día completo, sin restricción de hora */
  horario: string | null
  /** Resumen legible de las ventanas ("Lun-Vie 08:00-17:00") */
  horarioResumen: string | null
  /** Se le pedirá el documento al entrar */
  requiereId: boolean
  /** El documento se pide en CADA entrada (si no, una lectura respalda el pase) */
  idCadaEntrada: boolean
  /** Empresa del parque dueña del pase: define el nombre y el logo de la tarjeta */
  empresa: string | null
  empresaCode: string | null
}

const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// "YYYY-MM-DD" -> "DD/MM/YYYY"
const prettyDate = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}

// Texto de vigencia para un pase ya generado
const vigenciaTexto = (g: Generated) => {
  if (g.isRecurrent && g.dias.length > 1) {
    const sorted = [...g.dias].sort()
    return `${prettyDate(sorted[0])} – ${prettyDate(sorted[sorted.length - 1])}`
  }
  return prettyDate(g.dias[0] ?? g.entryDate)
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
  // Recurrente
  const [isRecurrent, setIsRecurrent] = useState(false)
  const [recurMode, setRecurMode] = useState<'rango' | 'dias'>('rango')
  const [startDate, setStartDate] = useState<Date>(new Date())
  const [endDate, setEndDate] = useState<Date>(new Date())
  const [diasList, setDiasList] = useState<string[]>([])
  // Qué picker está abierto: 'single' | 'start' | 'end' | 'add' | null
  const [pickerFor, setPickerFor] = useState<'single' | 'start' | 'end' | 'add' | null>(null)
  const [addTemp, setAddTemp] = useState<Date>(new Date()) // día en edición (modo "agregar día" en iOS)
  const [motivos, setMotivos] = useState<IMotivo[]>([])
  // Horario de visita: define en qué ventana de hora se puede entrar/permanecer.
  const [horarios, setHorarios] = useState<IHorario[]>([])
  const [horarioId, setHorarioId] = useState<number | undefined>(undefined)
  // Detalle del horario elegido: se usa para previsualizar qué días del rango
  // quedan REALMENTE habilitados (un horario L-V sobre lunes-a-domingo son 5).
  const [horarioDetalle, setHorarioDetalle] = useState<IHorarioDetalle[]>([])
  // Ventana escrita a mano, para no obligar a crear un horario en el catálogo.
  // Se usa solo cuando el selector está en 'personalizado'.
  const [horaPersonalizada, setHoraPersonalizada] = useState(false)
  const [horaDesde, setHoraDesde] = useState('09:00')
  const [horaHasta, setHoraHasta] = useState('18:00')
  const [pickerHora, setPickerHora] = useState<'desde' | 'hasta' | null>(null)
  // ¿Se le pide el documento al entrar? Encendido por defecto: pedir ID es el
  // criterio seguro, y quien genera el pase lo baja si no aplica.
  const [requiereId, setRequiereId] = useState(true)
  // Apagado por omisión: una lectura legible respalda todo el pase. Pedir el
  // documento en cada entrada es el respaldo extra y se elige a propósito.
  const [idCadaEntrada, setIdCadaEntrada] = useState(false)
  const [logos, setLogos] = useState<Record<string, any> | null>(null)
  const [loadingGen, setLoadingGen] = useState(false)
  const [result, setResult] = useState<Generated | null>(null)
  const [busyAction, setBusyAction] = useState<'share' | 'save' | null>(null)
  const viewShotRef = useRef<any>(null)
  // Alto del teclado. En Android con New Arch + edge-to-edge el teclado se dibuja
  // ENCIMA sin achicar la ventana, así que KeyboardAvoidingView no alcanza: se
  // reserva ese alto como paddingBottom del ScrollView para poder scrollear por
  // encima. En iOS basta el KAV con behavior="padding".
  const [kbHeight, setKbHeight] = useState(0)
  const scrollRef = useRef<RNScrollView>(null)

  usePageHeader({
    center: (
      <Text fontSize="$4" fontWeight="700" color="$text">
        Generar Pase
      </Text>
    ),
  })

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) =>
      setKbHeight(e.endCoordinates?.height ?? 0)
    )
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0))
    return () => {
      showSub.remove()
      hideSub.remove()
    }
  }, [])

  // Sube el campo enfocado por encima del teclado. Mide el campo contra la
  // ventana y desplaza SOLO el solape, para no dejar el hueco enorme que deja un
  // scrollToEnd. El delay deja que el paddingBottom ya esté aplicado.
  const scrollY = useRef(0)
  const subirCampo = (e: any) => {
    const node = e?.target
    setTimeout(() => {
      const alto = Dimensions.get('window').height
      const kb = kbHeight || alto * 0.4 // en el primer foco el alto aún no llegó
      const bordeTeclado = alto - kb
      if (node?.measureInWindow) {
        node.measureInWindow((_x: number, y: number, _w: number, h: number) => {
          const solape = y + h + 24 - bordeTeclado
          if (solape > 0) {
            scrollRef.current?.scrollTo({ y: scrollY.current + solape, animated: true })
          }
        })
      }
    }, 140)
  }

  useEffect(() => {
    ;(async () => {
      try {
        const [respMot, respHor] = await Promise.all([
          visitasService.getMotivos() as Promise<ExecutionResponse<IMotivo[]>>,
          visitasService.getHorarios(true),
        ])
        if (respMot.Success) setMotivos(respMot.Data ?? [])
        if (respHor.Success) setHorarios(respHor.Data ?? [])
      } catch (err) {
        const e = handleError(err)
        showToast('error', 'Error', e.message, 4000, 'bottom')
      }
    })()
  }, [])

  useEffect(() => {
    cargarLogosEmpresa().then(setLogos)
  }, [])

  // Trae las ventanas del horario elegido para poder previsualizar los días
  // habilitados y avisar si el rango no casa con ningún día del horario.
  useEffect(() => {
    if (!horarioId) {
      setHorarioDetalle([])
      return
    }
    let vivo = true
    ;(async () => {
      try {
        const resp = await visitasService.getHorarioDetalle(horarioId)
        if (vivo && resp.Success) setHorarioDetalle(resp.Data ?? [])
      } catch {
        if (vivo) setHorarioDetalle([])
      }
    })()
    return () => {
      vivo = false
    }
  }, [horarioId])

  const selectedHorario = horarios.find((h) => h.Id === horarioId)
  const selectedMotivo = motivos.find((m) => m.Id === motivoId)
  const isOtros = (selectedMotivo?.Name ?? '').toLowerCase() === 'otros'

  // ── Personas ──────────────────────────────────────────────
  const addPersona = () => setPersonas((prev) => [...prev, ''])
  const updatePersona = (i: number, val: string) =>
    setPersonas((prev) => prev.map((p, idx) => (idx === i ? val : p)))
  const removePersona = (i: number) =>
    setPersonas((prev) => prev.filter((_, idx) => idx !== i))

  // Días crudos que el usuario pidió (antes de cruzarlos con el horario)
  const buildDias = (): string[] => {
    if (!isRecurrent) return [fmtDate(entryDate)]
    if (recurMode === 'rango') {
      const out: string[] = []
      const cur = new Date(startDate); cur.setHours(0, 0, 0, 0)
      const end = new Date(endDate); end.setHours(0, 0, 0, 0)
      while (cur <= end) {
        out.push(fmtDate(cur))
        cur.setDate(cur.getDate() + 1)
      }
      return out
    }
    return [...diasList].sort()
  }

  // Días que el horario REALMENTE habilita. Antes el rango se expandía completo,
  // fines de semana incluidos, así que un horario L-V daba acceso sábado y
  // domingo. El backend descarta esos días; acá se muestra lo mismo para que el
  // contador no mienta.
  const diasEfectivos = (): string[] => diasHabilitadosPorHorario(buildDias(), horarioDetalle)

  // Agrega un día a la lista (modo días específicos), sin duplicar
  const addDia = (d: Date) => {
    const iso = fmtDate(d)
    setDiasList((prev) => (prev.includes(iso) ? prev : [...prev, iso].sort()))
  }
  const removeDia = (iso: string) => setDiasList((prev) => prev.filter((x) => x !== iso))

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
    if (isRecurrent && recurMode === 'rango' && endDate < startDate)
      return showToast('error', 'Validación', 'La fecha "Hasta" no puede ser anterior a "Desde"', 4000, 'bottom')
    if (isRecurrent && recurMode === 'dias' && diasList.length === 0)
      return showToast('error', 'Validación', 'Selecciona al menos un día', 4000, 'bottom')

    if (horaPersonalizada && horaAMinutos(horaDesde) === horaAMinutos(horaHasta))
      return showToast('error', 'Validación', 'La hora de inicio y la de fin no pueden ser iguales', 4000, 'bottom')

    const dias = buildDias()
    // Si el horario no cubre ningún día elegido, el pase no autorizaría nada.
    // El backend lo rechaza igual, pero se avisa antes para no perder el viaje.
    const efectivos = diasHabilitadosPorHorario(dias, horarioDetalle)
    if (efectivos.length === 0)
      return showToast(
        'error',
        'Validación',
        `Las fechas elegidas no caen en ningún día de "${selectedHorario?.Name ?? 'el horario'}"`,
        5000,
        'bottom'
      )

    setLoadingGen(true)
    try {
      const payload: IGenerarVisita = {
        VisitTo: visitTo.trim(),
        Motivo_Id: motivoId,
        VisitReasonOther: isOtros ? visitReasonOther.trim() : null,
        EntryDate: dias[0],
        IsRecurrent: isRecurrent,
        Dias: dias,
        Horario_Id: horarioId ?? null,
        HoraDesde: horaPersonalizada ? horaDesde : null,
        HoraHasta: horaPersonalizada ? horaHasta : null,
        RequiereId: requiereId,
        // Solo tiene sentido si se pide documento; si no, el SP lo ignora igual.
        IdCadaEntrada: requiereId && idCadaEntrada,
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
          entryDate: efectivos[0],
          isRecurrent,
          dias: efectivos,
          horario: selectedHorario?.Name ?? (horaPersonalizada ? `Personalizado ${horaDesde}-${horaHasta}` : null),
          horarioResumen: horarioId
            ? resumenHorario(horarioDetalle)
            : horaPersonalizada
              ? `Todos los días ${horaDesde}-${horaHasta}`
              : null,
          requiereId,
          idCadaEntrada: requiereId && idCadaEntrada,
          empresa: user?.Empresa ?? null,
          empresaCode: user?.EmpresaCode ?? null,
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
      const vig = vigenciaTexto(result)
      const fechaLinea = result.isRecurrent
        ? `📅 Vigencia: ${vig} (${result.dias.length} días)`
        : `📅 Fecha: ${prettyDate(result.entryDate)}`
      // El horario se manda en el texto además de la imagen: es la parte que el
      // visitante necesita leer antes de salir de su casa.
      const horarioLinea = result.horarioResumen ? `\n🕐 Horario: ${result.horarioResumen}` : ''
      const message = `🔐 Pase de acceso para: ${personasList}\n${fechaLinea}${horarioLinea}`
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
    setHorarioId(undefined)
    setHorarioDetalle([])
    setRequiereId(true)
    setIdCadaEntrada(false)
    setHoraPersonalizada(false)
    setHoraDesde('09:00')
    setHoraHasta('18:00')
    setPickerHora(null)
    setEntryDate(new Date())
    setIsRecurrent(false)
    setRecurMode('rango')
    setStartDate(new Date())
    setEndDate(new Date())
    setDiasList([])
    setPickerFor(null)
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
                  {/* La empresa del PASE, no una fija: un pase de Chamer no
                      puede salir con el nombre de Intermoda encima. Se achica la
                      letra en los nombres largos para que no desborde. */}
                  <Text
                    color="#1A1A2E"
                    fontWeight="800"
                    fontSize={(result.empresa ?? 'INTERMODA').length > 12 ? 15 : 20}
                    letterSpacing={(result.empresa ?? 'INTERMODA').length > 12 ? 1.5 : 3}
                    textAlign="center"
                  >
                    {(result.empresa ?? 'Intermoda').toUpperCase()}
                  </Text>
                  <QRCode
                    value={result.token}
                    size={220}
                    logo={logoDe(logos, result.empresaCode)}
                    logoSize={tamanoLogo(220)}
                    logoBackgroundColor="white"
                    logoBorderRadius={8}
                    quietZone={6}
                    ecl={NIVEL_QR}
                  />
                  <Text color="#1A1A2E" fontWeight="700" fontSize={15}>
                    {result.isRecurrent ? 'Vigencia: ' : 'Ingreso: '}{vigenciaTexto(result)}
                  </Text>
                  {/* El horario va DENTRO de la tarjeta que se comparte: si el
                      visitante no lo ve, llega fuera de hora y lo rebotan. */}
                  {!!result.horarioResumen && (
                    <Text color="#1A1A2E" fontWeight="600" fontSize={12} textAlign="center">
                      {result.horarioResumen}
                    </Text>
                  )}
                  {result.isRecurrent && (
                    <Text color="#FF551A" fontWeight="700" fontSize={11} letterSpacing={1}>
                      PASE RECURRENTE · {result.dias.length} DÍAS
                    </Text>
                  )}
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
                <InfoRow label={result.isRecurrent ? 'Vigencia' : 'Fecha de ingreso'} value={vigenciaTexto(result)} />
                {result.isRecurrent && <InfoRow label="Días habilitados" value={`${result.dias.length}`} />}
                <InfoRow label="Horario" value={result.horario ?? 'Día completo'} />
                <InfoRow
                  label="Identificación"
                  value={
                    !result.requiereId
                      ? 'No se pide'
                      : result.idCadaEntrada
                        ? 'Documento en cada entrada'
                        : 'Documento una vez'
                  }
                />
                {!!result.horarioResumen && <InfoRow label="Ventanas" value={result.horarioResumen} />}

                <XStack alignItems="center" gap="$2" marginTop="$2">
                  {result.horario ? (
                    <>
                      <Clock size={15} color="#FF551A" />
                      <Text fontSize={12} color="$primary" fontWeight="700" flexShrink={1}>
                        Solo puede ingresar dentro del horario asignado
                      </Text>
                    </>
                  ) : result.isRecurrent ? (
                    <>
                      <Repeat size={15} color="#2E9E5B" />
                      <Text fontSize={12} color="#2E9E5B" fontWeight="700">
                        Pase recurrente · registra entrada/salida cada día
                      </Text>
                    </>
                  ) : (
                    <>
                      <Calendar size={15} color="#FF551A" />
                      <Text fontSize={12} color="$primary" fontWeight="700">
                        Registra entrada y salida del día
                      </Text>
                    </>
                  )}
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
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        // iOS: 'padding' funciona bien. Android: undefined — bajo edge-to-edge el
        // KAV no maneja el teclado; ahí lo resuelve el paddingBottom dinámico.
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <YStack flex={1} backgroundColor="$backgroundPage">
      {/* ScrollView NATIVO de RN y no el de tamagui: el ref de tamagui no expone
          el scroll de forma confiable, y acá se necesita para subir el campo
          enfocado por encima del teclado. */}
      <RNScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y }}
        scrollEventThrottle={16}
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: (Platform.OS === 'android' ? kbHeight : 0) + 24,
        }}
      >
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
                onFocus={subirCampo}
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

          <AppInput
            label="A quién visita"
            value={visitTo}
            onChangeText={setVisitTo}
            onFocus={subirCampo}
          />

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
              onFocus={subirCampo}
            />
          )}

          <Separador label="IDENTIFICACIÓN" Icon={IdCard} />

          {/* ── ¿Pedir documento al entrar? ──
              Cuando está encendido, al registrar la entrada el guardia debe
              fotografiar el documento y el servidor lo lee para verificar que
              el nombre corresponda a alguien del pase. */}
          <XStack alignItems="center" justifyContent="space-between" marginTop="$1" gap="$2">
            <XStack alignItems="center" gap="$2" flex={1}>
              <IdCard size={16} color="#94A3B8" />
              <YStack flex={1}>
                <Text fontSize={14} fontWeight="700" color="$text">Requiere identificación</Text>
                <Text fontSize={11} color="$textMuted">
                  Al entrar se le toma foto al documento y se verifica el nombre
                </Text>
              </YStack>
            </XStack>
            <View
              onPress={() => setRequiereId((v) => !v)}
              pressStyle={{ opacity: 0.8 }}
              width={48}
              height={28}
              borderRadius={14}
              backgroundColor={requiereId ? '$primary' : '$border'}
              padding={3}
              justifyContent="center"
            >
              <View
                width={22}
                height={22}
                borderRadius={11}
                backgroundColor="white"
                alignSelf={requiereId ? 'flex-end' : 'flex-start'}
              />
            </View>
          </XStack>

          {/* ── ¿En cada entrada, o una vez por pase? ──
              Solo aparece si se pide documento. Apagado significa que UNA lectura
              legible respalda todo el pase: un proveedor que viene cinco días
              entrega el documento una vez y no cada mañana, que en portería se
              paga en tiempo. Encendido es el respaldo entrada por entrada. */}
          {requiereId && (
            <XStack alignItems="center" justifyContent="space-between" marginTop="$2" gap="$2" paddingLeft="$5">
              <XStack alignItems="center" gap="$2" flex={1}>
                <Repeat size={14} color="#94A3B8" />
                <YStack flex={1}>
                  <Text fontSize={13} fontWeight="700" color="$text">Pedirlo en cada entrada</Text>
                  <Text fontSize={11} color="$textMuted">
                    {idCadaEntrada
                      ? 'Cada vez que entre se le pedirá el documento'
                      : 'Con una lectura legible queda respaldado todo el pase'}
                  </Text>
                </YStack>
              </XStack>
              <View
                onPress={() => setIdCadaEntrada((v) => !v)}
                pressStyle={{ opacity: 0.8 }}
                width={48}
                height={28}
                borderRadius={14}
                backgroundColor={idCadaEntrada ? '$primary' : '$border'}
                padding={3}
                justifyContent="center"
              >
                <View
                  width={22}
                  height={22}
                  borderRadius={11}
                  backgroundColor="white"
                  alignSelf={idCadaEntrada ? 'flex-end' : 'flex-start'}
                />
              </View>
            </XStack>
          )}

          <Separador label="FECHAS Y HORARIO" Icon={CalendarRange} />

          {/* Tipo de pase: único o recurrente */}
          <XStack alignItems="center" justifyContent="space-between" marginTop="$1" gap="$2">
            <XStack alignItems="center" gap="$2" flex={1}>
              <Repeat size={16} color="#94A3B8" />
              <YStack flex={1}>
                <Text fontSize={14} fontWeight="700" color="$text">Pase recurrente</Text>
                <Text fontSize={11} color="$textMuted">Para visitas de varios días (consultores, etc.)</Text>
              </YStack>
            </XStack>
            <View
              onPress={() => setIsRecurrent((v) => !v)}
              pressStyle={{ opacity: 0.8 }}
              width={48}
              height={28}
              borderRadius={14}
              backgroundColor={isRecurrent ? '$primary' : '$border'}
              padding={3}
              justifyContent="center"
            >
              <View width={22} height={22} borderRadius={11} backgroundColor="white" alignSelf={isRecurrent ? 'flex-end' : 'flex-start'} />
            </View>
          </XStack>

          {/* ÚNICO: una sola fecha */}
          {!isRecurrent && (
            <View
              onPress={() => setPickerFor((p) => (p === 'single' ? null : 'single'))}
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
                <Text fontSize={11} color="$textMuted">Fecha de ingreso</Text>
                <Text fontSize={15} color="$text">{entryDate.toLocaleDateString('es-HN')}</Text>
              </YStack>
              <Calendar size={18} color="#94A3B8" />
            </View>
          )}

          {/* RECURRENTE: rango o días específicos */}
          {isRecurrent && (
            <YStack gap="$2">
              <XStack borderRadius="$3" borderWidth={1} borderColor="$border" overflow="hidden">
                {(['rango', 'dias'] as const).map((m) => (
                  <View
                    key={m}
                    flex={1}
                    onPress={() => { setRecurMode(m); setPickerFor(null) }}
                    pressStyle={{ opacity: 0.7 }}
                    backgroundColor={recurMode === m ? '$primary' : 'transparent'}
                    paddingVertical="$2.5"
                    alignItems="center"
                  >
                    <Text color={recurMode === m ? 'white' : '$text'} fontWeight="700" fontSize={13}>
                      {m === 'rango' ? 'Rango de fechas' : 'Días específicos'}
                    </Text>
                  </View>
                ))}
              </XStack>

              {recurMode === 'rango' ? (
                <XStack gap="$2">
                  <View
                    flex={1}
                    onPress={() => setPickerFor((p) => (p === 'start' ? null : 'start'))}
                    pressStyle={{ opacity: 0.7 }}
                    backgroundColor="$background" borderWidth={1} borderColor="$border" borderRadius={6}
                    height={46} paddingHorizontal="$3" flexDirection="row" alignItems="center" justifyContent="space-between"
                  >
                    <YStack>
                      <Text fontSize={11} color="$textMuted">Desde</Text>
                      <Text fontSize={14} color="$text">{startDate.toLocaleDateString('es-HN')}</Text>
                    </YStack>
                    <CalendarRange size={16} color="#94A3B8" />
                  </View>
                  <View
                    flex={1}
                    onPress={() => setPickerFor((p) => (p === 'end' ? null : 'end'))}
                    pressStyle={{ opacity: 0.7 }}
                    backgroundColor="$background" borderWidth={1} borderColor="$border" borderRadius={6}
                    height={46} paddingHorizontal="$3" flexDirection="row" alignItems="center" justifyContent="space-between"
                  >
                    <YStack>
                      <Text fontSize={11} color="$textMuted">Hasta</Text>
                      <Text fontSize={14} color="$text">{endDate.toLocaleDateString('es-HN')}</Text>
                    </YStack>
                    <CalendarRange size={16} color="#94A3B8" />
                  </View>
                </XStack>
              ) : (
                <YStack gap="$2">
                  <Button
                    alignSelf="flex-start"
                    height={36}
                    backgroundColor="transparent"
                    borderWidth={1}
                    borderColor="$primary"
                    borderRadius="$3"
                    pressStyle={{ opacity: 0.7 }}
                    onPress={() => { setAddTemp(new Date()); setPickerFor('add') }}
                    icon={<Plus size={16} color="#FF551A" />}
                  >
                    <Text color="$primary" fontWeight="700" fontSize={13}>Agregar día</Text>
                  </Button>
                  <XStack flexWrap="wrap" gap="$2">
                    {diasList.length === 0 ? (
                      <Text fontSize={12} color="$textMuted">Aún no has agregado días.</Text>
                    ) : (
                      diasList.map((d) => (
                        <XStack key={d} backgroundColor="rgba(255,85,26,0.12)" paddingHorizontal="$3" paddingVertical="$1.5" borderRadius="$10" alignItems="center" gap="$1.5">
                          <Text fontSize={12} color="$primary" fontWeight="700">{prettyDate(d)}</Text>
                          <View onPress={() => removeDia(d)} pressStyle={{ opacity: 0.6 }}>
                            <X size={13} color="#FF551A" />
                          </View>
                        </XStack>
                      ))
                    )}
                  </XStack>
                </YStack>
              )}

              {(() => {
                const pedidos = buildDias()
                const efectivos = diasEfectivos()
                const descartados = pedidos.length - efectivos.length
                return (
                  <YStack gap="$1">
                    <Text fontSize={11} color="$textMuted">
                      {efectivos.length} día(s) habilitado(s)
                      {horarioId ? ` · ${contarVentanas(efectivos, horarioDetalle)} ventana(s)` : ''}
                    </Text>
                    {/* El rango se expande completo, pero el horario manda: los días
                        que no están en el horario no se habilitan. */}
                    {descartados > 0 && (
                      <XStack alignItems="center" gap="$1.5">
                        <TriangleAlert size={12} color="#E58E26" />
                        <Text fontSize={11} color="#E58E26" flexShrink={1}>
                          {descartados} día(s) quedan fuera: no están en el horario
                          {horarioDetalle.length > 0
                            ? ` (${etiquetaDias([...new Set(horarioDetalle.map((d) => d.DiaSemana))].sort((a, b) => a - b))})`
                            : ''}
                        </Text>
                      </XStack>
                    )}
                    {efectivos.length === 0 && pedidos.length > 0 && (
                      <Text fontSize={11} color="#E53935">
                        Con este horario el pase no autorizaría ningún día.
                      </Text>
                    )}
                  </YStack>
                )
              })()}
            </YStack>
          )}

          {/* Picker de fecha compartido */}
          {pickerFor && (
            <View backgroundColor="$backgroundElevated" borderRadius="$4" padding="$2" marginTop="$2">
              <DateTimePicker
                value={
                  pickerFor === 'single' ? entryDate
                    : pickerFor === 'start' ? startDate
                    : pickerFor === 'end' ? endDate
                    : addTemp
                }
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                minimumDate={new Date()}
                themeVariant={theme === 'dark' ? 'dark' : 'light'}
                accentColor="#FF551A"
                onChange={(_, d) => {
                  const isIOS = Platform.OS === 'ios'
                  if (!isIOS) setPickerFor(null)
                  if (!d) return
                  if (pickerFor === 'single') setEntryDate(d)
                  else if (pickerFor === 'start') { setStartDate(d); if (endDate < d) setEndDate(d) }
                  else if (pickerFor === 'end') setEndDate(d)
                  else if (pickerFor === 'add') {
                    if (isIOS) setAddTemp(d)
                    else addDia(d)
                  }
                }}
              />
              {Platform.OS === 'ios' && (
                <Button
                  alignSelf="flex-end"
                  height={34}
                  backgroundColor="$primary"
                  borderRadius="$3"
                  pressStyle={{ opacity: 0.7 }}
                  onPress={() => {
                    if (pickerFor === 'add') addDia(addTemp)
                    setPickerFor(null)
                  }}
                >
                  <Text color="white" fontWeight="700" fontSize={13}>
                    {pickerFor === 'add' ? 'Agregar' : 'Listo'}
                  </Text>
                </Button>
              )}
            </View>
          )}

          {/* ── Horario de visita ──
              Define la ventana de hora en la que se puede entrar y permanecer.
              Sin horario el pase vale el día completo (comportamiento anterior). */}
          {/* Elegir horario del catálogo, o escribir la hora a mano.
              El modo va en un interruptor y NO como última opción del dropdown:
              con 6 opciones la lista pasa de su alto máximo (220px / 44px por
              fila) y la última queda debajo del corte, solo alcanzable con
              scroll. Un cambio de modo no puede estar escondido ahí. */}
          <XStack alignItems="center" justifyContent="space-between" marginTop="$1" gap="$2">
            <XStack alignItems="center" gap="$2" flex={1}>
              <Clock size={16} color="#94A3B8" />
              <YStack flex={1}>
                <Text fontSize={14} fontWeight="700" color="$text">Hora personalizada</Text>
                <Text fontSize={11} color="$textMuted">
                  Escribir la hora en vez de usar un horario del catálogo
                </Text>
              </YStack>
            </XStack>
            <View
              onPress={() => {
                setHoraPersonalizada((v) => !v)
                setHorarioId(undefined)
                setPickerHora(null)
              }}
              pressStyle={{ opacity: 0.8 }}
              width={48}
              height={28}
              borderRadius={14}
              backgroundColor={horaPersonalizada ? '$primary' : '$border'}
              padding={3}
              justifyContent="center"
            >
              <View
                width={22}
                height={22}
                borderRadius={11}
                backgroundColor="white"
                alignSelf={horaPersonalizada ? 'flex-end' : 'flex-start'}
              />
            </View>
          </XStack>

          {/* Con la hora a mano el selector de catálogo se oculta: mostrar los
              dos a la vez dejaría dos fuentes de verdad sobre la misma ventana. */}
          {!horaPersonalizada && (
            <AppSelect
              label="Horario de visita"
              value={horarioId !== undefined ? String(horarioId) : '0'}
              onValueChange={(val) => setHorarioId(Number(val) === 0 ? undefined : Number(val))}
              options={[
                { label: 'Sin restricción de hora (día completo)', value: '0' },
                ...horarios.map((h) => ({ label: h.Name, value: String(h.Id) })),
              ]}
            />
          )}

          {/* ── Ventana escrita a mano ── */}
          {horaPersonalizada && (
            <YStack
              backgroundColor="$backgroundElevated"
              borderRadius="$4"
              padding="$3"
              gap="$2.5"
            >
              <XStack alignItems="center" gap="$2">
                <Clock size={14} color="#FF551A" />
                <Text fontSize={12} fontWeight="700" color="$text">
                  Hora del pase
                </Text>
              </XStack>

              <XStack gap="$2">
                {(['desde', 'hasta'] as const).map((campo) => (
                  <View
                    key={campo}
                    flex={1}
                    onPress={() => setPickerHora((p) => (p === campo ? null : campo))}
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
                        {campo === 'desde' ? 'Desde' : 'Hasta'}
                      </Text>
                      <Text fontSize={15} color="$text" fontWeight="600">
                        {campo === 'desde' ? horaDesde : horaHasta}
                      </Text>
                    </YStack>
                    <Clock size={16} color="#94A3B8" />
                  </View>
                ))}
              </XStack>

              {pickerHora && (
                <View backgroundColor="$backgroundSurface" borderRadius="$3" padding="$2">
                  <DateTimePicker
                    value={horaADate(pickerHora === 'desde' ? horaDesde : horaHasta)}
                    mode="time"
                    is24Hour
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    themeVariant={theme === 'dark' ? 'dark' : 'light'}
                    onChange={(_, d) => {
                      const isIOS = Platform.OS === 'ios'
                      if (!isIOS) setPickerHora(null)
                      if (!d) return
                      if (pickerHora === 'desde') setHoraDesde(fmtHora(d))
                      else setHoraHasta(fmtHora(d))
                    }}
                  />
                  {Platform.OS === 'ios' && (
                    <Button
                      alignSelf="flex-end"
                      height={32}
                      backgroundColor="$primary"
                      borderRadius="$3"
                      pressStyle={{ opacity: 0.7 }}
                      onPress={() => setPickerHora(null)}
                    >
                      <Text color="white" fontWeight="700" fontSize={12}>
                        Listo
                      </Text>
                    </Button>
                  )}
                </View>
              )}

              {/* Cruce de medianoche: no es error, pero tiene que quedar claro */}
              {cruzaMedianoche(horaDesde, horaHasta) ? (
                <XStack alignItems="center" gap="$2">
                  <Moon size={13} color="#2563EB" />
                  <Text fontSize={11} color="#2563EB" flexShrink={1}>
                    Cruza medianoche: cierra el día siguiente ·{' '}
                    {fmtDuracion(duracionVentana(horaDesde, horaHasta))}
                  </Text>
                </XStack>
              ) : (
                <Text fontSize={11} color="$textMuted">
                  Duración: {fmtDuracion(duracionVentana(horaDesde, horaHasta))}
                </Text>
              )}

              {/* Diferencia con el catálogo, que sí filtra por día de semana */}
              <Text fontSize={11} color="$textMuted">
                Esta hora aplica a todos los días que elijas. Si necesitás que
                cambie según el día de la semana, creá un horario en el catálogo.
              </Text>
            </YStack>
          )}

          {!!selectedHorario && (
            <YStack
              backgroundColor="$backgroundElevated"
              borderRadius="$3"
              padding="$3"
              gap="$1.5"
            >
              <XStack alignItems="center" gap="$2">
                <Clock size={14} color="#FF551A" />
                <Text fontSize={12} fontWeight="700" color="$text" flexShrink={1}>
                  {horarioDetalle.length > 0 ? resumenHorario(horarioDetalle) : selectedHorario.Resumen ?? '...'}
                </Text>
              </XStack>
              {selectedHorario.TieneNocturna && (
                <XStack alignItems="center" gap="$2">
                  <Moon size={12} color="#2563EB" />
                  <Text fontSize={11} color="#2563EB" flexShrink={1}>
                    Ventana nocturna: cierra a la mañana del día siguiente
                  </Text>
                </XStack>
              )}
              <Text fontSize={11} color="$textMuted">
                Fuera de este horario no se permite la entrada. La salida siempre se
                registra, y si se pasa de la hora queda marcada como fuera de horario.
              </Text>
            </YStack>
          )}

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
      </RNScrollView>
      </YStack>
      </KeyboardAvoidingView>
    </Page>
  )
}

// Separador de sección: etiqueta chica en mayúsculas + línea de 1px que llena
// el resto. Agrupa visualmente sin agregar cajas ni peso.
function Separador({ label, Icon }: { label: string; Icon?: any }) {
  return (
    <XStack alignItems="center" gap="$2" marginTop="$4" marginBottom="$1">
      {!!Icon && <Icon size={13} color="#94A3B8" />}
      <Text fontSize={11} fontWeight="800" color="$textMuted" letterSpacing={0.8}>
        {label}
      </Text>
      <View flex={1} height={1} backgroundColor="$border" />
    </XStack>
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
