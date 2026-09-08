import {
  IOvertimeParameter,
  IOvertimeShiftSchedule,
} from '../../api/modules/overtime/overtime.types'

// Cálculo de las horas extra y su reparto entre bandas de recargo.
//
// Vive en el cliente y no en el servidor porque tiene que responder mientras el
// usuario mueve la hora: el reparto cambia con cada minuto que agrega, y un
// viaje por cada tecla haría la captura inusable. El procedimiento recibe el
// reparto ya calculado y lo guarda tal cual.
//
// Es el MISMO cálculo que hace la pantalla web (request.component.ts). Si acá
// se separa, dos pantallas repartirían las mismas horas de forma distinta.

/** Un tramo con recargo, en segundos desde la medianoche. */
export interface TimeBand {
  concepto: string
  descripcion: string
  porcentaje: number | null
  parametroId: number | null
  start: number
  end: number
}

/** Las horas de una fila que caen dentro de una banda. */
export interface OvertimeBand {
  concepto: string
  descripcion: string
  porcentaje: number | null
  hours: number
  parametroId: number | null
}

const SEGUNDOS_DIA = 86400
const MEDIA_HORA = 1800

/**
 * 'HH:mm', 'HH:mm:ss' o '4:30 PM' a segundos desde la medianoche.
 *
 * Devuelve null cuando no se puede interpretar, y eso es distinto de cero: cero
 * es la medianoche.
 */
export const timeToSeconds = (value: string | null | undefined): number | null => {
  if (value === null || value === undefined) return null

  const raw = String(value).trim()
  if (!raw) return null

  const match = raw.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp])?\.?[Mm]?/)
  if (!match) return null

  let hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = Number(match[3] ?? 0)
  const meridiem = match[4]?.toUpperCase()

  if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) return null

  if (meridiem === 'P' && hours < 12) hours += 12
  if (meridiem === 'A' && hours === 12) hours = 0

  if (hours > 24 || minutes > 59 || seconds > 59) return null

  return hours * 3600 + minutes * 60 + seconds
}

/** Segundos desde la medianoche a 'HH:mm'. */
export const secondsToTime = (total: number): string => {
  const h = Math.floor(total / 3600) % 24
  const m = Math.floor((total % 3600) / 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * 'HH:mm' a un Date de hoy con esa hora, para alimentar el selector nativo.
 *
 * La fecha da igual: el selector se abre en modo hora y solo se le lee la hora.
 * Sin valor arranca en la hora en curso, que suele estar más cerca de lo que se
 * va a elegir que la medianoche.
 */
export const horaADate = (hhmm: string | null | undefined): Date => {
  const d = new Date()
  const segundos = timeToSeconds(hhmm)

  if (segundos === null) {
    d.setSeconds(0, 0)
    return d
  }

  d.setHours(Math.floor(segundos / 3600) % 24, Math.floor((segundos % 3600) / 60), 0, 0)
  return d
}

/** Un Date a 'HH:mm', que es como se captura la hora extra. */
export const dateAHora = (d: Date): string =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

/** Una opción de hora de fin: a qué hora termina y cuánto duró. */
export interface OpcionFin {
  hora: string
  /** Minutos desde el inicio. Es lo que de verdad se está eligiendo. */
  minutos: number
}

/**
 * Hasta dónde llega la cobertura de las bandas a partir de un inicio, en
 * segundos (puede pasar de 86400 si cruza la medianoche).
 *
 * Es el techo de lo que se puede pedir: una hora fuera de banda no es pagable,
 * así que ofrecerla sería ofrecer trabajo que nadie va a pagar.
 *
 * Se recorre la cobertura en lugar de tomar el fin de la última banda: si hay
 * un HUECO entre bandas, la cobertura termina ahí. Las bandas que arma
 * bandsFrom son contiguas por construcción, pero eso depende de cómo estén
 * configurados los parámetros y no es algo que este cálculo pueda dar por
 * sentado.
 */
export const finMaximoEnBandas = (
  inicio: string | null | undefined,
  bands: TimeBand[],
): number | null => {
  const start = timeToSeconds(inicio)
  if (start === null || bands.length === 0) return null

  let cobertura = start

  const extender = (offset: number) => {
    for (const b of bands) {
      const bStart = b.start + offset
      const bEnd = b.end + offset

      if (bEnd <= cobertura) continue      // ya cubierta
      if (bStart > cobertura) break        // hueco: la cobertura se corta acá
      cobertura = bEnd
    }
  }

  extender(0)

  // La cobertura llegó a la medianoche: puede seguir con las bandas del día
  // siguiente, que son las mismas corridas 24 horas. Es el caso del turno de
  // noche, donde la hora extra empieza a las 22:00 y sigue de madrugada.
  if (cobertura >= SEGUNDOS_DIA) extender(SEGUNDOS_DIA)

  return cobertura > start ? cobertura : null
}

/**
 * Las horas de fin posibles a partir de un inicio, cada 30 minutos.
 *
 * La hora extra no se piensa como "¿a qué hora?" sino como "¿cuánto se queda?",
 * y siempre arranca donde termina la jornada. Con el inicio fijo, el fin es una
 * lista corta y ordenada en lugar de un campo libre — y así no existe el rango
 * inválido: ninguna opción cae antes del inicio ni se encima con el turno.
 *
 * El techo son LAS BANDAS del turno: solo se ofrece lo que está configurado
 * como pagable. Cuando el turno no tiene bandas —o todavía no llegaron— se cae
 * a un tope genérico, porque un selector vacío dejaría la fila sin forma de
 * llenarse; quien las use tiene que avisar que van sin respaldo.
 */
export const opcionesFin = (
  inicio: string | null | undefined,
  bands: TimeBand[] = [],
  horasMaxSinBandas = 10,
): OpcionFin[] => {
  const start = timeToSeconds(inicio)
  if (start === null) return []

  const techoBandas = finMaximoEnBandas(inicio, bands)
  const techo = techoBandas ?? start + horasMaxSinBandas * 3600

  const out: OpcionFin[] = []

  for (let s = start + MEDIA_HORA; s <= techo; s += MEDIA_HORA) {
    out.push({
      // El módulo es lo que permite que la lista cruce la medianoche: a las
      // 22:00 más tres horas es la 01:00, y rowHours ya corrige el día.
      hora: secondsToTime(s % SEGUNDOS_DIA),
      minutos: Math.round((s - start) / 60),
    })
  }

  // El fin exacto de la cobertura no siempre cae en una media hora (una banda
  // que cierra 20:45). Se agrega para que se pueda pedir la banda completa.
  if (techoBandas !== null && (techoBandas - start) % MEDIA_HORA !== 0) {
    out.push({
      hora: secondsToTime(techoBandas % SEGUNDOS_DIA),
      minutos: Math.round((techoBandas - start) / 60),
    })
  }

  return out
}

/**
 * Horas de inicio posibles, cada 30 minutos.
 *
 * Solo hacen falta cuando el día NO es laborable para el turno: ahí no hay
 * jornada de la cual deducir el inicio. El rango arranca a las 04:00 y no a la
 * medianoche porque nadie programa horas extra a las 02:00 y cuarenta opciones
 * ya son largas de recorrer.
 */
export const opcionesInicio = (desde = '04:00', hasta = '23:30'): string[] => {
  const ini = timeToSeconds(desde)
  const fin = timeToSeconds(hasta)
  if (ini === null || fin === null) return []

  const out: string[] = []
  for (let s = ini; s <= fin; s += MEDIA_HORA) out.push(secondsToTime(s))

  return out
}

/**
 * Normaliza lo que el usuario escribió.
 *
 * '2030' y '20:30' son lo mismo, y '24:00' es la medianoche de cierre: se
 * guarda como '00:00' porque es el mismo instante. Devuelve null si no se pudo
 * interpretar, para que el campo quede marcado en lugar de corregirse a algo
 * que el usuario no escribió.
 */
export const normalizeTime = (value: string | null | undefined): string | null => {
  const raw = String(value ?? '').trim()
  if (!raw) return null

  // Sin separador: se parte en horas y minutos por la derecha, así '930' es
  // 09:30 y no 93:0.
  const soloDigitos = raw.replace(/\D/g, '')
  const texto =
    raw.includes(':') || soloDigitos.length < 3
      ? raw
      : `${soloDigitos.slice(0, soloDigitos.length - 2)}:${soloDigitos.slice(-2)}`

  const segundos = timeToSeconds(texto)
  if (segundos === null) return null

  return segundos >= SEGUNDOS_DIA ? '00:00' : secondsToTime(segundos)
}

/**
 * El fin en segundos, corrido al día siguiente cuando la hora extra cruza la
 * medianoche: de 22:00 a 02:00 son cuatro horas, no menos veinte.
 */
export const endSeconds = (
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): number | null => {
  const start = timeToSeconds(startTime)
  const end = timeToSeconds(endTime)
  if (start === null || end === null) return null

  return end <= start ? end + SEGUNDOS_DIA : end
}

/** Horas decimales del rango. Null si está incompleto o no da un rango válido. */
export const rowHours = (
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): number | null => {
  const start = timeToSeconds(startTime)
  const end = endSeconds(startTime, endTime)
  if (start === null || end === null || end <= start) return null

  return +((end - start) / 3600).toFixed(2)
}

/** La llave con la que se agrupan las bandas: planilla + turno + detalle. */
export const parameterKey = (
  planilla: string | null | undefined,
  turnoId: number | null,
  turnoDetalleId: number | null,
): string => {
  // La planilla se normaliza porque los dos lados de la llave vienen de fuentes
  // distintas: el empleado la trae de la vista y la banda del procedimiento. Si
  // una llega de un char() con relleno ('15  '), la llave no calza y el reparto
  // se queda sin bandas.
  const p = String(planilla ?? '').trim().toUpperCase()
  return `${p}|${turnoId ?? ''}|${turnoDetalleId ?? ''}`
}

/**
 * Convierte los parámetros del servidor en tramos continuos.
 *
 * El procedimiento los entrega como 16:30:01-19:00:00, 19:00:01-21:00:00… o
 * sea cada banda arranca un segundo después de que termina la anterior. Tomados
 * literales, una hora extra de 16:30 a 19:00 daría 2h29m59s en vez de 2h30m: de
 * ahí el segundo que se le resta al inicio. Y una banda que cierra a las
 * 23:59:59 se lleva a medianoche por lo mismo.
 */
export const bandsFrom = (params: IOvertimeParameter[]): TimeBand[] =>
  params
    .map((p): TimeBand | null => {
      const start = timeToSeconds(p.horaEntrada)
      let end = timeToSeconds(p.horaSalida)
      if (start === null || end === null) return null
      if (end === SEGUNDOS_DIA - 1) end = SEGUNDOS_DIA

      return {
        concepto: p.concepto,
        descripcion: p.descripcion,
        porcentaje: p.porcentaje,
        parametroId: p.ParametroId ?? null,
        start: start - 1,
        end,
      }
    })
    .filter((b): b is TimeBand => b !== null)
    .sort((a, b) => a.start - b.start)

/**
 * Reparte las horas del rango entre las bandas.
 *
 * Lo que no cae en ninguna se reporta aparte en lugar de desaparecer del total:
 * si el turno no tiene bandas para ese día, o el rango se sale de las que
 * tiene, el usuario tiene que verlo — esas horas no son pagables y la
 * diferencia contra el total es la única señal.
 */
export const computeBreakdown = (
  startTime: string | null | undefined,
  endTime: string | null | undefined,
  bands: TimeBand[],
): OvertimeBand[] => {
  const start = timeToSeconds(startTime)
  const end = endSeconds(startTime, endTime)
  if (start === null || end === null || end <= start) return []

  const result: OvertimeBand[] = []
  let covered = 0

  for (const band of bands) {
    const from = Math.max(start, band.start)
    const to = Math.min(end, band.end)

    if (to > from) {
      covered += to - from
      result.push({
        concepto: band.concepto,
        descripcion: band.descripcion,
        porcentaje: band.porcentaje,
        parametroId: band.parametroId,
        hours: +((to - from) / 3600).toFixed(2),
      })
    }
  }

  const uncovered = end - start - covered

  // Más de un segundo: por debajo de eso es el redondeo de los tramos.
  if (uncovered > 1) {
    result.push({
      concepto: '',
      // Se distinguen las dos causas: o el turno no tiene bandas ese día, o las
      // tiene y el rango capturado se sale de ellas.
      descripcion: bands.length === 0 ? 'Sin parámetros del turno' : 'Fuera de banda',
      porcentaje: null,
      parametroId: null,
      hours: +(uncovered / 3600).toFixed(2),
    })
  }

  return result
}

/** ¿El día es laborable para ese turno? Es 'S'/'N' en la vista de turnos. */
export const esLaborable = (schedule: IOvertimeShiftSchedule | undefined): boolean =>
  String(schedule?.IsLaborable ?? '').trim().toUpperCase() === 'S'

/**
 * La hora a la que empieza la hora extra de un empleado: donde termina su
 * jornada.
 *
 * Vacío cuando el día no es laborable para su turno o el turno no tiene fin
 * configurado. Ahí la captura el usuario, porque no hay jornada de la cual
 * deducirla.
 */
export const inicioPorJornada = (schedule: IOvertimeShiftSchedule | undefined): string => {
  if (!esLaborable(schedule)) return ''

  const fin = timeToSeconds(schedule?.ShiftEnd)
  return fin === null ? '' : secondsToTime(fin)
}

/**
 * ¿El rango se encima con la jornada del empleado?
 *
 * Las horas extra son ADEMÁS del turno, así que no pueden solaparlo. Con
 * jornada 07:00-16:30 el rango válido empieza a las 16:30 o termina antes de
 * las 07:00.
 */
export const seEncimaConJornada = (
  startTime: string | null | undefined,
  endTime: string | null | undefined,
  schedule: IOvertimeShiftSchedule | undefined,
): boolean => {
  if (!esLaborable(schedule)) return false

  const jornadaIni = timeToSeconds(schedule?.ShiftStart)
  const jornadaFin = timeToSeconds(schedule?.ShiftEnd)
  const start = timeToSeconds(startTime)
  const end = endSeconds(startTime, endTime)

  if (jornadaIni === null || jornadaFin === null || start === null || end === null) return false

  return start < jornadaFin && end > jornadaIni
}

/** El rango cierra el día siguiente. Es válido, pero conviene decirlo. */
export const cruzaMedianoche = (
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): boolean => {
  const start = timeToSeconds(startTime)
  const end = timeToSeconds(endTime)
  if (start === null || end === null) return false

  return end <= start
}

/**
 * Fecha y hora completas para el servidor.
 *
 * El fin cae el día siguiente cuando el rango cruza la medianoche: la columna
 * es DATETIME justamente para poder representarlo.
 */
export const fechaHoraISO = (fecha: string, hora: string, corrimientoDias = 0): string => {
  if (corrimientoDias === 0) return `${fecha}T${hora}:00`

  const [y, m, d] = fecha.split('-').map(Number)
  const base = new Date(y, (m ?? 1) - 1, d ?? 1)
  base.setDate(base.getDate() + corrimientoDias)

  const yyyy = base.getFullYear()
  const mm = String(base.getMonth() + 1).padStart(2, '0')
  const dd = String(base.getDate()).padStart(2, '0')

  return `${yyyy}-${mm}-${dd}T${hora}:00`
}

/** Totales por concepto de todo el lote, para el resumen antes de guardar. */
export const totalesPorConcepto = (filas: { breakdown: OvertimeBand[] }[]): OvertimeBand[] => {
  const mapa = new Map<string, OvertimeBand>()

  for (const fila of filas) {
    for (const banda of fila.breakdown) {
      const key = banda.concepto || banda.descripcion
      const actual = mapa.get(key)

      if (actual) actual.hours = +(actual.hours + banda.hours).toFixed(2)
      else mapa.set(key, { ...banda })
    }
  }

  return [...mapa.values()].sort((a, b) => (a.porcentaje ?? 99) - (b.porcentaje ?? 99))
}
