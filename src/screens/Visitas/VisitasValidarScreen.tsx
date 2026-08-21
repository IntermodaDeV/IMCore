import React, { useEffect, useRef, useState } from 'react'
import { Platform, PermissionsAndroid, StyleSheet, Modal } from 'react-native'
import { YStack, XStack, Text, View, Button, Spinner, ScrollView } from 'tamagui'
import { Camera, CameraType } from 'react-native-camera-kit'
import { XCircle, TriangleAlert, ScanLine, Keyboard, RotateCcw, Users, X, LogIn, LogOut, Clock, AlarmClockOff, Timer, IdCard, Camera as CameraIcon, CheckCircle2, ShieldAlert } from 'lucide-react-native'
import { useNavigation, useFocusEffect, useIsFocused } from '@react-navigation/native'
import Page from '../../components/commons/Page'
import AppInput from '../../components/commons/AppInput'
import { usePageHeader } from '../../hooks/usePageHeader'
import { useAuth } from '../../context/AuthContext'
import { useShowToast } from '../../utils/useShowToast'
import { visitasService } from '../../api/modules/visitas/visitas.service'
import { IIdentificacionResult, IValidarResult } from '../../api/modules/visitas/visitas.types'
import { handleError } from '../../utils/errorHandler'
import { fmtDuracion } from './horarios'
import { launchCamera } from 'react-native-image-picker'

const prettyDate = (iso?: string | null) => {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}
const fmtDateTime = (iso?: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Solo la hora, para mostrar la ventana sin repetir la fecha
const fmtHoraCorta = (iso?: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' })
}

// Texto de la ventana: si cruza medianoche se muestra la fecha del cierre para
// que no parezca que cierra el mismo día.
const fmtVentana = (ini?: string | null, fin?: string | null) => {
  if (!ini || !fin) return ''
  const a = new Date(ini)
  const b = new Date(fin)
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return ''
  const mismoDia = a.toDateString() === b.toDateString()
  return mismoDia
    ? `${fmtHoraCorta(ini)} – ${fmtHoraCorta(fin)}`
    : `${fmtHoraCorta(ini)} – ${fmtHoraCorta(fin)} (${b.toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit' })})`
}

export default function VisitasValidarScreen() {
  const { user } = useAuth()
  const { showToast } = useShowToast()
  const navigation = useNavigation()

  const [hasPermission, setHasPermission] = useState<boolean | null>(null)
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<IValidarResult | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualToken, setManualToken] = useState('')
  const lockRef = useRef(false)
  const isFocused = useIsFocused()

  // ── Identificación del visitante ──
  // Cuando el pase la exige y se registró una ENTRADA, se le pide al guardia la
  // foto del documento. La imagen va al servidor, que la lee y coteja el nombre.
  const [idPaso, setIdPaso] = useState<'pedir' | 'enviando' | 'listo' | null>(null)
  // Cámara EMBEBIDA para el documento: se queda abierta entre intentos, así el
  // guardia ve el veredicto sobre el visor y corrige el encuadre sin salir.
  const [idCamaraAbierta, setIdCamaraAbierta] = useState(false)
  const idCamRef = useRef<any>(null)
  const [idResultado, setIdResultado] = useState<IIdentificacionResult | null>(null)
  const [idIntentos, setIdIntentos] = useState(0)

  usePageHeader({
    center: (
      <Text fontSize="$4" fontWeight="700" color="$text">
        Validar Acceso
      </Text>
    ),
  })

  useEffect(() => {
    ;(async () => {
      if (Platform.OS === 'android') {
        try {
          const g = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA)
          setHasPermission(g === PermissionsAndroid.RESULTS.GRANTED)
        } catch {
          setHasPermission(false)
        }
      } else {
        setHasPermission(true) // iOS pide permiso al montar la cámara (NSCameraUsageDescription)
      }
    })()
  }, [])

  // Cada vez que la pantalla gana foco (ej. al volver desde Home), reinicia el
  // estado para poder escanear de nuevo. Sin esto, el Drawer mantiene la
  // pantalla montada con el resultado anterior y el lock activo, y la cámara
  // "no hace nada" hasta cerrar la app por completo.
  useFocusEffect(
    React.useCallback(() => {
      setResult(null)
      setProcessing(false)
      limpiarId()
      lockRef.current = false
      return () => {
        lockRef.current = false
      }
    }, [])
  )

  const validar = async (token: string) => {
    const tk = (token || '').trim()
    if (!tk) return
    setProcessing(true)
    try {
      const resp = await visitasService.validar(tk, user?.Code ?? '')
      if (resp.Success && resp.Data) {
        setResult(resp.Data)
        // El documento se pide solo al ENTRAR y solo si el pase lo exige.
        // El backend manda RequiereId=1 únicamente en ese caso.
        if (resp.Data.Reason === 'entrada' && resp.Data.RequiereId && resp.Data.AccesoId) {
          setIdPaso('pedir')
          setIdIntentos(0)
          setIdResultado(null)
        }
      } else {
        showToast('error', 'Error', resp.ErrorMessage || 'No se pudo validar el pase', 4000, 'bottom')
      }
    } catch (err) {
      showToast('error', 'Error', handleError(err).message, 4000, 'bottom')
    }
    setProcessing(false)
  }

  const onReadCode = (event: any) => {
    if (lockRef.current || processing || result) return
    const code = event?.nativeEvent?.codeStringValue
    if (!code) return
    lockRef.current = true
    validar(code)
  }

  const limpiarId = () => {
    setIdPaso(null)
    setIdResultado(null)
    setIdIntentos(0)
    setIdCamaraAbierta(false)
  }

  const escanearOtro = () => {
    setResult(null)
    limpiarId()
    lockRef.current = false
  }

  // Cierra el resultado/cámara y regresa. En el Drawer puede no haber back stack,
  // así que si no se puede volver, navega al Home.
  const cerrar = () => {
    setResult(null)
    limpiarId()
    lockRef.current = false
    if (navigation.canGoBack()) navigation.goBack()
    else (navigation as any).navigate('inicio')
  }

  // Captura con la cámara EMBEBIDA y manda la foto al servidor.
  //
  // Se usa multipart y no base64 porque camera-kit devuelve un URI de archivo;
  // FormData con ese URI es lo que RN maneja nativo, sin conversiones frágiles.
  // La cámara NO se cierra: el veredicto se muestra encima del visor para poder
  // corregir el encuadre y volver a disparar en el mismo lugar.
  const capturarId = async (omitir = false) => {
    const accesoId = result?.AccesoId
    if (!accesoId) return

    let uri: string | null = null
    if (!omitir) {
      try {
        const foto = await idCamRef.current?.capture?.()
        if (!foto?.uri) {
          showToast('error', 'Cámara', 'No se obtuvo la imagen', 4000, 'bottom')
          return
        }
        uri = foto.uri
      } catch (err) {
        showToast('error', 'Error', handleError(err).message, 4000, 'bottom')
        return
      }
    }

    const intento = omitir ? idIntentos : idIntentos + 1
    setIdIntentos(intento)
    setIdPaso('enviando')
    try {
      const resp = await visitasService.guardarIdentificacionFoto({
        VisitaAcceso_Id: accesoId,
        Intentos: intento,
        OmitirPorGuardia: omitir,
        Create_By: user?.Code ?? '',
        fotoUri: uri,
        fotoMime: 'image/jpeg',
      })
      if (resp.Success && resp.Data) {
        setIdResultado(resp.Data)
        setIdPaso(resp.Data.ReintentarFoto ? 'pedir' : 'listo')
        // Solo se cierra el visor cuando ya no hay que volver a disparar.
        if (!resp.Data.ReintentarFoto) setIdCamaraAbierta(false)
      } else {
        showToast('error', 'Error', resp.ErrorMessage || 'No se pudo guardar la identificación', 5000, 'bottom')
        setIdPaso('pedir')
      }
    } catch (err) {
      showToast('error', 'Error', handleError(err).message, 5000, 'bottom')
      setIdPaso('pedir')
    }
  }

  const submitManual = async () => {
    if (!manualToken.trim()) return
    setManualOpen(false)
    lockRef.current = true
    await validar(manualToken)
  }

  // ── Estilo del resultado ──
  const estado = (() => {
    if (!result) return null
    if (result.Reason === 'entrada') return { color: '#2E9E5B', bg: 'rgba(46,158,91,0.12)', Icon: LogIn, title: 'Entrada registrada' }
    if (result.Reason === 'salida') return { color: '#2563EB', bg: 'rgba(37,99,235,0.12)', Icon: LogOut, title: 'Salida registrada' }
    // Salida fuera de horario: la salida SÍ se registró (nunca se bloquea, si no
    // se perdería el tiempo adentro), pero se muestra en ámbar porque es una
    // violación que hay que ver.
    if (result.Reason === 'salida_tarde') return { color: '#E58E26', bg: 'rgba(229,142,38,0.14)', Icon: AlarmClockOff, title: 'Salida fuera de horario' }
    // Día correcto, hora equivocada: no entra.
    if (result.Reason === 'outoftime') return { color: '#E53935', bg: 'rgba(229,57,53,0.12)', Icon: Clock, title: 'Fuera de horario' }
    if (result.Reason === 'outofrange') return { color: '#E58E26', bg: 'rgba(229,142,38,0.12)', Icon: TriangleAlert, title: 'Pase no válido hoy' }
    if (result.Reason === 'finished') return { color: '#64748B', bg: 'rgba(100,116,139,0.14)', Icon: TriangleAlert, title: 'Pase ya utilizado' }
    return { color: '#E53935', bg: 'rgba(229,57,53,0.12)', Icon: XCircle, title: 'Pase no encontrado' }
  })()

  return (
    <Page>
      <YStack flex={1} backgroundColor="#000">
        {/* RESULTADO */}
        {result && estado ? (
          <ScrollView flex={1} backgroundColor="$backgroundPage" contentContainerStyle={{ padding: 16, gap: 16, flexGrow: 1, justifyContent: 'center' }}>
            {/* X para salir y regresar a la pantalla anterior */}
            <View
              position="absolute"
              top={16}
              right={16}
              zIndex={10}
              onPress={cerrar}
              pressStyle={{ opacity: 0.6 }}
              width={40}
              height={40}
              borderRadius={20}
              backgroundColor="$backgroundElevated"
              justifyContent="center"
              alignItems="center"
            >
              <X size={22} color="#94A3B8" />
            </View>

            <YStack alignItems="center" gap="$3">
              <View width={88} height={88} borderRadius={44} backgroundColor={estado.bg} justifyContent="center" alignItems="center">
                <estado.Icon size={52} color={estado.color} />
              </View>
              <Text fontSize={22} fontWeight="800" color={estado.color}>
                {estado.title}
              </Text>
              {!!result.Message && (
                <Text fontSize={13} color="$textMuted" textAlign="center">
                  {result.Message}
                </Text>
              )}
            </YStack>

            {result.Reason !== 'notfound' && (
              <YStack backgroundColor="$backgroundElevated" borderRadius="$5" padding="$4" gap="$2.5">
                <XStack alignItems="center" gap="$2">
                  <Users size={16} color="#94A3B8" />
                  <Text fontSize={15} fontWeight="700" color="$text" flexShrink={1}>
                    {result.Personas || '—'}
                  </Text>
                </XStack>
                <Row label="Visita a" value={result.VisitTo} />
                <Row label="Motivo" value={result.Motivo === 'Otros' && result.VisitReasonOther ? result.VisitReasonOther : result.Motivo} />
                {!!result.Horario && <Row label="Horario" value={result.Horario} />}
                {/* En 'outoftime' el backend manda la PRÓXIMA ventana en VentanaInicio,
                    para que el guardia le pueda decir a qué hora volver. */}
                {result.Reason === 'outoftime' ? (
                  !!result.VentanaInicio && (
                    <Row
                      label="Puede ingresar"
                      value={fmtDateTime(result.VentanaInicio)}
                      valueColor="#E58E26"
                    />
                  )
                ) : (
                  !!result.VentanaInicio && (
                    <Row label="Ventana" value={fmtVentana(result.VentanaInicio, result.VentanaFin)} />
                  )
                )}
                {(result.Reason === 'entrada' || result.Reason === 'salida' || result.Reason === 'salida_tarde') && (
                  <Row label="Entrada" value={fmtDateTime(result.UsedAt)} valueColor="#2E9E5B" />
                )}
                {(result.Reason === 'salida' || result.Reason === 'salida_tarde') && (
                  <Row label="Salida" value={fmtDateTime(result.ExitAt)} valueColor="#2563EB" />
                )}
                {result.MinutosDentro != null && (
                  <Row label="Tiempo adentro" value={fmtDuracion(result.MinutosDentro)} />
                )}
                {result.Reason === 'outofrange' && (
                  <Row label="Vigente desde" value={prettyDate(result.EntryDate)} />
                )}
              </YStack>
            )}

            {/* ══════════ IDENTIFICACIÓN DEL VISITANTE ══════════
                Solo aparece cuando el pase la exige y se acaba de registrar una
                entrada. El veredicto NO bloquea: el guardia decide. */}
            {idPaso && (
              <YStack
                backgroundColor="$backgroundElevated"
                borderRadius="$5"
                padding="$4"
                gap="$3"
              >
                <XStack alignItems="center" gap="$2">
                  <IdCard size={18} color="#FF551A" />
                  <Text fontSize={14} fontWeight="800" color="$text">
                    Identificación del visitante
                  </Text>
                </XStack>

                {idPaso === 'enviando' ? (
                  <XStack alignItems="center" gap="$3">
                    <Spinner color="$primary" />
                    <Text fontSize={13} color="$textMuted">Leyendo el documento...</Text>
                  </XStack>
                ) : idPaso === 'pedir' ? (
                  <YStack gap="$3">
                    <Text fontSize={13} color="$textMuted">
                      {idResultado?.Mensaje ??
                        'Este pase requiere identificación. Tomá una foto del documento del visitante.'}
                    </Text>
                    {idIntentos > 0 && (
                      <Text fontSize={11} color="#E58E26">
                        Intento {idIntentos} de 3. Buscá buena luz, sin reflejo y que el
                        documento llene el cuadro.
                      </Text>
                    )}
                    <Button
                      height={48}
                      backgroundColor="$primary"
                      borderRadius="$4"
                      pressStyle={{ opacity: 0.8 }}
                      onPress={() => setIdCamaraAbierta(true)}
                      icon={<CameraIcon size={18} color="white" />}
                    >
                      <Text color="white" fontWeight="700">
                        {idIntentos === 0 ? 'Tomar foto del documento' : 'Tomar otra foto'}
                      </Text>
                    </Button>
                  </YStack>
                ) : (
                  // ── Resultado ──
                  <YStack gap="$2.5">
                    {idResultado?.Legible ? (
                      <>
                        <XStack alignItems="center" gap="$2">
                          {idResultado.Coincide === false ? (
                            <ShieldAlert size={18} color="#E58E26" />
                          ) : (
                            <CheckCircle2 size={18} color="#2E9E5B" />
                          )}
                          <Text
                            fontSize={13}
                            fontWeight="800"
                            color={idResultado.Coincide === false ? '#E58E26' : '#2E9E5B'}
                            flexShrink={1}
                          >
                            {idResultado.Coincide === false
                              ? 'El nombre NO coincide con el pase'
                              : idResultado.Coincide === true
                                ? 'Documento verificado'
                                : 'Documento leído'}
                          </Text>
                        </XStack>
                        <Row label="Nombre en el documento" value={idResultado.NombreDetectado} />
                        <Row label="Documento" value={idResultado.DocumentoDetectado} />
                        {!!idResultado.TipoDocumento && (
                          <Row label="Tipo" value={idResultado.TipoDocumento} />
                        )}
                        {!!idResultado.NombreCotejado && (
                          <Row
                            label="Coincide con"
                            value={`${idResultado.NombreCotejado}${
                              idResultado.ScoreCoincidencia != null
                                ? ` (${idResultado.ScoreCoincidencia}%)`
                                : ''
                            }`}
                            valueColor="#2E9E5B"
                          />
                        )}
                        {/* Discrepancia: se avisa, no se bloquea. Un typo en el pase
                            o un apellido de casada no pueden dejar a alguien afuera. */}
                        {idResultado.Coincide === false && (
                          <Text fontSize={11} color="#E58E26">
                            Verificá a la persona antes de dejarla pasar. La discrepancia
                            quedó registrada.
                          </Text>
                        )}
                      </>
                    ) : (
                      <>
                        <XStack alignItems="center" gap="$2">
                          <TriangleAlert size={18} color="#E58E26" />
                          <Text fontSize={13} fontWeight="800" color="#E58E26" flexShrink={1}>
                            Sin lectura del documento
                          </Text>
                        </XStack>
                        <Text fontSize={12} color="$textMuted">
                          {idResultado?.Mensaje ?? 'No se pudo leer el documento.'}
                        </Text>
                        {/* Tras agotar los intentos se ofrece continuar, para que
                            una cámara sucia no tranque la portería. */}
                        {idResultado?.PermitirOmitir && (
                          <Button
                            height={44}
                            backgroundColor="$buttonSecondary"
                            borderRadius="$4"
                            pressStyle={{ opacity: 0.7 }}
                            onPress={() => capturarId(true)}
                          >
                            <Text color="$text" fontWeight="700" fontSize={13}>
                              Continuar sin ID legible
                            </Text>
                          </Button>
                        )}
                      </>
                    )}
                  </YStack>
                )}
              </YStack>
            )}

            {/* Exceso: es el dato que motiva toda la función, así que va en un
                banner propio y no perdido entre las filas. */}
            {!!result.MinutosExceso && result.MinutosExceso > 0 && (
              <XStack
                backgroundColor="rgba(229,142,38,0.14)"
                borderRadius="$4"
                padding="$3"
                alignItems="center"
                gap="$2"
              >
                <Timer size={18} color="#E58E26" />
                <Text fontSize={13} fontWeight="800" color="#E58E26" flexShrink={1}>
                  Se pasó {fmtDuracion(result.MinutosExceso)} de su horario
                </Text>
              </XStack>
            )}

            <Button
              height={50}
              backgroundColor="$primary"
              borderRadius="$4"
              pressStyle={{ opacity: 0.8 }}
              onPress={escanearOtro}
              icon={<RotateCcw size={18} color="white" />}
            >
              <Text color="white" fontWeight="700">
                Escanear otro
              </Text>
            </Button>
          </ScrollView>
        ) : hasPermission === false ? (
          <YStack flex={1} justifyContent="center" alignItems="center" gap="$3" padding="$5" backgroundColor="$backgroundPage">
            <TriangleAlert size={48} color="#FF551A" />
            <Text color="$text" textAlign="center" fontSize={15}>
              Se necesita permiso de cámara para escanear los códigos QR.
            </Text>
            <Button backgroundColor="$primary" borderRadius="$4" onPress={() => setManualOpen(true)}>
              <Text color="white" fontWeight="700">Ingresar código manualmente</Text>
            </Button>
          </YStack>
        ) : (
          <>
            {hasPermission && isFocused && (
              <Camera
                style={StyleSheet.absoluteFill}
                scanBarcode
                onReadCode={onReadCode}
                scanThrottleDelay={300}
              />
            )}

            {/* Guía decorativa (no limita el escaneo: la cámara lee toda la vista) */}
            {hasPermission && (
              <View position="absolute" top={0} left={0} right={0} bottom={0} justifyContent="center" alignItems="center" pointerEvents="none">
                <View
                  width={250}
                  height={250}
                  borderWidth={3}
                  borderColor="rgba(255,255,255,0.9)"
                  borderRadius={20}
                />
              </View>
            )}

            {/* Botón para cerrar la cámara y volver atrás */}
            <View
              position="absolute"
              top={16}
              left={16}
              zIndex={20}
              onPress={cerrar}
              pressStyle={{ opacity: 0.6 }}
              width={42}
              height={42}
              borderRadius={21}
              backgroundColor="rgba(0,0,0,0.55)"
              justifyContent="center"
              alignItems="center"
            >
              <X size={24} color="#fff" />
            </View>

            <YStack position="absolute" top={20} left={0} right={0} alignItems="center" pointerEvents="none">
              <XStack backgroundColor="rgba(0,0,0,0.55)" paddingHorizontal="$3" paddingVertical="$2" borderRadius="$10" gap="$2" alignItems="center">
                <ScanLine size={16} color="#fff" />
                <Text color="#fff" fontSize={13}>
                  Apunta al código QR del pase
                </Text>
              </XStack>
            </YStack>

            <YStack position="absolute" bottom={34} left={0} right={0} alignItems="center">
              <Button
                backgroundColor="rgba(255,255,255,0.92)"
                borderRadius="$10"
                pressStyle={{ opacity: 0.8 }}
                onPress={() => {
                  setManualToken('')
                  setManualOpen(true)
                }}
                icon={<Keyboard size={16} color="#1A1A2E" />}
              >
                <Text color="#1A1A2E" fontWeight="700" fontSize={13}>
                  Ingresar código manualmente
                </Text>
              </Button>
            </YStack>

            {processing && (
              <View position="absolute" top={0} left={0} right={0} bottom={0} justifyContent="center" alignItems="center" backgroundColor="rgba(0,0,0,0.45)">
                <Spinner size="large" color="#fff" />
              </View>
            )}
          </>
        )}
      </YStack>

      {/* ══════════ Visor del documento ══════════
          La cámara se queda ABIERTA entre intentos: el veredicto aparece encima
          del visor, así el guardia corrige el encuadre y vuelve a disparar en el
          mismo lugar, sin salir y volver a entrar. */}
      <Modal visible={idCamaraAbierta} animationType="slide" onRequestClose={() => setIdCamaraAbierta(false)}>
        <YStack flex={1} backgroundColor="#000">
          <Camera ref={idCamRef} style={StyleSheet.absoluteFill} cameraType={CameraType.Back} />

          {/* Guía de encuadre con proporción de documento */}
          <View position="absolute" top={0} left={0} right={0} bottom={0} justifyContent="center" alignItems="center" pointerEvents="none">
            <View width="86%" aspectRatio={1.58} borderWidth={3} borderColor="rgba(255,255,255,0.9)" borderRadius={14} />
          </View>

          {/* Instrucción / motivo del rechazo anterior */}
          <YStack position="absolute" top={20} left={16} right={16} gap="$2">
            <XStack backgroundColor="rgba(0,0,0,0.65)" padding="$3" borderRadius="$4" gap="$2" alignItems="center">
              <IdCard size={16} color="#fff" />
              <Text color="#fff" fontSize={13} flexShrink={1}>
                {idIntentos === 0
                  ? 'Encuadrá el documento dentro del marco, con buena luz y sin reflejo.'
                  : `Intento ${idIntentos} de 3. ${idResultado?.Mensaje ?? ''}`}
              </Text>
            </XStack>
          </YStack>

          {/* Veredicto sobre el visor, sin cerrar la cámara */}
          {idPaso === 'listo' && idResultado?.Legible && (
            <YStack
              position="absolute"
              bottom={130}
              left={16}
              right={16}
              backgroundColor={idResultado.Coincide === false ? 'rgba(229,142,38,0.95)' : 'rgba(46,158,91,0.95)'}
              borderRadius="$4"
              padding="$3"
              gap="$1"
            >
              <Text color="#fff" fontWeight="800" fontSize={14}>
                {idResultado.Coincide === false ? 'El nombre NO coincide con el pase' : 'Documento verificado'}
              </Text>
              <Text color="#fff" fontSize={12}>{idResultado.NombreDetectado}</Text>
              {!!idResultado.DocumentoDetectado && (
                <Text color="#fff" fontSize={11}>{idResultado.DocumentoDetectado}</Text>
              )}
            </YStack>
          )}

          {/* Disparador */}
          <YStack position="absolute" bottom={34} left={0} right={0} alignItems="center" gap="$3">
            {idPaso === 'enviando' ? (
              <XStack backgroundColor="rgba(0,0,0,0.7)" paddingHorizontal="$4" paddingVertical="$3" borderRadius="$10" alignItems="center" gap="$3">
                <Spinner color="#fff" />
                <Text color="#fff" fontSize={13}>Leyendo el documento...</Text>
              </XStack>
            ) : (
              <View
                onPress={() => capturarId(false)}
                pressStyle={{ opacity: 0.7 }}
                width={72}
                height={72}
                borderRadius={36}
                backgroundColor="#fff"
                borderWidth={4}
                borderColor="rgba(255,255,255,0.5)"
                justifyContent="center"
                alignItems="center"
              >
                <CameraIcon size={30} color="#1A1A2E" />
              </View>
            )}

            <XStack gap="$3">
              <Button
                height={40}
                backgroundColor="rgba(0,0,0,0.6)"
                borderRadius="$10"
                pressStyle={{ opacity: 0.7 }}
                onPress={() => setIdCamaraAbierta(false)}
              >
                <Text color="#fff" fontWeight="700" fontSize={13}>
                  {idPaso === 'listo' ? 'Listo' : 'Cerrar'}
                </Text>
              </Button>
              {/* Tras agotar los intentos: continuar sin ID, marcado */}
              {idResultado?.PermitirOmitir && (
                <Button
                  height={40}
                  backgroundColor="rgba(229,142,38,0.9)"
                  borderRadius="$10"
                  pressStyle={{ opacity: 0.8 }}
                  onPress={() => capturarId(true)}
                >
                  <Text color="#fff" fontWeight="700" fontSize={13}>Continuar sin ID</Text>
                </Button>
              )}
            </XStack>
          </YStack>
        </YStack>
      </Modal>

      {/* Modal: ingreso manual del código */}
      <Modal visible={manualOpen} transparent animationType="fade" onRequestClose={() => setManualOpen(false)}>
        <View flex={1} backgroundColor="rgba(0,0,0,0.45)" justifyContent="center" padding="$4">
          <YStack backgroundColor="$backgroundElevated" borderRadius="$6" padding="$4" gap="$3">
            <Text fontSize={16} fontWeight="700" color="$text">
              Ingresar código del pase
            </Text>
            <AppInput label="Token del QR" value={manualToken} onChangeText={setManualToken} />
            <XStack gap="$3" marginTop="$2">
              <Button flex={1} height={44} backgroundColor="$buttonSecondary" borderRadius="$3" pressStyle={{ opacity: 0.7 }} onPress={() => setManualOpen(false)}>
                <Text color="$text" fontWeight="700">Cancelar</Text>
              </Button>
              <Button flex={1} height={44} backgroundColor="$primary" borderRadius="$3" pressStyle={{ opacity: 0.7 }} onPress={submitManual}>
                <Text color="white" fontWeight="700">Validar</Text>
              </Button>
            </XStack>
          </YStack>
        </View>
      </Modal>
    </Page>
  )
}

function Row({ label, value, valueColor }: { label: string; value?: string | null; valueColor?: string }) {
  return (
    <XStack justifyContent="space-between" gap="$2">
      <Text fontSize={12} color="$textMuted">
        {label}
      </Text>
      <Text fontSize={12} color={valueColor ?? '$text'} fontWeight={valueColor ? '700' : '600'} flexShrink={1} textAlign="right">
        {value || '—'}
      </Text>
    </XStack>
  )
}
