import React, { useCallback, useMemo, useState } from 'react'
import { ScrollView as RNScrollView } from 'react-native'
import { Text, XStack, YStack, View, Spinner, useTheme } from 'tamagui'
import { ScanBarcode, RotateCw, Search, CheckCircle2 } from 'lucide-react-native'

import KeyboardAwareForm from '../../components/commons/KeyboardAwareForm'
import AppInput from '../../components/commons/AppInput'
import { usePageHeader } from '../../hooks/usePageHeader'
import { useShowToast } from '../../utils/useShowToast'
import { shadows } from '../../theme/shadows'
import { salidaFacturasService } from '../../api/modules/salidaFacturas/salidaFacturas.service'
import { ISalidaFactura, ISalidaFacturaLinea } from '../../api/modules/salidaFacturas/salidaFacturas.types'
import {
  ACCENT, Aviso, GrupoArticulo, ScannerModal, agruparItems,
  fmtCantidad, fmtFecha, fmtFechaHora, piezasDe,
} from './components'

/**
 * Control de Salida de Facturas del CD (pantalla del guardia).
 *
 * El guardia escanea el código de barras de la factura, va marcando lo que
 * cuenta y confirma la salida. Las líneas se agrupan por artículo + color con
 * las tallas como columnas: es como está armado el bulto que tiene enfrente,
 * no como está armada la factura.
 *
 * Reglas que NO viven acá (las hace valer el servidor, que es lo que importa):
 * una factura sale una sola vez, y no sale con artículos sin revisar. Acá solo
 * se refleja: el botón se ve deshabilitado y la factura ya salida se muestra
 * bloqueada.
 */
export default function SalidaFacturaScreen() {
  usePageHeader({
    center: <Text fontSize="$4" fontWeight="700" color="$text">Salida de Facturas</Text>,
  })

  const theme = useTheme()
  const { showToast } = useShowToast()

  const [scannerOpen, setScannerOpen] = useState(false)
  const [manual, setManual] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [factura, setFactura] = useState<ISalidaFactura | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [salida, setSalida] = useState<{ invoiceId: string; fecha: string | null } | null>(null)

  // ── Búsqueda ──────────────────────────────────────────────────────────────

  const buscar = useCallback(async (codigo: string) => {
    const cod = (codigo || '').trim()
    if (!cod) return
    setBuscando(true)
    setError(null)
    setSalida(null)
    try {
      const res = await salidaFacturasService.escanear(cod)
      if (res.Success && res.Data) {
        setFactura(res.Data)
        setManual('')
      } else {
        setFactura(null)
        setError(res.ErrorMessage || 'No se pudo cargar la factura')
      }
    } catch (e: any) {
      setFactura(null)
      setError(e?.message || 'No se pudo consultar la factura. Intenta de nuevo.')
    } finally {
      setBuscando(false)
    }
  }, [])

  const onScan = (code: string) => {
    setScannerOpen(false)
    buscar(code)
  }

  const limpiar = () => {
    setFactura(null)
    setError(null)
    setSalida(null)
    setManual('')
  }

  // ── Marcar artículos ──────────────────────────────────────────────────────

  // Cambio local inmediato: el guardia toca mientras cuenta y no puede esperar
  // el viaje al servidor por cada talla. Si el servidor rechaza, se revierte y
  // se avisa; y de todos modos la salida la valida el servidor al confirmar,
  // así que un check perdido no puede dejar salir una factura sin revisar.
  const aplicarLocal = (lineNums: number[], valor: boolean) =>
    setFactura(f => f
      ? { ...f, Items: f.Items.map(i => (lineNums.includes(i.LineNum) ? { ...i, Revisado: valor } : i)) }
      : f)

  const marcar = async (lineNums: number[], valor: boolean) => {
    if (!factura?.InvoiceId || !lineNums.length) return
    const invoiceId = factura.InvoiceId
    aplicarLocal(lineNums, valor)
    try {
      const resultados = await Promise.all(
        lineNums.map(n => salidaFacturasService.marcarLinea(invoiceId, n, valor)),
      )
      const fallo = resultados.find(r => !r.Success)
      if (fallo) throw new Error(fallo.ErrorMessage || 'No se pudo marcar el artículo')
    } catch (e: any) {
      aplicarLocal(lineNums, !valor)
      const msg = e?.message || 'No se pudo marcar el artículo'
      showToast('error', 'No se guardó', msg)
      // Si la factura ya salió (otro guardia la cerró), la pantalla está vieja:
      // se recarga para que muestre el bloqueo en vez de dejar seguir marcando.
      if (msg.toLowerCase().includes('ya salió')) buscar(invoiceId)
    }
  }

  const toggleLinea = (linea: ISalidaFacturaLinea) => marcar([linea.LineNum], !linea.Revisado)

  const toggleGrupo = (g: GrupoArticulo) => {
    const todos = g.lineas.every(l => l.Revisado)
    marcar(g.lineas.map(l => l.LineNum), !todos)
  }

  // ── Confirmar salida ──────────────────────────────────────────────────────

  const confirmar = async () => {
    if (!factura?.InvoiceId) return
    const invoiceId = factura.InvoiceId
    setConfirmando(true)
    try {
      const res = await salidaFacturasService.completar(invoiceId)
      if (res.Success) {
        setSalida({ invoiceId, fecha: res.Data?.FechaSalida ?? null })
        setFactura(null)
      } else {
        showToast('error', 'No se pudo confirmar', res.ErrorMessage || 'Intenta de nuevo')
      }
    } catch (e: any) {
      showToast('error', 'Error', e?.message || 'No se pudo confirmar la salida')
    } finally {
      setConfirmando(false)
    }
  }

  // ── Derivados ─────────────────────────────────────────────────────────────

  const avance = useMemo(() => {
    const items = factura?.Items ?? []
    const total = items.length
    const revisados = items.filter(i => i.Revisado).length
    const piezas = piezasDe(items)
    const piezasRevisadas = piezasDe(items.filter(i => i.Revisado))
    return {
      total, revisados, piezas, piezasRevisadas,
      pct: total ? Math.round((revisados / total) * 100) : 0,
      completo: total > 0 && revisados === total,
    }
  }, [factura])

  const grupos = useMemo(() => agruparItems(factura?.Items ?? []), [factura])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View flex={1} backgroundColor="$background">
      <KeyboardAwareForm contentContainerStyle={{ padding: 16, paddingBottom: 40, width: '100%', maxWidth: 1000, alignSelf: 'center' }}>
        {/* Escanear / escribir */}
        {!factura && (
          <YStack backgroundColor="$backgroundElevated" borderRadius="$4" borderWidth={1} borderColor="$border"
            padding="$4" gap="$3" {...shadows.sm}>
            <Text fontSize="$5" fontWeight="800" color="$text">Escanear factura</Text>

            <View onPress={() => setScannerOpen(true)} pressStyle={{ opacity: 0.85 }}
              backgroundColor={ACCENT} borderRadius="$4" height={54} flexDirection="row"
              alignItems="center" justifyContent="center" gap="$2">
              <ScanBarcode size={22} color="#fff" />
              <Text color="#fff" fontWeight="800" fontSize="$4">Escanear código de barra</Text>
            </View>

            <XStack alignItems="center" gap="$2">
              <View flex={1} height={1} backgroundColor="$border" />
              <Text fontSize="$2" color="$textMuted">o escribe el número</Text>
              <View flex={1} height={1} backgroundColor="$border" />
            </XStack>

            <AppInput
              label="Número de factura"
              placeholder="Ej. 336482"
              value={manual}
              onChangeText={setManual}
              autoCapitalize="none"
              /* phone-pad = el teclado numérico del celular (equivale al
                 inputmode="tel" de la app vieja). OJO: NO usar
                 keyboardType="numeric" — AppInput lo interpreta como cantidad y
                 le mete separador de miles, así que 336482 se vería "336,482". */
              keyboardType="phone-pad"
              returnKeyType="search"
              onSubmitEditing={() => buscar(manual)}
            />
            <View onPress={() => buscar(manual)} pressStyle={{ opacity: 0.85 }}
              opacity={manual.trim() ? 1 : 0.4}
              borderWidth={1} borderColor={ACCENT} borderRadius="$4" height={46}
              flexDirection="row" alignItems="center" justifyContent="center" gap="$2">
              <Search size={18} color={ACCENT} />
              <Text color={ACCENT} fontWeight="800" fontSize="$3">Buscar</Text>
            </View>
          </YStack>
        )}

        {/* Buscando: la primera lectura de una factura pega contra AX y puede tardar */}
        {buscando && (
          <YStack backgroundColor="$backgroundElevated" borderRadius="$4" borderWidth={1} borderColor="$border"
            padding="$5" marginTop="$3" alignItems="center" gap="$2" {...shadows.sm}>
            <Spinner size="large" color={ACCENT} />
            <Text color="$text" fontWeight="700">Buscando factura…</Text>
            <Text color="$textMuted" fontSize="$2" textAlign="center">
              La primera vez puede tardar unos segundos
            </Text>
          </YStack>
        )}

        {/* Error de búsqueda */}
        {!!error && !buscando && (
          <YStack marginTop="$3">
            <Aviso tipo="error">
              <Text fontSize="$3" fontWeight="700" color="$text">{error}</Text>
              <Text fontSize="$2" color="$textMuted">
                Verifica el número o vuelve a escanear el código de barra.
              </Text>
            </Aviso>
          </YStack>
        )}

        {/* Salida confirmada */}
        {!!salida && !buscando && (
          <YStack marginTop="$3" gap="$3">
            <Aviso tipo="exito">
              <XStack alignItems="center" gap="$2">
                <CheckCircle2 size={20} color="#16a34a" />
                <Text fontSize="$4" fontWeight="800" color="$text">Salida confirmada</Text>
              </XStack>
              <Text fontSize="$3" color="$text">
                Factura <Text fontWeight="800">{salida.invoiceId}</Text>
                {salida.fecha ? ` · ${fmtFechaHora(salida.fecha)}` : ''}
              </Text>
            </Aviso>
          </YStack>
        )}

        {/* Factura bloqueada. Los dos motivos son conversaciones distintas con el
            guardia: una ya salió (y hay que decirle cuándo y con quién), la otra es
            de antes de que existiera el control (y no hay nada que hacer acá). */}
        {factura?.Bloqueada && (
          <YStack gap="$3">
            {factura.MotivoBloqueo === 'ANTERIOR_AL_CORTE' ? (
              <Aviso tipo="aviso">
                <Text fontSize="$4" fontWeight="800" color="$text">Factura anterior al control</Text>
                <Text fontSize="$3" color="$text">
                  Factura <Text fontWeight="800">{factura.InvoiceId}</Text>
                  {factura.FechaFactura ? ` · ${fmtFecha(factura.FechaFactura)}` : ''}
                </Text>
                {/* El texto lo arma el servidor: así dice la fecha de corte vigente
                    aunque la muevan sin recompilar la app. */}
                <Text fontSize="$2" color="$textMuted">
                  {factura.MensajeBloqueo ||
                    'Esta factura es anterior al inicio del control de salida y no se puede procesar aquí.'}
                </Text>
              </Aviso>
            ) : (
              <Aviso tipo="error">
                <Text fontSize="$4" fontWeight="800" color="$text">Esta factura ya salió del CD</Text>
                <Text fontSize="$3" color="$text">
                  Factura <Text fontWeight="800">{factura.InvoiceId}</Text>
                  {factura.FechaSalida ? ` · ${fmtFechaHora(factura.FechaSalida)}` : ''}
                </Text>
                {!!factura.GuardiaSalida && (
                  <Text fontSize="$2" color="$textMuted">Guardia: {factura.GuardiaSalida}</Text>
                )}
                <Text fontSize="$2" color="$textMuted">No se puede volver a procesar.</Text>
              </Aviso>
            )}
            <BotonOtra onPress={limpiar} />
          </YStack>
        )}

        {/* Factura en revisión */}
        {!!factura && !factura.Bloqueada && (
          <YStack gap="$3">
            {/* Cabecera */}
            <YStack backgroundColor="$backgroundElevated" borderRadius="$4" borderWidth={1} borderColor="$border"
              padding="$4" gap="$2" {...shadows.sm}>
              <XStack alignItems="center" justifyContent="space-between" gap="$2">
                <Text fontSize="$6" fontWeight="900" color="$text" flex={1} numberOfLines={1}>
                  {factura.InvoiceId}
                </Text>
                <View onPress={() => buscar(factura.InvoiceId!)} pressStyle={{ opacity: 0.6 }} hitSlop={10} padding="$1">
                  <RotateCw size={18} color={theme.textMuted?.val} />
                </View>
              </XStack>
              <Dato etiqueta="Cliente" valor={factura.Cliente} />
              <Dato etiqueta="Fecha de factura" valor={fmtFecha(factura.FechaFactura) || null} />
              <Dato etiqueta="Pedido de venta" valor={factura.PedidoVenta} />

              {/* Avance */}
              <XStack alignItems="center" justifyContent="space-between" marginTop="$2">
                <XStack alignItems="baseline" gap="$1.5">
                  <Text fontSize="$2" color="$textMuted" fontWeight="700">PIEZAS</Text>
                  <Text fontSize="$5" fontWeight="900" color="$text">
                    {fmtCantidad(avance.piezasRevisadas)} / {fmtCantidad(avance.piezas)}
                  </Text>
                </XStack>
                <Text fontSize="$2" color="$textMuted" fontWeight="700">
                  {avance.revisados} / {avance.total} revisados
                </Text>
              </XStack>
              <View height={8} borderRadius={4} backgroundColor="$backgroundSurface" overflow="hidden">
                <View height={8} borderRadius={4} width={`${avance.pct}%`}
                  backgroundColor={avance.completo ? '#22C55E' : ACCENT} />
              </View>
            </YStack>

            {/* Artículos por artículo + color, tallas como columnas */}
            {grupos.map(g => (
              <GrupoCard key={g.clave} grupo={g} onToggleLinea={toggleLinea} onToggleGrupo={toggleGrupo} />
            ))}

            {/* Confirmar */}
            <View onPress={avance.completo && !confirmando ? confirmar : undefined}
              pressStyle={{ opacity: avance.completo ? 0.85 : 1 }}
              opacity={avance.completo && !confirmando ? 1 : 0.45}
              backgroundColor="#22C55E" borderRadius="$4" height={54}
              flexDirection="row" alignItems="center" justifyContent="center" gap="$2">
              {confirmando ? <Spinner color="#fff" /> : <CheckCircle2 size={22} color="#fff" />}
              <Text color="#fff" fontWeight="800" fontSize="$4">
                {confirmando ? 'Confirmando…' : 'Confirmar salida'}
              </Text>
            </View>
            {!avance.completo && (
              <Text fontSize="$2" color="$textMuted" textAlign="center">
                Faltan {avance.total - avance.revisados} artículos por revisar
              </Text>
            )}

            <BotonOtra onPress={limpiar} texto="Escanear otra factura" />
          </YStack>
        )}
      </KeyboardAwareForm>

      <ScannerModal
        open={scannerOpen}
        title="Escanear factura"
        hint="Apunta al código de barras de la factura"
        onClose={() => setScannerOpen(false)}
        onRead={onScan}
      />
    </View>
  )
}

// ── Piezas de la pantalla ───────────────────────────────────────────────────

function Dato({ etiqueta, valor }: { etiqueta: string; valor?: string | null }) {
  return (
    <XStack gap="$2" flexWrap="wrap">
      <Text fontSize="$3" color="$textMuted">{etiqueta}:</Text>
      <Text fontSize="$3" fontWeight="700" color="$text" flex={1}>{valor || '-'}</Text>
    </XStack>
  )
}

function BotonOtra({ onPress, texto = 'Escanear otra' }: { onPress: () => void; texto?: string }) {
  return (
    <View onPress={onPress} pressStyle={{ opacity: 0.85 }}
      borderWidth={1} borderColor="$border" borderRadius="$4" height={48}
      flexDirection="row" alignItems="center" justifyContent="center" gap="$2">
      <ScanBarcode size={18} color={ACCENT} />
      <Text color={ACCENT} fontWeight="800" fontSize="$3">{texto}</Text>
    </View>
  )
}

/* Medidas calculadas para que el caso COMÚN quepa sin scroll. En un iPhone de
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
 * columna Total quedan fijas: son las dos referencias que el guardia necesita
 * ver siempre. Las dos filas van DENTRO del mismo scroll para que talla y
 * cantidad no se desalineen.
 */
function GrupoCard({
  grupo,
  onToggleLinea,
  onToggleGrupo,
}: {
  grupo: GrupoArticulo
  onToggleLinea: (l: ISalidaFacturaLinea) => void
  onToggleGrupo: (g: GrupoArticulo) => void
}) {
  const total = piezasDe(grupo.lineas)
  const todos = grupo.lineas.every(l => l.Revisado)

  return (
    <YStack backgroundColor="$backgroundElevated" borderRadius="$4" borderWidth={1}
      borderColor={todos ? 'rgba(34,197,94,0.55)' : '$border'} padding="$3" gap="$2" {...shadows.sm}>
      <Text fontSize="$4" fontWeight="800" color="$text">{grupo.descripcion || 'Sin descripción'}</Text>
      <XStack gap="$3" flexWrap="wrap">
        <Text fontSize="$2" color="$textMuted">Color: <Text fontWeight="700" color="$text">{grupo.color || '-'}</Text></Text>
        <Text fontSize="$2" color="$textMuted">Código: <Text fontWeight="700" color="$text">{grupo.itemId || '-'}</Text></Text>
      </XStack>

      <XStack>
        {/* Etiquetas fijas */}
        <YStack width={ANCHO_ETIQUETA}>
          <Celda ancho={ANCHO_ETIQUETA}>
            <Text fontSize="$1" fontWeight="800" color="$textMuted">TALLA</Text>
          </Celda>
          <Celda ancho={ANCHO_ETIQUETA}>
            <Text fontSize="$1" fontWeight="800" color="$textMuted">CANT.</Text>
          </Celda>
        </YStack>

        {/* Tallas (scroll horizontal, las dos filas juntas) */}
        <RNScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
          <YStack>
            <XStack>
              {grupo.lineas.map(l => (
                <Celda key={`t-${l.LineNum}`} ancho={ANCHO_CELDA}>
                  <Text fontSize="$2" fontWeight="700" color="$textSecondary">{l.Talla || '-'}</Text>
                </Celda>
              ))}
            </XStack>
            <XStack>
              {grupo.lineas.map(l => (
                <Celda key={`c-${l.LineNum}`} ancho={ANCHO_CELDA} onPress={() => onToggleLinea(l)}
                  revisado={l.Revisado}>
                  <Text fontSize="$4" fontWeight="900" color={l.Revisado ? '#fff' : '$text'}>
                    {fmtCantidad(l.Cantidad)}
                  </Text>
                </Celda>
              ))}
            </XStack>
          </YStack>
        </RNScrollView>

        {/* Total fijo: toca aquí para marcar todas las tallas del artículo */}
        <YStack width={ANCHO_CELDA} marginLeft={SEP_TOTAL}>
          <Celda ancho={ANCHO_CELDA}>
            <Text fontSize="$1" fontWeight="800" color="$textMuted">TOTAL</Text>
          </Celda>
          <Celda ancho={ANCHO_CELDA} onPress={() => onToggleGrupo(grupo)} revisado={todos}>
            <Text fontSize="$4" fontWeight="900" color={todos ? '#fff' : '$text'}>
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
  children,
  onPress,
  revisado,
}: {
  ancho: number
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
      height={44}
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
