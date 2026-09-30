import { open, DB } from '@op-engineering/op-sqlite'
import { IMiAsignacion, ILecturaServidor, TipoLectura } from '../../api/modules/inventarioImpulsadoras/inventarioImpulsadoras.types'

/*
 * Base local del inventario de impulsadoras. NADA de lo escaneado vive solo en memoria:
 * cada lectura se escribe aquí (una transacción, WAL + synchronous=FULL) ANTES de que
 * suene la confirmación. «Si vibró, está guardado», aunque la PDA se apague un segundo
 * después. El motor de envío (motorEnvio.ts) sube lo pendiente cuando hay señal.
 *
 * Todo va por user_code: si otra persona entra en el mismo equipo no ve ni envía lo ajeno,
 * y lo de la primera se envía cuando ella vuelva a entrar.
 */

/**
 * Qué está escaneando la persona. La etiqueta de Denim trae QR Y barra juntos y el lector
 * de la PDA lee lo que quede bajo la mira: en una línea Mixto se dice QUÉ se escanea y lo
 * otro se rechaza (si no, la misma pieza se cuenta una vez por barra y otra por QR).
 *   QR           el QR de la etiqueta (una lectura = una pieza, con serie única)
 *   BARRA        piezas que solo traen barra
 *   NOENCONTRADO «QR dañado»: la barra de una pieza cuyo QR no se puede leer
 *   AUTO         lo único que admite la línea (versiones anteriores de la pantalla)
 */
export type ModoEscaneo = 'AUTO' | 'QR' | 'BARRA' | 'NOENCONTRADO'

/** El modo con que arranca una línea: QR si lleva QR (Denim y Mixto), si no Barra. */
export const modoInicial = (tipoEscaneo: string): ModoEscaneo => (tipoEscaneo.includes('QR') ? 'QR' : 'BARRA')

export interface AsignacionLocal {
  iu: number
  user_code: string
  inventario_id: number
  correlativo: string
  fecha: string
  empresa: string
  cliente_codigo: string
  cliente: string
  sucursal: string
  direccion: string
  linea: string
  tipo_escaneo: string
  estado: string
  puede_escanear: number
  lecturas_servidor: number
  piezas_servidor: number
  finalizar_pedido: number
  finalizada_at: string | null
  actualizado_at: string
  // calculadas
  lecturas: number
  piezas: number
  pendientes: number
}

export interface LecturaLocal {
  uuid: string
  iu: number
  secuencia: number
  tipo: TipoLectura
  codigo: string
  delta: number
  es_ajuste: number
  fecha_equipo: string
  enviada: number
  rechazo: string | null
}

export interface ResumenCodigo { tipo: TipoLectura; codigo: string; cantidad: number; ultima_at: string }

export type ResultadoLectura =
  | { ok: true; lectura: LecturaLocal }
  | { ok: false; motivo: string; codigo: string; conflicto?: ConflictoQrBarra; danadoRepetido?: DanadoRepetido }

/**
 * La misma barra otra vez en «QR dañado». Sin QR no hay número de serie: puede ser OTRA
 * pieza de la misma talla/color o la misma escaneada dos veces. Solo cuenta si confirma.
 */
export interface DanadoRepetido { codigo: string; contadas: number }

/** Un QR cuya barra ya se contó suelta: probablemente la MISMA pieza. Se ofrece cambiarla. */
export interface ConflictoQrBarra { qr: string; barra: string; barrasContadas: number }

/**
 * La barra que va dentro del QR (4.º campo: «producto,talla,color,BARRA,estilo,…»). Es la
 * misma barra impresa en la etiqueta: con ella se cruza QR contra barra sin adivinar.
 */
export function barraDelQR(qr: string): string | null {
  const b = (qr.split(',')[3] ?? '').trim()
  return /^(\d{8}|\d{12}|\d{13})$/.test(b) ? b : null
}

const VERSION_ESQUEMA = 1

const ESQUEMA = [
  `CREATE TABLE IF NOT EXISTS meta (clave TEXT PRIMARY KEY, valor TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS asignacion (
     iu INTEGER PRIMARY KEY, user_code TEXT NOT NULL, inventario_id INTEGER NOT NULL,
     correlativo TEXT NOT NULL, fecha TEXT, empresa TEXT, cliente_codigo TEXT, cliente TEXT,
     sucursal TEXT, direccion TEXT, linea TEXT, tipo_escaneo TEXT NOT NULL, estado TEXT NOT NULL,
     puede_escanear INTEGER NOT NULL DEFAULT 1, lecturas_servidor INTEGER NOT NULL DEFAULT 0,
     piezas_servidor INTEGER NOT NULL DEFAULT 0, finalizar_pedido INTEGER NOT NULL DEFAULT 0,
     finalizada_at TEXT, actualizado_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS lectura (
     uuid TEXT PRIMARY KEY, iu INTEGER NOT NULL, user_code TEXT NOT NULL, secuencia INTEGER NOT NULL,
     tipo TEXT NOT NULL, codigo TEXT NOT NULL, delta INTEGER NOT NULL, es_ajuste INTEGER NOT NULL DEFAULT 0,
     fecha_equipo TEXT NOT NULL, enviada INTEGER NOT NULL DEFAULT 0, rechazo TEXT)`,
  `CREATE INDEX IF NOT EXISTS ix_lectura_envio ON lectura (iu, enviada, secuencia)`,
  `CREATE INDEX IF NOT EXISTS ix_lectura_user ON lectura (user_code, enviada)`,
  `CREATE TABLE IF NOT EXISTS resumen (
     iu INTEGER NOT NULL, tipo TEXT NOT NULL, codigo TEXT NOT NULL, cantidad INTEGER NOT NULL,
     ultima_at TEXT NOT NULL, PRIMARY KEY (iu, tipo, codigo))`,
]

let db: DB | null = null
let secuencia = 0
let equipo = ''

export function base(): DB {
  if (db) return db
  const d = open({ name: 'inventario_impulsadoras.sqlite' })
  // WAL: escribir no bloquea leer. FULL: el commit no vuelve hasta que está en disco;
  // con NORMAL un apagón puede llevarse la última transacción.
  d.executeSync('PRAGMA journal_mode = WAL')
  d.executeSync('PRAGMA synchronous = FULL')
  for (const sql of ESQUEMA) d.executeSync(sql)
  d.executeSync(`PRAGMA user_version = ${VERSION_ESQUEMA}`)

  const eq = d.executeSync(`SELECT valor FROM meta WHERE clave = 'equipo'`).rows[0]?.valor as string | undefined
  equipo = eq ?? `eq-${uuidV4()}`
  if (!eq) d.executeSync(`INSERT INTO meta (clave, valor) VALUES ('equipo', ?)`, [equipo])

  const sMeta = Number(d.executeSync(`SELECT valor FROM meta WHERE clave = 'secuencia'`).rows[0]?.valor ?? 0)
  const sMax = Number(d.executeSync(`SELECT MAX(secuencia) AS m FROM lectura`).rows[0]?.m ?? 0)
  secuencia = Math.max(sMeta, sMax)
  d.executeSync(`INSERT OR IGNORE INTO meta (clave, valor) VALUES ('secuencia', '0')`)

  db = d
  limpiarCodigosGuardados(d)
  return d
}

/**
 * Una sola vez por equipo: los códigos guardados antes de que la app limpiara los
 * caracteres de control (los 8 ESC de la Unitech) se limpian, y se rehace el resumen de
 * esas asignaciones. Si no, el mismo QR reescaneado ya no se reconocería como repetido.
 */
function limpiarCodigosGuardados(d: DB) {
  if (d.executeSync(`SELECT 1 AS x FROM meta WHERE clave = 'limpieza_codigos_v1'`).rows.length) return
  const sucias = d.executeSync(`SELECT uuid, iu, codigo FROM lectura WHERE codigo GLOB '*[^ -~]*'`).rows
    .map(r => ({ uuid: String(r.uuid), iu: Number(r.iu), antes: String(r.codigo), despues: limpiarCodigo(String(r.codigo)) }))
    .filter(r => r.despues !== r.antes)
  for (const r of sucias) d.executeSync(`UPDATE lectura SET codigo = ? WHERE uuid = ?`, [r.despues, r.uuid])
  for (const iu of new Set(sucias.map(r => r.iu))) {
    d.executeSync(`DELETE FROM resumen WHERE iu = ?`, [iu])
    d.executeSync(`INSERT INTO resumen (iu, tipo, codigo, cantidad, ultima_at)
                   SELECT iu, tipo, codigo, SUM(delta), MAX(fecha_equipo) FROM lectura WHERE iu = ? GROUP BY iu, tipo, codigo`, [iu])
  }
  d.executeSync(`INSERT OR REPLACE INTO meta (clave, valor) VALUES ('limpieza_codigos_v1', ?)`, [String(sucias.length)])
}

export const equipoId = () => { base(); return equipo }

/** UUID v4. Hermes no trae crypto.randomUUID; si hay getRandomValues se usa. */
export function uuidV4(): string {
  const b = new Uint8Array(16)
  const c = (globalThis as any).crypto
  if (c?.getRandomValues) c.getRandomValues(b)
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** Hora LOCAL del equipo en ISO sin zona (2026-09-29T10:15:30.123): así la guarda el servidor. */
export function ahoraLocal(): string {
  const d = new Date()
  const p = (n: number, l = 2) => String(n).padStart(l, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`
}

// ── Validación (reglas de la app vieja) ───────────────────────────────────────

/**
 * Quita lo que el lector manda y no es parte del código: saltos de línea, tabuladores y
 * cualquier carácter de control o invisible. La Unitech EA520 antepone 8 ESC (0x1B) al QR,
 * que se ven como cuadritos y rompen el código de producto al cerrar. Los espacios de
 * adentro se conservan: el código de producto de AX los lleva («10 11 33 07 783 0008»).
 */
export const limpiarCodigo = (s: string) =>
  s.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u2060\ufeff]/g, '').trim()

/**
 * Decide el tipo de una lectura. El QR de Denim trae 8 campos separados por coma (una
 * etiqueta por pieza); la barra son 8, 12 o 13 dígitos. NOENCONTRADO = QR dañado: se
 * escanea la barra de la etiqueta en su lugar (solo en líneas que aceptan QR).
 */
export function clasificar(codigo: string, modo: ModoEscaneo, tipoEscaneo: string):
  { tipo: TipoLectura } | { error: string } {
  const aceptaQR = tipoEscaneo.includes('QR')
  const aceptaBarra = tipoEscaneo.includes('Barra')
  if (!codigo) return { error: 'Código vacío' }

  if (codigo.includes(',')) {
    if (modo === 'NOENCONTRADO') return { error: 'En modo «QR dañado» se escanea la barra, no el QR' }
    if (!aceptaQR) return { error: 'Esta línea no lleva QR, escanea la barra' }
    if (modo === 'BARRA') return { error: 'Estás en modo Barra y eso fue un QR. Si la pieza trae QR, cambia a «QR»' }
    if (codigo.split(',').length < 8) return { error: 'QR incompleto (se esperan 8 campos)' }
    return { tipo: 'QR' }
  }

  if (!/^(\d{8}|\d{12}|\d{13})$/.test(codigo)) return { error: 'Código de barras inválido (8, 12 o 13 dígitos)' }
  if (modo === 'NOENCONTRADO') {
    if (!aceptaQR) return { error: 'Esta línea no usa QR' }
    return { tipo: 'NOENCONTRADO' }
  }
  if (modo === 'QR') {
    return { error: aceptaBarra
      ? 'Estás en modo QR y eso fue una barra: apunta al QR. Si la pieza no trae QR, cambia a «Barra»'
      : 'Esta línea es de QR: apunta al QR. Si la etiqueta está dañada, usa «QR dañado»' }
  }
  if (!aceptaBarra) return { error: 'Esta línea es de QR. Si la etiqueta está dañada, usa «QR dañado»' }
  return { tipo: 'BARRA' }
}

// ── Escritura (en serie: una lectura a la vez, en el orden en que llegan) ──────

let cola: Promise<unknown> = Promise.resolve()
const enSerie = <T,>(fn: () => Promise<T>): Promise<T> => {
  const p = cola.then(fn, fn)
  cola = p.catch(() => undefined)
  return p
}

function insertar(iu: number, userCode: string, tipo: TipoLectura, codigo: string, delta: number, esAjuste: boolean) {
  const d = base()
  const lectura: LecturaLocal = {
    uuid: uuidV4(), iu, secuencia: ++secuencia, tipo, codigo, delta,
    es_ajuste: esAjuste ? 1 : 0, fecha_equipo: ahoraLocal(), enviada: 0, rechazo: null,
  }
  return d.executeBatch([
    [`INSERT INTO lectura (uuid, iu, user_code, secuencia, tipo, codigo, delta, es_ajuste, fecha_equipo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [lectura.uuid, iu, userCode, lectura.secuencia, tipo, codigo, delta, lectura.es_ajuste, lectura.fecha_equipo]],
    [`INSERT INTO resumen (iu, tipo, codigo, cantidad, ultima_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (iu, tipo, codigo) DO UPDATE SET cantidad = cantidad + excluded.cantidad, ultima_at = excluded.ultima_at`,
      [iu, tipo, codigo, delta, lectura.fecha_equipo]],
    [`UPDATE meta SET valor = ? WHERE clave = 'secuencia'`, [String(lectura.secuencia)]],
  ]).then(() => lectura)
}

/** Registra una lectura escaneada. Resuelve DESPUÉS del commit en disco. */
export function registrarLectura(iu: number, userCode: string, crudo: string, modo: ModoEscaneo, tipoEscaneo: string,
  opciones?: { otraPiezaDanada?: boolean }): Promise<ResultadoLectura> {
  return enSerie(async () => {
    const codigo = limpiarCodigo(crudo)
    const c = clasificar(codigo, modo, tipoEscaneo)
    if ('error' in c) return { ok: false, motivo: c.error, codigo }
    if (c.tipo === 'NOENCONTRADO' && !opciones?.otraPiezaDanada) {
      const n = Number(base().executeSync(
        `SELECT cantidad FROM resumen WHERE iu = ? AND tipo = 'NOENCONTRADO' AND codigo = ?`, [iu, codigo]).rows[0]?.cantidad ?? 0)
      if (n > 0) {
        return { ok: false, codigo, danadoRepetido: { codigo, contadas: n },
          motivo: `Ya contaste ${n === 1 ? '1 pieza' : `${n} piezas`} de esta talla/color con QR dañado. ¿Es OTRA pieza?` }
      }
    }
    if (c.tipo === 'QR') {
      const ya = base().executeSync(`SELECT cantidad FROM resumen WHERE iu = ? AND tipo = 'QR' AND codigo = ?`, [iu, codigo]).rows[0]
      if (ya && Number(ya.cantidad) > 0) return { ok: false, motivo: 'Esta pieza ya se escaneó (QR repetido)', codigo }
      // ¿Su barra ya se contó suelta? Es la misma pieza contada dos veces: no se cuenta y se ofrece cambiarla.
      const barra = barraDelQR(codigo)
      const n = barra ? barrasContadas(iu, barra) : 0
      if (barra && n > 0) {
        return { ok: false, codigo, conflicto: { qr: codigo, barra, barrasContadas: n },
          motivo: `Esta talla/color ya la contaste por su barra (${n}). ¿Es la misma pieza?` }
      }
    }
    if (c.tipo === 'BARRA' && qrsConEsaBarra(iu, codigo) > 0) {
      return { ok: false, codigo,
        motivo: 'Esta pieza trae QR (ya contaste otras por QR): escanea el QR. Si el QR está dañado, usa «QR dañado»' }
    }
    const lectura = await insertar(iu, userCode, c.tipo, codigo, 1, false)
    return { ok: true, lectura }
  })
}

const barrasContadas = (iu: number, barra: string) => Number(base().executeSync(
  `SELECT cantidad FROM resumen WHERE iu = ? AND tipo = 'BARRA' AND codigo = ?`, [iu, barra]).rows[0]?.cantidad ?? 0)

/** Piezas por QR cuya barra (4.º campo) es ésta. La coma a los dos lados la ubica en ese campo. */
const qrsConEsaBarra = (iu: number, barra: string) => Number(base().executeSync(
  `SELECT COALESCE(SUM(cantidad), 0) AS n FROM resumen
   WHERE iu = ? AND tipo = 'QR' AND cantidad > 0 AND instr(codigo, ',' || ? || ',') > 0`, [iu, barra]).rows[0]?.n ?? 0)

/**
 * «Era la misma pieza»: se quita UNA de las barras sueltas (ajuste −1) y se cuenta el QR.
 * Las dos lecturas quedan en la historia: se ve que se corrigió y quién.
 */
export function cambiarBarraPorQR(iu: number, userCode: string, conflicto: ConflictoQrBarra): Promise<ResultadoLectura> {
  return enSerie(async () => {
    const ya = base().executeSync(`SELECT cantidad FROM resumen WHERE iu = ? AND tipo = 'QR' AND codigo = ?`, [iu, conflicto.qr]).rows[0]
    if (ya && Number(ya.cantidad) > 0) return { ok: false, motivo: 'Esta pieza ya se escaneó (QR repetido)', codigo: conflicto.qr }
    if (barrasContadas(iu, conflicto.barra) > 0) await insertar(iu, userCode, 'BARRA', conflicto.barra, -1, true)
    const lectura = await insertar(iu, userCode, 'QR', conflicto.qr, 1, false)
    return { ok: true, lectura }
  })
}

/**
 * Referencias contadas por los dos lados en esta asignación (barra suelta y QR con esa
 * barra). Se revisa antes de finalizar; lo nuevo ya lo frena registrarLectura.
 */
export function doblesConteos(iu: number): { barra: string; porBarra: number; porQR: number }[] {
  const barras = base().executeSync(
    `SELECT codigo, cantidad FROM resumen WHERE iu = ? AND tipo = 'BARRA' AND cantidad > 0`, [iu]).rows
  return barras
    .map(r => ({ barra: String(r.codigo), porBarra: Number(r.cantidad), porQR: qrsConEsaBarra(iu, String(r.codigo)) }))
    .filter(x => x.porQR > 0)
}

/** Corrige la cantidad de un código: se guarda como una lectura de AJUSTE (queda la historia). */
export function ajustarCantidad(iu: number, userCode: string, tipo: TipoLectura, codigo: string, nueva: number) {
  return enSerie(async () => {
    const actual = Number(base().executeSync(
      `SELECT cantidad FROM resumen WHERE iu = ? AND tipo = ? AND codigo = ?`, [iu, tipo, codigo]).rows[0]?.cantidad ?? 0)
    const delta = Math.max(0, Math.floor(nueva)) - actual
    if (delta === 0) return null
    return insertar(iu, userCode, tipo, codigo, delta, true)
  })
}

// ── Consultas ─────────────────────────────────────────────────────────────────

export function totales(iu: number) {
  const r = base().executeSync(
    `SELECT COUNT(*) AS lecturas, COALESCE(SUM(delta), 0) AS piezas,
            COALESCE(SUM(CASE WHEN enviada = 0 AND rechazo IS NULL THEN 1 ELSE 0 END), 0) AS pendientes,
            COALESCE(SUM(CASE WHEN rechazo IS NOT NULL THEN 1 ELSE 0 END), 0) AS rechazadas
     FROM lectura WHERE iu = ?`, [iu]).rows[0] ?? {}
  const codigos = Number(base().executeSync(`SELECT COUNT(*) AS n FROM resumen WHERE iu = ? AND cantidad <> 0`, [iu]).rows[0]?.n ?? 0)
  return {
    lecturas: Number(r.lecturas ?? 0), piezas: Number(r.piezas ?? 0),
    pendientes: Number(r.pendientes ?? 0), rechazadas: Number(r.rechazadas ?? 0), codigos,
  }
}

export const ultimasLecturas = (iu: number, n = 30) =>
  base().executeSync(`SELECT * FROM lectura WHERE iu = ? ORDER BY secuencia DESC LIMIT ?`, [iu, n]).rows as unknown as LecturaLocal[]

export const resumenCodigos = (iu: number) =>
  base().executeSync(`SELECT tipo, codigo, cantidad, ultima_at FROM resumen WHERE iu = ? AND cantidad <> 0 ORDER BY ultima_at DESC`, [iu])
    .rows as unknown as ResumenCodigo[]

export function pendientesDelUsuario(userCode: string): number {
  return Number(base().executeSync(
    `SELECT COUNT(*) AS n FROM lectura WHERE user_code = ? AND enviada = 0 AND rechazo IS NULL`, [userCode]).rows[0]?.n ?? 0)
}

export function asignacionesLocales(userCode: string): AsignacionLocal[] {
  return base().executeSync(
    `SELECT a.*,
            COALESCE(t.lecturas, 0) AS lecturas, COALESCE(t.piezas, 0) AS piezas, COALESCE(t.pendientes, 0) AS pendientes
     FROM asignacion a
     LEFT JOIN (SELECT iu, COUNT(*) AS lecturas, SUM(delta) AS piezas,
                       SUM(CASE WHEN enviada = 0 AND rechazo IS NULL THEN 1 ELSE 0 END) AS pendientes
                FROM lectura GROUP BY iu) t ON t.iu = a.iu
     WHERE a.user_code = ?
     ORDER BY CASE a.estado WHEN 'ACTIVA' THEN 0 WHEN 'FINALIZADA' THEN 1 ELSE 2 END, a.fecha, a.correlativo`,
    [userCode]).rows as unknown as AsignacionLocal[]
}

export function asignacion(iu: number): AsignacionLocal | undefined {
  return base().executeSync(`SELECT a.*, 0 AS lecturas, 0 AS piezas, 0 AS pendientes FROM asignacion a WHERE iu = ?`, [iu])
    .rows[0] as unknown as AsignacionLocal | undefined
}

/** Guarda lo que dijo el servidor, sin tocar el pedido de finalizar que el equipo tenga en cola. */
export async function guardarAsignaciones(userCode: string, lista: IMiAsignacion[]) {
  if (!lista.length) return
  const ahora = ahoraLocal()
  await base().executeBatch(lista.map(a => [
    `INSERT INTO asignacion (iu, user_code, inventario_id, correlativo, fecha, empresa, cliente_codigo, cliente, sucursal,
                             direccion, linea, tipo_escaneo, estado, puede_escanear, lecturas_servidor, piezas_servidor, actualizado_at,
                             finalizada_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (iu) DO UPDATE SET
       correlativo = excluded.correlativo, fecha = excluded.fecha, empresa = excluded.empresa,
       cliente_codigo = excluded.cliente_codigo, cliente = excluded.cliente, sucursal = excluded.sucursal,
       direccion = excluded.direccion, linea = excluded.linea, tipo_escaneo = excluded.tipo_escaneo,
       estado = excluded.estado, puede_escanear = excluded.puede_escanear,
       lecturas_servidor = excluded.lecturas_servidor, piezas_servidor = excluded.piezas_servidor,
       actualizado_at = excluded.actualizado_at,
       -- Si la oficina la REABRIÓ (vuelve ACTIVA), se olvida la finalización vieja.
       finalizada_at = CASE WHEN excluded.estado = 'ACTIVA' THEN NULL
                            ELSE COALESCE(asignacion.finalizada_at, excluded.finalizada_at) END`,
    [a.InventarioUsuario_Id, userCode, a.Inventario_Id, a.Correlativo, a.Fecha?.slice(0, 10) ?? '', a.Empresa,
     a.ClienteCodigo, a.ClienteNombre, a.SucursalNombre, a.SucursalDireccion ?? '', a.Linea, a.TipoEscaneo,
     a.Estado, a.PuedeEscanear ? 1 : 0, a.LecturasServidor, a.PiezasServidor, ahora,
     a.Estado === 'FINALIZADA' ? (a.FechaFinalizado ?? ahora) : null],
  ] as [string, any[]]))
}

export const idsLocales = (userCode: string): number[] =>
  base().executeSync(`SELECT iu FROM asignacion WHERE user_code = ?`, [userCode]).rows.map(r => Number(r.iu))

export const pedirFinalizar = (iu: number) =>
  base().execute(`UPDATE asignacion SET finalizar_pedido = 1 WHERE iu = ?`, [iu])

// ── Para el motor de envío ────────────────────────────────────────────────────

export const lotePendiente = (iu: number, n: number) =>
  base().executeSync(`SELECT * FROM lectura WHERE iu = ? AND enviada = 0 AND rechazo IS NULL ORDER BY secuencia LIMIT ?`, [iu, n])
    .rows as unknown as LecturaLocal[]

export const asignacionesConPendientes = (userCode: string): number[] =>
  base().executeSync(`SELECT DISTINCT iu FROM lectura WHERE user_code = ? AND enviada = 0 AND rechazo IS NULL`, [userCode])
    .rows.map(r => Number(r.iu))

export async function marcarEnviadas(uuids: string[], rechazadas: { Uuid: string; Motivo: string }[]) {
  const rech = new Map(rechazadas.map(r => [r.Uuid.toLowerCase(), r.Motivo]))
  await base().executeBatch(uuids.map(u => rech.has(u.toLowerCase())
    ? [`UPDATE lectura SET rechazo = ? WHERE uuid = ?`, [rech.get(u.toLowerCase())!, u]]
    : [`UPDATE lectura SET enviada = 1 WHERE uuid = ?`, [u]]) as [string, any[]][])
}

export const actualizarDelServidor = (iu: number, estado: string, lecturas: number, piezas: number) =>
  base().execute(
    `UPDATE asignacion SET estado = ?, lecturas_servidor = ?, piezas_servidor = ?,
            puede_escanear = CASE WHEN ? = 'ACTIVA' THEN 1 ELSE 0 END WHERE iu = ?`,
    [estado, lecturas, piezas, estado, iu])

export const marcarFinalizada = (iu: number) =>
  base().execute(`UPDATE asignacion SET finalizar_pedido = 0, finalizada_at = ?, estado = 'FINALIZADA', puede_escanear = 0 WHERE iu = ?`,
    [ahoraLocal(), iu])

export const finalizacionesPedidas = (userCode: string): number[] =>
  base().executeSync(`SELECT iu FROM asignacion WHERE user_code = ? AND finalizar_pedido = 1`, [userCode]).rows.map(r => Number(r.iu))

/** El servidor dice tener menos de lo que el equipo marcó como enviado: se reenvía todo (no duplica). */
export const reenviarTodo = (iu: number) =>
  base().execute(`UPDATE lectura SET enviada = 0 WHERE iu = ? AND rechazo IS NULL`, [iu])

/** Trae al equipo las lecturas que el servidor ya tiene (recuperar en otro equipo). */
export async function importarDelServidor(iu: number, userCode: string, lecturas: ILecturaServidor[]) {
  if (!lecturas.length) return
  await base().executeBatch(lecturas.map(l => [
    `INSERT OR IGNORE INTO lectura (uuid, iu, user_code, secuencia, tipo, codigo, delta, es_ajuste, fecha_equipo, enviada)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [l.Uuid.toLowerCase(), iu, userCode, l.Secuencia, l.Tipo, l.Codigo, l.Delta, l.EsAjuste ? 1 : 0, l.FechaEquipo],
  ]) as [string, any[]][])
  await base().executeBatch([
    [`DELETE FROM resumen WHERE iu = ?`, [iu]],
    [`INSERT INTO resumen (iu, tipo, codigo, cantidad, ultima_at)
      SELECT iu, tipo, codigo, SUM(delta), MAX(fecha_equipo) FROM lectura WHERE iu = ? GROUP BY iu, tipo, codigo`, [iu]],
  ])
}

/** Limpia lo ya cerrado y enviado de hace más de 7 días. Nunca borra nada pendiente. */
export function limpiarViejas(userCode: string) {
  const d = base()
  const viejas = d.executeSync(
    `SELECT a.iu FROM asignacion a
     WHERE a.user_code = ? AND a.estado IN ('CERRADO', 'DESACTIVADO', 'QUITADA', 'FINALIZADA')
       AND a.actualizado_at < ?
       AND NOT EXISTS (SELECT 1 FROM lectura l WHERE l.iu = a.iu AND l.enviada = 0 AND l.rechazo IS NULL)`,
    [userCode, new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)]).rows.map(r => Number(r.iu))
  for (const iu of viejas) {
    d.executeSync(`DELETE FROM lectura WHERE iu = ?`, [iu])
    d.executeSync(`DELETE FROM resumen WHERE iu = ?`, [iu])
    d.executeSync(`DELETE FROM asignacion WHERE iu = ?`, [iu])
  }
  return viejas.length
}
