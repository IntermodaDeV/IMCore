import React, { useEffect, useRef, useState } from 'react'
import { Platform, PermissionsAndroid, StyleSheet } from 'react-native'
import { YStack, XStack, Text, View, Button, Spinner } from 'tamagui'
import { Camera } from 'react-native-camera-kit'
import { ScanLine, RotateCcw, TriangleAlert, X, QrCode } from 'lucide-react-native'
import { useNavigation, useFocusEffect, useIsFocused } from '@react-navigation/native'

import Page from '../../../components/commons/Page'
import { usePageHeader } from '../../../hooks/usePageHeader'
import { handleError } from '../../../utils/errorHandler'
import { pasesService } from '../../../api/modules/pasesSalida/pases.service'

/**
 * El atajo de portería: entrar y tener la cámara ya apuntando.
 *
 * POR QUÉ EXISTE SI CONTROL DE SALIDA YA ESCANEA
 *   Son dos usos distintos. Control de salida es una pantalla de trabajo —la
 *   agenda del día, las bandejas, la búsqueda—; esta es un atajo para cuando
 *   hay una fila esperando y lo único que hace falta es leer el QR. Dos toques
 *   de diferencia no parecen nada hasta que se repiten cincuenta veces en un
 *   turno.
 *
 * LA CÁMARA VA EMBEBIDA, NO EN UN MODAL. Es la misma forma que usa la
 * validación de visitas, y no es solo estético: la pantalla ES la cámara, así
 * que no hay un paso intermedio ni un visor que se pueda cerrar dejando atrás
 * una pantalla vacía.
 *
 * SE DESMONTA AL PERDER EL FOCO (`isFocused`). Una cámara viva en una pantalla
 * que no se está mirando gasta batería y, en el Drawer, deja el lector activo
 * escaneando de fondo.
 *
 * EL CANDADO SE SUELTA A MANO. Tras una lectura el lector queda bloqueado para
 * que un QR frente a la cámara no dispare veinte consultas. Si el código no
 * resuelve, el candado NO se abre solo: se muestra el error con "Escanear otro"
 * — de otro modo el mismo código malo se releería en bucle.
 *
 * LO QUE PASA DESPUÉS NO CAMBIA: se resuelve el correlativo y se navega a la
 * MISMA pantalla de verificación de siempre, que es la que decide qué se puede
 * hacer con ese pase. Acá no se registra nada.
 */
export default function EscanearPaseScreen() {
  const navigation = useNavigation<any>()
  const isFocused = useIsFocused()

  const [hasPermission, setHasPermission] = useState<boolean | null>(null)
  const [buscando, setBuscando] = useState(false)
  /** El último código que no resolvió. Mientras esté puesto, el lector espera. */
  const [fallo, setFallo] = useState<string | null>(null)

  const lockRef = useRef(false)

  usePageHeader({
    center: <Text fontSize="$4" fontWeight="700" color="$text">Pases de salida</Text>,
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
        // iOS pide el permiso al montar la cámara (NSCameraUsageDescription).
        setHasPermission(true)
      }
    })()
  }, [])

  /* Al volver de verificar un pase, el Drawer mantiene esta pantalla montada con
     el candado puesto y la cámara "no hace nada". Reiniciarlo al enfocar es lo
     que la convierte en una estación de escaneo: el siguiente pase se lee sin
     tocar nada. */
  useFocusEffect(
    React.useCallback(() => {
      setFallo(null)
      setBuscando(false)
      lockRef.current = false
      return () => { lockRef.current = false }
    }, [])
  )

  const escanearOtro = () => {
    setFallo(null)
    lockRef.current = false
  }

  const cerrar = () => {
    if (navigation.canGoBack()) navigation.goBack()
    else navigation.navigate('inicio')
  }

  /**
   * El QR trae el CORRELATIVO, no el Id, así que hay que levantar el pase antes
   * de poder mostrar nada.
   *
   * La consulta lo trae en cualquier estado a propósito: un pase rechazado o
   * vencido tiene que poder verse como tal, no como "código inválido".
   */
  const buscar = async (codigo: string) => {
    setBuscando(true)
    try {
      const r = await pasesService.getPasePorCorrelativo(codigo)
      const p = r.Data?.[0]
      if (!p) {
        setFallo(`No hay ningún pase con el código "${codigo}".`)
        return
      }
      navigation.navigate('pasesSalidaVerificarSalida', { id: p.Id, correlativo: p.Correlativo })
    } catch (e) {
      setFallo(handleError(e).message)
    } finally { setBuscando(false) }
  }

  const onReadCode = (event: any) => {
    if (lockRef.current || buscando || fallo) return
    const code = event?.nativeEvent?.codeStringValue
    if (!code) return
    lockRef.current = true
    buscar(String(code).trim())
  }

  return (
    <Page>
      <YStack flex={1} backgroundColor="#000">
        {fallo ? (
          /* El error ocupa la pantalla en vez de ser un toast: el guardia tiene
             gente enfrente y necesita saber que el lector está esperando, no que
             la cámara se quedó pensando. */
          <YStack flex={1} justifyContent="center" alignItems="center" gap="$4" padding="$5"
            backgroundColor="$backgroundPage">
            <View width={88} height={88} borderRadius={44} backgroundColor="rgba(239,68,68,0.12)"
              borderWidth={1.5} borderColor="#ef4444" alignItems="center" justifyContent="center">
              <TriangleAlert size={40} color="#ef4444" />
            </View>
            <Text fontSize={17} fontWeight="900" color="$text" textAlign="center">
              No se pudo leer el pase
            </Text>
            <Text fontSize={13} color="$textMuted" textAlign="center" maxWidth={300}>
              {fallo}
            </Text>
            <Button backgroundColor="$primary" borderRadius="$4" size="$5"
              onPress={escanearOtro} icon={<RotateCcw size={18} color="white" />}>
              <Text color="white" fontWeight="700">Escanear otro</Text>
            </Button>
            <Button chromeless onPress={cerrar}>
              <Text color="$textMuted" fontWeight="700">Volver</Text>
            </Button>
          </YStack>
        ) : hasPermission === false ? (
          <YStack flex={1} justifyContent="center" alignItems="center" gap="$3" padding="$5"
            backgroundColor="$backgroundPage">
            <TriangleAlert size={48} color="#FF551A" />
            <Text color="$text" textAlign="center" fontSize={15}>
              Se necesita permiso de cámara para escanear los códigos QR.
            </Text>
            <Text color="$textMuted" textAlign="center" fontSize={12} maxWidth={300}>
              Si el código no se puede leer, use «Salida manual» desde Control de
              salida para buscar el pase por correlativo o por quién lo retira.
            </Text>
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

            {/* Guía decorativa: no limita el escaneo, la cámara lee toda la vista. */}
            {hasPermission && (
              <View position="absolute" top={0} left={0} right={0} bottom={0}
                justifyContent="center" alignItems="center" pointerEvents="none">
                <View width={250} height={250} borderWidth={3}
                  borderColor="rgba(255,255,255,0.9)" borderRadius={20} />
              </View>
            )}

            <View position="absolute" top={16} left={16} zIndex={20}
              onPress={cerrar} pressStyle={{ opacity: 0.6 }}
              width={42} height={42} borderRadius={21}
              backgroundColor="rgba(0,0,0,0.55)" justifyContent="center" alignItems="center">
              <X size={24} color="#fff" />
            </View>

            <YStack position="absolute" top={20} left={0} right={0} alignItems="center" pointerEvents="none">
              <XStack backgroundColor="rgba(0,0,0,0.55)" paddingHorizontal="$3" paddingVertical="$2"
                borderRadius="$10" gap="$2" alignItems="center">
                <ScanLine size={16} color="#fff" />
                <Text color="#fff" fontSize={13}>Apunta al código QR del pase</Text>
              </XStack>
            </YStack>

            {/* "Escanear otro" también acá: si el lector quedó trabado —un QR
                que se leyó a medias, la pantalla que volvió del detalle— este
                botón lo suelta sin tener que salir y entrar. */}
            <YStack position="absolute" bottom={34} left={0} right={0} alignItems="center">
              <Button backgroundColor="rgba(255,255,255,0.92)" borderRadius="$10"
                pressStyle={{ opacity: 0.8 }} onPress={escanearOtro}
                icon={<RotateCcw size={16} color="#1A1A2E" />}>
                <Text color="#1A1A2E" fontWeight="700" fontSize={13}>Escanear otro</Text>
              </Button>
            </YStack>

            {buscando && (
              <View position="absolute" top={0} left={0} right={0} bottom={0}
                justifyContent="center" alignItems="center" backgroundColor="rgba(0,0,0,0.45)" gap="$3">
                <Spinner size="large" color="#fff" />
                <XStack alignItems="center" gap="$2">
                  <QrCode size={16} color="#fff" />
                  <Text color="#fff" fontSize={13}>Buscando el pase…</Text>
                </XStack>
              </View>
            )}
          </>
        )}
      </YStack>
    </Page>
  )
}
