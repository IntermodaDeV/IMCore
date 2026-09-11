import React, { useRef, useState } from 'react'
import { Modal, StyleSheet, Platform, PermissionsAndroid } from 'react-native'
import { Text, XStack, YStack, View, Spinner, ScrollView } from 'tamagui'
import { X, TriangleAlert } from 'lucide-react-native'
import { ILineaBloqueada } from '../../api/modules/repuestos/repuestos.types'
import { Camera } from 'react-native-camera-kit'

// Color de acento del módulo (primary de la app).
export const ACCENT = '#FF551A'
// El ámbar de 'ojo con esto' que ya usa el resto de la app.
export const WARN = '#f59e0b'

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

// Los helpers de período viven en utils/periodo (sin dependencias). Se
// re-exportan acá para no tocar las pantallas que ya los importaban de este
// archivo, y para que exista UNA sola definición del rango de fechas.
export { MESES, MESES_L, inicioSemana, rango, toParam } from '../../utils/periodo'
export type { Periodo } from '../../utils/periodo'

// Con separador de miles: en el dashboard de consumo los montos son agregados
// (L 28,622.68) y sin separador no se leen. Los totales de un diario suelto, que
// es de donde venia esta funcion, nunca llegaban a esa magnitud.
export const fmtL = (n: number) =>
  `L ${(n || 0).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Por qué AX va a rechazar esta línea. Son DOS problemas distintos y se explican
 *  distinto: probándolo con datos reales salieron los dos en el mismo diario. */
export function motivoBloqueo(b: ILineaBloqueada): 'SIN_COSTO' | 'SIN_EXISTENCIA' {
  // Hay piezas en bodega suficientes, pero AX no sabe costearlas: es el caso de la
  // factura de compra sin registrar.
  return b.Fisico >= b.Pide ? 'SIN_COSTO' : 'SIN_EXISTENCIA'
}

/**
 * Lo que AX va a rechazar al postear, explicado en cristiano.
 *
 * POR QUÉ EXISTE: AX cancela el diario ENTERO por una sola línea mala y devuelve un
 * párrafo suyo —«el precio de coste sólo se conoce para 0.00 en existencias»— que no
 * dice qué línea es. Óscar posteaba 41 líneas, fallaba por la 4, y no había forma de
 * saber cuál sin leer el mensaje de AX con lupa.
 *
 * Se dice la pieza, la cantidad, y a quién hay que ir a buscar (la orden y el
 * proveedor), porque «no se puede» sin eso no le sirve a nadie.
 */
export function BloqueadasModal({
  open,
  bloqueadas,
  totalLineas,
  trabajando,
  colores,
  onApartar,
  onEsperar,
}: {
  open: boolean
  bloqueadas: ILineaBloqueada[]
  totalLineas: number
  trabajando: boolean
  /** ⚠ Los colores VIENEN DE AFUERA a propósito: dentro de un `Modal` de React Native
   *  el contenido se monta en otra raíz y los tokens de Tamagui NO se resuelven — el
   *  texto salía en el color del tema claro sobre un panel oscuro, ilegible. Es la
   *  misma razón por la que `ScannerModal` escribe sus colores a mano. */
  colores: { panel: string; texto: string; suave: string; tenue: string; borde: string }
  onApartar: () => void
  onEsperar: () => void
}) {
  const n = bloqueadas.length
  const quedan = Math.max(0, totalLineas - n)
  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onEsperar}>
      <View flex={1} backgroundColor="rgba(0,0,0,0.6)" justifyContent="flex-end">
        <YStack backgroundColor={colores.panel} borderTopLeftRadius={20} borderTopRightRadius={20}
          paddingHorizontal="$4" paddingTop="$4" paddingBottom={40} gap="$3" maxHeight="88%">

          <XStack alignItems="center" gap="$2">
            <TriangleAlert size={22} color={WARN} />
            <Text fontSize="$6" fontWeight="800" flex={1} color={colores.texto}>
              {n === 1 ? 'AX va a rechazar una línea' : `AX va a rechazar ${n} líneas`}
            </Text>
          </XStack>

          <Text fontSize="$3" lineHeight={20} color={colores.suave}>
            Si posteas así, AX cancela el diario <Text fontWeight="800" color={colores.texto}>completo</Text>,
            no solo{n === 1 ? ' esa línea' : ' esas líneas'}.
          </Text>

          {/* Se encoge para caber, en vez de un alto fijo: con dos tarjetas el alto
              fijo cortaba la segunda a media frase y no se veía que hubiera más. */}
          <ScrollView flexShrink={1}>
            <YStack gap="$2">
              {bloqueadas.map(b => (
                <YStack key={b.LineNum} borderWidth={1} borderColor={WARN} borderRadius={12}
                  padding="$3" gap="$1" backgroundColor="rgba(245,158,11,0.08)">
                  <XStack justifyContent="space-between" alignItems="center">
                    <Text fontSize="$2" fontWeight="800" color={WARN}>Línea {b.LineNum}</Text>
                    <Text fontSize="$2" color={colores.tenue}>pide {b.Pide}</Text>
                  </XStack>
                  <Text fontSize="$4" fontWeight="700" color={colores.texto}>{b.Descripcion || b.ItemId}</Text>
                  <Text fontSize="$2" color={colores.tenue} fontFamily="$mono">{b.ItemId}</Text>
                  {motivoBloqueo(b) === 'SIN_COSTO' ? (
                    <>
                      <Text fontSize="$2" color={colores.suave} lineHeight={18}>
                        Hay {b.Fisico} en bodega, pero AX no sabe cuánto {b.Fisico === 1 ? 'vale' : 'valen'}:
                        con costo registrado tiene {b.Valuadas}. Casi siempre es que no han
                        registrado la factura de compra.
                      </Text>
                      {!!b.PurchId && (
                        <Text fontSize="$2" color={colores.suave} lineHeight={18}>
                          Falta facturar la orden <Text fontWeight="800" color={colores.texto}>{b.PurchId}</Text>
                          {!!b.ProveedorNombre && ` · ${b.ProveedorNombre}`}
                        </Text>
                      )}
                    </>
                  ) : (
                    <Text fontSize="$2" color={colores.suave} lineHeight={18}>
                      {b.Fisico <= 0
                        ? 'AX no tiene existencia de esta pieza en el almacén.'
                        : `En el almacén hay ${b.Fisico} y el diario pide ${b.Pide}.`}
                    </Text>
                  )}
                </YStack>
              ))}
            </YStack>
          </ScrollView>

          {trabajando ? (
            <XStack alignItems="center" justifyContent="center" gap="$2" paddingVertical="$3">
              <Spinner color={ACCENT} />
              <Text fontSize="$3" color={colores.texto}>Apartando…</Text>
            </XStack>
          ) : (
            <YStack gap="$2">
              {quedan <= 0 && (
                <Text fontSize="$2" color={colores.suave} textAlign="center" paddingBottom="$1">
                  No queda ninguna línea que sí se pueda postear.
                </Text>
              )}
              {quedan > 0 && (
                <View onPress={onApartar} pressStyle={{ opacity: 0.85 }} backgroundColor={ACCENT}
                  borderRadius={12} paddingVertical="$3.5" alignItems="center">
                  <Text color="#fff" fontWeight="800" fontSize="$4">
                    Postear las otras {quedan}
                  </Text>
                  <Text color="#fff" opacity={0.9} fontSize="$1" marginTop={2}>
                    {n === 1 ? 'la pieza pasa' : 'las piezas pasan'} a un diario aparte
                  </Text>
                </View>
              )}
              <View onPress={onEsperar} pressStyle={{ opacity: 0.7 }} borderWidth={1}
                borderColor={colores.borde} borderRadius={12} paddingVertical="$3.5" alignItems="center">
                <Text fontWeight="700" fontSize="$4" color={colores.texto}>
                  {quedan > 0 ? 'Esperar' : 'Entendido'}
                </Text>
                <Text color={colores.tenue} fontSize="$1" marginTop={2}>
                  no se postea nada, el diario queda como está
                </Text>
              </View>
            </YStack>
          )}
        </YStack>
      </View>
    </Modal>
  )
}
