/**
 * Lógica compartida de horarios de visita.
 *
 * Convención de día de semana: 1=Lunes .. 7=Domingo, y es el día en que la
 * ventana ABRE. Por eso "Viernes 22:00-06:00" cierra el sábado: la ventana que
 * abrió el viernes corre hasta completarse.
 *
 * La misma convención se usa en SQL, donde se calcula con
 * DATEDIFF(DAY,'19000101',fecha)%7+1 para no depender de @@DATEFIRST.
 */
import { IHorarioDetalle } from '../../api/modules/visitas/visitas.types'

export const DIAS_SEMANA: { id: number; corto: string; largo: string }[] = [
  { id: 1, corto: 'L', largo: 'Lunes' },
  { id: 2, corto: 'M', largo: 'Martes' },
  { id: 3, corto: 'M', largo: 'Miércoles' },
  { id: 4, corto: 'J', largo: 'Jueves' },
  { id: 5, corto: 'V', largo: 'Viernes' },
  { id: 6, corto: 'S', largo: 'Sábado' },
  { id: 7, corto: 'D', largo: 'Domingo' },
]

export const diaCorto = (id: number) => DIAS_SEMANA.find((d) => d.id === id)?.corto ?? '?'
export const diaLargo = (id: number) => DIAS_SEMANA.find((d) => d.id === id)?.largo ?? '?'
/** Etiqueta de 3 letras, como la que arma el SP ("Lun", "Mié"...) */
export const diaAbrev = (id: number) => diaLargo(id).slice(0, 3)

/**
 * Convierte 'YYYY-MM-DD' a Date en hora LOCAL.
 *
 * OJO: `new Date('2026-08-21')` se interpreta como medianoche UTC, que en
 * UTC-6 cae el 20 de agosto a las 18:00 — o sea, el día de semana saldría
 * corrido un día. Por eso se construye componente por componente.
 */
export const parseISOLocal = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

/** Día de semana 1=Lunes..7=Domingo de una fecha 'YYYY-MM-DD'. */
export const diaSemanaDe = (iso: string): number => {
  // getDay() da 0=Domingo..6=Sábado; se recorre para que Lunes sea 1.
  return ((parseISOLocal(iso).getDay() + 6) % 7) + 1
}

/** 'HH:mm' -> minutos desde medianoche. */
export const horaAMinutos = (hhmm: string): number => {
  const [h, m] = (hhmm || '').split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** Una ventana cruza la medianoche cuando su fin no es posterior a su inicio. */
export const cruzaMedianoche = (desde: string, hasta: string) =>
  horaAMinutos(hasta) <= horaAMinutos(desde)

/** Duración de una ventana en minutos, contando el cruce de medianoche. */
export const duracionVentana = (desde: string, hasta: string): number => {
  const ini = horaAMinutos(desde)
  const fin = horaAMinutos(hasta)
  return fin > ini ? fin - ini : 24 * 60 - ini + fin
}

/** 137 -> "2 h 17 min" ; 45 -> "45 min" ; 120 -> "2 h" */
export const fmtDuracion = (min?: number | null): string => {
  if (min == null) return '—'
  if (min < 0) return '—'
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}

/**
 * Días de una lista que el horario realmente habilita.
 *
 * Es el arreglo del hueco que existía: un rango de fechas se expandía completo,
 * fines de semana incluidos, así que un horario "L-V" sobre un rango
 * lunes-a-domingo daba acceso sábado y domingo. Ahora las fechas cuyo día de
 * semana no está en el horario se descartan, igual que hace el backend.
 *
 * Con `detalle` vacío (sin horario) se devuelven todas: día completo.
 */
export const diasHabilitadosPorHorario = (
  dias: string[],
  detalle?: IHorarioDetalle[] | null
): string[] => {
  if (!detalle || detalle.length === 0) return [...dias]
  const permitidos = new Set(detalle.map((d) => d.DiaSemana))
  return dias.filter((iso) => permitidos.has(diaSemanaDe(iso)))
}

/** Cuántas ventanas genera una lista de días con un horario dado. */
export const contarVentanas = (
  dias: string[],
  detalle?: IHorarioDetalle[] | null
): number => {
  if (!detalle || detalle.length === 0) return dias.length
  return dias.reduce((acc, iso) => {
    const ds = diaSemanaDe(iso)
    return acc + detalle.filter((d) => d.DiaSemana === ds).length
  }, 0)
}

/**
 * Resumen legible del detalle de un horario, agrupando días que comparten el
 * mismo par de horas: "Lun-Vie 08:00-17:00 · Sáb 08:00-12:00".
 */
export const resumenHorario = (detalle?: IHorarioDetalle[] | null): string => {
  if (!detalle || detalle.length === 0) return 'Sin restricción de hora'

  // Agrupa por "desde-hasta"
  const porRango = new Map<string, number[]>()
  for (const d of detalle) {
    const k = `${d.HoraDesde}-${d.HoraHasta}`
    porRango.set(k, [...(porRango.get(k) ?? []), d.DiaSemana])
  }

  const partes: string[] = []
  for (const [rango, dias] of porRango) {
    const ordenados = [...new Set(dias)].sort((a, b) => a - b)
    partes.push(`${etiquetaDias(ordenados)} ${rango}`)
  }
  return partes.join(' · ')
}

/** [1,2,3,4,5] -> "Lun-Vie" ; [1,3,5] -> "Lun, Mié, Vie" ; [6] -> "Sáb" */
export const etiquetaDias = (dias: number[]): string => {
  if (dias.length === 0) return ''
  if (dias.length === 1) return diaAbrev(dias[0])
  // ¿es un tramo corrido? entonces se abrevia con guion
  const corrido = dias.every((d, i) => i === 0 || d === dias[i - 1] + 1)
  if (corrido && dias.length > 2) return `${diaAbrev(dias[0])}-${diaAbrev(dias[dias.length - 1])}`
  return dias.map(diaAbrev).join(', ')
}

/** Valida el detalle antes de guardar. Devuelve el error o null si está bien. */
export const validarDetalle = (detalle: IHorarioDetalle[]): string | null => {
  if (detalle.length === 0) return 'Agrega al menos una ventana horaria'

  for (const d of detalle) {
    if (!/^\d{1,2}:\d{2}$/.test(d.HoraDesde) || !/^\d{1,2}:\d{2}$/.test(d.HoraHasta))
      return 'Hay una hora con formato inválido'
    // Duración 0 no autoriza nada.
    if (horaAMinutos(d.HoraDesde) === horaAMinutos(d.HoraHasta))
      return 'La hora de inicio y de fin no pueden ser iguales'
  }

  // Dos ventanas del mismo día no se pueden traslapar: un mismo instante
  // quedaría autorizado por dos ventanas y el exceso se mediría contra la
  // equivocada. Solo se comparan las que NO cruzan medianoche, igual que el SP.
  for (let i = 0; i < detalle.length; i++) {
    for (let j = i + 1; j < detalle.length; j++) {
      const a = detalle[i]
      const b = detalle[j]
      if (a.DiaSemana !== b.DiaSemana) continue
      if (cruzaMedianoche(a.HoraDesde, a.HoraHasta)) continue
      if (cruzaMedianoche(b.HoraDesde, b.HoraHasta)) continue
      const aI = horaAMinutos(a.HoraDesde), aF = horaAMinutos(a.HoraHasta)
      const bI = horaAMinutos(b.HoraDesde), bF = horaAMinutos(b.HoraHasta)
      if (aI < bF && bI < aF)
        return `Dos ventanas del ${diaLargo(a.DiaSemana).toLowerCase()} se traslapan`
    }
  }
  return null
}

/** Formatea 'HH:mm' desde un Date. */
export const fmtHora = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

/** 'HH:mm' -> Date de hoy con esa hora (para alimentar el time picker). */
export const horaADate = (hhmm: string): Date => {
  const [h, m] = (hhmm || '00:00').split(':').map(Number)
  const d = new Date()
  d.setHours(h ?? 0, m ?? 0, 0, 0)
  return d
}
