import React, { useRef, useState } from 'react'
import { Modal, StyleSheet, Platform, PermissionsAndroid } from 'react-native'
import { Text, XStack, YStack, View } from 'tamagui'
import { X } from 'lucide-react-native'
import { Camera } from 'react-native-camera-kit'

// Color de acento del módulo (primary de la app).
export const ACCENT = '#FF551A'

// Qué situaciones del ticket admiten despacho ya NO está horneado: lo gobierna la
// configuración global 'Mtto.EstadosDespachoRepuestos', que el SP_Linea_Insertar
// lee del lado del servidor. Acá solo se pre-filtra para avisarle a tiempo al
// despachador, antes de que escanee el repuesto.
//
// El default es el mismo que el del SP (todas menos CANCELADO) y se usa cuando la
// configuración no se pudo leer —la tablet sin señal un momento—: trabar el piso
// por no poder leer una lista sería peor. No abre ninguna puerta, porque el SP
// revalida siempre; como mucho el rechazo llega un paso más tarde con su motivo.
export const SITUACIONES_DESPACHO_DEFAULT = [
  'PENDIENTE', 'EN_PROCESO', 'PAUSADO', 'RECHAZADO', 'COMPLETADO', 'VALIDADO',
]

// La SITUACIÓN no es el estado crudo: 'VALIDADO' es un COMPLETADO con sello
// (ValidadoPor). Se resuelve igual que en el SP para que las dos compuertas no
// puedan discrepar.
export const situacionTicket = (estadoCode?: string | null, validadoPor?: string | null): string => {
  const code = (estadoCode ?? '').toUpperCase()
  return code === 'COMPLETADO' && !!validadoPor ? 'VALIDADO' : code
}

export const puedeDespachar = (
  estadoCode?: string | null,
  validadoPor?: string | null,
  situacionesPermitidas: string[] = SITUACIONES_DESPACHO_DEFAULT,
): boolean => situacionesPermitidas.includes(situacionTicket(estadoCode, validadoPor))

// ms de una fecha ISO (para ordenar desc); 0 si vacía/ inválida.
export const ts = (iso?: string | null): number => {
  if (!iso) return 0
  const t = new Date(iso).getTime()
  return isNaN(t) ? 0 : t
}

// "mié 28 jul · 14:01" (día + fecha + hora). Vacío si no hay fecha.
export function fmtFechaHora(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const f = d.toLocaleDateString('es-HN', { weekday: 'short', day: '2-digit', month: 'short' })
  const h = d.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' })
  return `${f} · ${h}`
}

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
  // Permiso de cámara: null=pidiendo, true=concedido, false=denegado. iOS lo pide el SO.
  const [perm, setPerm] = useState<boolean | null>(null)

  // Al (re)abrir: libera el lock y solicita el permiso de cámara en Android
  // (imprescindible en release; sin esto la cámara sale en negro).
  React.useEffect(() => {
    if (!open) return
    lock.current = false
    if (Platform.OS !== 'android') { setPerm(true); return }
    setPerm(null)
    PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
      title: 'Cámara', message: 'Se necesita la cámara para escanear.',
      buttonPositive: 'Permitir', buttonNegative: 'Cancelar',
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
              Habilita el permiso de cámara en los ajustes del dispositivo. También puedes usar el lector físico o el ingreso manual.
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
    <YStack marginBottom="$2" gap="$1.5">
      <XStack alignItems="center" gap="$2">
        <Text fontSize="$2" fontWeight="700" color="$text">{label}</Text>
        {!!hint && <Text fontSize="$1" color="$textMuted">· {hint}</Text>}
      </XStack>
      {children}
      {error && <Text fontSize="$1" color="#ef4444">Este campo es obligatorio</Text>}
    </YStack>
  )
}

// ── Período (Semana/Mes/Año) ─────────────────────────────────────────────────
// Vive acá y no dentro de una pantalla porque el listado de diarios y el KPI de
// suministros TIENEN que calcular el mismo rango; dos copias de esto derivan.

export type Periodo = 'semana' | 'mes' | 'anio'
export const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
export const MESES_L = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

const padNum = (n: number) => String(n).padStart(2, '0')
// ISO local (sin zona) para que el rango coincida con Creation_Date del servidor.
export const toParam = (d: Date) => `${d.getFullYear()}-${padNum(d.getMonth() + 1)}-${padNum(d.getDate())}T${padNum(d.getHours())}:${padNum(d.getMinutes())}:${padNum(d.getSeconds())}`
// Con separador de miles: en el dashboard de consumo los montos son agregados
// (L 28,622.68) y sin separador no se leen. Los totales de un diario suelto, que
// es de donde venia esta funcion, nunca llegaban a esa magnitud.
export const fmtL = (n: number) =>
  `L ${(n || 0).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Lunes 00:00 de la semana de `d`.
export function inicioSemana(d: Date) {
  const x = new Date(d); x.setHours(0, 0, 0, 0)
  const dow = (x.getDay() + 6) % 7   // 0 = lunes
  x.setDate(x.getDate() - dow)
  return x
}

// Rango [desde, hasta) + etiqueta según período y desplazamiento (0 = actual, -1 = anterior).
export function rango(periodo: Periodo, offset: number): { desde: Date; hasta: Date; label: string } {
  const now = new Date()
  if (periodo === 'semana') {
    const desde = inicioSemana(now); desde.setDate(desde.getDate() + offset * 7)
    const hasta = new Date(desde); hasta.setDate(desde.getDate() + 7)
    const fin = new Date(hasta); fin.setDate(hasta.getDate() - 1)
    const label = `${desde.getDate()} ${MESES[desde.getMonth()]} – ${fin.getDate()} ${MESES[fin.getMonth()]}`
    return { desde, hasta, label }
  }
  if (periodo === 'mes') {
    const desde = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    const hasta = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1)
    return { desde, hasta, label: `${MESES_L[desde.getMonth()]} ${desde.getFullYear()}` }
  }
  const desde = new Date(now.getFullYear() + offset, 0, 1)
  const hasta = new Date(now.getFullYear() + offset + 1, 0, 1)
  return { desde, hasta, label: `${desde.getFullYear()}` }
}

