import { AppState, AppStateStatus, Platform } from 'react-native'
import NetInfo, { NetInfoState } from '@react-native-community/netinfo'
import DeviceInfo from 'react-native-device-info'
import { HttpError, NetworkError } from '../../api/core/httpClient'
import { inventarioImpulsadorasService as api } from '../../api/modules/inventarioImpulsadoras/inventarioImpulsadoras.service'
import {
  actualizarDelServidor, asignacionesConPendientes, asignacionesLocales, equipoId, finalizacionesPedidas, lotePendiente,
  marcarEnviadas, marcarFinalizada, pendientesDelUsuario, reenviarTodo, totales,
} from './baseLocal'

/*
 * Motor de envío del inventario de impulsadoras. Es un servicio de la app, no de una
 * pantalla: sigue enviando aunque la impulsadora cambie de pantalla, y arranca solo al
 * abrir la app si quedó algo pendiente.
 *
 * - Lotes en orden y en gzip. El servidor no duplica por Uuid: reenviar siempre es seguro,
 *   aunque la respuesta se pierda o la app muera a medio lote.
 * - Lote adaptativo: 300 lecturas; si un lote no alcanza a llegar (timeout = señal débil)
 *   baja a 100, 50 y 20, y vuelve a subir después de 5 lotes buenos seguidos.
 * - Dispara cada 30 s, al volver la señal, al volver la app al frente, al mandarla al
 *   fondo, a las 25 lecturas nuevas y a mano. La señal (NetInfo) solo DISPARA: nunca se
 *   deja de intentar porque diga «sin red». Si falla espera 5 s, 10 s, 20 s… hasta 2 min,
 *   con variación para que 40 PDA no reintenten al mismo tiempo, y reintenta justo al
 *   cumplirse la espera. Un lote que llega reinicia la cuenta: hubo señal.
 * - El equipo NUNCA descarta una lectura por su cuenta: solo el servidor la puede rechazar,
 *   una por una y con motivo.
 * - La pantalla solo deja finalizar con TODO enviado. Si en ese momento se va la señal, el
 *   pedido de finalizar queda en cola y sale solo; nunca sale con lecturas pendientes.
 * - Latido: con la app al frente, cada 2 min manda un lote VACÍO por cada inventario activo
 *   con algo escaneado. Así el web distingue «al día» de «sin contacto» (si no, un equipo sin
 *   nada pendiente y uno sin señal se ven igual) y el equipo se entera si la oficina lo cerró.
 *   Un latido que no llega no es un error ni frena nada.
 */

const TAMANOS_LOTE = [300, 100, 50, 20]
const EXITOS_PARA_SUBIR = 5
const CADA_MS = 30_000
const ESPERA_MAX_MS = 120_000
const LECTURAS_PARA_DISPARAR = 25
const LATIDO_MS = 120_000
const APP_VERSION = `${DeviceInfo.getVersion()} (${DeviceInfo.getBuildNumber()})`

type Motivo = 'timer' | 'reintento' | 'frente' | 'fondo' | 'red' | 'inicio' | 'lecturas' | 'manual'

export interface EstadoMotor {
  enviando: boolean
  pendientes: number
  ultimoEnvioOk: number | null
  ultimoError: string | null
  reintentoEn: number | null
  /** Cuándo empezó el último intento (bueno o malo): la franja lo muestra para que un toque se note. */
  ultimoIntento: number | null
  /** NetInfo dice que no hay red (solo informativo: se sigue intentando). */
  sinRed: boolean
  tamanoLote: number
  /** Avance del envío en curso: `total` crece si se escanea mientras se envía. */
  progreso: { enviadas: number; total: number } | null
}

type Oyente = (e: EstadoMotor) => void

const hayRed = (s: NetInfoState) => s.isConnected === true && s.isInternetReachable !== false

class MotorEnvio {
  private userCode: string | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private reintento: ReturnType<typeof setTimeout> | null = null
  private appState: { remove: () => void } | null = null
  private red: (() => void) | null = null
  private conRed: boolean | null = null
  private enCurso: Promise<void> | null = null
  private repetir = false
  private fallos = 0
  private esperarHasta = 0
  private nuevasDesdeEnvio = 0
  private nivelLote = 0
  private lotesBuenos = 0
  private oyentes = new Set<Oyente>()
  private estado: EstadoMotor = {
    enviando: false, pendientes: 0, ultimoEnvioOk: null, ultimoError: null, reintentoEn: null,
    ultimoIntento: null, sinRed: false, tamanoLote: TAMANOS_LOTE[0], progreso: null,
  }
  private ultimoLatido = new Map<number, number>()

  iniciar(userCode: string) {
    if (this.userCode === userCode && this.timer) return
    this.detener()
    this.userCode = userCode
    this.timer = setInterval(() => { void this.disparar('timer') }, CADA_MS)
    this.appState = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') void this.disparar('frente')
      // Al mandarla al fondo: último intento mientras el sistema todavía la deja correr.
      else if (s === 'background') void this.disparar('fondo')
    })
    this.red = NetInfo.addEventListener(s => {
      const ahora = hayRed(s)
      const volvio = ahora && this.conRed === false
      this.conRed = ahora
      this.publicar({ sinRed: !ahora })
      if (volvio) void this.disparar('red')
    })
    this.publicar({ pendientes: pendientesDelUsuario(userCode) })
    void this.disparar('inicio')
  }

  detener() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    if (this.reintento) clearTimeout(this.reintento)
    this.reintento = null
    this.appState?.remove()
    this.appState = null
    this.red?.()
    this.red = null
    this.conRed = null
    this.userCode = null
    this.ultimoLatido.clear()
  }

  suscribir(fn: Oyente) {
    this.oyentes.add(fn)
    fn(this.estado)
    return () => { this.oyentes.delete(fn) }
  }

  estadoActual(): EstadoMotor { return this.estado }

  /** Lo llama la pantalla después de cada lectura guardada. */
  avisarLectura() {
    if (!this.userCode) return
    this.nuevasDesdeEnvio++
    const p = this.estado.progreso
    this.publicar({ pendientes: this.estado.pendientes + 1, progreso: p && { ...p, total: p.total + 1 } })
    if (this.nuevasDesdeEnvio >= LECTURAS_PARA_DISPARAR) void this.disparar('lecturas')
  }

  /**
   * manual / red = hay una razón concreta para creer que ahora sí pasa: se salta la
   * espera por fallos anteriores. Si ya hay un envío en curso, se repite al terminar
   * (un «volvió la señal» a media espera de un lote que se iba a caer no se pierde).
   */
  disparar(motivo: Motivo): Promise<void> {
    if (!this.userCode) return Promise.resolve()
    const urgente = motivo === 'manual' || motivo === 'red'
    if (this.enCurso) {
      // Las lecturas nuevas no hace falta repetirlas: el ciclo en curso vuelve a leer la base en cada lote.
      if (urgente) this.repetir = true
      return this.enCurso
    }
    if (!urgente && Date.now() < this.esperarHasta) return Promise.resolve()
    const user = this.userCode
    this.enCurso = this.ciclo(user).finally(() => {
      this.enCurso = null
      if (this.repetir && this.userCode === user) {
        this.repetir = false
        this.esperarHasta = 0
        void this.disparar('manual')
      }
    })
    return this.enCurso
  }

  private publicar(parcial: Partial<EstadoMotor>) {
    this.estado = { ...this.estado, ...parcial }
    this.oyentes.forEach(fn => { try { fn(this.estado) } catch { /* una pantalla desmontada no frena el envío */ } })
  }

  private get tamanoLote() { return TAMANOS_LOTE[this.nivelLote] }

  private loteBueno() {
    if (this.nivelLote === 0) return
    if (++this.lotesBuenos >= EXITOS_PARA_SUBIR) {
      this.nivelLote--
      this.lotesBuenos = 0
      this.publicar({ tamanoLote: this.tamanoLote })
    }
  }

  private loteQueNoLlego() {
    this.lotesBuenos = 0
    if (this.nivelLote < TAMANOS_LOTE.length - 1) {
      this.nivelLote++
      this.publicar({ tamanoLote: this.tamanoLote })
    }
  }

  private async ciclo(user: string) {
    const equipo = equipoId()
    if (this.reintento) clearTimeout(this.reintento)
    this.reintento = null
    // Solo se «enciende» la franja si hay algo que mandar: el ciclo corre cada 30 s y el latido no se anuncia.
    const porEnviar = pendientesDelUsuario(user)
    const hayQueEnviar = porEnviar > 0 || finalizacionesPedidas(user).length > 0
    let enviadas = 0
    const recienEnviadas = new Set<number>()
    if (hayQueEnviar) {
      this.publicar({
        enviando: true, ultimoIntento: Date.now(),
        progreso: porEnviar > 0 ? { enviadas: 0, total: porEnviar } : null,
      })
    }
    try {
      for (const iu of asignacionesConPendientes(user)) {
        for (;;) {
          const lote = lotePendiente(iu, this.tamanoLote)
          if (!lote.length) break
          const t = totales(iu)
          let res
          try {
            res = await api.enviarLote({
              InventarioUsuario_Id: iu, Equipo: equipo, AppVersion: APP_VERSION, Plataforma: Platform.OS,
              LecturasEquipo: t.lecturas, PiezasEquipo: t.piezas,
              // Lo que le quedará sin enviar DESPUÉS de este lote (el web lo muestra como «sin enviar»).
              PendientesEquipo: Math.max(0, t.pendientes - lote.length),
              Lecturas: lote.map(l => ({
                Uuid: l.uuid, Secuencia: l.secuencia, Tipo: l.tipo, Codigo: l.codigo, Delta: l.delta,
                EsAjuste: !!l.es_ajuste, FechaEquipo: l.fecha_equipo,
              })),
            })
          } catch (e) {
            // 403/404 = esa asignación ya no es de este usuario o no existe: no se reintenta
            // en bucle, pero las lecturas NO se borran; se sigue con las demás asignaciones.
            if (e instanceof HttpError && (e.status === 403 || e.status === 404)) break
            // Timeout o lote demasiado grande: el próximo intento va con un lote más chico.
            if (e instanceof NetworkError || (e instanceof HttpError && e.status === 413)) this.loteQueNoLlego()
            throw e
          }
          const d = res.Data
          await marcarEnviadas(lote.map(l => l.uuid), d.RechazadasDetalle ?? [])
          await actualizarDelServidor(iu, d.Estado, d.LecturasServidor, d.PiezasServidor)
          this.fallos = 0
          this.loteBueno()
          enviadas += lote.length
          recienEnviadas.add(iu)
          const quedan = pendientesDelUsuario(user)
          this.publicar({ pendientes: quedan, ultimoEnvioOk: Date.now(), progreso: { enviadas, total: enviadas + quedan } })
        }
      }

      for (const iu of finalizacionesPedidas(user)) {
        const t = totales(iu)
        if (t.pendientes > 0) continue
        const r = (await api.finalizar({
          InventarioUsuario_Id: iu, Equipo: equipo,
          LecturasDeclaradas: t.lecturas - t.rechazadas, PiezasDeclaradas: t.piezas,
        })).Data
        if (r.Finalizada) await marcarFinalizada(iu)
        else if (r.Estado === 'ACTIVA' && r.Faltan > 0) await reenviarTodo(iu)   // al servidor le falta algo: se reenvía todo
        else await actualizarDelServidor(iu, r.Estado, r.LecturasServidor, r.PiezasServidor)
      }

      this.fallos = 0
      this.esperarHasta = 0
      this.nuevasDesdeEnvio = 0
      this.publicar({
        enviando: false, ultimoError: null, reintentoEn: null, pendientes: pendientesDelUsuario(user), progreso: null,
        ultimoEnvioOk: Date.now(),
      })
      await this.latidos(user, equipo, recienEnviadas)
    } catch (e: any) {
      this.fallos++
      const espera = Math.min(ESPERA_MAX_MS, 5000 * 2 ** (this.fallos - 1)) * (0.7 + Math.random() * 0.6)
      this.esperarHasta = Date.now() + espera
      if (this.userCode === user) this.reintento = setTimeout(() => { void this.disparar('reintento') }, espera + 50)
      this.publicar({
        enviando: false,
        ultimoError: describirError(e),
        reintentoEn: this.esperarHasta,
        pendientes: pendientesDelUsuario(user),
        progreso: null,
      })
    }
  }

  /** Lote vacío = «sigo aquí, con N guardadas»: el web lo muestra como último contacto. */
  private async latidos(user: string, equipo: string, recienEnviadas: Set<number>) {
    if (AppState.currentState !== 'active') return
    const ahora = Date.now()
    for (const a of asignacionesLocales(user)) {
      if (a.estado !== 'ACTIVA' || a.lecturas === 0) continue
      if (recienEnviadas.has(a.iu)) { this.ultimoLatido.set(a.iu, ahora); continue }
      if (ahora - (this.ultimoLatido.get(a.iu) ?? 0) < LATIDO_MS) continue
      this.ultimoLatido.set(a.iu, ahora)
      const t = totales(a.iu)
      try {
        const d = (await api.enviarLote({
          InventarioUsuario_Id: a.iu, Equipo: equipo, AppVersion: APP_VERSION, Plataforma: Platform.OS,
          LecturasEquipo: t.lecturas, PiezasEquipo: t.piezas, PendientesEquipo: t.pendientes, Lecturas: [],
        })).Data
        await actualizarDelServidor(a.iu, d.Estado, d.LecturasServidor, d.PiezasServidor)
      } catch (e) {
        // Ya no es suya o no existe: no se insiste en esta sesión. Cualquier otro fallo se ignora.
        if (e instanceof HttpError && (e.status === 403 || e.status === 404)) this.ultimoLatido.set(a.iu, Infinity)
      }
    }
  }
}

function describirError(e: any): string {
  if (e instanceof NetworkError) return 'La señal no alcanzó: se reintenta con lotes más chicos'
  if (!(e instanceof HttpError)) return 'Sin conexión con el servidor'
  if (e.status === 401) return 'Sesión vencida: vuelve a iniciar sesión (lo escaneado sigue en el equipo)'
  if (e.status >= 500) return `El servidor tuvo un problema (${e.status}); se reintenta solo`
  return `El servidor respondió ${e.status}`
}

export const motorEnvio = new MotorEnvio()
