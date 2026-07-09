import { MantenimientoRegistro } from '../../api/modules/sharepoint/mantenimiento.types'

// ── Capacidades de tickets (rol por defecto o acceso por usuario) ────────────
type RoleLike = { RoleName: string }
const ROLES_CREAR_DEFAULT = ['Supervisor de Producción', 'Administrador']
const hasAccess = (access: string | undefined | null, key: string) =>
  (access ?? '').split(',').map(s => s.trim()).includes(key)
const hasRole = (roles: RoleLike[] | undefined | null, names: string[]) =>
  (roles ?? []).some(r => names.includes(r.RoleName))

// Crear tickets / ver listado: Sup. Producción o Admin, o acceso 'CrearTickets'.
export const puedeCrearTickets = (roles?: RoleLike[] | null, access?: string | null) =>
  hasRole(roles, ROLES_CREAR_DEFAULT) || hasAccess(access, 'CrearTickets')

// Crear tickets de máquina: Sup. Producción o Admin, o acceso 'CrearTicketsMaquinas'.
export const puedeCrearMaquina = (roles?: RoleLike[] | null, access?: string | null) =>
  hasRole(roles, ROLES_CREAR_DEFAULT) || hasAccess(access, 'CrearTicketsMaquinas')

// Operar un ticket (Iniciar/Pausar/Reanudar/Completar): el mecánico asignado,
// o un Administrador / Supervisor de Mantenimiento. (El backend revalida.)
const ROLES_OPERAR = ['Administrador', 'Supervisor de Mantenimiento']
export const puedeOperarTicket = (
  roles?: RoleLike[] | null,
  userCode?: string | null,
  mecanicoUserCode?: string | null,
) =>
  (!!userCode && !!mecanicoUserCode && userCode === mecanicoUserCode) ||
  hasRole(roles, ROLES_OPERAR)

// Diagnosticar (tipo de falla + causa): Admin, Sup. Mantenimiento, Mecánico,
// el mecánico asignado, o acceso 'DiagnosticarTickets'. (El backend revalida.)
const ROLES_DIAGNOSTICAR = ['Administrador', 'Supervisor de Mantenimiento', 'Mecánico']
export const puedeDiagnosticar = (
  roles?: RoleLike[] | null,
  access?: string | null,
  userCode?: string | null,
  mecanicoUserCode?: string | null,
) =>
  hasRole(roles, ROLES_DIAGNOSTICAR) ||
  (!!userCode && !!mecanicoUserCode && userCode === mecanicoUserCode) ||
  hasAccess(access, 'DiagnosticarTickets')

// Validar / rechazar la reparación (sello de producción): el creador de su propio
// ticket, rol Sup. Producción/Administrador, o acceso 'ValidarTickets'. (El backend revalida.)
const ROLES_VALIDAR = ['Administrador', 'Supervisor de Producción']
export const puedeValidar = (
  roles?: RoleLike[] | null,
  access?: string | null,
  userCode?: string | null,
  createdBy?: string | null,
) =>
  (!!userCode && !!createdBy && userCode === createdBy) ||
  hasRole(roles, ROLES_VALIDAR) ||
  hasAccess(access, 'ValidarTickets')

// Configurar el recordatorio del ticket (minutos): rol Sup. Mantenimiento o
// Administrador, o acceso 'ConfigRecordatorioTicket'. (El backend revalida.)
const ROLES_CONFIG_RECORDATORIO = ['Administrador', 'Supervisor de Mantenimiento']
export const puedeConfigRecordatorio = (roles?: RoleLike[] | null, access?: string | null) =>
  hasRole(roles, ROLES_CONFIG_RECORDATORIO) || hasAccess(access, 'ConfigRecordatorioTicket')

// Ver el "pool" de TODOS los tickets (para descubrir y autoasignarse): rol
// Mecánico/Técnico/Sup. Mtto/Admin, o acceso 'AsignarTickets'. Habilita el toggle
// "Todos" en el listado. (El backend revalida el alcance.)
const ROLES_POOL = ['Administrador', 'Supervisor de Mantenimiento', 'Mecánico', 'Técnico']
export const puedeVerPool = (roles?: RoleLike[] | null, access?: string | null) =>
  hasRole(roles, ROLES_POOL) || hasAccess(access, 'AsignarTickets')

// Despachar: asignar un ticket a CUALQUIER mecánico/técnico. Sup. Mtto/Admin o
// acceso 'AsignarTickets'. (El backend revalida.)
const ROLES_DESPACHAR = ['Administrador', 'Supervisor de Mantenimiento']
export const puedeDespachar = (roles?: RoleLike[] | null, access?: string | null) =>
  hasRole(roles, ROLES_DESPACHAR) || hasAccess(access, 'AsignarTickets')

// Autoasignarse (tomar un ticket para sí mismo): rol Mecánico o Técnico. El
// backend solo permite tickets libres o el propio (no "robar" el de otro).
const ROLES_AUTOASIGNAR = ['Mecánico', 'Técnico']
export const puedeAutoasignar = (roles?: RoleLike[] | null) =>
  hasRole(roles, ROLES_AUTOASIGNAR)

// ── Paletas (mismas del dashboard de Streamlit) ──────────────────────────────
export const MESES: Record<number, string> = {
  1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril',
  5: 'Mayo', 6: 'Junio', 7: 'Julio', 8: 'Agosto',
  9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre',
}

export const PALETA_ESTADO: Record<string, string> = {
  Completado: '#22c55e',
  'En Proceso': '#3b82f6',
  Pausado: '#a855f7',
  Pendiente: '#f59e0b',
  Cancelado: '#dc2626',
  Rechazado: '#f43f5e',   // reabierto por producción (rosa/rojo — requiere atención)
}

export const COLORES_PRIO: Record<string, string> = {
  Alta: '#ef4444',
  Media: '#f97316',
  Baja: '#22c55e',
}

// Acento de la marca (equivale al #e8510a/#FF551A del dashboard).
export const ACCENT = '#FF551A'

const COLOR_FALLBACK = '#94A3B8'
export const colorEstado = (e: string) => PALETA_ESTADO[e] ?? COLOR_FALLBACK
export const colorPrioridad = (p: string) => COLORES_PRIO[p] ?? COLOR_FALLBACK

// Estado derivado "Asignado": el ticket sigue Pendiente pero ya tiene mecánico/
// técnico asignado. Color propio (teal), distinto del resto de estados.
export const COLOR_ASIGNADO = '#14b8a6'
export function estadoVisual(
  estadoCode?: string | null,
  estadoLabel?: string | null,
  mecanicoUserCode?: string | null,
): { label: string; color: string } {
  if (estadoCode === 'PENDIENTE' && !!mecanicoUserCode)
    return { label: 'Asignado', color: COLOR_ASIGNADO }
  const label = estadoLabel ?? '—'
  return { label, color: colorEstado(label) }
}

// Escalas de degradado [claro, oscuro] (≈ color_continuous_scale de plotly).
export type Escala = [string, string]
export const ESCALA_AZUL: Escala = ['#bfdbfe', '#1e40af']
export const ESCALA_NARANJA: Escala = ['#fed7aa', '#c2410c']
export const ESCALA_VERDE: Escala = ['#bbf7d0', '#15803d']
export const ESCALA_ROJA: Escala = ['#fecaca', '#b91c1c']

const hexToRgb = (h: string) => {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0')

// Mezcla lineal entre el extremo claro y el oscuro según t∈[0,1].
export function shade(escala: Escala, t: number): string {
  const [a, b] = [hexToRgb(escala[0]), hexToRgb(escala[1])]
  const c = a.map((v, i) => v + (b[i] - v) * Math.max(0, Math.min(1, t)))
  return `#${toHex(c[0])}${toHex(c[1])}${toHex(c[2])}`
}

// ── Filtros finos (Área / Prioridad / Tipo de Paro) ──────────────────────────
export interface FiltrosFinos {
  area: string // 'Todas' = sin filtro
  prioridad: string // 'Todas'
  tipoParo: string // 'Todos'
}

export const FILTROS_FINOS_DEFAULT: FiltrosFinos = {
  area: 'Todas',
  prioridad: 'Todas',
  tipoParo: 'Todos',
}

export function aplicarFiltrosFinos(
  registros: MantenimientoRegistro[],
  f: FiltrosFinos,
): MantenimientoRegistro[] {
  return registros.filter(r => {
    if (f.area !== 'Todas' && r.Area !== f.area) return false
    if (f.prioridad !== 'Todas' && r.Prioridad !== f.prioridad) return false
    if (f.tipoParo !== 'Todos' && r.TipoParo !== f.tipoParo) return false
    return true
  })
}

// ── Agregaciones ─────────────────────────────────────────────────────────────
export interface Kpis {
  total: number
  sinAtender: number
  completados: number
  enProceso: number
  tRespProm: number | null
  tResolProm: number | null
}

export function calcularKpis(rows: MantenimientoRegistro[]): Kpis {
  const total = rows.length
  const sinAtender = rows.filter(r => !r.Atendido).length
  const completados = rows.filter(r => r.Estado === 'Completado').length
  const enProceso = rows.filter(r => r.Estado === 'En Proceso').length
  const resp = rows.map(r => r.TiempoRespuestaMin).filter((n): n is number => n != null)
  const resol = rows.map(r => r.TiempoResolucionMin).filter((n): n is number => n != null)
  const prom = (arr: number[]) =>
    arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
  return {
    total,
    sinAtender,
    completados,
    enProceso,
    tRespProm: prom(resp),
    tResolProm: prom(resol),
  }
}

export interface Conteo {
  label: string
  value: number
}

// value_counts genérico sobre un campo string (ignora vacíos).
function contarPor(
  rows: MantenimientoRegistro[],
  campo: (r: MantenimientoRegistro) => string,
): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows) {
    const k = campo(r)
    if (!k) continue
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}

// Conteo de Estado, ordenado descendente (para la dona).
export function conteoEstado(rows: MantenimientoRegistro[]): Conteo[] {
  return [...contarPor(rows, r => r.Estado).entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
}

// Conteo de Prioridad en orden fijo Alta/Media/Baja.
export function conteoPrioridad(rows: MantenimientoRegistro[]): Conteo[] {
  const m = contarPor(rows, r => r.Prioridad)
  return ['Alta', 'Media', 'Baja']
    .map(label => ({ label, value: m.get(label) ?? 0 }))
    .filter(c => c.value > 0)
}

// Conteo por Área, ascendente (barras horizontales como el Streamlit).
export function conteoArea(rows: MantenimientoRegistro[]): Conteo[] {
  return [...contarPor(rows, r => r.Area).entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => a.value - b.value)
}

export function conteoTipoParo(rows: MantenimientoRegistro[]): Conteo[] {
  return [...contarPor(rows, r => r.TipoParo).entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => a.value - b.value)
}

// Top N descendente para rankings (mecánicos, tipos de falla).
export function topN(
  rows: MantenimientoRegistro[],
  campo: (r: MantenimientoRegistro) => string,
  n = 10,
): Conteo[] {
  return [...contarPor(rows, campo).entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, n)
    .sort((a, b) => a.value - b.value) // ascendente para barras horizontales
}

// Tendencia por día del período (adaptación móvil de la "tendencia mensual").
export function tendenciaPorDia(rows: MantenimientoRegistro[]): Conteo[] {
  const m = new Map<string, number>()
  for (const r of rows) {
    if (!r.Fecha) continue
    const dia = r.Fecha.slice(0, 10) // YYYY-MM-DD
    m.set(dia, (m.get(dia) ?? 0) + 1)
  }
  return [...m.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => a.label.localeCompare(b.label))
}
