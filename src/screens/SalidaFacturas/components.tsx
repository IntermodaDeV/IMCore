import React, { useRef, useState } from 'react'
import { Modal, ScrollView as RNScrollView, StyleSheet, Platform, PermissionsAndroid } from 'react-native'
import { Text, XStack, YStack, View } from 'tamagui'
import { shadows } from '../../theme/shadows'
import { X } from 'lucide-react-native'
import { Camera } from 'react-native-camera-kit'

import { ISalidaCDLinea } from '../../api/modules/salidaFacturas/salidaFacturas.types'

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
  lineas: ISalidaCDLinea[]
}

export function agruparItems(items: ISalidaCDLinea[]): GrupoArticulo[] {
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
export const piezasDe = (lineas: ISalidaCDLinea[]): number =>
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
/**
 * El estado de la revisión.
 *
 * ⚠ Antes esto era `completada ? 'Salió' : 'En revisión'`, o sea que CUALQUIER
 * estado que no fuera COMPLETADA se pintaba «En revisión» en verde. Cuando
 * apareció DESCARTADA, un descarte se veía como algo pendiente —justo lo
 * contrario— y encima en el color de «va bien». Ahora los estados se nombran, y
 * lo que no se reconozca se muestra TAL CUAL en gris: si mañana aparece otro,
 * se va a ver que es otro en vez de disfrazarse del que más se parece.
 */
export function EstadoBadge({ estado }: { estado?: string | null }) {
  const e = (estado ?? '').toUpperCase()
  const { texto, color, fondo } =
    e === 'COMPLETADA' ? { texto: 'Salió', color: '#6b7280', fondo: 'rgba(107,114,128,0.15)' }
    : e === 'EN_REVISION' ? { texto: 'En revisión', color: '#16a34a', fondo: 'rgba(34,197,94,0.15)' }
    : e === 'DESCARTADA' ? { texto: 'Descartada', color: '#dc2626', fondo: 'rgba(220,38,38,0.15)' }
    : { texto: estado || '—', color: '#6b7280', fondo: 'rgba(107,114,128,0.15)' }

  return (
    <View borderRadius={6} paddingHorizontal="$2" paddingVertical={2} backgroundColor={fondo}>
      <Text fontSize="$1" fontWeight="800" color={color}>{texto}</Text>
    </View>
  )
}

/* ══ LA MATRIZ TALLA × CANTIDAD ══════════════════════════════════════════════
   Vive acá y no en la pantalla del guardia porque la usan LAS DOS: la de la
   puerta (interactiva) y el detalle del historial (solo consulta). Es la misma
   decisión que en el web: si se separaran, la vista de supervisión y la de la
   puerta dejarían de coincidir, y entonces el supervisor no estaría revisando
   lo que el guardia vio.

   Sin `onToggleLinea` es de SOLO LECTURA, y ahí las celdas van compactas: en el
   historial interesa que quepan más artículos, no que sean objetivos de dedo.

   Medidas calculadas para que el caso COMÚN quepa sin scroll. En un iPhone de
   393 pt, descontando el padding de la página y de la tarjeta quedan ~337 pt:
   64 (etiqueta) + 4x52 (tallas) + 6 (separación) + 52 (total) = 330. O sea que
   hasta 4 tallas entran completas; de 5 en adelante la fila scrollea. */
const ANCHO_CELDA = 52
const ANCHO_ETIQUETA = 64
/* Separación entre las tallas que scrollean y la columna TOTAL fija. Sin ella,
   una talla cortada al borde se lee pegada al total: "6 | 21" parecían dos
   totales en vez de una cantidad a medio ver. */
const SEP_TOTAL = 6

/**
 * Tarjeta de un artículo + color, con una columna por talla.
 *
 * Las columnas de talla scrollean en horizontal (un artículo puede traer 8 o 10
 * tallas y en un teléfono no caben), pero la etiqueta de la izquierda y la
 * columna Total quedan fijas: son las dos referencias que hay que ver siempre.
 * Las dos filas van DENTRO del mismo scroll para que talla y cantidad no se
 * desalineen.
 */
export function GrupoCard({
  grupo,
  onToggleLinea,
  onToggleGrupo,
}: {
  grupo: GrupoArticulo
  onToggleLinea?: (l: ISalidaCDLinea) => void
  onToggleGrupo?: (g: GrupoArticulo) => void
}) {
  const total = piezasDe(grupo.lineas)
  const todos = grupo.lineas.every(l => l.Revisado)
  const interactivo = !!onToggleLinea
  const alto = interactivo ? 44 : 34
  /* Varias líneas del mismo artículo SIN talla se pintaban como columnas "-"
     todas iguales, sin forma de distinguir cuál es cuál: pasa en los diarios de
     tela, que no traen talla. Se numeran solo en ese caso, para no cambiarle el
     rótulo a las facturas, que sí la traen. */
  const numerar = grupo.lineas.length > 1 && grupo.lineas.every(l => !l.Talla)

  return (
    <YStack backgroundColor="$backgroundElevated" borderRadius="$4" borderWidth={1}
      borderColor={todos ? 'rgba(34,197,94,0.55)' : '$border'} padding="$3" gap="$2" {...shadows.sm}>
      <Text fontSize={interactivo ? '$4' : '$3'} fontWeight="800" color="$text">
        {grupo.descripcion || 'Sin descripción'}
      </Text>
      <XStack gap="$3" flexWrap="wrap">
        <Text fontSize="$2" color="$textMuted">Color: <Text fontWeight="700" color="$text">{grupo.color || '-'}</Text></Text>
        <Text fontSize="$2" color="$textMuted">Código: <Text fontWeight="700" color="$text">{grupo.itemId || '-'}</Text></Text>
      </XStack>

      <XStack>
        {/* Etiquetas fijas */}
        <YStack width={ANCHO_ETIQUETA}>
          <Celda ancho={ANCHO_ETIQUETA} alto={alto}>
            <Text fontSize="$1" fontWeight="800" color="$textMuted">TALLA</Text>
          </Celda>
          <Celda ancho={ANCHO_ETIQUETA} alto={alto}>
            <Text fontSize="$1" fontWeight="800" color="$textMuted">CANT.</Text>
          </Celda>
        </YStack>

        {/* Tallas (scroll horizontal, las dos filas juntas) */}
        <RNScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
          <YStack>
            <XStack>
              {grupo.lineas.map((l, idx) => (
                <Celda key={`t-${l.LineNum}`} ancho={ANCHO_CELDA} alto={alto}>
                  <Text fontSize="$2" fontWeight="700" color="$textSecondary">
                    {l.Talla || (numerar ? `#${idx + 1}` : '-')}
                  </Text>
                </Celda>
              ))}
            </XStack>
            <XStack>
              {grupo.lineas.map(l => (
                <Celda key={`c-${l.LineNum}`} ancho={ANCHO_CELDA} alto={alto}
                  onPress={onToggleLinea ? () => onToggleLinea(l) : undefined}
                  revisado={l.Revisado}>
                  <Text fontSize={interactivo ? '$4' : '$3'} fontWeight="900" color={l.Revisado ? '#fff' : '$text'}>
                    {fmtCantidad(l.Cantidad)}
                  </Text>
                </Celda>
              ))}
            </XStack>
          </YStack>
        </RNScrollView>

        {/* Total fijo: en modo interactivo, tocar acá marca todas las tallas */}
        <YStack width={ANCHO_CELDA} marginLeft={SEP_TOTAL}>
          <Celda ancho={ANCHO_CELDA} alto={alto}>
            <Text fontSize="$1" fontWeight="800" color="$textMuted">TOTAL</Text>
          </Celda>
          <Celda ancho={ANCHO_CELDA} alto={alto}
            onPress={onToggleGrupo ? () => onToggleGrupo(grupo) : undefined} revisado={todos}>
            <Text fontSize={interactivo ? '$4' : '$3'} fontWeight="900" color={todos ? '#fff' : '$text'}>
              {fmtCantidad(total)}
            </Text>
          </Celda>
        </YStack>
      </XStack>
    </YStack>
  )
}

/** Celda de la matriz talla/cantidad. Con onPress se vuelve el check del guardia. */
function Celda({
  ancho,
  alto = 44,
  children,
  onPress,
  revisado,
}: {
  ancho: number
  alto?: number
  children: React.ReactNode
  onPress?: () => void
  revisado?: boolean
}) {
  return (
    <View
      width={ancho}
      // flexShrink=0 es imprescindible: sin esto, cuando las tallas no caben en el
      // ancho de la pantalla NO scrollean — se aplastan. Con 4 tallas la última
      // quedaba encimada contra la columna TOTAL. Tamagui trae flexShrink=1 por
      // omisión, y un ancho fijo no lo evita.
      flexShrink={0}
      height={alto}
      alignItems="center"
      justifyContent="center"
      borderWidth={1}
      borderColor={revisado ? '#22C55E' : '$border'}
      backgroundColor={revisado ? '#22C55E' : 'transparent'}
      onPress={onPress}
      pressStyle={onPress ? { opacity: 0.7 } : undefined}
    >
      {children}
    </View>
  )
}
