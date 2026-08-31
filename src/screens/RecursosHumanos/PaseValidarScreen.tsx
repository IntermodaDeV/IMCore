import React, { useEffect, useRef, useState } from 'react'
import { Platform, PermissionsAndroid, StyleSheet, Modal } from 'react-native'
import { YStack, XStack, Text, View, Button, Spinner, ScrollView } from 'tamagui'
import { Camera } from 'react-native-camera-kit'
import { XCircle, TriangleAlert, ScanLine, RotateCcw, X, LogIn, LogOut, Clock, List, Search, RefreshCw } from 'lucide-react-native'
import { useNavigation, useFocusEffect, useIsFocused } from '@react-navigation/native'
import Page from '../../components/commons/Page'
import AppInput from '../../components/commons/AppInput'
import { usePasesHeader } from './usePasesHeader'
import { useAuth } from '../../context/AuthContext'
import { useShowToast } from '../../utils/useShowToast'
import { pasesService } from '../../api/modules/pases/pases.service'
import { IPase, IRegistrarAccesoResult } from '../../api/modules/pases/pases.types'
import { sinCodigo, textoCarnet, textoDesvio, textoSecuencia } from './paseFormat'
import { handleError } from '../../utils/errorHandler'

const fmtDateTime = (iso?: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// El QR del carnet trae el código alterno con información adicional, p.ej.
// "#sfbc#user#25524". Extraemos solo el código (último segmento entre '#').
const parseCarnet = (raw?: string | null): string => {
  if (!raw) return ''
  const s = String(raw).trim()
  if (s.includes('#')) {
    const parts = s.split('#').map((p) => p.trim()).filter(Boolean)
    if (parts.length) return parts[parts.length - 1]
  }
  return s
}

/**
 * La cámara lee dos cosas distintas con el mismo gesto:
 *   el carnet     -> el código alterno (números)
 *   el QR del pase -> un UUID
 * Se distinguen por la forma, así que Seguridad no tiene que elegir nada.
 */
const ES_TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function PaseValidarScreen() {
  const { user } = useAuth()
  const { showToast } = useShowToast()
  const navigation = useNavigation()

  const [hasPermission, setHasPermission] = useState<boolean | null>(null)
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<IRegistrarAccesoResult | null>(null)
  // Se cayó el ingreso manual del código: teclear un número es el mismo trabajo
  // que elegir a la persona de la lista del día, y deja un registro peor —el
  // código suelto no dice contra qué permiso entró.
  const [listaOpen, setListaOpen] = useState(false)
  const [lista, setLista] = useState<IPase[]>([])
  const [cargandoLista, setCargandoLista] = useState(false)
  const [filtroLista, setFiltroLista] = useState('')
  const lockRef = useRef(false)
  const isFocused = useIsFocused()

  usePasesHeader('Validar permiso')


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
        setHasPermission(true)
      }
    })()
  }, [])

  useFocusEffect(
    React.useCallback(() => {
      setResult(null)
      setProcessing(false)
      lockRef.current = false
      return () => {
        lockRef.current = false
      }
    }, [])
  )

  /**
   * Registra el movimiento que toca. Las tres formas de identificar el pase van
   * al mismo endpoint; el servidor decide si es entrada o salida.
   */
  const validar = async (datos: { EmpleadoCode?: string; Token?: string; Pase_Id?: number; Metodo: 'C' | 'Q' | 'L' }) => {
    setProcessing(true)
    try {
      const resp = await pasesService.registrarAcceso({ ...datos, Create_By: user?.Code ?? '' })
      if (resp.Success && resp.Data) setResult(resp.Data)
      else showToast('error', 'Error', resp.ErrorMessage || 'No se pudo registrar el acceso', 4000, 'bottom')
    } catch (err) {
      showToast('error', 'Error', handleError(err).message, 4000, 'bottom')
    }
    setProcessing(false)
  }

  const onReadCode = (event: any) => {
    if (lockRef.current || processing || result) return
    // El shape del evento varía por versión/plataforma de react-native-camera-kit.
    const raw =
      event?.nativeEvent?.codeStringValue ??
      event?.codeStringValue ??
      event?.nativeEvent?.code ??
      event?.code

    const texto = String(raw ?? '').trim()
    if (!texto) return

    lockRef.current = true

    // Un UUID es el QR del pase; cualquier otra cosa, el carnet.
    if (ES_TOKEN.test(texto)) validar({ Token: texto, Metodo: 'Q' })
    else {
      const code = parseCarnet(texto)
      if (!code) { lockRef.current = false; return }
      validar({ EmpleadoCode: code, Metodo: 'C' })
    }
  }

  const escanearOtro = () => {
    setResult(null)
    lockRef.current = false
  }

  const cerrar = () => {
    setResult(null)
    lockRef.current = false
    if (navigation.canGoBack()) navigation.goBack()
    else (navigation as any).navigate('inicio')
  }

  /** Los pases aprobados de hoy, para el que llega sin carnet y sin la app. */
  const abrirLista = async () => {
    setFiltroLista('')
    setListaOpen(true)
    setCargandoLista(true)
    try {
      const resp = await pasesService.getSeguridad()
      if (resp.Success) setLista(resp.Data ?? [])
      else showToast('error', 'Error', resp.ErrorMessage || 'No se pudo cargar la lista', 4000, 'bottom')
    } catch (err) {
      showToast('error', 'Error', handleError(err).message, 4000, 'bottom')
    }
    setCargandoLista(false)
  }

  const registrarDeLista = async (p: IPase) => {
    setListaOpen(false)
    lockRef.current = true
    await validar({ Pase_Id: p.Id, Metodo: 'L' })
  }

  const estado = (() => {
    if (!result) return null
    if (result.Valid && result.Reason === 'entrada') return { color: '#2E9E5B', bg: 'rgba(46,158,91,0.12)', Icon: LogIn, title: 'Entrada registrada' }
    if (result.Valid && result.Reason === 'salida') return { color: '#2563EB', bg: 'rgba(37,99,235,0.12)', Icon: LogOut, title: 'Salida registrada' }
    if (result.Reason === 'pendiente') return { color: '#E58E26', bg: 'rgba(229,142,38,0.12)', Icon: Clock, title: 'Falta la firma del jefe' }
    if (result.Reason === 'pendienterh') return { color: '#A855F7', bg: 'rgba(168,85,247,0.12)', Icon: Clock, title: 'Falta la firma de RR. HH.' }
    if (result.Reason === 'utilizado') return { color: '#64748B', bg: 'rgba(100,116,139,0.14)', Icon: TriangleAlert, title: 'Permiso ya utilizado' }
    if (result.Reason === 'repetido') return { color: '#64748B', bg: 'rgba(100,116,139,0.14)', Icon: TriangleAlert, title: 'Ya se registró' }
    if (result.Reason === 'vencido') return { color: '#64748B', bg: 'rgba(100,116,139,0.14)', Icon: TriangleAlert, title: 'Permiso vencido' }
    if (result.Reason === 'futuro') return { color: '#E58E26', bg: 'rgba(229,142,38,0.12)', Icon: Clock, title: 'Permiso para otro día' }
    if (result.Reason === 'rechazado') return { color: '#E53935', bg: 'rgba(229,57,53,0.12)', Icon: XCircle, title: 'Permiso rechazado' }
    return { color: '#E53935', bg: 'rgba(229,57,53,0.12)', Icon: XCircle, title: 'Sin permiso para hoy' }
  })()

  return (
    <Page>
      <YStack flex={1} backgroundColor="#000">
        {result && estado ? (
          <YStack flex={1} backgroundColor="$backgroundPage" padding="$4" justifyContent="center" gap="$4">
            <View
              position="absolute" top={16} right={16} zIndex={10}
              onPress={cerrar} pressStyle={{ opacity: 0.6 }}
              width={40} height={40} borderRadius={20} backgroundColor="$backgroundElevated"
              justifyContent="center" alignItems="center"
            >
              <X size={22} color="#94A3B8" />
            </View>

            <YStack alignItems="center" gap="$3">
              <View width={88} height={88} borderRadius={44} backgroundColor={estado.bg} justifyContent="center" alignItems="center">
                <estado.Icon size={52} color={estado.color} />
              </View>
              <Text fontSize={22} fontWeight="800" color={estado.color}>{estado.title}</Text>
              {!!result.Message && (
                <Text fontSize={13} color="$textMuted" textAlign="center">{result.Message}</Text>
              )}
            </YStack>

            <YStack backgroundColor="$backgroundElevated" borderRadius="$5" padding="$4" gap="$2.5">
              <Row label="Empleado" value={sinCodigo(result.EmpleadoNombre)} />
              {/* El carnet primero: es el número que el guardia puede comparar
                  con la credencial que tiene enfrente. */}
              {!!result.CodAlterno && <Row label="Carnet" value={result.CodAlterno} />}
              {!!result.EmpleadoCode && <Row label="Código de planilla" value={result.EmpleadoCode} />}
              {!!result.Categoria && <Row label="Permiso" value={result.Categoria} />}

              {result.Valid && (
                <>
                  <Row
                    label={result.Reason === 'entrada' ? 'Entrada' : 'Salida'}
                    value={fmtDateTime(result.FechaHora)}
                    valueColor={result.Reason === 'entrada' ? '#2E9E5B' : '#2563EB'}
                  />

                  {/* Lo que Seguridad tiene que ver de un golpe: si llegó a la
                      hora. No traba nada — se registra y queda en el historial. */}
                  {!!result.HoraPrevista && (
                    <Row label="Estaba previsto" value={result.HoraPrevista} />
                  )}
                  {result.DesvioMin != null && (
                    <Row
                      label="Diferencia"
                      value={textoDesvio(result.DesvioMin)}
                      valueColor={Math.abs(result.DesvioMin) <= 10 ? '#2E9E5B' : '#E58E26'}
                    />
                  )}

                  {/* Con dos movimientos, decir qué falta evita que la persona
                      se vaya creyendo que ya cerró su permiso. */}
                  {!!result.Faltan && (
                    <Row
                      label="Falta"
                      value={result.Tipo === 'S' ? 'Registrar el regreso' : 'Registrar la salida'}
                      valueColor="#E58E26"
                    />
                  )}

                  {/* La leyenda: entró sin código, elegido de la lista. */}
                  {result.Metodo === 'L' && (
                    <Row label="Registrado" value="Sin código · elegido de la lista" valueColor="#E58E26" />
                  )}
                  {result.Metodo === 'Q' && (
                    <Row label="Registrado" value="Con el QR del permiso" />
                  )}
                </>
              )}
            </YStack>

            <Button height={50} backgroundColor="$primary" borderRadius="$4" pressStyle={{ opacity: 0.8 }} onPress={escanearOtro} icon={<RotateCcw size={18} color="white" />}>
              <Text color="white" fontWeight="700">Escanear otro</Text>
            </Button>
          </YStack>
        ) : hasPermission === false ? (
          <YStack flex={1} justifyContent="center" alignItems="center" gap="$3" padding="$5" backgroundColor="$backgroundPage">
            <TriangleAlert size={48} color="#FF551A" />
            <Text color="$text" textAlign="center" fontSize={15}>
              Se necesita permiso de cámara para escanear el carnet.
            </Text>
            <Button backgroundColor="$primary" borderRadius="$4" onPress={abrirLista}>
              <Text color="white" fontWeight="700">Ver los permisos de hoy</Text>
            </Button>
          </YStack>
        ) : (
          <>
            {hasPermission && isFocused && (
              <Camera style={StyleSheet.absoluteFill} scanBarcode onReadCode={onReadCode} scanThrottleDelay={300} />
            )}

            {hasPermission && (
              <View position="absolute" top={0} left={0} right={0} bottom={0} justifyContent="center" alignItems="center" pointerEvents="none">
                <View width={250} height={250} borderWidth={3} borderColor="rgba(255,255,255,0.9)" borderRadius={20} />
              </View>
            )}

            <View
              position="absolute" top={16} left={16} zIndex={20}
              onPress={cerrar} pressStyle={{ opacity: 0.6 }}
              width={42} height={42} borderRadius={21} backgroundColor="rgba(0,0,0,0.55)"
              justifyContent="center" alignItems="center"
            >
              <X size={24} color="#fff" />
            </View>

            <YStack position="absolute" top={20} left={0} right={0} alignItems="center" pointerEvents="none">
              <XStack backgroundColor="rgba(0,0,0,0.55)" paddingHorizontal="$3" paddingVertical="$2" borderRadius="$10" gap="$2" alignItems="center">
                <ScanLine size={16} color="#fff" />
                <Text color="#fff" fontSize={13}>Apunta al carnet o al QR del permiso</Text>
              </XStack>
            </YStack>

            <YStack position="absolute" bottom={34} left={0} right={0} alignItems="center">
              {/* El que llega sin carnet y sin la app: se elige de los permisos
                  del día y queda marcado como "sin código". */}
              <Button
                backgroundColor="rgba(255,255,255,0.92)" borderRadius="$10" pressStyle={{ opacity: 0.8 }}
                onPress={abrirLista}
                icon={<List size={16} color="#1A1A2E" />}
              >
                <Text color="#1A1A2E" fontWeight="700" fontSize={13}>No trae carnet</Text>
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

      {/* Los permisos aprobados de hoy. Elegir a la persona de acá deja el
          registro pegado a un permiso real, que es lo que una confirmación
          suelta no da. */}
      <Modal visible={listaOpen} transparent animationType="fade" onRequestClose={() => setListaOpen(false)}>
        <View flex={1} backgroundColor="rgba(0,0,0,0.45)" justifyContent="center" padding="$4">
          <YStack backgroundColor="$backgroundElevated" borderRadius="$6" padding="$4" gap="$3" maxHeight="80%">
            <XStack alignItems="center" justifyContent="space-between">
              <Text fontSize={16} fontWeight="700" color="$text">Permisos de hoy</Text>
              <XStack gap="$2" alignItems="center">
                <View onPress={abrirLista} pressStyle={{ opacity: 0.6 }} padding="$1.5">
                  <RefreshCw size={16} color="#94A3B8" />
                </View>
                <View onPress={() => setListaOpen(false)} pressStyle={{ opacity: 0.6 }} padding="$1.5">
                  <X size={18} color="#94A3B8" />
                </View>
              </XStack>
            </XStack>

            <AppInput
              label="Buscar por nombre"
              value={filtroLista}
              onChangeText={setFiltroLista}
              prefix={<Search size={16} color="#94A3B8" />}
            />

            {cargandoLista ? (
              <XStack alignItems="center" gap="$2" paddingVertical="$3">
                <Spinner size="small" color="$primary" />
                <Text fontSize={13} color="$textMuted">Cargando...</Text>
              </XStack>
            ) : (
              <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">
                <YStack gap="$2">
                  {(() => {
                    const q = filtroLista.trim().toLowerCase()
                    // Solo los que todavía tienen algo por registrar: los
                    // completos no sirven para dejar pasar a nadie.
                    const items = lista
                      .filter(p => (p.MovimientosHechos ?? 0) < (p.MovimientosTotal ?? 1))
                      .filter(p => !q || (p.EmpleadoNombre ?? '').toLowerCase().includes(q))

                    if (items.length === 0) {
                      return (
                        <Text fontSize={12} color="$textMuted" paddingVertical="$2">
                          No hay permisos pendientes de registrar para hoy.
                        </Text>
                      )
                    }

                    return items.map(p => (
                      <YStack
                        key={p.Id}
                        backgroundColor="$backgroundSurface"
                        borderRadius="$3"
                        borderWidth={1}
                        borderColor="$border"
                        padding="$3"
                        gap="$1"
                        pressStyle={{ opacity: 0.6 }}
                        onPress={() => registrarDeLista(p)}
                      >
                        <Text fontSize={14} fontWeight="600" color="$text">
                          {sinCodigo(p.EmpleadoNombre)}
                        </Text>
                        <Text fontSize={11} color="$textMuted">
                          {textoCarnet(p)} · {p.Categoria || textoSecuencia(p.Tipo)}
                        </Text>
                        <Text fontSize={11} color="$textMuted">
                          {p.Tipo === 'ES'
                            ? [p.HoraEntrada && `Entra ${p.HoraEntrada}`, p.HoraSalida && `Sale ${p.HoraSalida}`].filter(Boolean).join(' · ')
                            : [p.HoraSalida && `Sale ${p.HoraSalida}`, p.HoraEntrada && `${p.Tipo === 'SE' ? 'Regresa' : 'Entra'} ${p.HoraEntrada}`].filter(Boolean).join(' · ')}
                          {(p.MovimientosHechos ?? 0) > 0 ? ' · falta el regreso' : ''}
                        </Text>
                      </YStack>
                    ))
                  })()}
                </YStack>
              </ScrollView>
            )}

            <Text fontSize={11} color="$textMuted">
              El registro va a quedar marcado como "sin código".
            </Text>
          </YStack>
        </View>
      </Modal>

    </Page>
  )
}

function Row({ label, value, valueColor }: { label: string; value?: string | null; valueColor?: string }) {
  return (
    <XStack justifyContent="space-between" gap="$2">
      <Text fontSize={12} color="$textMuted">{label}</Text>
      <Text fontSize={12} color={valueColor ?? '$text'} fontWeight={valueColor ? '700' : '600'} flexShrink={1} textAlign="right">
        {value || '—'}
      </Text>
    </XStack>
  )
}
