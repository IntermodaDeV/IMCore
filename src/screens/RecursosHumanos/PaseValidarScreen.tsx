import React, { useEffect, useRef, useState } from 'react'
import { Platform, PermissionsAndroid, StyleSheet, Modal } from 'react-native'
import { YStack, XStack, Text, View, Button, Spinner } from 'tamagui'
import { Camera } from 'react-native-camera-kit'
import { XCircle, TriangleAlert, ScanLine, Keyboard, RotateCcw, X, LogIn, LogOut } from 'lucide-react-native'
import { useNavigation, useFocusEffect, useIsFocused } from '@react-navigation/native'
import Page from '../../components/commons/Page'
import AppInput from '../../components/commons/AppInput'
import { usePageHeader } from '../../hooks/usePageHeader'
import { useAuth } from '../../context/AuthContext'
import { useShowToast } from '../../utils/useShowToast'
import { pasesService } from '../../api/modules/pases/pases.service'
import { IRegistrarAccesoResult } from '../../api/modules/pases/pases.types'
import { handleError } from '../../utils/errorHandler'

const fmtDateTime = (iso?: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function PaseValidarScreen() {
  const { user } = useAuth()
  const { showToast } = useShowToast()
  const navigation = useNavigation()

  const [hasPermission, setHasPermission] = useState<boolean | null>(null)
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<IRegistrarAccesoResult | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualCode, setManualCode] = useState('')
  const lockRef = useRef(false)
  const isFocused = useIsFocused()

  usePageHeader({
    center: (
      <Text fontSize="$4" fontWeight="700" color="$text">
        Validar pase
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

  const validar = async (code: string) => {
    const c = (code || '').trim()
    if (!c) return
    setProcessing(true)
    try {
      const resp = await pasesService.registrarAcceso({ EmpleadoCode: c, Create_By: user?.Code ?? '' })
      if (resp.Success && resp.Data) setResult(resp.Data)
      else showToast('error', 'Error', resp.ErrorMessage || 'No se pudo registrar el acceso', 4000, 'bottom')
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

  const submitManual = async () => {
    if (!manualCode.trim()) return
    setManualOpen(false)
    lockRef.current = true
    await validar(manualCode)
  }

  const estado = (() => {
    if (!result) return null
    if (result.Valid && result.Reason === 'entrada') return { color: '#2E9E5B', bg: 'rgba(46,158,91,0.12)', Icon: LogIn, title: 'Entrada registrada' }
    if (result.Valid && result.Reason === 'salida') return { color: '#2563EB', bg: 'rgba(37,99,235,0.12)', Icon: LogOut, title: 'Salida registrada' }
    return { color: '#E58E26', bg: 'rgba(229,142,38,0.12)', Icon: TriangleAlert, title: 'Sin pase válido' }
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
              <Row label="Empleado" value={result.EmpleadoNombre} />
              <Row label="Código" value={result.EmpleadoCode} />
              {!!result.Categoria && <Row label="Categoría" value={result.Categoria} />}
              {result.Valid && (
                <Row
                  label={result.Reason === 'entrada' ? 'Entrada' : 'Salida'}
                  value={fmtDateTime(result.FechaHora)}
                  valueColor={result.Reason === 'entrada' ? '#2E9E5B' : '#2563EB'}
                />
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
            <Button backgroundColor="$primary" borderRadius="$4" onPress={() => setManualOpen(true)}>
              <Text color="white" fontWeight="700">Ingresar código manualmente</Text>
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
                <Text color="#fff" fontSize={13}>Apunta al QR del carnet del empleado</Text>
              </XStack>
            </YStack>

            <YStack position="absolute" bottom={34} left={0} right={0} alignItems="center">
              <Button
                backgroundColor="rgba(255,255,255,0.92)" borderRadius="$10" pressStyle={{ opacity: 0.8 }}
                onPress={() => { setManualCode(''); setManualOpen(true) }}
                icon={<Keyboard size={16} color="#1A1A2E" />}
              >
                <Text color="#1A1A2E" fontWeight="700" fontSize={13}>Ingresar código manualmente</Text>
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

      <Modal visible={manualOpen} transparent animationType="fade" onRequestClose={() => setManualOpen(false)}>
        <View flex={1} backgroundColor="rgba(0,0,0,0.45)" justifyContent="center" padding="$4">
          <YStack backgroundColor="$backgroundElevated" borderRadius="$6" padding="$4" gap="$3">
            <Text fontSize={16} fontWeight="700" color="$text">Ingresar código de empleado</Text>
            <AppInput label="Código de empleado" value={manualCode} onChangeText={setManualCode} />
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
      <Text fontSize={12} color="$textMuted">{label}</Text>
      <Text fontSize={12} color={valueColor ?? '$text'} fontWeight={valueColor ? '700' : '600'} flexShrink={1} textAlign="right">
        {value || '—'}
      </Text>
    </XStack>
  )
}
