import React, { useRef, useState } from 'react'
import { Modal, StyleSheet, Platform, PermissionsAndroid } from 'react-native'
import { Text, XStack, YStack, View } from 'tamagui'
import { X } from 'lucide-react-native'
import { Camera } from 'react-native-camera-kit'

import { ISalidaFacturaLinea } from '../../api/modules/salidaFacturas/salidaFacturas.types'

// Color de acento del módulo (primary de la app).
export const ACCENT = '#FF551A'

// ── Formatos ────────────────────────────────────────────────────────────────

// "28/08/2026 14:01". Vacío si no hay fecha.
export function fmtFechaHora(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return (
    d.toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' })
  )
}

// Solo la fecha (la fecha de la factura no tiene hora útil).
export function fmtFecha(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Cantidades: la BD las guarda con decimales (AX puede traer negativos en notas de
// crédito) pero en el CD se cuentan piezas enteras. Se muestran los decimales solo
// si de verdad los hay, para no llenar la pantalla de ",00".
export function fmtCantidad(n?: number | null): string {
  if (n === null || n === undefined) return '-'
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)))
}

// ── Agrupación de artículos ─────────────────────────────────────────────────
// El guardia no cuenta líneas de factura: cuenta bultos del mismo artículo y
// color, repartidos por talla. Por eso las líneas se agrupan por (código, color)
// y las tallas quedan como columnas — es la misma vista que la app vieja.

export type GrupoArticulo = {
  clave: string
  itemId: string | null
  color: string | null
  descripcion: string | null
  lineas: ISalidaFacturaLinea[]
}

export function agruparItems(items: ISalidaFacturaLinea[]): GrupoArticulo[] {
  const grupos: GrupoArticulo[] = []
  const porClave = new Map<string, GrupoArticulo>()

  for (const i of items) {
    const clave = `${i.ItemId ?? ''}|${i.Color ?? ''}`
    let g = porClave.get(clave)
    if (!g) {
      g = { clave, itemId: i.ItemId, color: i.Color, descripcion: i.Descripcion, lineas: [] }
      porClave.set(clave, g)
      grupos.push(g)
    }
    g.lineas.push(i)
  }
  return grupos
}

// Piezas de un grupo (valor absoluto: una nota de crédito no resta piezas a contar).
export const piezasDe = (lineas: ISalidaFacturaLinea[]): number =>
  lineas.reduce((s, l) => s + Math.abs(l.Cantidad || 0), 0)

// ── Escáner ─────────────────────────────────────────────────────────────────
// Extrae el código del evento de react-native-camera-kit (el shape varía por
// versión/plataforma). Mismo criterio que el resto de la app.
export function readCode(event: any): string {
  const raw =
    event?.nativeEvent?.codeStringValue ??
    event?.codeStringValue ??
    event?.nativeEvent?.code ??
    event?.code
  return String(raw ?? '').trim()
}

/**
 * Modal de escaneo del código de barras de la factura. `onRead` recibe el código
 * ya limpio; el lock evita que el mismo frame se lea dos veces (con una factura
 * eso significaría dos búsquedas de 30 s).
 */
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
  // Permiso de cámara: null=pidiendo, true=concedido, false=denegado. iOS lo pide el SO.
  const [perm, setPerm] = useState<boolean | null>(null)

  React.useEffect(() => {
    if (!open) return
    lock.current = false
    if (Platform.OS !== 'android') { setPerm(true); return }
    setPerm(null)
    PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
      title: 'Cámara',
      message: 'Se necesita la cámara para escanear la factura.',
      buttonPositive: 'Permitir',
      buttonNegative: 'Cancelar',
    })
      .then(g => setPerm(g === PermissionsAndroid.RESULTS.GRANTED))
      .catch(() => setPerm(false))
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
        {open && perm === true && (
          <Camera style={StyleSheet.absoluteFill} scanBarcode onReadCode={handle} scanThrottleDelay={400} />
        )}
        {open && perm === false && (
          <YStack flex={1} alignItems="center" justifyContent="center" paddingHorizontal="$6" gap="$2">
            <Text color="#fff" fontSize="$5" fontWeight="800">Sin acceso a la cámara</Text>
            <Text color="#fff" opacity={0.8} fontSize="$2" textAlign="center">
              Habilita el permiso de cámara en los ajustes del dispositivo. También puedes escribir
              el número de la factura a mano.
            </Text>
          </YStack>
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

// ── Piezas sueltas de UI ────────────────────────────────────────────────────

/** Aviso en bloque (error / éxito / advertencia). */
export function Aviso({
  tipo,
  children,
}: {
  tipo: 'error' | 'exito' | 'aviso'
  children: React.ReactNode
}) {
  const estilo =
    tipo === 'error'
      ? { bg: 'rgba(239,68,68,0.12)', bd: '#EF4444' }
      : tipo === 'exito'
        ? { bg: 'rgba(34,197,94,0.12)', bd: '#22C55E' }
        : { bg: 'rgba(245,158,11,0.12)', bd: '#f59e0b' }
  return (
    <YStack backgroundColor={estilo.bg} borderLeftWidth={4} borderLeftColor={estilo.bd}
      borderRadius="$3" padding="$3" gap="$1">
      {children}
    </YStack>
  )
}

/** Badge de estado de la factura. */
export function EstadoBadge({ estado }: { estado?: string | null }) {
  const completada = (estado ?? '').toUpperCase() === 'COMPLETADA'
  return (
    <View borderRadius={6} paddingHorizontal="$2" paddingVertical={2}
      backgroundColor={completada ? 'rgba(107,114,128,0.15)' : 'rgba(34,197,94,0.15)'}>
      <Text fontSize="$1" fontWeight="800" color={completada ? '#6b7280' : '#16a34a'}>
        {completada ? 'Salió' : 'En revisión'}
      </Text>
    </View>
  )
}
