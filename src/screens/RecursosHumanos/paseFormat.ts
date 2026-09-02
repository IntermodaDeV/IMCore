import type { SituacionPase } from '../../api/modules/pases/pases.types'

// Formateo de fechas para las pantallas de pases.

// DATETIME (creación/aprobación/registro) -> "dd/mm/aaaa hh:mm"
export const fmtFechaHora = (iso?: string | null): string => {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime())
    ? String(iso)
    : d.toLocaleString('es-HN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
}

// FechaPase viene como "YYYY-MM-DD" -> "dd/mm/aaaa"
export const fmtFecha = (s?: string | null): string => {
  if (!s) return ''
  const [y, m, d] = String(s).split('-')
  return y && m && d ? `${d}/${m}/${y}` : String(s)
}

/** Palabras que no se capitalizan en medio de un nombre: "Gerencia de Ventas". */
const CONECTORES = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'en', 'a'])

/**
 * Capitaliza "ROBERTO ALEXANDER" -> "Roberto Alexander". Planilla guarda todo en
 * mayúsculas.
 *
 * Las siglas cortas se dejan como están: sin esto, "GERENCIA IT" quedaba
 * "Gerencia It", que se lee como un error de tipeo.
 */
export const capitalizar = (texto?: string | null, conSiglas: boolean = true): string =>
  (texto ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((palabra, i) => {
      const baja = palabra.toLowerCase()

      if (i > 0 && CONECTORES.has(baja)) return baja
      if (conSiglas && palabra.length <= 3 && palabra === palabra.toUpperCase() && /[A-Z]/.test(palabra)) return palabra

      return baja.charAt(0).toUpperCase() + baja.slice(1)
    })
    .join(' ')

/**
 * Planilla antepone el código a casi todo: "003281 - ROBERTO MARTINEZ",
 * "IT0001 - GERENCIA IT". El código se muestra aparte cuando hace falta, y
 * capitalizarlo lo estropea ("It0001"), así que se recorta la parte del código
 * y se capitaliza solo la descripción.
 */
export const sinCodigo = (texto?: string | null): string => {
  const limpio = (texto ?? '').trim()
  const guion = limpio.indexOf(' - ')
  return capitalizar(guion >= 0 ? limpio.slice(guion + 3) : limpio)
}

/**
 * Cómo se lee la secuencia de movimientos de un pase.
 * 'S' salida · 'E' entrada · 'SE' sale y regresa · 'ES' entra y sale.
 */
export const textoSecuencia = (tipo?: string | null): string => {
  switch (tipo) {
    case 'S': return 'Salida'
    case 'E': return 'Entrada'
    case 'SE': return 'Salir y regresar'
    case 'ES': return 'Entrar y salir'
    default: return tipo ?? ''
  }
}

/**
 * El desvío contra la hora prevista, en palabras.
 * Positivo = después de lo previsto; negativo = antes.
 */
export const textoDesvio = (min?: number | null): string => {
  if (min == null) return ''
  if (min === 0) return 'a la hora'

  const abs = Math.abs(min)
  const cuanto = abs >= 60
    ? `${Math.floor(abs / 60)} h${abs % 60 ? ` ${abs % 60} min` : ''}`
    : `${abs} min`

  return min > 0 ? `${cuanto} tarde` : `${cuanto} antes`
}

/**
 * Las horas previstas de un permiso, en el orden de su secuencia.
 * 'SE' se lee "Sale 14:00 · Regresa 16:00"; 'ES' al revés.
 */
export const textoHoras = (p: { Tipo?: string | null; HoraSalida?: string | null; HoraEntrada?: string | null }): string => {
  const salida = p.HoraSalida ? `Sale ${p.HoraSalida}` : ''
  const entrada = p.HoraEntrada ? `${p.Tipo === 'SE' ? 'Regresa' : 'Entra'} ${p.HoraEntrada}` : ''

  if (p.Tipo === 'ES') return [entrada, salida].filter(Boolean).join(' · ')
  return [salida, entrada].filter(Boolean).join(' · ')
}

/**
 * El código con el que se identifica a la persona en pantalla.
 *
 * Se muestra el ALTERNO porque es el que está impreso en el carnet: es el único
 * que alguien puede comparar con lo que tiene enfrente. El de personal no
 * aparece en ninguna parte física, así que solo se usa cuando no hay alterno.
 */
export const textoCarnet = (
  p: { CodAlterno?: string | null; EmpleadoCode?: string | null },
): string => {
  const alterno = (p.CodAlterno ?? '').trim()
  if (alterno) return `Carnet ${alterno}`

  const codigo = (p.EmpleadoCode ?? '').trim()
  return codigo ? `Código ${codigo}` : ''
}

// ── El tablero ─────────────────────────────────────────────────────────────

/**
 * Cómo se lee cada situación y de qué color va. Los MISMOS textos y colores que
 * el tablero del web: la misma fila tiene que leerse igual en la portería y en
 * el teléfono del que anda en planta.
 *
 * El color es del CONCEPTO. La urgencia se marca aparte con el atraso
 * (`MinutosDeMas > 0` pinta la fila de rojo), para que una fila tenga un solo
 * color y no un semáforo por columna.
 */
export const SITUACION: Record<
  SituacionPase,
  { label: string; color: string; bg: string; ayuda: string }
> = {
  afuera: {
    label: 'Afuera', color: '#B45309', bg: 'rgba(245,158,11,0.14)',
    ayuda: 'Salió con permiso y todavía no regresa.',
  },
  adentro: {
    label: 'Adentro', color: '#15803D', bg: 'rgba(34,197,94,0.14)',
    ayuda: 'Entró con un permiso de «entrar y salir»: le falta la salida.',
  },
  por_salir: {
    label: 'Por salir', color: '#1D4ED8', bg: 'rgba(59,130,246,0.14)',
    ayuda: 'Autorizado y todavía no sale.',
  },
  por_entrar: {
    label: 'Por entrar', color: '#7E22CE', bg: 'rgba(168,85,247,0.14)',
    ayuda: 'Autorizado a llegar más tarde y todavía no llega.',
  },
  completo: {
    label: 'Completo', color: '#64748B', bg: 'rgba(148,163,184,0.18)',
    ayuda: 'Usó todos los movimientos de su permiso.',
  },
  pendiente_jefe: {
    label: 'Espera al jefe', color: '#B45309', bg: 'rgba(245,158,11,0.14)',
    ayuda: 'Le falta la primera firma. Todavía no abre la puerta.',
  },
  pendiente_rh: {
    label: 'Espera a RR. HH.', color: '#7E22CE', bg: 'rgba(168,85,247,0.14)',
    ayuda: 'El jefe ya firmó; falta la segunda. Todavía no abre la puerta.',
  },
  rechazado: {
    label: 'Rechazado', color: '#B91C1C', bg: 'rgba(239,68,68,0.14)',
    ayuda: 'No se autorizó.',
  },
  anulado: {
    label: 'Anulado', color: '#64748B', bg: 'rgba(148,163,184,0.18)',
    ayuda: 'La persona lo retiró antes de que lo firmaran.',
  },
  vencido: {
    label: 'Vencido', color: '#64748B', bg: 'rgba(148,163,184,0.18)',
    ayuda: 'Se pasó el día sin usarse.',
  },
}

/**
 * Cómo se llama la situación cuando el día YA PASÓ.
 *
 * En un período, "Afuera" no es alguien que está afuera ahora: es un permiso al
 * que nunca le registraron el regreso. Y "Por salir" no es alguien que va a
 * salir: es un permiso que no se usó. Llamarlos igual que en el tablero de hoy
 * haría leer como urgencia lo que es historia.
 */
const ETIQUETA_PASADA: Partial<Record<SituacionPase, string>> = {
  afuera: 'Sin cerrar',
  adentro: 'Sin cerrar',
  por_salir: 'No se usó',
  por_entrar: 'No llegó',
}

export const etiquetaSituacion = (f: { Situacion?: SituacionPase; EsDeHoy?: boolean }): string => {
  if (f.EsDeHoy === false && f.Situacion && ETIQUETA_PASADA[f.Situacion]) {
    return ETIQUETA_PASADA[f.Situacion]!
  }
  return situacionInfo(f.Situacion).label
}

export const situacionInfo = (s?: SituacionPase | null) =>
  (s && SITUACION[s]) || { label: s ?? '—', color: '#64748B', bg: 'rgba(148,163,184,0.18)', ayuda: '' }

/** Se pasó de la hora del movimiento que le toca. */
export const estaAtrasado = (f: { MinutosDeMas?: number | null }): boolean =>
  (f.MinutosDeMas ?? 0) > 0

/** Duración en minutos, en palabras: 95 -> "1 h 35 min". */
export const textoDuracion = (min?: number | null): string => {
  if (min == null) return ''
  const abs = Math.abs(min)
  return abs >= 60
    ? `${Math.floor(abs / 60)} h${abs % 60 ? ` ${abs % 60} min` : ''}`
    : `${abs} min`
}

/**
 * Lo que hay que decir de una fila en una línea: la hora que se espera y, si ya
 * pasó, cuánto. "Vuelve 16:00" vale más que "16:00" a secas.
 */
export const textoProximo = (f: {
  Situacion?: SituacionPase
  HoraProxima?: string | null
  MinutosDeMas?: number | null
}): string => {
  if (!f.HoraProxima) return ''
  const verbo =
    f.Situacion === 'afuera' ? 'Vuelve'
    : f.Situacion === 'por_entrar' ? 'Entra'
    : 'Sale'
  return `${verbo} ${f.HoraProxima}${estaAtrasado(f) ? ` · ${textoDuracion(f.MinutosDeMas)} tarde` : ''}`
}

/** Solo la hora de un DATETIME, "hh:mm". */
export const soloHora = (iso?: string | null): string => {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' })
}

/**
 * El nombre de una PERSONA como se muestra: sin el código que planilla le
 * antepone y capitalizado.
 *
 * No aplica la excepción de siglas de `capitalizar`: esa existe para que
 * "GERENCIA IT" no quede "Gerencia It", pero en un nombre convierte a Ana en
 * "ANA" y a Luz en "LUZ". Las siglas viven en las áreas, no en los nombres.
 */
export const nombrePersona = (texto?: string | null): string => {
  const limpio = (texto ?? '').trim()
  const guion = limpio.indexOf(' - ')
  return capitalizar(guion >= 0 ? limpio.slice(guion + 3) : limpio, false)
}
