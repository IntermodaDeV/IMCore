import React, { useRef } from 'react'
import { Modal, StyleSheet } from 'react-native'
import { Text, XStack, YStack, View } from 'tamagui'
import { X } from 'lucide-react-native'
import { Camera } from 'react-native-camera-kit'

// Color de acento del módulo (primary de la app).
export const ACCENT = '#FF551A'

// Estados de ticket que admiten despacho de repuestos (tickets abiertos/activos).
// Bloqueados: CANCELADO, COMPLETADO (y validado = COMPLETADO con sello). Debe
// coincidir con la validación del backend (SP_Linea_Insertar).
export const ESTADOS_DESPACHO = ['PENDIENTE', 'EN_PROCESO', 'PAUSADO', 'RECHAZADO']
export const puedeDespachar = (estadoCode?: string | null) =>
  ESTADOS_DESPACHO.includes((estadoCode ?? '').toUpperCase())

// Extrae el código del evento de react-native-camera-kit (el shape varía por
// versión/plataforma). Mismo criterio que NewTicketScreen (máquinas).
export function readCode(event: any): string {
  const raw =
    event?.nativeEvent?.codeStringValue ??
    event?.codeStringValue ??
    event?.nativeEvent?.code ??
    event?.code
  return String(raw ?? '').trim()
}

// Modal de escaneo (cámara). Reutilizado para el QR del ticket y el código de
// barras del repuesto. `onRead` recibe el código ya limpio; el lock evita
// lecturas repetidas del mismo frame.
export function ScannerModal({
  open,
  title,
  hint,
  onClose,
  onRead,
}: {
  open: boolean
  title: string
  hint?: string
  onClose: () => void
  onRead: (code: string) => void
}) {
  const lock = useRef(false)

  // Al (re)abrir, liberamos el lock.
  React.useEffect(() => {
    if (open) lock.current = false
  }, [open])

  const handle = (event: any) => {
    if (lock.current) return
    const code = readCode(event)
    if (!code) return
    lock.current = true
    onRead(code)
  }

  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose}>
      <View flex={1} backgroundColor="#000">
        {open && (
          <Camera style={StyleSheet.absoluteFill} scanBarcode onReadCode={handle} scanThrottleDelay={400} />
        )}
        <YStack position="absolute" top={0} left={0} right={0} paddingTop="$8" paddingHorizontal="$4" gap="$2">
          <XStack alignItems="center" justifyContent="space-between">
            <Text color="#fff" fontSize="$5" fontWeight="800">{title}</Text>
            <View onPress={onClose} pressStyle={{ opacity: 0.7 }}
              width={40} height={40} borderRadius={20} alignItems="center" justifyContent="center"
              backgroundColor="rgba(0,0,0,0.5)">
              <X size={24} color="#fff" />
            </View>
          </XStack>
          {!!hint && <Text color="#fff" opacity={0.8} fontSize="$2">{hint}</Text>}
        </YStack>
      </View>
    </Modal>
  )
}

// Etiqueta de campo (mismo estilo que el formulario de tickets).
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: boolean
  children: React.ReactNode
}) {
  return (
    <YStack marginBottom="$5" gap="$2">
      <XStack alignItems="center" gap="$2">
        <Text fontSize="$3" fontWeight="700" color="$text">{label}</Text>
        {!!hint && <Text fontSize="$1" color="$textMuted">· {hint}</Text>}
      </XStack>
      {children}
      {error && <Text fontSize="$1" color="#ef4444">Este campo es obligatorio</Text>}
    </YStack>
  )
}
