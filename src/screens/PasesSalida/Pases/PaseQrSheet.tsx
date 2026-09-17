import React, { useEffect, useRef, useState } from 'react'
import { Modal, Platform, PermissionsAndroid } from 'react-native'
import { Text, XStack, YStack, View, Spinner, useTheme } from 'tamagui'
import { X, Share2, Download, QrCode, Ban, Clock } from 'lucide-react-native'
import QRCode from 'react-native-qrcode-svg'
import Share from 'react-native-share'
import ViewShot, { captureRef } from 'react-native-view-shot'
import { CameraRoll } from '@react-native-camera-roll/camera-roll'

import { useShowToast } from '../../../utils/useShowToast'
// Se reutiliza el helper de Visitas tal cual está, sin moverlo ni tocarlo: el
// catálogo de logos es el mismo y su caché vive a nivel de módulo, así que una
// copia propia significaría dos cachés y dos llamadas al mismo catálogo.
// Mismo patrón con el que este módulo ya usa ErrorState/EmptyState de AdmSys.
import { NIVEL_QR, cargarLogosEmpresa, logoDe, tamanoLogo } from '../../Visitas/logoEmpresa'
import { ACCENT, situacionQr } from '../pasesSalida.helpers'
import { IPaseSalida } from '../../../api/modules/pasesSalida/pases.types'

/**
 * El QR del pase, en hoja inferior.
 *
 * NO EXISTE ANTES DE LA APROBACIÓN. Un QR que se puede escanear sin las firmas
 * es justo el agujero que este módulo cierra, así que mientras el pase no reúna
 * su cadena la hoja explica que falta aprobarlo en vez de mostrar algo.
 * Qué estados ya lo tienen lo decide `tieneQr`, compartido con el detalle.
 *
 * Lo que codifica es el CORRELATIVO: es lo único que portería necesita para
 * levantar el pase completo, y no expone nada que no esté ya impreso.
 * Cuando exista PaseSalidaEnc.QrToken, se cambia el contenido por el token y
 * todo lo demás de esta pantalla sigue igual.
 */

type Props = {
  pase: IPaseSalida | null
  onCerrar: () => void
}

export default function PaseQrSheet({ pase, onCerrar }: Props) {
  const theme = useTheme()
  const { showToast } = useShowToast()
  const viewShotRef = useRef<any>(null)
  const [busy, setBusy] = useState<'share' | 'save' | null>(null)
  const [logos, setLogos] = useState<Record<string, any> | null>(null)

  const qr = situacionQr(pase?.Estado)
  const aprobado = qr.situacion === 'disponible'
  // Cerrado no es lo mismo que "todavía no": uno se resuelve esperando y el
  // otro no se resuelve nunca. La hoja los distingue.
  const cerrado = qr.situacion === 'cerrado'

  // El catálogo se pide una vez y queda cacheado en el módulo; abrir la hoja
  // muchas veces no dispara muchas llamadas.
  useEffect(() => { cargarLogosEmpresa().then(setLogos).catch(() => setLogos(null)) }, [])

  // Mismo patrón que Visitas: el ref propio si existe, si no captureRef, con
  // un tope de tiempo para no dejar el botón girando si la captura se cuelga.
  const capturarQr = async (): Promise<string | null> => {
    try {
      const ref: any = viewShotRef.current
      const captura: Promise<string> = ref?.capture
        ? ref.capture()
        : captureRef(viewShotRef, { format: 'png', quality: 1, result: 'tmpfile' })
      const tope = new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000))
      return await Promise.race([captura, tope])
    } catch {
      return null
    }
  }

  const compartir = async () => {
    if (!pase || busy) return
    setBusy('share')
    try {
      const uri = await capturarQr()
      if (!uri) {
        showToast('error', 'Error', 'No se pudo generar la imagen del QR', 4000, 'bottom')
        return
      }
      const message =
        `📦 Pase de salida ${pase.Correlativo}\n` +
        `Tipo: ${pase.TipoSalida}` +
        (pase.EnviadoA ? `\nEnviado a: ${pase.EnviadoA}` : '')
      await Share.open({ title: 'Pase de salida', message, url: uri, type: 'image/png', failOnCancel: false })
    } catch {
      // cancelar la hoja de compartir no es error
    } finally {
      setBusy(null)
    }
  }

  const guardar = async () => {
    if (!pase || busy) return
    setBusy('save')
    try {
      if (Platform.OS === 'android' && Number(Platform.Version) <= 29) {
        const permiso = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE)
        if (permiso !== PermissionsAndroid.RESULTS.GRANTED) {
          showToast('error', 'Permiso', 'No se otorgó permiso para guardar', 4000, 'bottom')
          return
        }
      }
      const uri = await capturarQr()
      if (!uri) throw new Error('No se pudo generar la imagen')
      await CameraRoll.save(uri, { type: 'photo', album: 'INTERMODA' })
      showToast('success', 'Guardado', 'Pase guardado en la galería', 4000, 'bottom')
    } catch (e: any) {
      showToast('error', 'Error', 'No se pudo guardar: ' + (e?.message ?? ''), 5000, 'bottom')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal visible={!!pase} transparent animationType="slide" onRequestClose={onCerrar}>
      <View flex={1} backgroundColor="rgba(0,0,0,0.45)" justifyContent="flex-end">
        <YStack
          backgroundColor="$backgroundElevated"
          borderTopLeftRadius="$6"
          borderTopRightRadius="$6"
          paddingHorizontal="$4"
          paddingTop="$4"
          paddingBottom="$5"
          maxHeight="85%"
          gap="$3"
        >
          <XStack alignItems="center" gap="$2">
            <YStack flex={1} gap={2}>
              <Text fontSize={15} fontWeight="800" color="$text">{pase?.Correlativo}</Text>
              <Text fontSize={10} color="$textMuted">
                {pase?.TipoSalida}{pase?.EnviadoA ? ` · ${pase.EnviadoA}` : ''}
              </Text>
            </YStack>
            <View onPress={onCerrar} pressStyle={{ opacity: 0.6 }} hitSlop={8} padding="$1">
              <X size={20} color={theme.textMuted?.val} />
            </View>
          </XStack>

          {aprobado ? (
            <>
              {/* Lo capturado incluye el correlativo: una foto del QR sin él no
                  le sirve a nadie que la reciba por WhatsApp. */}
              <YStack alignItems="center">
                <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1, result: 'tmpfile' }}>
                  <YStack backgroundColor="#fff" padding="$4" borderRadius="$4" alignItems="center" gap="$3">
                    <Text fontSize={11} fontWeight="900" color="#1A1A2E" letterSpacing={1}>
                      {(pase?.Empresa ?? 'Intermoda').toUpperCase()}
                    </Text>
                    {/* El logo es el de la empresa DEL PASE, no el de quien mira:
                        quien aprueba y comparte el QR puede ser de la otra
                        empresa del parque, y esa tarjeta ya salió por WhatsApp.
                        Sin logo en el catálogo, el QR se dibuja sin logo — mejor
                        eso que el de otra empresa. */}
                    <QRCode
                      value={pase!.Correlativo}
                      size={210}
                      backgroundColor="#fff"
                      color="#000"
                      logo={logoDe(logos, pase?.EmpresaCode)}
                      logoSize={tamanoLogo(210)}
                      logoBackgroundColor="white"
                      logoBorderRadius={8}
                      quietZone={6}
                      ecl={NIVEL_QR}
                    />
                    <Text fontSize={14} fontWeight="900" color="#000">{pase!.Correlativo}</Text>
                    <Text fontSize={10} color="#444">{pase!.TipoSalida}</Text>
                  </YStack>
                </ViewShot>
              </YStack>

              <XStack gap="$2.5">
                <View flex={1} onPress={busy ? undefined : compartir} pressStyle={{ opacity: 0.85 }}
                  opacity={busy ? 0.6 : 1} borderWidth={1.5} borderColor="$border" borderRadius="$4" height={46}
                  alignItems="center" justifyContent="center" flexDirection="row" gap="$2">
                  {busy === 'share' ? <Spinner color={ACCENT} /> : <Share2 size={17} color={theme.text?.val} />}
                  <Text color="$text" fontWeight="800" fontSize="$3">Compartir</Text>
                </View>
                <View flex={1} onPress={busy ? undefined : guardar} pressStyle={{ opacity: 0.85 }}
                  opacity={busy ? 0.6 : 1} backgroundColor={ACCENT} borderRadius="$4" height={46}
                  alignItems="center" justifyContent="center" flexDirection="row" gap="$2">
                  {busy === 'save' ? <Spinner color="#fff" /> : <Download size={17} color="#fff" />}
                  <Text color="#fff" fontWeight="800" fontSize="$3">Descargar</Text>
                </View>
              </XStack>
            </>
          ) : (
            <YStack alignItems="center" gap="$3" paddingVertical="$6" paddingHorizontal="$2">
              <YStack backgroundColor={cerrado ? 'rgba(100, 116, 139, 0.18)' : 'rgba(245, 158, 11, 0.18)'}
                borderWidth={1} borderColor={cerrado ? '#64748b' : '#f59e0b'}
                borderRadius="$10" padding="$4">
                {cerrado
                  ? <Ban size={34} color="#64748b" />
                  : <QrCode size={34} color="#f59e0b" />}
              </YStack>
              <Text fontSize="$4" fontWeight="800" color="$text" textAlign="center">
                {cerrado ? 'Este código ya no se puede generar' : 'El QR todavía no está disponible'}
              </Text>
              <Text fontSize="$2" color="$textMuted" textAlign="center">{qr.motivo}</Text>

              {/* Cuántas firmas lleva solo tiene sentido mientras la cadena sigue
                  abierta. En un pase cerrado es ruido: ya no va a avanzar. */}
              {cerrado ? null : (
              <XStack alignItems="center" gap="$2" marginTop="$1">
                <Clock size={13} color={theme.textMuted?.val} />
                <Text fontSize={11} color="$textMuted" fontWeight="700">
                  {pase?.FirmasDadas ?? 0} de {pase?.FirmasRequeridas ?? 0} firmas
                </Text>
              </XStack>
              )}
            </YStack>
          )}
        </YStack>
      </View>
    </Modal>
  )
}
