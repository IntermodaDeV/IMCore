import { IAgenda, EstadoAgenda } from '../../api/modules/visitas/visitas.types'

// Helpers del tablero de Visitas en la app.
//
// El ESTADO no se calcula acá: lo manda el servidor (Visitas.SP_GetAgenda). Si
// la app lo recalculara con su propio reloj, el teléfono del guardia y la
// pantalla de portería podrían discrepar justo en el minuto que importa —el de
// la tolerancia—, y el número dejaría de ser creíble.
//
// Es el mismo criterio que el tablero del web (IMCoreWeb/src/visitas/agenda.ts).
// Lo que cambia en la app es el RECORTE, no la lógica: en un teléfono la
// cuadrícula del mes no se lee, así que el calendario se sirve como una tira de
// días y la lista del día elegido.

/** Tonos de la paleta ya validada para daltonismo y contraste. Son los mismos
 *  del web a propósito: quien ve el tablero en la pantalla de portería y en el
 *  teléfono tiene que leer el mismo color como la misma cosa. */
const TONO = {
  azul:    { claro: '#2a78d6', oscuro: '#3987e5' },
  naranja: { claro: '#eb6834', oscuro: '#d95926' },
  verde:   { claro: '#008300', oscuro: '#2E9E5B' },
  rojo:    { claro: '#e34948', oscuro: '#e66767' },
  gris:    { claro: '#64748B', oscuro: '#8b97a8' },
} as const

type Tono = keyof typeof TONO

const ESTADOS: Record<EstadoAgenda, { label: string; corto: string; tono: Tono; orden: number }> = {
  Vencida:      { label: 'Se le venció',   corto: 'Vencida',    tono: 'rojo',    orden: 0 },
  EnPlanta:     { label: 'En planta',      corto: 'Adentro',    tono: 'verde',   orden: 1 },
  Programada:   { label: 'Programada',     corto: 'Programada', tono: 'azul',    orden: 2 },
  ConExceso:    { label: 'Salió tarde',    corto: 'Tarde',      tono: 'naranja', orden: 3 },
  NoSePresento: { label: 'No se presentó', corto: 'No llegó',   tono: 'gris',    orden: 4 },
  Finalizada:   { label: 'Finalizada',     corto: 'Finalizó',   tono: 'gris',    orden: 5 },
}

export const estadoInfo = (estado: EstadoAgenda | string, dark = false) => {
  const e = ESTADOS[estado as EstadoAgenda] ?? ESTADOS.Programada
  return { ...e, color: TONO[e.tono][dark ? 'oscuro' : 'claro'] }
}

/** Orden de gravedad: lo que necesita atención primero. En un teléfono se ven
 *  tres o cuatro filas sin hacer scroll, así que la roja no puede quedar abajo. */
export const porGravedad = (a: IAgenda, b: IAgenda) => {
  const d = estadoInfo(a.Estado).orden - estadoInfo(b.Estado).orden
  return d !== 0 ? d : (a.VentanaInicio ?? '').localeCompare(b.VentanaInicio ?? '')
}

// ── Cortes del tablero ─────────────────────────────────────────────────────

/** Adentro EN ESTE MOMENTO: los dos estados abiertos juntos. Para el guardia es
 *  una sola pregunta —¿cuánta gente hay adentro?—; el color distingue a los que
 *  ya se pasaron de hora. */
export const estanAdentro = (filas: IAgenda[]) =>
  filas.filter(f => f.Estado === 'EnPlanta' || f.Estado === 'Vencida').sort(porGravedad)

/** Próximas a entrar, ordenadas por cuándo abren.
 *
 *  Incluye las que YA abrieron y todavía no llega nadie (MinutosParaIniciar
 *  negativo): esas son las MÁS urgentes de mirar, no las menos. */
export const proximas = (filas: IAgenda[]) =>
  filas
    .filter(f => f.Estado === 'Programada')
    .sort((a, b) => a.MinutosParaIniciar - b.MinutosParaIniciar)

/** Resumen por empresa de quién está adentro. Se agrupa por CÓDIGO y no por
 *  nombre: dos empresas podrían llamarse parecido y el código es la llave. */
export type ResumenEmpresa = {
  code: string
  nombre: string
  pases: number
  personas: number
  vencidas: number
}

export const adentroPorEmpresa = (filas: IAgenda[]): ResumenEmpresa[] => {
  const mapa = new Map<string, ResumenEmpresa>()
  for (const f of estanAdentro(filas)) {
    const code = f.EmpresaCode ?? '—'
    const acc = mapa.get(code) ?? {
      code,
      nombre: f.Empresa ?? 'Sin empresa',
      pases: 0,
      personas: 0,
      vencidas: 0,
    }
    acc.pases += 1
    acc.personas += f.PersonasCount || 1
    if (f.Estado === 'Vencida') acc.vencidas += 1
    mapa.set(code, acc)
  }
  return [...mapa.values()].sort((a, b) => b.personas - a.personas)
}

// ── Días ───────────────────────────────────────────────────────────────────

/** 'YYYY-MM-DD' local de un Date (sin pasar por UTC, que en Honduras retrocede
 *  un día). */
export const claveDia = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** La fila trae Dia como fecha ISO (a veces con hora). Se RECORTA en vez de
 *  parsear: `new Date('2026-08-24')` es medianoche UTC y acá restaría un día. */
export const diaDeFila = (f: IAgenda) => (f.Dia ?? '').slice(0, 10)

export const esHoy = (clave: string) => clave === claveDia(new Date())

/** El lunes de la semana que contiene a `d`. Sirve para las flechas ← →. */
export const lunesDe = (d: Date): Date => {
  const base = new Date(d)
  base.setHours(0, 0, 0, 0)
  base.setDate(base.getDate() - ((base.getDay() + 6) % 7))
  return base
}

/** Las siete claves 'YYYY-MM-DD' de la semana que empieza en `lunes`. */
export const semanaDe = (lunes: Date): string[] => {
  const out: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(lunes)
    d.setDate(lunes.getDate() + i)
    out.push(claveDia(d))
  }
  return out
}

export const agruparPorDia = (filas: IAgenda[]): Record<string, IAgenda[]> => {
  const mapa: Record<string, IAgenda[]> = {}
  for (const f of filas) {
    const k = diaDeFila(f)
    if (!mapa[k]) mapa[k] = []
    mapa[k].push(f)
  }
  for (const k of Object.keys(mapa)) mapa[k].sort(porGravedad)
  return mapa
}

// ── Formato ────────────────────────────────────────────────────────────────

const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const DIAS_INICIAL = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const partes = (clave: string) => clave.split('-').map(Number)

/** 'L' / 'M' / … para la tira de días: en un teléfono no cabe más. */
export const inicialDia = (clave: string) => {
  const [y, m, d] = partes(clave)
  return y && m && d ? DIAS_INICIAL[new Date(y, m - 1, d).getDay()] : '?'
}

export const numeroDia = (clave: string) => partes(clave)[2] ?? 0

/** 'lun 25 ago' a partir de la clave, sin pasar por UTC. */
export const etiquetaDia = (clave: string): string => {
  const [y, m, d] = partes(clave)
  if (!y || !m || !d) return clave
  return `${DIAS_CORTOS[new Date(y, m - 1, d).getDay()]} ${d} ${MESES_CORTOS[m - 1]}`
}

/** '25 – 31 ago' o '30 ago – 5 sep' para el encabezado de la semana. */
export const rangoSemana = (dias: string[]): string => {
  if (dias.length === 0) return ''
  const [, m1, d1] = partes(dias[0])
  const [, m2, d2] = partes(dias[dias.length - 1])
  return m1 === m2
    ? `${d1} – ${d2} ${MESES_CORTOS[m1 - 1]}`
    : `${d1} ${MESES_CORTOS[m1 - 1]} – ${d2} ${MESES_CORTOS[m2 - 1]}`
}

export const fmtHora = (iso?: string | null) => {
  if (!iso) return ''
  // Se recorta el ISO en vez de construir un Date: el servidor manda hora local
  // sin zona y `new Date` la interpretaría como UTC en algunos equipos.
  const hhmm = iso.slice(11, 16)
  return hhmm || ''
}

/** ¿La ventana cubre el día completo? Los pases sin horario se generan de 00:00
 *  a 23:59, y pintar «00:00» es ruido: no es una hora a la que nadie vaya a
 *  llegar, es la ausencia de horario. */
export const esTodoElDia = (ini?: string | null, fin?: string | null): boolean =>
  (ini ?? '').slice(11, 16) === '00:00' && (fin ?? '').slice(11, 16) >= '23:59'

export const fmtVentana = (ini?: string | null, fin?: string | null) =>
  esTodoElDia(ini, fin) ? 'Todo el día' : `${fmtHora(ini)} – ${fmtHora(fin)}`

/** '1 h 20 min', '45 min'. */
export const fmtDuracionMin = (min?: number | null): string => {
  const v = Math.max(0, Math.round(min ?? 0))
  const h = Math.floor(v / 60)
  const m = v % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/** «en 25 min», «abrió hace 40 min», «ahora». Para la lista de próximas, donde
 *  la distancia importa más que la hora exacta. */
export const cuandoAbre = (minutos: number): string => {
  if (minutos > 0) return `en ${fmtDuracionMin(minutos)}`
  if (minutos < -1) return `abrió hace ${fmtDuracionMin(-minutos)}`
  return 'ahora'
}

/** Qué decir bajo «por llegar»: si alguna ya abrió y nadie apareció, ESO es lo
 *  que hay que mirar, no cuándo abre la siguiente. */
export const resumenProximas = (filas: IAgenda[]): string => {
  if (filas.length === 0) return 'Nada pendiente'
  const enVentana = filas.filter(f => f.MinutosParaIniciar <= 0).length
  if (enVentana > 0) return `${enVentana} en ventana y sin llegar`
  return `La próxima ${cuandoAbre(filas[0].MinutosParaIniciar)}`
}

/** Nombre a mostrar de una fila: el visitante si se sabe, si no a quién visita. */
export const quienVisita = (f: IAgenda) => (f.Personas || '').trim() || `Visita a ${f.VisitTo}`
