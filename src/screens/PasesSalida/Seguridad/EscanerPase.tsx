import React, { useEffect, useRef, useState } from 'react'
import { Modal, Platform, PermissionsAndroid, StyleSheet } from 'react-native'
import { Text, XStack, YStack, View, Spinner } from 'tamagui'
import { Camera } from 'react-native-camera-kit'
import { X, TriangleAlert, ScanLine } from 'lucide-react-native'

import { ACCENT } from '../pasesSalida.helpers'

/**
 * El lector del QR del pase.
 *
 * EL LOCK POR REF, NO POR ESTADO. La cámara dispara `onReadCode` varias veces
 * por segundo mientras el código esté encuadrado; un flag de estado se actualiza
 * en el siguiente render y para entonces ya entraron tres lecturas. El ref corta
 * en la primera.
 *
 * La cámara SOLO se monta con el modal abierto y el permiso concedido: dejarla
 * montada gasta batería y en algunos equipos bloquea el sensor para el resto de
 * la app.
 */

type Props = {
  abierto: boolean
  onCerrar: () => void
  /** El contenido del QR: el correlativo del pase. */
  onLeer: (codigo: string) => void
  /** Mientras se consulta el pase, para que no se lea otro encima. */
  buscando?: boolean
}

export default function EscanerPase({ abierto, onCerrar, onLeer, buscando }: Props) {
  const [permiso, setPermiso] = useState<boolean | null>(null)
  const lockRef = useRef(false)

  useEffect(() => {
    if (!abierto) { lockRef.current = false; return }
    ;(async () => {
      if (Platform.OS === 'android') {
        try {
          const g = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA)
          setPermiso(g === PermissionsAndroid.RESULTS.GRANTED)
        } catch { setPermiso(false) }
      } else {
        // iOS pide el permiso al montar la cámara (NSCameraUsageDescription).
        setPermiso(true)
      }
    })()
  }, [abierto])

  const leer = (event: any) => {
    if (lockRef.current || buscando) return
    const codigo = event?.nativeEvent?.codeStringValue
    if (!codigo) return
    lockRef.current = true
    onLeer(String(codigo).trim())
  }

  return (
    <Modal visible={abierto} animationType="slide" onRequestClose={onCerrar} statusBarTranslucent>
      <YStack flex={1} backgroundColor="#000">
        {permiso === false ? (
          <YStack flex={1} justifyContent="center" alignItems="center" gap="$3" padding="$6">
            <TriangleAlert size={44} color={ACCENT} />
            <Text color="#fff" fontSize={15} fontWeight="700" textAlign="center">
              Falta el permiso de cámara
            </Text>
            <Text color="rgba(255,255,255,0.7)" fontSize={13} textAlign="center">
              Se necesita para leer el código QR del pase. Actívelo en los ajustes
              del teléfono y vuelva a intentar.
            </Text>
          </YStack>
        ) : (
          <>
            {permiso ? (
              <Camera
                style={StyleSheet.absoluteFill}
                scanBarcode
                onReadCode={leer}
                scanThrottleDelay={300}
              />
            ) : null}

            {/* Guía decorativa: la cámara lee toda la vista, el marco solo dice
                dónde poner el código. */}
            <View position="absolute" top={0} left={0} right={0} bottom={0}
              justifyContent="center" alignItems="center" pointerEvents="none">
              <View width={240} height={240} borderWidth={3} borderRadius={20}
                borderColor="rgba(255,255,255,0.9)" />
              <XStack alignItems="center" gap="$2" marginTop="$5">
                {buscando ? <Spinner color="#fff" /> : <ScanLine size={16} color="#fff" />}
                <Text color="#fff" fontSize={13} fontWeight="700">
                  {buscando ? 'Buscando el pase…' : 'Apunte al código QR del pase'}
                </Text>
              </XStack>
            </View>
          </>
        )}

        <View position="absolute" top={48} right={20}
          onPress={onCerrar} pressStyle={{ opacity: 0.7 }} hitSlop={12}
          width={40} height={40} borderRadius={20} backgroundColor="rgba(0,0,0,0.55)"
          alignItems="center" justifyContent="center">
          <X size={22} color="#fff" />
        </View>
      </YStack>
    </Modal>
  )
}
