import React from 'react'
import { YStack, XStack, Text, View, Button } from 'tamagui'
import QRCode from 'react-native-qrcode-svg'
import FormDialog from '../../components/commons/FormDialog'
import { IPase } from '../../api/modules/pases/pases.types'
import { textoHoras, textoSecuencia } from './paseFormat'

/**
 * El QR de un permiso, para mostrarlo en la puerta cuando la persona no trae su
 * carnet. Seguridad lo escanea con el mismo gesto y el servidor resuelve cuál es
 * el movimiento que toca.
 *
 * Vive acá y no dentro de una pantalla porque se usa en dos —Mis pases y el
 * Historial— y el día que cambie el texto tiene que cambiar en las dos.
 *
 * El token solo llega desde el servidor cuando el permiso es de quien consulta:
 * ni Mis pases ni el Historial lo reciben para los permisos de otra persona, así
 * que "es tuyo y no se comparte" no depende de que la pantalla se porte bien.
 */
export default function PaseQrDialog({
  pase,
  onClose,
}: {
  pase: IPase | null
  onClose: () => void
}) {
  return (
    <FormDialog
      open={!!pase}
      onOpenChange={(v) => { if (!v) onClose() }}
      title="Tu permiso"
      description={pase ? `${pase.Categoria ?? textoSecuencia(pase.Tipo)} · ${pase.FechaPase ?? ''}` : ''}
      footer={
        <XStack marginTop="$3">
          <Button
            flex={1}
            height={45}
            borderRadius="$3"
            backgroundColor="$buttonSecondary"
            pressStyle={{ opacity: 0.7 }}
            onPress={onClose}
          >
            <Text color="$text" fontWeight="700">Cerrar</Text>
          </Button>
        </XStack>
      }
    >
      <YStack alignItems="center" gap="$3" paddingVertical="$2">
        {/* Fondo blanco fijo: el QR se lee por contraste y en tema oscuro sobre
            fondo oscuro el lector no lo agarra. */}
        <View backgroundColor="#FFFFFF" padding="$3" borderRadius="$4">
          {!!pase?.Token && <QRCode value={pase.Token} size={200} />}
        </View>

        {!!pase && !!textoHoras(pase) && (
          <Text fontSize={13} color="$text" fontWeight="600">{textoHoras(pase)}</Text>
        )}

        <Text fontSize={11} color="$textMuted" textAlign="center">
          Mostralo en la puerta si no traés tu carnet. Es tuyo y sirve solo para este
          permiso: al completarse deja de funcionar.
        </Text>
      </YStack>
    </FormDialog>
  )
}
