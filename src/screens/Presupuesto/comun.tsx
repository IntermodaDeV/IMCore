import React from 'react'
import { Text, View, XStack } from 'tamagui'
import type { EstadoRevision, IMiCentro, IPlaza } from '../../api/modules/presupuesto/presupuesto.types'

// Piezas comunes de Presupuesto en la app. Las reglas son las mismas del web
// (IMCoreWeb/src/pages/presupuesto/presupuestoUi.tsx): si cambian allá, cambian acá.

export const ACCENT = '#FF551A'
export const OK = '#16a34a'
export const WARN = '#f59e0b'
export const ERR = '#dc2626'
export const AZUL = '#2563eb'
export const GRIS = '#6b7280'
const AMARILLO = '#ca8a04'
const MORADO = '#9333ea'

export const lps = (v: number | null | undefined, dec = 0) =>
  (v ?? 0).toLocaleString('es-HN', { minimumFractionDigits: dec, maximumFractionDigits: dec })

export const fmtFechaHora = (iso?: string | null) => {
  if (!iso) return ''
  const [f, h] = iso.replace('T', ' ').split(' ')
  const [y, m, d] = f.split('-')
  return `${d}/${m}/${y}${h ? ` ${h.slice(0, 5)}` : ''}`
}

/** Etiqueta chica de color: estado, observación, lo que tiene una persona. */
export function Chip({ texto, color }: { texto: string; color: string }) {
  return (
    <View borderRadius={6} paddingHorizontal="$2" paddingVertical={2} backgroundColor={`${color}22`}>
      <Text fontSize="$1" fontWeight="800" color={color}>{texto}</Text>
    </View>
  )
}

const COLOR_ESTADO: Record<EstadoRevision, string> = {
  'Sin habilitar': GRIS,
  Habilitado: AZUL,
  Vencido: WARN,
  Confirmado: OK,
  Cerrado: GRIS,
}

export const EstadoChip = ({ estado }: { estado: EstadoRevision }) =>
  <Chip texto={estado.toUpperCase()} color={COLOR_ESTADO[estado] ?? GRIS} />

/** Barra delgada de avance (personas revisadas). */
export function Barra({ hechas, total }: { hechas: number; total: number }) {
  const pct = total <= 0 ? 0 : Math.min(100, (hechas * 100) / total)
  const color = total > 0 && hechas >= total ? OK : hechas > 0 ? WARN : GRIS
  return (
    <View height={4} borderRadius={2} backgroundColor={`${color}33`} overflow="hidden">
      <View height={4} width={`${pct}%`} borderRadius={2} backgroundColor={color} />
    </View>
  )
}

// ---------------------------------------------------------------- observaciones
// Lo que el gerente tiene que mirar antes de confirmar (Presupuesto.fn_ObservacionesCentro).

export interface ConteoObservaciones {
  SinSalarioRH: number
  FueraDePlanilla: number
  VacantesSinSalario: number
  BajoMinimo: number
  TemporalesSinFin: number
}

const OBSERVACIONES: { k: keyof ConteoObservaciones; color: string; texto: (n: number) => string }[] = [
  { k: 'VacantesSinSalario', color: ERR, texto: n => `${n} ${n === 1 ? 'vacante' : 'vacantes'} sin salario` },
  { k: 'SinSalarioRH', color: WARN, texto: n => `${n} sin salario de RR. HH.` },
  { k: 'FueraDePlanilla', color: WARN, texto: n => `${n} ya no ${n === 1 ? 'está' : 'están'} en planilla` },
  { k: 'BajoMinimo', color: AMARILLO, texto: n => `${n} debajo del mínimo` },
  { k: 'TemporalesSinFin', color: MORADO, texto: n => `${n} ${n === 1 ? 'temporal' : 'temporales'} todo el año` },
]

export const totalObservaciones = (c: ConteoObservaciones) => OBSERVACIONES.reduce((s, o) => s + (c[o.k] ?? 0), 0)

export function Observaciones({ c }: { c: ConteoObservaciones }) {
  const lista = OBSERVACIONES.filter(o => (c[o.k] ?? 0) > 0)
  return (
    <XStack gap="$1" flexWrap="wrap">
      {lista.length === 0
        ? <Chip texto="SIN OBSERVACIONES" color={OK} />
        : lista.map(o => <Chip key={o.k} texto={o.texto(c[o.k])} color={o.color} />)}
    </XStack>
  )
}

/** Centro sin personas que no se muestra salvo que se pida; habilitado (para agregar vacantes) sí se muestra. */
export const centroOculto = (c: IMiCentro) => c.Plazas === 0 && c.Estado !== 'Habilitado'

/** Se puede confirmar sin abrirlo: habilitado, en plazo y sin vacantes sin salario (lo mismo que exige la base). */
export const esConfirmable = (c: IMiCentro) => c.Acceso === 2 && c.Estado === 'Habilitado' && c.VacantesSinSalario === 0
  && (c.PuedeConfirmar ?? 1) === 1

/** El gerente puede delegar este centro: suyo, habilitado, sin el candado de Planificación y sin su propio salario. */
export const esDelegable = (c: IMiCentro) => c.EsDelegado !== 1 && c.Acceso === 2 && c.Estado === 'Habilitado'
  && c.NoDelegable !== 1 && c.TienePropia !== 1

// ---------------------------------------------------------------- fecha límite
// «cerca» = los últimos `diasAviso` días (configuración global, la misma que manda los recordatorios).
export function plazoRestante(iso: string | null | undefined, diasAviso = 3): { texto: string; color: string; cerca: boolean } | null {
  if (!iso) return null
  const limite = new Date(iso.replace(' ', 'T'))
  if (Number.isNaN(limite.getTime())) return null
  const ahora = new Date()
  if (limite <= ahora) return { texto: 'Venció el plazo', color: ERR, cerca: true }
  const dia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const dias = Math.round((dia(limite) - dia(ahora)) / 864e5)
  if (dias === 0) return { texto: `Vence hoy a las ${iso.slice(11, 16)}`, color: ERR, cerca: true }
  if (dias === 1) return { texto: 'Vence mañana', color: WARN, cerca: diasAviso >= 1 }
  return { texto: `Vence en ${dias} días`, color: dias <= diasAviso ? WARN : GRIS, cerca: dias <= diasAviso }
}

export function PlazoChip({ fecha, dias }: { fecha: string | null | undefined; dias: number }) {
  const p = plazoRestante(fecha, dias)
  return p?.cerca ? <Chip texto={p.texto.toUpperCase()} color={p.color} /> : null
}

// ---------------------------------------------------------------- salario según la planilla
// Planilla guarda el MENSUAL (diario × 30); quien maneja planilla semanal piensa en el semanal (mensual ÷ 30 × 7).
export const aSemanal = (mensual: number) => Math.round((mensual / 30) * 7 * 100) / 100
export const aMensual = (semanal: number) => Math.round((semanal / 7) * 30 * 100) / 100

/** Planillas «… Temporal…»: se presupuestan hasta que termina el contrato. */
export const esTemporal = (p: IPlaza) => p.Origen === 'Planilla' && /temporal/i.test(p.TipoPlanillaNombre ?? '')
export const temporalSinFin = (p: IPlaza) => esTemporal(p) && p.SemanaFin >= 53 && p.Revisado !== 1
export const fueraDePlanilla = (p: IPlaza) => p.Origen === 'Planilla' && p.EnPlanilla === 0 && p.SemanaFin >= 53
export const tieneObservacion = (p: IPlaza) =>
  p.SinSalarioRH === 1 || p.BajoMinimo === 1 || fueraDePlanilla(p) || (p.Origen === 'Vacante' && !((p.Salario ?? 0) > 0))
  || temporalSinFin(p)

/** Salario como lo maneja cada planilla: semanal en la semanal, US$ en la de dólares, mensual en las demás. */
export const mostrarSalario = (p: IPlaza, mensual: number | null) => {
  if (mensual == null) return ''
  if (p.EsSemanal === 1) return `${lps(aSemanal(mensual), 2)} /sem`
  return p.EsDolares === 1 ? `US$ ${lps(mensual, 2)}` : lps(mensual, 2)
}

export const etiquetaSalario = (p: IPlaza) =>
  p.EsSemanal === 1 ? 'Salario semanal' : p.EsDolares === 1 ? 'Salario mensual en US$' : 'Salario mensual'
