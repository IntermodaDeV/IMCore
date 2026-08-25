import type { IMecanico, ITicket } from '../../api/modules/mantenimiento/tickets.types'

// ════════ Mecánicos ocupados y disponibles, AHORA ════════
// La otra mitad de la pregunta de piso: ya sé qué máquina está mala
// (maquinasMalas.helpers.ts), ahora quién la puede atender. Igual que ese panel,
// mira el momento y no el período.
//
// Espejo de IMCoreWeb/src/mantenimiento/mecanicosAhora.ts: el celular del
// supervisor y la pantalla del taller tienen que contar lo mismo.

// Cuatro estados, en el orden en que le importan a quien reparte trabajo. El de
// "cola" existe porque un mecánico con tickets asignados que NO arrancó no está
// libre (se le va a caer encima) ni está trabajando.
export type EstadoMecanico = 'trabajando' | 'pausa' | 'cola' | 'libre'

// Los colores son los de siempre (tramos del paro): azul trabajo, morado pausa,
// ámbar espera. Verde para el libre, que acá es lo BUENO: hay a quién asignarle.
export const ESTADO_MEC: Record<
  EstadoMecanico,
  { label: string; color: string; orden: number; pie: string }
> = {
  trabajando: {
    label: 'Trabajando',
    color: '#3b82f6',
    orden: 0,
    pie: 'con las manos en una máquina',
  },
  pausa: {
    label: 'En pausa',
    color: '#a855f7',
    orden: 1,
    pie: 'arrancó y se detuvo: puede tomar otra cosa',
  },
  cola: {
    label: 'Con cola',
    color: '#f59e0b',
    orden: 2,
    pie: 'tiene tickets encima y no ha arrancado',
  },
  libre: { label: 'Libre', color: '#22c55e', orden: 3, pie: 'sin nada abierto en el sistema' },
}

// Roles que se CUENTAN como mecánicos. El padrón (SP_GetMecanicos) devuelve además
// Supervisor de Mantenimiento, porque los tres pueden tomar un ticket, pero
// contarlos como "disponibles" infla el número: se muestran aparte.
const ROLES_OPERATIVOS = ['Mecánico', 'Técnico']
const ROL_SUPERVISOR = 'Supervisor de Mantenimiento'
// Un mecánico que salió del padrón (usuario inactivo o sin rol) pero que TIENE
// tickets abiertos no puede desaparecer del panel: sus tickets son reales.
const FUERA_PADRON = '(fuera del padrón)'

export interface MecanicoAhora {
  code: string
  nombre: string
  rol: string
  estado: EstadoMecanico
  // El ticket que lo define (para abrir el detalle desde el panel).
  ticketId: number | null
  codigo: string | null
  // Dónde está: la máquina si el ticket es de activo, o el objeto/área si no.
  donde: string | null
  area: string | null
  // Desde cuándo: arrancó (trabajando/pausa) o se le asignó (cola). null = no hay sello.
  desde: number | null
  enProceso: number
  pausados: number
  // Asignados sin arrancar + reabiertos por producción: los dos son cola.
  enCola: number
  total: number
}

const txt = (s?: string | null) => (s ?? '').trim()
const ms = (f?: string | null) => {
  const x = f ? new Date(f).getTime() : NaN
  return Number.isNaN(x) ? null : x
}

export function clasificarMecanicos(
  mecanicos: IMecanico[],
  abiertos: ITicket[],
): { operativos: MecanicoAhora[]; supervisores: MecanicoAhora[] } {
  // Tickets abiertos por mecánico. Los que no tienen mecánico asignado no cuentan
  // acá: esos son el pool sin dueño y los muestra el panel de máquinas malas.
  const porCode = new Map<string, ITicket[]>()
  for (const t of abiertos) {
    const code = txt(t.Mecanico_UserCode)
    if (!code) continue
    const arr = porCode.get(code)
    if (arr) arr.push(t)
    else porCode.set(code, [t])
  }

  const padron = new Map<string, IMecanico>()
  for (const m of mecanicos) {
    const code = txt(m.User_Code)
    if (code) padron.set(code, m)
  }

  const armar = (code: string, nombre: string, rol: string): MecanicoAhora => {
    const suyos = porCode.get(code) ?? []
    const code_ = (t: ITicket) => txt(t.EstadoCode).toUpperCase()
    const enProc = suyos.filter(t => code_(t) === 'EN_PROCESO')
    const paus = suyos.filter(t => code_(t) === 'PAUSADO')
    // RECHAZADO también es cola: producción lo reabrió y nadie lo está trabajando.
    const cola = suyos.filter(t => ['PENDIENTE', 'RECHAZADO'].includes(code_(t)))

    let estado: EstadoMecanico = 'libre'
    let grupo: ITicket[] = []
    if (enProc.length) {
      estado = 'trabajando'
      grupo = enProc
    } else if (paus.length) {
      estado = 'pausa'
      grupo = paus
    } else if (cola.length) {
      estado = 'cola'
      grupo = cola
    }

    // El ticket que lo representa: el más viejo del grupo que define su estado.
    const clave = (t: ITicket) =>
      estado === 'cola' ? (ms(t.FechaAsignacion) ?? ms(t.Fecha)) : (ms(t.HoraInicio) ?? ms(t.Fecha))
    const orden = [...grupo].sort((a, b) => (clave(a) ?? 0) - (clave(b) ?? 0))
    const t = orden[0] ?? null

    return {
      code,
      nombre,
      rol,
      estado,
      ticketId: t?.Id ?? null,
      codigo: t?.CodigoTicket ?? null,
      donde: t ? txt(t.NumeroMaquina) || txt(t.Objeto) || null : null,
      area: t ? txt(t.Area) || null : null,
      desde: t ? clave(t) : null,
      enProceso: enProc.length,
      pausados: paus.length,
      enCola: cola.length,
      total: suyos.length,
    }
  }

  const operativos: MecanicoAhora[] = []
  const supervisores: MecanicoAhora[] = []

  for (const [code, m] of padron) {
    const rol = txt(m.Rol)
    const fila = armar(code, txt(m.Nombre) || code, rol)
    if (rol === ROL_SUPERVISOR) supervisores.push(fila)
    // Sin rol (API vieja, antes del script 74) se cuenta como operativo: es lo que
    // hacía el panel antes y es mejor que dejar la lista vacía.
    else if (!rol || ROLES_OPERATIVOS.includes(rol)) operativos.push(fila)
  }

  // Los que tienen tickets abiertos y NO están en el padrón: se muestran igual.
  for (const code of porCode.keys()) {
    if (padron.has(code)) continue
    const nombre = txt(porCode.get(code)?.[0]?.Mecanico) || code
    operativos.push(armar(code, nombre, FUERA_PADRON))
  }

  // Dentro de cada estado, lo MÁS VIEJO primero: el trabajo que lleva más tiempo
  // abierto es el que hay que mirar. Sin sello de tiempo va al final (no adelante).
  const cuando = (m: MecanicoAhora) => m.desde ?? Number.MAX_SAFE_INTEGER
  const ordenar = (a: MecanicoAhora, b: MecanicoAhora) =>
    ESTADO_MEC[a.estado].orden - ESTADO_MEC[b.estado].orden ||
    cuando(a) - cuando(b) ||
    b.total - a.total ||
    a.nombre.localeCompare(b.nombre)

  // Dos usuarios ACTIVOS para la misma persona existe de verdad en producción
  // (hrivera / herivera, los dos "Hector Rivera"). Sin esto el panel muestra el
  // mismo nombre dos veces y parece un bug del panel; con el código al lado se lee
  // como lo que es: dos cuentas que alguien tiene que unificar.
  const veces = new Map<string, number>()
  for (const m of [...operativos, ...supervisores])
    veces.set(m.nombre, (veces.get(m.nombre) ?? 0) + 1)
  for (const m of [...operativos, ...supervisores])
    if ((veces.get(m.nombre) ?? 0) > 1) m.nombre = `${m.nombre} (${m.code})`

  return { operativos: operativos.sort(ordenar), supervisores: supervisores.sort(ordenar) }
}

// Cuántos hay en cada estado (sobre los operativos: los supervisores van aparte).
export function totalesMecanicos(operativos: MecanicoAhora[]) {
  const cuenta = (e: EstadoMecanico) => operativos.filter(m => m.estado === e).length
  return {
    total: operativos.length,
    trabajando: cuenta('trabajando'),
    pausa: cuenta('pausa'),
    cola: cuenta('cola'),
    libre: cuenta('libre'),
    // "Ocupados" para el titular: cualquiera que no esté libre.
    ocupados: operativos.filter(m => m.estado !== 'libre').length,
  }
}
