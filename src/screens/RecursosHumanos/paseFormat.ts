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
export const capitalizar = (texto?: string | null): string =>
  (texto ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((palabra, i) => {
      const baja = palabra.toLowerCase()

      if (i > 0 && CONECTORES.has(baja)) return baja
      if (palabra.length <= 3 && palabra === palabra.toUpperCase() && /[A-Z]/.test(palabra)) return palabra

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
