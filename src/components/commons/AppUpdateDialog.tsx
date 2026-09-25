import React from 'react'
import { Platform } from 'react-native'
import { AlertDialog, Button, Text, XStack, YStack } from 'tamagui'
import { Download } from 'lucide-react-native'
import { shadows } from '../../theme/shadows'
import { openStore, useAppUpdateCheck } from '../../services/appUpdate'

const ACCENT = '#FF551A'

/**
 * Aviso de versión nueva (ver services/appUpdate). Opcional: «Más tarde» lo
 * descarta por un día. Obligatoria (build instalado < BuildMinimo): sin forma de
 * cerrarlo, porque la versión instalada ya no funciona con la API.
 */
export default function AppUpdateDialog() {
  const { estado, descartar } = useAppUpdateCheck()
  if (!estado) return null
  const tienda = Platform.OS === 'ios' ? 'App Store' : 'Play Store'

  return (
    <AlertDialog
      open
      onOpenChange={(v) => { if (!v && !estado.obligatoria) descartar() }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay
          key="overlay"
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
          opacity={0.6}
          backgroundColor="black"
        />
        <AlertDialog.Content
          elevate
          key="content"
          width="85%"
          alignSelf="center"
          enterStyle={{ y: -12, opacity: 0, scale: 0.94 }}
          exitStyle={{ y: 8, opacity: 0, scale: 0.96 }}
          backgroundColor="$backgroundElevated"
          borderRadius="$6"
          paddingHorizontal="$5"
          paddingVertical="$5"
          marginHorizontal="$5"
          x={0} y={0} scale={1} opacity={1}
          {...shadows.lg}
        >
          <YStack gap="$2" alignItems="center">
            <YStack width={56} height={56} borderRadius={28} backgroundColor={`${ACCENT}18`}
              justifyContent="center" alignItems="center">
              <Download size={26} color={ACCENT} />
            </YStack>

            <YStack gap="$1.5" alignItems="center" width="100%">
              <AlertDialog.Title>
                <Text fontSize={16} fontWeight="700" color="$text" textAlign="center">
                  {estado.obligatoria ? 'Actualización necesaria' : 'Hay una nueva versión'}
                </Text>
              </AlertDialog.Title>
              <AlertDialog.Description>
                <Text fontSize={13} color="$textMuted" lineHeight={20} textAlign="center">
                  {estado.obligatoria
                    ? `Esta versión de IMCore ya no es compatible. Instala la ${estado.version} desde ${tienda} para seguir usándola.`
                    : `IMCore ${estado.version} ya está disponible en ${tienda}.`}
                </Text>
              </AlertDialog.Description>
            </YStack>

            <XStack gap="$3" width="100%" marginTop="$1">
              {!estado.obligatoria && (
                <Button flex={1} height={42} borderRadius="$4" backgroundColor="$buttonSecondary"
                  borderWidth={0} pressStyle={{ opacity: 0.7 }} onPress={descartar}>
                  <Text fontSize={14} fontWeight="600" color="$text">Más tarde</Text>
                </Button>
              )}
              <Button flex={1} height={42} borderRadius="$4" backgroundColor={ACCENT}
                borderWidth={0} pressStyle={{ opacity: 0.7 }} onPress={openStore}>
                <Text fontSize={14} fontWeight="600" color="white">Actualizar</Text>
              </Button>
            </XStack>
          </YStack>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog>
  )
}
