import React from 'react'
import { Text, View, XStack } from 'tamagui'
import { EstadoCorrida, EstadoProceso, ICorrida, ModoCorrida } from '../../api/modules/creditos/administracionPaquetes.types'

export const ACCENT = '#FF551A'

// ── Modo ────────────────────────────────────────────────────────────────────
// FALTANTES quita unidades (llegó menos de lo vendido); SOBRANTES las reparte
// (llegó de más). Son operaciones opuestas, así que van en colores opuestos.
const MODO: Record<ModoCorrida, { txt: string; bg: string; fg: string }> = {
  FALTANTES: { txt: 'Faltantes', bg: 'rgba(234,88,12,0.13)', fg: '#c2410c' },
  SOBRANTES: { txt: 'Sobrantes', bg: 'rgba(13,148,136,0.13)', fg: '#0f766e' },
}

export function ModoChip({ modo }: { modo: ModoCorrida }) {
  const c = MODO[modo] ?? MODO.FALTANTES
  return (
    <View backgroundColor={c.bg} borderRadius="$10" paddingHorizontal="$2.5" paddingVertical="$1">
      <Text fontSize={11} fontWeight="800" color={c.fg}>{c.txt}</Text>
    </View>
  )
}

// ── Estado de la corrida ────────────────────────────────────────────────────
// Lo que importa de un vistazo: si ya tiene resultado (verde), si está a medio
// camino (gris/azul) o si se fue a AX y ya no se puede tocar (morado).
const ESTADO: Record<EstadoCorrida, { txt: string; bg: string; fg: string }> = {
  BORRADOR:  { txt: 'Borrador',   bg: 'rgba(107,114,128,0.15)', fg: '#6b7280' },
  INSUMOS:   { txt: 'Con datos',  bg: 'rgba(37,99,235,0.13)',   fg: '#1d4ed8' },
  CALCULADA: { txt: 'Calculada',  bg: 'rgba(34,197,94,0.15)',   fg: '#16a34a' },
  APLICADA:  { txt: 'Aplicada',   bg: 'rgba(124,58,237,0.15)',  fg: '#7c3aed' },
  ERROR:     { txt: 'Con error',  bg: 'rgba(239,68,68,0.15)',   fg: '#dc2626' },
}

export function EstadoChip({ estado }: { estado: EstadoCorrida }) {
  const c = ESTADO[estado] ?? ESTADO.BORRADOR
  return (
    <View backgroundColor={c.bg} borderRadius="$10" paddingHorizontal="$2.5" paddingVertical="$1">
      <Text fontSize={11} fontWeight="700" color={c.fg}>{c.txt}</Text>
    </View>
  )
}

export const colorEstado = (e: EstadoCorrida) => (ESTADO[e] ?? ESTADO.BORRADOR).fg

// ── Estado de la carga de datos de AX ───────────────────────────────────────
export const PROCESO: Record<EstadoProceso, { txt: string; fg: string }> = {
  EN_CURSO:  { txt: 'Trayendo datos de AX…', fg: '#1d4ed8' },
  OK:        { txt: 'Datos cargados',        fg: '#16a34a' },
  ERROR:     { txt: 'Falló la carga',        fg: '#dc2626' },
  CANCELADO: { txt: 'Carga cancelada',       fg: '#6b7280' },
}

/**
 * LOS DOS TRABAJOS LARGOS NO SON LO MISMO y la pantalla tiene que decir cuál.
 * Uno LEE de AX para armar la corrida; el otro ESCRIBE en los pedidos de venta.
 * Decir «Trayendo datos de AX…» mientras se manda el lote hace creer que está
 * corriendo otra cosa.
 */
export const PROCESO_ENVIO: Record<EstadoProceso, { txt: string; fg: string }> = {
  EN_CURSO:  { txt: 'Enviando a AX…',  fg: '#1d4ed8' },
  OK:        { txt: 'Enviado a AX',    fg: '#16a34a' },
  ERROR:     { txt: 'Falló el envío',  fg: '#dc2626' },
  CANCELADO: { txt: 'Envío detenido',  fg: '#6b7280' },
}

/** El chip que corresponde, según qué trabajo corrió último en esa corrida. */
export const chipProceso = (tipo?: string | null, estado?: EstadoProceso | null) =>
  estado ? (tipo === 'ENVIO_AX' ? PROCESO_ENVIO[estado] : PROCESO[estado]) : null

/**
 * LA "EFICIENCIA" DE UNA CORRIDA.
 *
 * Es la COBERTURA: de las unidades que había que repartir (la meta que salió del
 * balance), cuántas alcanzó a colocar el reparto sobre los pedidos reales.
 *
 * No se mide sobre los clientes a propósito. El reparto no busca tocar a muchos
 * ni a pocos: busca cuadrar unidades. Un 100% tocando a 40 clientes es MEJOR que
 * un 100% tocando a 300 — por eso los clientes se muestran aparte, como el costo
 * de haberlo logrado, y no como el logro.
 *
 * Queda por debajo de 100% cuando los pedidos de los clientes seleccionados no
 * dan para cubrir el faltante de algún SKU. Eso no es una falla del cálculo: es
 * que no había de dónde sacarlo.
 */
export function cobertura(c: ICorrida): number | null {
  const meta = c.TotalUnidadesMeta ?? 0
  if (meta <= 0) return null
  return Math.round(((c.TotalUnidadesAdmin ?? 0) * 100) / meta)
}

export const colorCobertura = (pct: number) =>
  pct >= 99 ? '#16a34a' : pct >= 90 ? '#ca8a04' : '#dc2626'

/** Barra de cobertura. Sin número: el número va al lado, en el texto. */
export function BarraCobertura({ pct }: { pct: number }) {
  const c = colorCobertura(pct)
  return (
    <View height={6} borderRadius={3} backgroundColor="rgba(148,163,184,0.28)" overflow="hidden">
      <View height={6} borderRadius={3} backgroundColor={c} width={`${Math.max(0, Math.min(100, pct))}%`} />
    </View>
  )
}

// ── Formato ─────────────────────────────────────────────────────────────────

export const fmtNum = (n?: number | null) =>
  n === null || n === undefined ? '—' : n.toLocaleString('es-HN')

export const fmtFecha = (iso?: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: '2-digit' })
}

export const fmtFechaHora = (iso?: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return `${d.toLocaleDateString('es-HN', { day: '2-digit', month: 'short' })} · ${d.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' })}`
}

/**
 * Duración en palabras. La carga de AX va de 45 s a más de 3 minutos según cómo
 * esté AX de cargado, así que el segundo importa tanto como el minuto: "2m 14s",
 * no "2 min".
 */
export const fmtDuracion = (seg?: number | null) => {
  if (seg === null || seg === undefined) return '—'
  if (seg < 60) return `${seg}s`
  const m = Math.floor(seg / 60)
  const s = seg % 60
  return s === 0 ? `${m}m` : `${m}m ${s}s`
}

/** Fila etiqueta/valor del detalle. */
export function Dato({ label, valor, color }: { label: string; valor: string; color?: string }) {
  return (
    <XStack justifyContent="space-between" alignItems="baseline" gap="$3">
      <Text fontSize="$2" color="$textMuted" flexShrink={1}>{label}</Text>
      <Text fontSize="$3" fontWeight="700" color={color ?? '$text'} textAlign="right">{valor}</Text>
    </XStack>
  )
}
