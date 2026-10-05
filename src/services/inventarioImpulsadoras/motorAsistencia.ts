import { AppState, AppStateStatus, Platform } from 'react-native'
import NetInfo, { NetInfoState } from '@react-native-community/netinfo'
import DeviceInfo from 'react-native-device-info'
import { HttpError, NetworkError } from '../../api/core/httpClient'
import { asistenciaService as api } from '../../api/modules/inventarioImpulsadoras/asistencia.service'
import {
  comoEnvio, fotosPorEnviar, guardarAgenda, leerAgenda, leerFoto, limpiarViejas, marcarEnviadas, marcarFotoEnviada,
  marcasPorEnviar, pendientes,
} from './asistenciaLocal'
import { ahoraLocal, equipoId } from './baseLocal'

/*
 * Motor de envío de la ASISTENCIA. Igual que el del inventario, es un servicio de la app:
 * sigue aunque la impulsadora cambie de pantalla y arranca solo al abrir la app si quedó algo.
 *
 * - Primero las MARCAS (livianas, en gzip, de a 50, las más viejas primero); después las
 *   FOTOS, una por una. Una marca nunca espera a que suba su foto.
 * - El servidor no duplica por Uuid: reenviar es seguro aunque la respuesta se pierda.
 * - Dispara al volver la señal, al volver la app al frente, al mandarla al fondo, después de
 *   cada marca, cada 45 s mientras haya algo pendiente, y a mano. La señal (NetInfo) solo
 *   DISPARA: nunca se deja de intentar porque diga «sin red».
 * - Si falla espera 5 s, 10 s, 20 s… hasta 2 min (con variación) y reintenta solo.
 * - Con señal, refresca la AGENDA (turnos, tiendas, reglas) para la próxima vez que se abra
 *   sin señal: al arrancar, al volver al frente o la señal, y cada 15 min.
 * - El teléfono NUNCA borra una marca sin enviar.
 */

const LOTE = 50
const CADA_MS = 45_000
const ESPERA_MAX_MS = 120_000
const AGENDA_CADA_MS = 15 * 60_000
const APP_VERSION = `${DeviceInfo.getVersion()} (${DeviceInfo.getBuildNumber()})`

type Motivo = 'timer' | 'reintento' | 'frente' | 'fondo' | 'red' | 'inicio' | 'marca' | 'manual'

export interface EstadoAsistencia {
  enviando: boolean
  marcasPendientes: number
  fotosPendientes: number
  ultimoEnvioOk: number | null
  ultimoError: string | null
  reintentoEn: number | null
  sinRed: boolean
  /** Cuándo se bajó la agenda por última vez (ms). */
  agendaAt: number | null
  /** Sube cada vez que cambia algo local (marca enviada, agenda nueva): la pantalla se repinta. */
  version: number
}

type Oyente = (e: EstadoAsistencia) => void
const hayRed = (s: NetInfoState) => s.isConnected === true && s.isInternetReachable !== false

class MotorAsistencia {
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
  private oyentes = new Set<Oyente>()
  private estado: EstadoAsistencia = {
    enviando: false, marcasPendientes: 0, fotosPendientes: 0, ultimoEnvioOk: null, ultimoError: null,
    reintentoEn: null, sinRed: false, agendaAt: null, version: 0,
  }

  iniciar(userCode: string) {
    if (this.userCode === userCode && this.timer) return
    this.detener()
    this.userCode = userCode
    const guardada = leerAgenda(userCode)
    this.timer = setInterval(() => { void this.disparar('timer') }, CADA_MS)
    this.appState = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') void this.disparar('frente')
      else if (s === 'background') void this.disparar('fondo')
    })
    this.red = NetInfo.addEventListener(s => {
      const ahora = hayRed(s)
      const volvio = ahora && this.conRed === false
      this.conRed = ahora
      this.publicar({ sinRed: !ahora })
      if (volvio) void this.disparar('red')
    })
    this.publicar({ ...this.contar(userCode), agendaAt: guardada ? new Date(guardada.bajadaAt).getTime() : null })
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
  }

  suscribir(fn: Oyente) {
    this.oyentes.add(fn)
    fn(this.estado)
    return () => { this.oyentes.delete(fn) }
  }

  estadoActual() { return this.estado }

  /** La pantalla guardó una marca: se cuenta y se intenta subir ya. */
  avisarMarca() {
    if (!this.userCode) return
    this.publicar({ ...this.contar(this.userCode), version: this.estado.version + 1 })
    void this.disparar('marca')
  }

  disparar(motivo: Motivo): Promise<void> {
    if (!this.userCode) return Promise.resolve()
    const urgente = motivo === 'manual' || motivo === 'red' || motivo === 'marca'
    if (this.enCurso) {
      if (urgente) this.repetir = true
      return this.enCurso
    }
    // Sin nada pendiente y con la agenda fresca, el timer no hace nada.
    const p = this.contar(this.userCode)
    const agendaVieja = !this.estado.agendaAt || Date.now() - this.estado.agendaAt > AGENDA_CADA_MS
    if (motivo === 'timer' && p.marcasPendientes + p.fotosPendientes === 0 && !agendaVieja) return Promise.resolve()
    if (!urgente && Date.now() < this.esperarHasta) return Promise.resolve()
    const user = this.userCode
    const conAgenda = motivo === 'inicio' || motivo === 'frente' || motivo === 'red' || motivo === 'manual' || agendaVieja
    this.enCurso = this.ciclo(user, conAgenda).finally(() => {
      this.enCurso = null
      if (this.repetir && this.userCode === user) {
        this.repetir = false
        this.esperarHasta = 0
        void this.disparar('manual')
      }
    })
    return this.enCurso
  }

  private contar(user: string) {
    const p = pendientes(user)
    return { marcasPendientes: p.marcas, fotosPendientes: p.fotos }
  }

  private publicar(parcial: Partial<EstadoAsistencia>) {
    this.estado = { ...this.estado, ...parcial }
    this.oyentes.forEach(fn => { try { fn(this.estado) } catch { /* pantalla desmontada */ } })
  }

  private async ciclo(user: string, conAgenda: boolean) {
    if (this.reintento) clearTimeout(this.reintento)
    this.reintento = null
    const p = this.contar(user)
    if (p.marcasPendientes + p.fotosPendientes > 0) this.publicar({ enviando: true })
    try {
      // 1) Marcas
      const yaEnviadas = new Set<string>()
      for (;;) {
        const lote = marcasPorEnviar(user, LOTE)
        // Si el servidor no confirmó un lote, no se reenvía en bucle en este ciclo: va en el próximo.
        if (!lote.length || lote.every(m => yaEnviadas.has(m.uuid))) break
        lote.forEach(m => yaEnviadas.add(m.uuid))
        const r = await api.enviarMarcas({
          Equipo: equipoId(), AppVersion: APP_VERSION, Plataforma: Platform.OS, FechaHoraEnvio: ahoraLocal().slice(0, 19),
          Marcas: lote.map(comoEnvio),
        })
        await marcarEnviadas(r.Data ?? [])
        this.fallos = 0
        this.publicar({ ...this.contar(user), ultimoEnvioOk: Date.now(), version: this.estado.version + 1 })
      }
      // 2) Fotos (una por una: pesan)
      for (const { uuid } of fotosPorEnviar(user)) {
        const b64 = leerFoto(uuid)
        if (!b64) continue
        try {
          const f = (await api.enviarFoto(uuid, b64)).Data
          await marcarFotoEnviada(uuid, f?.Estado ?? null, f?.Motivos ?? null)
        } catch (e) {
          // 404 = la marca todavía no está en el servidor (no debería pasar: va después); se reintenta luego.
          if (e instanceof HttpError && e.status === 404) continue
          throw e
        }
        this.publicar({ ...this.contar(user), ultimoEnvioOk: Date.now(), version: this.estado.version + 1 })
      }
      // 3) Agenda para la próxima vez sin señal
      if (conAgenda) {
        const a = (await api.agenda()).Data
        if (a) {
          await guardarAgenda(user, a)
          this.publicar({ agendaAt: Date.now(), version: this.estado.version + 1 })
        }
        limpiarViejas(user)
      }
      this.fallos = 0
      this.esperarHasta = 0
      this.publicar({ enviando: false, ultimoError: null, reintentoEn: null, ...this.contar(user) })
    } catch (e: any) {
      this.fallos++
      const espera = Math.min(ESPERA_MAX_MS, 5000 * 2 ** (this.fallos - 1)) * (0.7 + Math.random() * 0.6)
      this.esperarHasta = Date.now() + espera
      const quedan = this.contar(user)
      // Si no hay nada que subir y solo falló la agenda, no hace falta reintentar pronto.
      if (this.userCode === user && quedan.marcasPendientes + quedan.fotosPendientes > 0)
        this.reintento = setTimeout(() => { void this.disparar('reintento') }, espera + 50)
      this.publicar({ enviando: false, ultimoError: describirError(e), reintentoEn: this.esperarHasta, ...quedan })
    }
  }
}

function describirError(e: any): string {
  if (e instanceof NetworkError) return 'La señal no alcanzó'
  if (!(e instanceof HttpError)) return 'Sin conexión con el servidor'
  if (e.status === 401) return 'Sesión vencida: vuelve a iniciar sesión (tus marcas siguen en el teléfono)'
  if (e.status >= 500) return `El servidor tuvo un problema (${e.status}); se reintenta solo`
  return `El servidor respondió ${e.status}`
}

export const motorAsistencia = new MotorAsistencia()
