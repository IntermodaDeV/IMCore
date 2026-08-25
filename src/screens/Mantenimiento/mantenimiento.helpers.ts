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

// Editar un ticket (info completa: máquina, área, operación, etc.): Admin o
// Supervisor de Mantenimiento, o acceso 'EditarTickets'. Solo en estados
// Pendiente/Pausado/En Proceso (el estado se valida en la pantalla). Backend revalida.
const ROLES_EDITAR = ['Administrador', 'Supervisor de Mantenimiento']
export const puedeEditarTicket = (roles?: RoleLike[] | null, access?: string | null) =>
  hasRole(roles, ROLES_EDITAR) || hasAccess(access, 'EditarTickets')

// Cancelar por rol/acceso: Admin, Supervisor de Mantenimiento, o acceso
// 'CancelarTickets' → en Pendiente/Pausado/En Proceso. (El CREADOR puede cancelar
// su propio ticket solo en Pendiente; eso se combina en la pantalla.) Backend revalida.
const ROLES_CANCELAR = ['Administrador', 'Supervisor de Mantenimiento']
export const puedeCancelarTicket = (roles?: RoleLike[] | null, access?: string | null) =>
  hasRole(roles, ROLES_CANCELAR) || hasAccess(access, 'CancelarTickets')

// Diagnosticar (tipo de falla + causa): Admin, Sup. Mantenimiento, Mecánico,
// Técnico, el mecánico asignado, o acceso 'DiagnosticarTickets'. (El backend revalida.)
const ROLES_DIAGNOSTICAR = ['Administrador', 'Supervisor de Mantenimiento', 'Mecánico', 'Técnico']
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

// Ver el "pool" de TODOS los tickets: rol Mecánico/Técnico/Sup. Mtto/Admin, o
// acceso 'AsignarTickets' (para descubrir y autoasignarse), 'DespacharRepuestos'
// (el despachador ve todos los tickets en SOLO LECTURA: no crea, edita ni opera;
// esas acciones se gatean aparte) o 'VerTodosTickets' (consulta pura: listado y
// detalle con su QR, sin ninguna acción). Habilita el toggle "Todos" en el
// listado. (El backend ya revalida el mismo alcance en SP_GetTickets.)
const ROLES_POOL = ['Administrador', 'Supervisor de Mantenimiento', 'Mecánico', 'Técnico']
export const puedeVerPool = (roles?: RoleLike[] | null, access?: string | null) =>
  hasRole(roles, ROLES_POOL) ||
  hasAccess(access, 'AsignarTickets') ||
  hasAccess(access, 'DespacharRepuestos') ||
  hasAccess(access, 'VerTodosTickets')

// Alcance inicial del listado de tickets. El despachador de repuestos no crea ni
// tiene tickets propios, así que su pestaña "Míos" saldría vacía → arranca en
// "Todos". Solo aplica si NO tiene un rol/acceso con tickets propios (mecánico/
// técnico/supervisores/creador querrían ver primero los suyos).
const ROLES_PERSONALES = ['Administrador', 'Supervisor de Mantenimiento', 'Mecánico', 'Técnico', 'Supervisor de Producción']
export const scopeInicialTickets = (roles?: RoleLike[] | null, access?: string | null): 'mias' | 'todos' => {
  const tienePersonales = hasRole(roles, ROLES_PERSONALES) || hasAccess(access, 'CrearTickets')
  // Igual que el despachador, quien solo consulta no tiene tickets propios.
  const soloMira = hasAccess(access, 'DespacharRepuestos') || hasAccess(access, 'VerTodosTickets')
  return !tienePersonales && soloMira ? 'todos' : 'mias'
}

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

// ── Formateo ─────────────────────────────────────────────────────────────────
// Minutos → "1h 30m" (compacto, para totales y barras).
export function fmtHM(min: number): string {
  const m = Math.max(0, Math.round(min))
  const h = Math.floor(m / 60)
  const mm = m % 60
  return h > 0 ? `${h}h ${mm}m` : `${mm}m`
}

// Lo que algo lleva DETENIDO se mide en días, no en horas: 12 646 min es 8d 19h, y
// "210h 46m" no lo lee nadie. (Vive acá porque lo usan Análisis y el panel de
// máquinas malas; es el mismo fmtDetenido del web.)
export function fmtDetenido(min: number): string {
  const m = Math.max(0, Math.round(min))
  if (m < 1440) return fmtHM(m)
  let d = Math.floor(m / 1440)
  let h = Math.round((m % 1440) / 60)
  // 4 316 min redondea a 24 h y salía "2d 24h": las 24 horas son un día más.
  if (h === 24) {
    d += 1
    h = 0
  }
  return h > 0 ? `${d}d ${h}h` : `${d}d`
}

// Minutos → "746 h": para totales grandes, donde los minutos sueltos no dicen nada.
export const fmtHoras = (min: number) => `${Math.round(min / 60).toLocaleString('es-HN')} h`

export const fmtEntero = (n: number) => n.toLocaleString('es-HN')

// ── Comparativo contra el período anterior ───────────────────────────────────
// Rango [desde, hasta) inmediatamente anterior y del MISMO largo que el actual.
// Con 'mes'/'anio' se retrocede por calendario (no por días) para que febrero se
// compare contra enero completo y no contra "28 días atrás".
export function rangoAnterior(
  desde: Date,
  hasta: Date,
  modo: 'semana' | 'mes' | 'anio',
): { desde: Date; hasta: Date } {
  if (modo === 'mes') {
    return {
      desde: new Date(desde.getFullYear(), desde.getMonth() - 1, 1),
      hasta: new Date(desde.getFullYear(), desde.getMonth(), 1),
    }
  }
  if (modo === 'anio') {
    return {
      desde: new Date(desde.getFullYear() - 1, 0, 1),
      hasta: new Date(desde.getFullYear(), 0, 1),
    }
  }
  const largo = hasta.getTime() - desde.getTime()
  return { desde: new Date(desde.getTime() - largo), hasta: new Date(desde) }
}

// Variación % contra el período anterior. null cuando no hay base de comparación
// (antes no hubo nada: un "+∞%" no informa).
export function variacion(actual: number, anterior: number): number | null {
  if (!anterior) return null
  return ((actual - anterior) / anterior) * 100
}

// Colores de los tramos del paro: se reusan los de estado para que el color
// signifique lo mismo en toda la app (espera = pendiente, trabajo = en proceso,
// pausa = pausado).
export const COLOR_ESPERA = '#f59e0b'
export const COLOR_TRABAJO = '#3b82f6'
export const COLOR_PAUSA = '#a855f7'
// Reproceso: rosa oscuro, la familia del estado "Rechazado" (de ahí nace el tramo)
// en un tono que no se confunde con el morado de la pausa. El MISMO hex que el web.
export const COLOR_REPROCESO = '#be123c'

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
  // Maquinas DISTINTAS con al menos un ticket sin atender. No es lo mismo que
  // `sinAtender`: 6 tickets sin atender pueden ser 6 maquinas paradas o 6 avisos
  // de la misma. Lo que decide si la linea para son las maquinas, no los papeles.
  maquinasSinAtender: number
  completados: number
  enProceso: number
  tRespProm: number | null
  tResolProm: number | null
}

export function calcularKpis(rows: MantenimientoRegistro[]): Kpis {
  const total = rows.length
  const pendientes = rows.filter(r => !r.Atendido)
  const sinAtender = pendientes.length
  // Se cuentan codigos de activo distintos; los tickets de area no traen maquina.
  const maquinasSinAtender = new Set(
    pendientes.map(r => (r.NumeroMaquina ?? '').trim()).filter(Boolean),
  ).size
  const completados = rows.filter(r => r.Estado === 'Completado').length
  const enProceso = rows.filter(r => r.Estado === 'En Proceso').length
  const resp = rows.map(r => r.TiempoRespuestaMin).filter((n): n is number => n != null)
  const resol = rows.map(r => r.TiempoResolucionMin).filter((n): n is number => n != null)
  const prom = (arr: number[]) =>
    arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
  return {
    total,
    sinAtender,
    maquinasSinAtender,
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
