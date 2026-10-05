import { open, DB } from '@op-engineering/op-sqlite'
import {
  IAgenda, IAgendaMarca, IMarcaEnvio, IMarcaResultado, SinGps, TipoMarca, EstadoMarca,
} from '../../api/modules/inventarioImpulsadoras/asistencia.types'
import { ahoraLocal, uuidV4 } from './baseLocal'

/*
 * Base local de la ASISTENCIA de impulsadoras (archivo aparte del inventario).
 *
 * Las impulsadoras pierden señal seguido: NINGUNA marca vive solo en memoria ni depende de
 * la red. Al tocar «Marcar» la marca se escribe aquí (una transacción, WAL + synchronous
 * FULL) con la hora del teléfono y la coordenada que dio el GPS (que funciona sin internet),
 * y el motor (motorAsistencia.ts) la sube cuando hay señal. El servidor no duplica por Uuid,
 * así que reenviar siempre es seguro.
 *
 * También se guarda la AGENDA (turnos, tiendas y reglas) para poder marcar aunque la app se
 * abra sin señal, y la foto va en su propia tabla y sube DESPUÉS de la marca.
 *
 * Todo va por user_code: si otra persona entra en el mismo teléfono no ve ni envía lo ajeno.
 */

export interface MarcaLocal {
  uuid: string
  user_code: string
  tipo: TipoMarca
  turno_id: number | null
  sucursal_id: number | null
  tienda: string | null
  fecha_telefono: string
  mono_ms: number
  proceso: string
  lat: number | null
  lng: number | null
  prec: number | null
  gps_fecha: string | null
  simulada: number | null
  sin_gps: SinGps | null
  comentario: string | null
  con_foto: number
  enviada: number
  foto_enviada: number
  estado: EstadoMarca | null
  motivos: string | null
  distancia: number | null
  rechazo: string | null
  creada_at: string
}

const ESQUEMA = [
  `CREATE TABLE IF NOT EXISTS meta (clave TEXT PRIMARY KEY, valor TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS agenda (user_code TEXT PRIMARY KEY, json TEXT NOT NULL, bajada_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS marca (
     uuid TEXT PRIMARY KEY, user_code TEXT NOT NULL, tipo TEXT NOT NULL, turno_id INTEGER, sucursal_id INTEGER,
     tienda TEXT, fecha_telefono TEXT NOT NULL, mono_ms REAL NOT NULL, proceso TEXT NOT NULL,
     lat REAL, lng REAL, prec REAL, gps_fecha TEXT, simulada INTEGER, sin_gps TEXT, comentario TEXT,
     con_foto INTEGER NOT NULL DEFAULT 0, enviada INTEGER NOT NULL DEFAULT 0, foto_enviada INTEGER NOT NULL DEFAULT 0,
     estado TEXT, motivos TEXT, distancia INTEGER, rechazo TEXT, creada_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS ix_marca_envio ON marca (user_code, enviada, fecha_telefono)`,
  `CREATE TABLE IF NOT EXISTS foto (uuid TEXT PRIMARY KEY, base64 TEXT NOT NULL)`,
]

/** Identifica ESTA ejecución de la app: el reloj monótono solo vale dentro de la misma. */
export const PROCESO = uuidV4()
/** Reloj monótono (no cambia si alguien mueve la hora del teléfono). */
export const monotono = () => (globalThis as any).performance?.now?.() ?? Date.now()

let db: DB | null = null

function base(): DB {
  if (db) return db
  const d = open({ name: 'asistencia_impulsadoras.sqlite' })
  d.executeSync('PRAGMA journal_mode = WAL')
  d.executeSync('PRAGMA synchronous = FULL')
  for (const sql of ESQUEMA) d.executeSync(sql)
  db = d
  return d
}

const filas = <T,>(sql: string, p: any[] = []) => base().executeSync(sql, p).rows as unknown as T[]

// ── Agenda ───────────────────────────────────────────────────────────────────

export async function guardarAgenda(user: string, a: IAgenda) {
  await base().execute(`INSERT OR REPLACE INTO agenda (user_code, json, bajada_at) VALUES (?, ?, ?)`,
    [user, JSON.stringify(a), ahoraLocal()])
}

export function leerAgenda(user: string): { agenda: IAgenda; bajadaAt: string } | null {
  const r = filas<{ json: string; bajada_at: string }>(`SELECT json, bajada_at FROM agenda WHERE user_code = ?`, [user])[0]
  if (!r) return null
  try { return { agenda: JSON.parse(r.json) as IAgenda, bajadaAt: r.bajada_at } } catch { return null }
}

// ── Marcas ───────────────────────────────────────────────────────────────────

export interface NuevaMarca {
  tipo: TipoMarca
  turnoId: number | null
  sucursalId: number | null
  tienda: string | null
  /** Hora del teléfono AL TOCAR «Marcar» (antes de esperar el GPS). */
  fechaTelefono: string
  mono: number
  lat: number | null
  lng: number | null
  prec: number | null
  gpsFecha: string | null
  simulada: boolean | null
  sinGps: SinGps | null
  comentario: string | null
  fotoBase64: string | null
}

/** Guarda la marca (y su foto) en el teléfono. Si vuelve sin error, está en disco. */
export async function guardarMarca(user: string, m: NuevaMarca): Promise<MarcaLocal> {
  const uuid = uuidV4()
  const creada = ahoraLocal()
  await base().transaction(async tx => {
    await tx.execute(
      `INSERT INTO marca (uuid, user_code, tipo, turno_id, sucursal_id, tienda, fecha_telefono, mono_ms, proceso,
                          lat, lng, prec, gps_fecha, simulada, sin_gps, comentario, con_foto, creada_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuid, user, m.tipo, m.turnoId, m.sucursalId, m.tienda, m.fechaTelefono, m.mono, PROCESO,
        m.lat, m.lng, m.prec, m.gpsFecha, m.simulada == null ? null : m.simulada ? 1 : 0, m.sinGps,
        m.comentario, m.fotoBase64 ? 1 : 0, creada])
    if (m.fotoBase64) await tx.execute(`INSERT INTO foto (uuid, base64) VALUES (?, ?)`, [uuid, m.fotoBase64])
  })
  return filas<MarcaLocal>(`SELECT * FROM marca WHERE uuid = ?`, [uuid])[0]
}

/** Las marcas del teléfono de un día (YYYY-MM-DD), enviadas o no. */
export const marcasDelDia = (user: string, dia: string) =>
  filas<MarcaLocal>(`SELECT * FROM marca WHERE user_code = ? AND substr(fecha_telefono, 1, 10) = ? ORDER BY fecha_telefono`, [user, dia])

/** Las de los últimos días (para el historial sin señal). */
export const marcasRecientes = (user: string, dias: number) =>
  filas<MarcaLocal>(`SELECT * FROM marca WHERE user_code = ? AND fecha_telefono >= ? ORDER BY fecha_telefono DESC`,
    [user, restarDias(ahoraLocal().slice(0, 10), dias)])

export function restarDias(iso: string, n: number) {
  const [y, m, d] = iso.split('-').map(Number)
  const f = new Date(y, m - 1, d - n)
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`
}

/** Las que faltan subir, las más viejas primero. */
export const marcasPorEnviar = (user: string, limite: number) =>
  filas<MarcaLocal>(`SELECT * FROM marca WHERE user_code = ? AND enviada = 0 ORDER BY fecha_telefono LIMIT ?`, [user, limite])

/** Fotos de marcas que ya llegaron al servidor pero cuya foto todavía no. */
export const fotosPorEnviar = (user: string) =>
  filas<{ uuid: string }>(`SELECT m.uuid FROM marca m JOIN foto f ON f.uuid = m.uuid
                           WHERE m.user_code = ? AND m.enviada = 1 AND m.rechazo IS NULL AND m.foto_enviada = 0
                           ORDER BY m.fecha_telefono`, [user])

export const leerFoto = (uuid: string) => filas<{ base64: string }>(`SELECT base64 FROM foto WHERE uuid = ?`, [uuid])[0]?.base64 ?? null

export function pendientes(user: string): { marcas: number; fotos: number } {
  const r = filas<{ m: number; f: number }>(
    `SELECT (SELECT COUNT(*) FROM marca WHERE user_code = ? AND enviada = 0) AS m,
            (SELECT COUNT(*) FROM marca mm JOIN foto ff ON ff.uuid = mm.uuid
              WHERE mm.user_code = ? AND mm.enviada = 1 AND mm.rechazo IS NULL AND mm.foto_enviada = 0) AS f`, [user, user])[0]
  return { marcas: Number(r?.m ?? 0), fotos: Number(r?.f ?? 0) }
}

/** La marca tal como viaja. SegundosDesdeMarca solo si la app no se reinició (reloj monótono). */
export function comoEnvio(m: MarcaLocal): IMarcaEnvio {
  return {
    Uuid: m.uuid, Tipo: m.tipo, Turno_Id: m.turno_id, Sucursal_Id: m.sucursal_id, FechaHoraTelefono: m.fecha_telefono,
    SegundosDesdeMarca: m.proceso === PROCESO ? Math.max(0, Math.round((monotono() - m.mono_ms) / 1000)) : null,
    Latitud: m.lat, Longitud: m.lng, PrecisionM: m.prec, GpsFechaHora: m.gps_fecha,
    Simulada: m.simulada == null ? null : !!m.simulada, SinGpsMotivo: m.sin_gps, Comentario: m.comentario,
    ConFoto: !!m.con_foto,
  }
}

/** Lo que dijo el servidor de cada una. Una RECHAZADA (mal formada) no se reintenta, pero NO se borra. */
export async function marcarEnviadas(resultados: IMarcaResultado[]) {
  await base().transaction(async tx => {
    for (const r of resultados) {
      await tx.execute(
        `UPDATE marca SET enviada = 1, estado = ?, motivos = ?, distancia = ?, rechazo = ? WHERE uuid = ?`,
        [r.Estado, r.Motivos, r.DistanciaM, r.Resultado === 'RECHAZADA' ? (r.Rechazo ?? 'RECHAZADA') : null, r.Uuid.toLowerCase()])
    }
  })
}

/** La foto ya está en el servidor: se borra del teléfono (pesa) y se actualiza el estado. */
export async function marcarFotoEnviada(uuid: string, estado: EstadoMarca | null, motivos: string | null) {
  await base().transaction(async tx => {
    await tx.execute(`UPDATE marca SET foto_enviada = 1, estado = COALESCE(?, estado), motivos = ? WHERE uuid = ?`, [estado, motivos, uuid])
    await tx.execute(`DELETE FROM foto WHERE uuid = ?`, [uuid])
  })
}

/** Lo enviado y viejo (más de 45 días) ya no hace falta en el teléfono. Lo pendiente NUNCA se borra. */
export function limpiarViejas(user: string) {
  base().executeSync(`DELETE FROM marca WHERE user_code = ? AND enviada = 1 AND (con_foto = 0 OR foto_enviada = 1)
                      AND fecha_telefono < ?`, [user, restarDias(ahoraLocal().slice(0, 10), 45)])
}

// ── Qué toca marcar ──────────────────────────────────────────────────────────

export interface MarcaVista {
  uuid: string
  tipo: TipoMarca
  fecha: string
  /** EN_TELEFONO = guardada sin enviar todavía. */
  estado: EstadoMarca | 'EN_TELEFONO'
  motivos: string | null
  local: boolean
}

/**
 * Las marcas de un turno (o de una tienda sin turno, ese día): las del teléfono + las que el
 * servidor ya tiene (por si marcó desde otro teléfono o reinstaló la app), sin repetir.
 */
export function marcasDeTurno(user: string, agendaMarcas: IAgendaMarca[], dia: string, turnoId: number | null, sucursalId: number | null): MarcaVista[] {
  const locales = marcasDelDia(user, dia).filter(m => (turnoId != null ? m.turno_id === turnoId : m.turno_id == null && m.sucursal_id === sucursalId))
  const vistas = new Map<string, MarcaVista>()
  for (const m of agendaMarcas) {
    if (m.FechaHoraTelefono.slice(0, 10) !== dia) continue
    if (turnoId != null ? m.Turno_Id !== turnoId : !(m.Turno_Id == null && m.Sucursal_Id === sucursalId)) continue
    vistas.set(m.Uuid.toLowerCase(), { uuid: m.Uuid, tipo: m.Tipo, fecha: m.FechaHoraTelefono, estado: m.Estado, motivos: m.Motivos, local: false })
  }
  for (const m of locales) {
    vistas.set(m.uuid, {
      uuid: m.uuid, tipo: m.tipo, fecha: m.fecha_telefono,
      estado: m.enviada ? (m.estado ?? 'VALIDA') : 'EN_TELEFONO', motivos: m.motivos, local: true,
    })
  }
  return [...vistas.values()].filter(v => v.estado !== 'RECHAZADA').sort((a, b) => a.fecha.localeCompare(b.fecha))
}

/** La siguiente marca: inicio → (salida y regreso de almuerzo, si los hay) → fin. null = ya terminó. */
export function siguienteMarca(hechas: MarcaVista[], conAlmuerzo: boolean): TipoMarca | null {
  const tiene = (t: TipoMarca) => hechas.some(h => h.tipo === t)
  if (!tiene('INICIO')) return 'INICIO'
  if (tiene('FIN')) return null
  if (tiene('SALIDA_ALMUERZO') && !tiene('REGRESO_ALMUERZO')) return 'REGRESO_ALMUERZO'
  if (conAlmuerzo && !tiene('SALIDA_ALMUERZO')) return 'SALIDA_ALMUERZO'
  return 'FIN'
}
