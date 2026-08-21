import type { ITicket } from '../../api/modules/mantenimiento/tickets.types'

// ════════ Máquinas malas ahora, por área ════════
// La pregunta de piso: "¿dónde hay una máquina mala y la puedo ir a reparar?".
// Todo lo demás del dashboard mira un PERÍODO; esto mira el momento, y a propósito
// tampoco mira el filtro de prioridad: una máquina parada está parada aunque el
// ticket sea de la semana pasada o lo hayan reportado como Baja.
//
// MALA = el activo tiene al menos un ticket ABIERTO. COMPLETADO queda fuera aunque
// siga sin validar: la máquina ya se reparó y lo que falta es el visto bueno de
// producción (eso lo mide la cola de validación). Mandar un mecánico ahí sería
// mandarlo a una máquina que ya funciona.
// Espejo de IMCoreWeb/src/mantenimiento/maquinasMalas.ts: la agrupación tiene que
// dar el MISMO número en el celular y en la pantalla del supervisor.
export const CODES_MALA = ['PENDIENTE', 'EN_PROCESO', 'PAUSADO', 'RECHAZADO']

// En qué situación está cada máquina — es lo que decide si el mecánico va o no:
//   libre     → nadie la tomó todavía              → la puede tomar
//   rechazo   → producción la reabrió              → vuelve a la fila
//   pausa     → arrancó y se detuvo (repuestos…)   → alguien la tiene, atascada
//   asignada  → tiene mecánico y no ha arrancado
//   proceso   → alguien está con las manos ahí
export type Situacion = 'libre' | 'rechazo' | 'pausa' | 'asignada' | 'proceso'

// Los colores son los MISMOS de estados/tramos (mantenimiento.helpers.ts): ámbar
// es espera, azul es trabajo, morado es pausa. Que el color signifique lo mismo en
// toda la app importa más que destacar este bloque.
export const SITUACION: Record<Situacion, { label: string; color: string; orden: number }> = {
  libre: { label: 'Nadie la tomó', color: '#f59e0b', orden: 0 },
  rechazo: { label: 'Reabierta', color: '#f43f5e', orden: 1 },
  pausa: { label: 'En pausa', color: '#a855f7', orden: 2 },
  asignada: { label: 'Asignada', color: '#14b8a6', orden: 3 },
  proceso: { label: 'Reparándose', color: '#3b82f6', orden: 4 },
}

// Un día parada es el umbral en el que el número deja de ser rutina: hasta ahí es
// el paro del turno, arriba es una máquina olvidada. Es lo ÚNICO que se pinta del
// lado derecho de la fila, para que el color signifique algo en vez de decorar.
export const MIN_RESALTAR = 1440
export const esViejo = (m: MaquinaMala) => m.minMala >= MIN_RESALTAR

export interface MaquinaMala {
  maquina: string
  modelo: string | null
  area: string
  // El ticket que la representa (para abrir el detalle desde el panel).
  ticketId: number
  codigo: string
  prioridad: string
  situacion: Situacion
  mecanico: string | null
  // Qué le pasa: el tipo de falla si ya se diagnosticó, o lo que escribió quien
  // la reportó (un ticket recién reportado todavía no tiene diagnóstico).
  falla: string | null
  minMala: number
  // Tickets abiertos del MISMO activo (normalmente 1; >1 si la regla de un ticket
  // por máquina está apagada).
  tickets: number
}

export interface AreaMalas {
  area: string
  maquinas: MaquinaMala[]
  // Cuántas de esas máquinas no tienen a nadie: lo que un mecánico puede tomar.
  libres: number
  // Lo que lleva la peor de todas.
  minPeor: number
  // Lo que lleva la peor de las que NADIE tomó (0 si todas tienen mecánico). Es lo
  // que ordena el panel: ver "hay algo que puedo tomar y lleva 3 días" primero.
  minPeorLibre: number
}

const txt = (s?: string | null) => (s ?? '').trim()
const ms = (f?: string | null) => {
  const x = f ? new Date(f).getTime() : NaN
  return Number.isNaN(x) ? null : x
}

function situacionDe(t: ITicket): Situacion {
  const code = txt(t.EstadoCode).toUpperCase()
  if (code === 'EN_PROCESO') return 'proceso'
  if (code === 'PAUSADO') return 'pausa'
  if (code === 'RECHAZADO') return 'rechazo'
  return txt(t.Mecanico_UserCode) ? 'asignada' : 'libre'
}

const SIN_AREA = '(sin área)'

// Agrupa los tickets abiertos en máquinas y las máquinas en áreas. `ahora` entra
// por parámetro para que el cálculo sea puro y testeable.
export function agruparMaquinasMalas(tickets: ITicket[], ahora = Date.now()): AreaMalas[] {
  // Un activo puede traer más de un ticket abierto: la MÁQUINA se cuenta una vez.
  const porMaquina = new Map<string, ITicket[]>()
  for (const t of tickets) {
    if (!CODES_MALA.includes(txt(t.EstadoCode).toUpperCase())) continue
    // Los tickets de ÁREA no tienen activo: son tareas, no máquinas paradas.
    if (txt(t.TipoDestino).toUpperCase() === 'AREA') continue
    const maq = txt(t.NumeroMaquina)
    if (!maq) continue
    const k = maq.toUpperCase()
    const arr = porMaquina.get(k)
    if (arr) arr.push(t)
    else porMaquina.set(k, [t])
  }

  const maquinas: MaquinaMala[] = []
  for (const grupo of porMaquina.values()) {
    // Desde cuándo está mala: el reporte MÁS VIEJO que sigue abierto. No el último,
    // porque lo que la máquina lleva parada arranca en el primero.
    const inicios = grupo.map(t => ms(t.Fecha)).filter((n): n is number => n != null)
    const desde = inicios.length ? Math.min(...inicios) : null
    // Cuál de sus tickets la representa: si alguien está trabajando en uno, ESE
    // (si no, el panel diría "nadie la tomó" con un mecánico adentro); si no, el
    // más viejo, que es el que hay que atender.
    const orden = [...grupo].sort((a, b) => (ms(a.Fecha) ?? 0) - (ms(b.Fecha) ?? 0))
    const t = orden.find(x => txt(x.EstadoCode).toUpperCase() === 'EN_PROCESO') ?? orden[0]
    maquinas.push({
      maquina: txt(t.NumeroMaquina),
      modelo: txt(t.Modelo) || null,
      area: txt(t.Area) || SIN_AREA,
      ticketId: t.Id,
      codigo: t.CodigoTicket,
      prioridad: txt(t.Prioridad) || '—',
      situacion: situacionDe(t),
      mecanico: txt(t.Mecanico) || null,
      falla: txt(t.TipoFalla) || txt(t.Observaciones) || null,
      minMala: desde != null ? Math.max(0, Math.round((ahora - desde) / 60000)) : 0,
      tickets: grupo.length,
    })
  }

  const porArea = new Map<string, MaquinaMala[]>()
  for (const m of maquinas) {
    const arr = porArea.get(m.area)
    if (arr) arr.push(m)
    else porArea.set(m.area, [m])
  }

  return [...porArea.entries()]
    .map(([area, ms_]) => ({
      area,
      // Dentro del área: primero lo que se puede tomar (SITUACION.orden), y de eso,
      // lo que lleva más tiempo malo.
      maquinas: [...ms_].sort(
        (a, b) =>
          SITUACION[a.situacion].orden - SITUACION[b.situacion].orden ||
          b.minMala - a.minMala ||
          a.maquina.localeCompare(b.maquina),
      ),
      libres: ms_.filter(m => m.situacion === 'libre').length,
      minPeor: ms_.reduce((max, m) => Math.max(max, m.minMala), 0),
      minPeorLibre: ms_.reduce((max, m) => (m.situacion === 'libre' ? Math.max(max, m.minMala) : max), 0),
    }))
    // Arriba, las áreas donde hay algo que nadie tomó (y de esas, la que lleva más
    // esperando). Ordenar por CANTIDAD entierra lo que importa: tres áreas con dos
    // máquinas reportadas hace 15 minutos empujaban hacia abajo la que lleva ocho
    // días parada. Al final, las que ya tienen mecánico: informan, no accionan.
    .sort(
      (a, b) =>
        Number(b.libres > 0) - Number(a.libres > 0) ||
        b.minPeorLibre - a.minPeorLibre ||
        b.minPeor - a.minPeor ||
        b.maquinas.length - a.maquinas.length,
    )
}

// Totales del encabezado. Se calculan sobre lo YA agrupado para que no puedan
// contradecir a las tarjetas de abajo.
export function totalesMalas(areas: AreaMalas[]) {
  const maquinas = areas.reduce((s, a) => s + a.maquinas.length, 0)
  const libres = areas.reduce((s, a) => s + a.libres, 0)
  const peor = areas.reduce((max, a) => Math.max(max, a.minPeor), 0)
  return { maquinas, libres, areas: areas.length, peor }
}
