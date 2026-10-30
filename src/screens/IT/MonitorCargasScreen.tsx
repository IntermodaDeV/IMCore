import React, { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshControl, ScrollView } from 'react-native'
import { Spinner, Text, View, XStack, YStack } from 'tamagui'
import {
  Activity, AlertTriangle, CalendarClock, CheckCircle2, CircleDashed, CircleX, Clock, CloudUpload, Database, Gauge,
  ChevronDown, ChevronUp, History, Layers, Play, RefreshCw, Server, ServerCrash, Store, Timer,
} from 'lucide-react-native'
import { useFocusEffect } from '@react-navigation/native'

import { usePageHeader } from '../../hooks/usePageHeader'
import { useAuth } from '../../context/AuthContext'
import { useShowToast } from '../../utils/useShowToast'
import ConfirmDialog from '../../components/commons/ConfirmDialog'
import { HttpError } from '../../api/core/httpClient'
import { monitorCargasService as svc } from '../../api/modules/monitorCargas/monitorCargas.service'
import {
  CapaAnalitica, EstadoCorrida, EstadoFuente, IAdvertenciaMonitor, ICapaMonitor, IConexionEstado, IFuenteMonitor,
  IMedicionMonitor, IPasoMonitor, IProcesoMonitor,
} from '../../api/modules/monitorCargas/monitorCargas.types'
import { shadows } from '../../theme/shadows'

/* ============================================================================
   MONITOR DE CARGAS en el teléfono — el resumen, nada más.

   Si nuestras cargas corrieron, si las fuentes llegaron a su ritmo y si se
   publicó a IMCore; si cada servidor responde; el % de cada fuente y de cada
   capa de IMAnalitica, las advertencias vigentes y cada proceso. Es la misma
   opción de menú del web ('itMonitorCargas') y los mismos endpoints. Como en el
   web, «Ejecutar ahora» (con el acceso 'MonitorCargasEjecutar') y los pasos de
   la corrida en vivo; reintentar, corridas, gráficas y conexiones quedan en el
   web. La lógica del semáforo y de los % es la del web
   (IMCoreWeb/src/pages/it/monitorCargasUi.ts): si cambia allá, cambia aquí.

   Se pone al día sola mientras está abierta: cada 60 s; cada 10 s si algo
   corre; cada 2.5 s si se está siguiendo una corrida (por datos móviles, más
   espaciado que el web).
   ============================================================================ */

const ACCENT = '#FF551A'
const VERDE = '#16a34a'
const NARANJA = '#ea580c'
const ROJO = '#dc2626'
const AZUL = '#2a78d6'
const GRIS = '#94A3B8'
const RAPIDO = 10_000
const NORMAL = 60_000
/** Mientras se sigue una corrida abierta: la pantalla y sus pasos se piden más seguido. */
const EN_VIVO = 2_500
const ACCESO_EJECUTAR = 'MonitorCargasEjecutar'
const tieneAcceso = (access: string | null | undefined, key: string) =>
  (access ?? '').split(',').map(x => x.trim()).includes(key)

type Nivel = 'ok' | 'aviso' | 'error' | 'info'
const COLOR_NIVEL: Record<Nivel, string> = { ok: VERDE, aviso: NARANJA, error: ROJO, info: GRIS }

type Icono = typeof Activity
const ICONO_NIVEL: Record<Nivel, Icono> = { ok: CheckCircle2, aviso: AlertTriangle, error: CircleX, info: CircleDashed }
/** El color con transparencia (#rrggbbaa), para fondos y bordes suaves que sirven en tema claro y oscuro. */
const tinte = (hex: string, alfa: number) => `${hex}${Math.round(alfa * 255).toString(16).padStart(2, '0')}`
const peor = (a: Nivel, b: Nivel): Nivel => {
  const orden: Nivel[] = ['error', 'aviso', 'ok', 'info']
  return orden[Math.min(orden.indexOf(a), orden.indexOf(b))]
}

const ESTADO_CORRIDA: Record<EstadoCorrida, { color: string; label: string; icono: Icono }> = {
  Corriendo: { color: AZUL, label: 'Corriendo', icono: RefreshCw },
  OK: { color: VERDE, label: 'OK', icono: CheckCircle2 },
  Advertencia: { color: NARANJA, label: 'Con hallazgos', icono: AlertTriangle },
  Error: { color: ROJO, label: 'Error', icono: CircleX },
  Cancelada: { color: GRIS, label: 'Cortada', icono: CircleDashed },
}

/** Los servidores, con el nombre de las fichas del web (CONEXIONES en monitorCargasUi.ts). */
const SERVIDORES: Record<string, string> = {
  'CUBO-INTERMODA': 'CUBO-INTERMODA · IMAnalitica',
  'GIM-PRO3-DBO': 'AX en vivo',
  IMREPSVCPRO: 'MDS',
  'CRM-DBS': 'CRM · IMCore_Pro y AVentas',
}

/** Las fuentes que vigila hoy la vigilancia, en el orden del flujo. CRONO es solo referencia (D-15). */
const FUENTES_PRINCIPALES = [
  { sistema: 'Replica de AX', titulo: 'Réplica de AX', icono: Database },
  { sistema: 'IMClientesIV', titulo: 'IMClientesIV', icono: Store },
  { sistema: 'CRONO', titulo: 'CRONO', icono: History },
] as const

const CAPAS: { capa: CapaAnalitica; nombre: string; cuando: string }[] = [
  { capa: 'carga', nombre: 'carga · monitor', cuando: 'paso 1' },
  { capa: 'stg', nombre: 'stg · solo lo que cambió', cuando: 'pasos 2 a 5' },
  { capa: 'core', nombre: 'core · detalle limpio', cuando: 'pasos 2 a 5' },
  { capa: 'mart', nombre: 'mart · resúmenes', cuando: 'paso 6' },
  { capa: 'publicacion', nombre: 'publicación a IMCore', cuando: 'paso 6' },
]

/* ── La misma lógica del web ─────────────────────────────────────────────── */

const FUENTE_CON_PROBLEMA: (EstadoFuente | null)[] = ['Atrasada', 'SinDatos', 'Error', 'SinRitmo']
const conProblema = (f: IFuenteMonitor) => FUENTE_CON_PROBLEMA.includes(f.Estado) || f.Estructura === 'Error'

function nivelDe(estados: (EstadoFuente | null)[], estructuras: (string | null)[] = []): Nivel {
  if (estados.length === 0) return 'info'
  if (estados.some(e => e === 'Error' || e === 'SinDatos') || estructuras.includes('Error')) return 'error'
  if (estados.some(e => e === 'Atrasada' || e === 'SinRitmo')) return 'aviso'
  return 'ok'
}

/** Sin las cuentas excluidas y, en CRONO, sin su bitácora (se cuentan sus tablas). */
const partesDe = (sistema: string, fuentes: IFuenteMonitor[]) =>
  fuentes.filter(f => f.Sistema === sistema && f.Estado !== 'Excluida' && f.Fuente !== 'CRONO.audit.Logs')

function porcentaje(partes: IFuenteMonitor[]): number | null {
  if (partes.length === 0) return null
  return Math.round((partes.filter(f => !conProblema(f)).length / partes.length) * 100)
}

const colorPorcentaje = (pct: number | null, nivel?: Nivel) =>
  pct == null || nivel === 'info' ? GRIS : nivel === 'error' ? ROJO : pct >= 100 ? VERDE : NARANJA

/** Nombre legible de una parte vigilada (igual que nombreParte del web). */
const nombreParte = (f: IFuenteMonitor) =>
  f.Sistema === 'Replica de AX' ? (f.Clave === 'IX_IMA' ? 'Índices de la réplica' : 'Atraso de la réplica') : f.Nombre ?? f.Fuente

const colorCapa = (c?: ICapaMonitor) =>
  !c || c.Estado === 'PorConstruir' ? GRIS : c.Estado === 'Error' ? ROJO : c.Estado === 'AlDia' ? VERDE : NARANJA

const corriendo = (p: IProcesoMonitor[]) => p.some(x => x.Estado === 'Corriendo')
/** Debía correr hace más de 2 minutos y no corrió: casi siempre, el orquestador apagado. */
const atrasado = (p: IProcesoMonitor, ahora: number) =>
  p.Estado !== 'Corriendo' && p.ProximaCorrida != null && ahora - new Date(p.ProximaCorrida).getTime() > 120_000

const entero = (n?: number | null) => (n == null ? '—' : Math.round(n).toLocaleString('es-HN'))

function hace(s?: string | null, ahora = Date.now()): string {
  if (!s) return '—'
  const min = Math.round((ahora - new Date(s).getTime()) / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`
}

function enCuanto(s?: string | null, ahora = Date.now()): string {
  if (!s) return '—'
  const min = Math.round((new Date(s).getTime() - ahora) / 60000)
  if (min <= 0) return 'ya'
  if (min < 60) return `en ${min} min`
  return new Date(s).toLocaleString('es-HN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function duracion(seg?: number | null): string {
  if (seg == null) return '—'
  if (seg < 1) return '< 1 s'
  if (seg < 60) return `${seg} s`
  const m = Math.floor(seg / 60)
  return m < 60 ? `${m} min ${seg % 60} s` : `${Math.floor(m / 60)} h ${m % 60} min`
}

const hora = (ms: number) => new Date(ms).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' })
const plural = (n: number, uno: string, varios: string) => `${entero(n)} ${n === 1 ? uno : varios}`
const nombreSistema = (s: string | null) => (s === 'Replica de AX' ? 'Réplica de AX' : s ?? '—')

/** Un 404 es una API sin este módulo, no «sin datos». */
const mensajeError = (e: any) =>
  e instanceof HttpError && e.status === 404
    ? 'La API publicada todavía no tiene el Monitor de cargas.'
    : e?.message || 'No se pudo cargar el monitor.'

interface Datos {
  procesos: IProcesoMonitor[]
  fuentes: IFuenteMonitor[]
  mediciones: IMedicionMonitor[]
  capas: ICapaMonitor[]
  advertencias: IAdvertenciaMonitor[]
  conexiones: IConexionEstado[]
}

export default function MonitorCargasScreen() {
  usePageHeader({
    center: <Text fontSize="$4" fontWeight="700" color="$text">Monitor de cargas</Text>,
  })

  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [actualizado, setActualizado] = useState(0)
  const [enFoco, setEnFoco] = useState(false)
  const pedido = useRef(0)
  const { user } = useAuth()
  const { showToast } = useShowToast()
  const puedeEjecutar = tieneAcceso(user?.Access, ACCESO_EJECUTAR)
  /** El proceso con sus pasos abiertos (uno a la vez); al ejecutar se abre solo. */
  const [abierto, setAbierto] = useState<string | null>(null)
  const [confirmar, setConfirmar] = useState<IProcesoMonitor | null>(null)
  const [ejecutando, setEjecutando] = useState(false)
  /** Pasos de la corrida anterior de cada proceso: con eso se estima el avance de la nueva. */
  const [esperados, setEsperados] = useState<Record<string, number>>({})

  const cargar = useCallback(async () => {
    const n = ++pedido.current
    try {
      const [p, f, m, c, a, x] = await Promise.all([
        svc.procesos(), svc.fuentes(), svc.mediciones(1), svc.capas(), svc.advertencias(7), svc.conexionEstado(),
      ])
      if (n !== pedido.current) return
      const mal = [p, f, m, c, a, x].find(r => !r.Success)
      if (mal) {
        setError(mal.ErrorMessage || 'No se pudo cargar el monitor.')
        return
      }
      setDatos({ procesos: p.Data, fuentes: f.Data, mediciones: m.Data, capas: c.Data, advertencias: a.Data, conexiones: x.Data })
      setError(null)
      setActualizado(Date.now())
    } catch (e: any) {
      if (n === pedido.current) setError(mensajeError(e))
    } finally {
      if (n === pedido.current) {
        setCargando(false)
        setRefrescando(false)
      }
    }
  }, [])

  useFocusEffect(useCallback(() => {
    setEnFoco(true)
    cargar()
    return () => setEnFoco(false)
  }, [cargar]))

  // Al día sola mientras está en pantalla; más seguido si algo corre.
  const hayCorriendo = corriendo(datos?.procesos ?? [])
  const siguiendo = !!abierto && (datos?.procesos ?? []).some(p => p.Codigo === abierto && p.Estado === 'Corriendo')
  useEffect(() => {
    if (!enFoco) return
    const t = setInterval(cargar, siguiendo ? EN_VIVO : hayCorriendo ? RAPIDO : NORMAL)
    return () => clearInterval(t)
  }, [enFoco, hayCorriendo, siguiendo, cargar])

  const ejecutar = async (p: IProcesoMonitor) => {
    setEjecutando(true)
    try {
      // Cuántos pasos tuvo la corrida anterior: la barra de avance de la nueva se mide contra eso.
      if (p.CorridaId) {
        const prev = await svc.pasos(p.CorridaId).catch(() => null)
        if (prev?.Success && prev.Data.length) setEsperados(e => ({ ...e, [p.Codigo]: prev.Data.length }))
      }
      const r = await svc.ejecutar(p.Codigo)
      if (!r.Success) showToast('error', 'No se pudo ejecutar', r.ErrorMessage || 'Intentá de nuevo')
      else if (!r.Data.Aceptado) showToast('warning', 'No se ejecutó', r.Data.Mensaje)
      else {
        showToast('success', p.Nombre, 'Corriendo en el servidor; el avance se ve aquí.')
        setAbierto(p.Codigo)
      }
    } catch (e: any) {
      showToast('error', 'No se pudo ejecutar', mensajeError(e))
    } finally {
      setEjecutando(false)
      setConfirmar(null)
      cargar()
    }
  }

  const ahora = actualizado || Date.now()
  const procesos = datos?.procesos ?? []
  const fuentes = datos?.fuentes ?? []

  // ── Semáforo: las mismas tres preguntas del web ─────────────────────────
  const vigilancia = procesos.find(p => p.Codigo === 'VIGILANCIA')
  const conError = procesos.filter(p => p.Estado === 'Error' || p.Estado === 'Cancelada')
  const sinCorrer = procesos.filter(p => atrasado(p, ahora))
  const nivelCargas: Nivel = !datos ? 'info' : conError.length ? 'error' : sinCorrer.length ? 'aviso' : 'ok'
  const vigiladas = fuentes.filter(f => f.Estado !== 'Excluida')
  const fuentesMal = vigiladas.filter(conProblema)
  // Un servidor que no responde es un problema de fuente, no de nuestras cargas: va en este semáforo, en rojo.
  const sinConexion = (datos?.conexiones ?? []).filter(c => c.Estado === 'Error')
  const nivelFuentes: Nivel = sinConexion.length ? 'error'
    : datos ? nivelDe(vigiladas.map(f => f.Estado), vigiladas.map(f => f.Estructura)) : 'info'

  // ── Cada fuente principal: su %, su métrica y qué la tiene mal ──────────
  const nodos = FUENTES_PRINCIPALES.map(fp => {
    const filas = fuentes.filter(f => f.Sistema === fp.sistema)
    const vivas = filas.filter(f => f.Estado !== 'Excluida')
    const pct = porcentaje(partesDe(fp.sistema, fuentes))
    if (fp.sistema === 'Replica de AX') {
      const atraso = [...(datos?.mediciones ?? [])].reverse()
        .find(m => m.Metrica === 'AtrasoMin' && m.Fuente === 'AX.CUSTINVOICETRANS')
      return { ...fp, pct, nivel: nivelDe(vivas.map(f => f.Estado), filas.map(f => f.Estructura)),
        metrica: atraso?.Valor != null ? `${entero(atraso.Valor)} min de atraso con AX en vivo` : 'Sin medición en la última hora',
        detalle: filas.find(f => f.Clave === 'IX_IMA')?.Detalle ?? '' }
    }
    if (fp.sistema === 'IMClientesIV') {
      const mal = vivas.filter(conProblema)
      return { ...fp, pct, nivel: nivelDe(vivas.map(f => f.Estado), filas.map(f => f.Estructura)),
        metrica: `${vivas.length - mal.length} de ${vivas.length} cuentas al día`,
        detalle: mal.length ? `Atrasadas: ${mal.map(f => f.Nombre).join(', ')}` : 'Todas mandan a su ritmo' }
    }
    const tablas = vivas.filter(f => f.Fuente !== 'CRONO.audit.Logs')
    return { ...fp, pct, nivel: nivelDe(tablas.map(f => f.Estado), tablas.map(f => f.Estructura)),
      metrica: `${tablas.filter(f => !conProblema(f)).length} de ${tablas.length} tablas al día`,
      detalle: filas.find(f => f.Fuente === 'CRONO.audit.Logs')?.Detalle ?? '' }
  })

  // Errores primero, después lo más reciente.
  const vigentes = (datos?.advertencias ?? []).filter(a => a.Vigente)
    .sort((a, b) => (a.Resultado === b.Resultado ? b.UltimaVez.localeCompare(a.UltimaVez) : a.Resultado === 'Error' ? -1 : 1))
  const MAX_ADVERTENCIAS = 10

  // El estado general es el peor de nuestras cargas y las fuentes (la publicación todavía no existe).
  const general = peor(nivelCargas, nivelFuentes)
  const TITULO_GENERAL: Record<Nivel, string> = {
    ok: 'Todo al día', aviso: 'Con avisos', error: 'Requiere atención', info: 'Sin datos',
  }
  const fuentesAlDia = nodos.filter(n => n.nivel === 'ok').length
  const conexionesOk = (datos?.conexiones ?? []).filter(c => c.Estado === 'OK').length
  const capasHechas = CAPAS.filter(c => {
    const d = datos?.capas.find(x => x.Capa === c.capa)
    return d && d.Estado !== 'PorConstruir'
  }).length

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}
      refreshControl={
        <RefreshControl refreshing={refrescando} tintColor={ACCENT}
          onRefresh={() => { setRefrescando(true); cargar() }} />
      }
    >
      {error && (
        <XStack backgroundColor={tinte(ROJO, 0.12)} borderRadius="$4" borderWidth={1} borderColor={tinte(ROJO, 0.4)}
          padding="$3" gap="$2.5" alignItems="center">
          <CircleX size={18} color={ROJO} />
          <Text flex={1} fontSize="$2" color="$text">{error}</Text>
        </XStack>
      )}

      {cargando && !datos ? (
        <YStack alignItems="center" paddingTop="$8"><Spinner size="large" color={ACCENT} /></YStack>
      ) : !datos ? null : (
        <>
          {/* Estado general y las tres preguntas del semáforo del web. */}
          <YStack backgroundColor="$backgroundElevated" borderRadius="$5" borderWidth={1}
            borderColor={tinte(COLOR_NIVEL[general], 0.35)} overflow="hidden" {...shadows.sm}>
            <XStack backgroundColor={tinte(COLOR_NIVEL[general], 0.12)} padding="$3.5" gap="$3" alignItems="center">
              <Circulo icono={ICONO_NIVEL[general]} color={COLOR_NIVEL[general]} tam={52} />
              <YStack flex={1} gap={2}>
                <Text fontSize={21} fontWeight="900" color="$text">{TITULO_GENERAL[general]}</Text>
                <Text fontSize="$1" color="$textMuted">Actualizado {hora(actualizado)} · se pone al día sola</Text>
              </YStack>
              {hayCorriendo && <Spinner size="small" color={AZUL} />}
            </XStack>
            <YStack padding="$3" gap="$3">
              <FilaSemaforo icono={Activity} nivel={nivelCargas} titulo="Nuestras cargas"
                valor={nivelCargas === 'ok' ? 'Al día' : nivelCargas === 'error' ? `${conError.length} con error` : 'Sin correr'}
                sub={vigilancia ? `Vigilancia ${hace(vigilancia.Inicio, ahora)} · próxima ${enCuanto(vigilancia.ProximaCorrida, ahora)}` : ''} />
              <FilaSemaforo icono={Database} nivel={nivelFuentes} titulo="Fuentes"
                valor={sinConexion.length ? `${sinConexion.length} sin conexión`
                  : fuentesMal.length === 0 ? 'Al día' : plural(fuentesMal.length, 'aviso', 'avisos')}
                sub={sinConexion.length ? `No responde: ${sinConexion.map(c => SERVIDORES[c.Servidor] ?? c.Servidor).join(', ')}`
                  : fuentesMal.length ? fuentesMal.map(nombreParte).join(', ') : `${vigiladas.length} partes vigiladas en 3 fuentes`} />
              <FilaSemaforo icono={CloudUpload} nivel="info" titulo="Publicación a IMCore" valor="Por construir"
                sub="Paso 6: solo resúmenes que cambien, con la hora de los datos" />
            </YStack>
          </YStack>

          <Seccion icono={Database} titulo="Fuentes" resumen={`${fuentesAlDia} de ${nodos.length} al día`}
            color={fuentesAlDia === nodos.length ? VERDE : NARANJA}>
            {nodos.map((n, i) => (
              <XStack key={n.sistema} gap="$3" alignItems="flex-start"
                borderTopWidth={i === 0 ? 0 : 1} borderTopColor="$border" paddingTop={i === 0 ? 0 : '$3'}>
                <Circulo icono={n.icono} color={COLOR_NIVEL[n.nivel]} tam={38} />
                <YStack flex={1} gap={5}>
                  <XStack alignItems="center" gap="$2">
                    <Text fontSize="$4" fontWeight="800" color="$text">{n.titulo}</Text>
                    {n.sistema === 'CRONO' && <Pastilla color={GRIS} texto="solo referencia" />}
                    <View flex={1} />
                    <Text fontSize="$5" fontWeight="900" color={colorPorcentaje(n.pct, n.nivel)}>
                      {n.pct == null ? '—' : `${n.pct}%`}
                    </Text>
                  </XStack>
                  <Barra pct={n.pct} color={colorPorcentaje(n.pct, n.nivel)} alto={6} />
                  <Text fontSize="$3" fontWeight="600" color="$text">{n.metrica}</Text>
                  {!!n.detalle && <Text fontSize="$1" color="$textMuted" numberOfLines={2}>{n.detalle}</Text>}
                  {n.sistema === 'CRONO' && (
                    // El mismo aviso del web (D-15): sutil, pero como advertencia.
                    <XStack gap={8} alignItems="flex-start" backgroundColor={tinte(NARANJA, 0.1)} borderRadius={8}
                      borderLeftWidth={3} borderLeftColor={NARANJA} paddingHorizontal="$2.5" paddingVertical="$2" marginTop={2}>
                      <AlertTriangle size={13} color={NARANJA} style={{ marginTop: 1 }} />
                      <Text flex={1} fontSize="$1" color="$text">
                        Solo comparamos: de CRONO leemos su bitácora de cargas y sus totales. Ningún dato entra a IMAnalitica.
                      </Text>
                    </XStack>
                  )}
                </YStack>
              </XStack>
            ))}
          </Seccion>

          <Seccion icono={Server} titulo="Conexiones"
            resumen={datos.conexiones.length === 0 ? 'Sin revisar'
              : sinConexion.length ? `${sinConexion.length} sin respuesta` : `${conexionesOk} de ${datos.conexiones.length} responden`}
            color={sinConexion.length ? ROJO : datos.conexiones.length ? VERDE : GRIS}>
            {datos.conexiones.map(c => (
              <XStack key={c.Servidor} gap="$3" alignItems="center">
                <Circulo icono={c.Estado === 'OK' ? Server : ServerCrash} color={c.Estado === 'OK' ? VERDE : ROJO} tam={34} />
                <YStack flex={1} gap={1}>
                  <Text fontSize="$3" fontWeight="700" color="$text" numberOfLines={1}>{SERVIDORES[c.Servidor] ?? c.Servidor}</Text>
                  {c.Estado === 'OK' ? (
                    <Text fontSize="$1" color="$textMuted" numberOfLines={1}>{c.Servidor}</Text>
                  ) : (
                    <Text fontSize="$1" color={ROJO} numberOfLines={3}>Falla {hace(c.FallaDesde, ahora)}. {c.Error}</Text>
                  )}
                </YStack>
                {c.Estado === 'OK'
                  ? <Pastilla color={VERDE} texto={c.Milisegundos ? `${c.Milisegundos} ms` : 'Responde'} />
                  : <Pastilla color={ROJO} texto="No responde" />}
              </XStack>
            ))}
            {datos.conexiones.length > 0 && (
              <Dato icono={Clock}
                texto={`Revisadas ${hace(datos.conexiones.reduce((m, c) => (c.RevisadaEn > m ? c.RevisadaEn : m), ''), ahora)} · cada 15 min`} />
            )}
          </Seccion>

          <Seccion icono={Layers} titulo="IMAnalitica" resumen={`${capasHechas} de ${CAPAS.length} capas`}
            color={capasHechas === CAPAS.length ? VERDE : AZUL}>
            {/* Escalera de capas: de la carga a la publicación; lo que falta construir va en gris. */}
            {CAPAS.map((c, i) => {
              const d = datos.capas.find(x => x.Capa === c.capa)
              const hecha = !!d && d.Estado !== 'PorConstruir'
              const color = colorCapa(d)
              return (
                <XStack key={c.capa} gap="$3">
                  <YStack alignItems="center" width={18}>
                    <View width={16} height={16} borderRadius={8} marginTop={2}
                      backgroundColor={hecha ? color : 'transparent'} borderWidth={2} borderColor={hecha ? color : '$border'} />
                    {i < CAPAS.length - 1 && <View width={2} flex={1} minHeight={18} backgroundColor="$border" marginVertical={2} />}
                  </YStack>
                  <YStack flex={1} gap={4} paddingBottom={i < CAPAS.length - 1 ? '$2.5' : 0}>
                    <XStack alignItems="baseline" gap="$2">
                      <Text flex={1} fontSize="$3" fontWeight={hecha ? '700' : '500'} color={hecha ? '$text' : '$textMuted'}
                        numberOfLines={1}>{c.nombre}</Text>
                      {hecha && d.Porcentaje != null && (
                        <Text fontSize="$2" fontWeight="800" color={color}>{d.Porcentaje}%</Text>
                      )}
                    </XStack>
                    {hecha ? (
                      <>
                        <Barra pct={d.Porcentaje} color={color} alto={4} />
                        <Text fontSize="$1" color="$textMuted">{plural(d.Tablas, 'tabla', 'tablas')} · {entero(d.Filas)} filas</Text>
                      </>
                    ) : (
                      <Text fontSize="$1" color="$textMuted">Por construir · {c.cuando}</Text>
                    )}
                  </YStack>
                </XStack>
              )
            })}
          </Seccion>

          <Seccion icono={AlertTriangle} titulo="Advertencias" resumen={vigentes.length ? `${vigentes.length} vigentes` : 'Ninguna'}
            color={vigentes.some(a => a.Resultado === 'Error') ? ROJO : vigentes.length ? NARANJA : VERDE}>
            {vigentes.length === 0 ? (
              <XStack gap="$3" alignItems="center">
                <Circulo icono={CheckCircle2} color={VERDE} tam={34} />
                <Text flex={1} fontSize="$2" color="$text">La última revisión de cada proceso salió limpia.</Text>
              </XStack>
            ) : (
              <>
                {vigentes.slice(0, MAX_ADVERTENCIAS).map((a, i) => {
                  const color = a.Resultado === 'Error' ? ROJO : NARANJA
                  return (
                    <XStack key={`${a.Fuente}|${a.Clave}|${a.Tipo}|${a.Resultado}|${a.Proceso}`} gap="$3" alignItems="flex-start"
                      borderTopWidth={i === 0 ? 0 : 1} borderTopColor="$border" paddingTop={i === 0 ? 0 : '$3'}>
                      <Circulo icono={a.Resultado === 'Error' ? CircleX : AlertTriangle} color={color} tam={34} />
                      <YStack flex={1} gap={3}>
                        <Text fontSize="$3" fontWeight="700" color="$text" numberOfLines={2}>
                          {a.NombreClave ?? a.Fuente}
                        </Text>
                        <XStack gap="$3" flexWrap="wrap">
                          <Dato icono={Database} texto={nombreSistema(a.Sistema)} />
                          <Dato icono={Clock} texto={`desde ${hace(a.PrimeraVez, ahora).replace('hace ', '')}`} />
                          <Dato icono={RefreshCw} texto={plural(a.Veces, 'vez', 'veces')} />
                        </XStack>
                        {!!a.UltimoDetalle && <Text fontSize="$1" color="$textMuted" numberOfLines={2}>{a.UltimoDetalle}</Text>}
                      </YStack>
                    </XStack>
                  )
                })}
                {vigentes.length > MAX_ADVERTENCIAS && (
                  <Text fontSize="$1" color="$textMuted">Y {vigentes.length - MAX_ADVERTENCIAS} más en el sistema web.</Text>
                )}
              </>
            )}
          </Seccion>

          <Seccion icono={Play} titulo="Procesos" resumen={plural(procesos.length, 'proceso', 'procesos')} color={AZUL}>
            {procesos.map((p, i) => {
              const e = p.Estado ? ESTADO_CORRIDA[p.Estado] : null
              const vivo = p.Estado === 'Corriendo'
              const verPasos = abierto === p.Codigo && !!p.CorridaId
              return (
                <YStack key={p.Codigo} gap="$2.5"
                  borderTopWidth={i === 0 ? 0 : 1} borderTopColor="$border" paddingTop={i === 0 ? 0 : '$3'}>
                <XStack gap="$3" alignItems="flex-start" pressStyle={{ opacity: 0.7 }}
                  onPress={() => p.CorridaId && setAbierto(a => (a === p.Codigo ? null : p.Codigo))}>
                  <Circulo icono={e?.icono ?? CircleDashed} color={e?.color ?? GRIS} tam={38} />
                  <YStack flex={1} gap={5}>
                    <XStack alignItems="center" gap="$2">
                      <Text flex={1} fontSize="$4" fontWeight="800" color="$text" numberOfLines={1}>{p.Nombre}</Text>
                      <Pastilla color={e?.color ?? GRIS} texto={e?.label ?? 'Sin correr'} />
                    </XStack>
                    {p.Estado === 'Corriendo' ? (
                      <Dato icono={Clock} texto={`Empezó ${hace(p.Inicio, ahora)}${p.PasoActual ? ` · ${p.PasoActual}` : ''}`} />
                    ) : (
                      <XStack gap="$3" flexWrap="wrap">
                        <Dato icono={Clock} texto={`Última ${hace(p.Inicio, ahora)}`} />
                        <Dato icono={Timer} texto={duracion(p.Segundos)} />
                        <Dato icono={Gauge} texto={`${entero(p.LecturasLogicas)} lecturas`} />
                      </XStack>
                    )}
                    {atrasado(p, ahora) ? (
                      <Dato icono={AlertTriangle} color={NARANJA}
                        texto={`Debía correr ${hace(p.ProximaCorrida, ahora)}: revisar el orquestador.`} />
                    ) : p.Activo && p.ProximaCorrida ? (
                      <Dato icono={CalendarClock} texto={`Próxima ${enCuanto(p.ProximaCorrida, ahora)}`} />
                    ) : null}
                    {!!p.ErrorMensaje && <Text fontSize="$1" color={ROJO} numberOfLines={3}>{p.ErrorMensaje}</Text>}
                  </YStack>
                  {!!p.CorridaId && (verPasos ? <ChevronUp size={18} color={GRIS} /> : <ChevronDown size={18} color={GRIS} />)}
                </XStack>

                {verPasos && (
                  <PasosCorrida corridaId={p.CorridaId!} vivo={vivo} esperados={esperados[p.Codigo]}
                    inicio={p.Inicio} ahora={ahora} resultado={vivo ? null : p.ErrorMensaje ?? p.Mensaje} />
                )}

                {puedeEjecutar && (
                  <XStack height={38} borderRadius={10} alignItems="center" justifyContent="center" gap="$2"
                    backgroundColor={vivo || !p.Activo ? tinte(GRIS, 0.15) : ACCENT}
                    opacity={ejecutando && confirmar?.Codigo === p.Codigo ? 0.6 : 1}
                    pressStyle={{ opacity: 0.8 }}
                    onPress={() => !vivo && p.Activo && !ejecutando && setConfirmar(p)}>
                    {vivo ? <Spinner size="small" color={GRIS} /> : <Play size={15} color={p.Activo ? '#fff' : GRIS} />}
                    <Text fontSize="$3" fontWeight="800" color={vivo || !p.Activo ? GRIS : '#fff'}>
                      {vivo ? 'Corriendo…' : p.Activo ? 'Ejecutar ahora' : 'Proceso inactivo'}
                    </Text>
                  </XStack>
                )}
                </YStack>
              )
            })}
          </Seccion>

          <ConfirmDialog open={!!confirmar} onOpenChange={o => !o && !ejecutando && setConfirmar(null)}
            title={`¿Ejecutar ${confirmar?.Nombre ?? ''} ahora?`}
            message="Corre en el servidor, igual que a su hora. Aquí se ve el avance paso a paso."
            confirmLabel="Ejecutar" loading={ejecutando}
            onConfirm={() => confirmar && ejecutar(confirmar)} />

          <Text fontSize="$1" color="$textMuted" textAlign="center">
            Reintentar, corridas, gráficas y conexiones están en el sistema web.
          </Text>
        </>
      )}
    </ScrollView>
  )
}

/**
 * Los pasos de una corrida. Mientras corre se vuelven a pedir cada 2.5 s: cada paso con su estado,
 * duración y lecturas, y una barra de avance contra los pasos de la corrida anterior (si se conocen).
 */
function PasosCorrida({ corridaId, vivo, esperados, inicio, ahora, resultado }: {
  corridaId: number
  vivo: boolean
  esperados?: number
  inicio: string | null
  ahora: number
  resultado: string | null
}) {
  const [pasos, setPasos] = useState<IPasoMonitor[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    const leer = async () => {
      try {
        const r = await svc.pasos(corridaId)
        if (!vigente) return
        if (r.Success) {
          setPasos(r.Data)
          setError(null)
        } else setError(r.ErrorMessage || 'No se pudieron leer los pasos.')
      } catch (e: any) {
        if (vigente) setError(mensajeError(e))
      }
    }
    leer()
    // Al terminar, una última lectura y se deja de pedir.
    const t = vivo ? setInterval(leer, EN_VIVO) : null
    return () => {
      vigente = false
      if (t) clearInterval(t)
    }
  }, [corridaId, vivo])

  const hechos = (pasos ?? []).filter(x => x.Fin).length
  const pct = !vivo ? 100 : esperados ? Math.min(95, Math.round((hechos / esperados) * 100)) : Math.min(90, 10 + hechos * 15)
  const segundos = vivo && inicio ? Math.max(0, Math.round((ahora - new Date(inicio).getTime()) / 1000)) : null

  return (
    <YStack backgroundColor={tinte(vivo ? AZUL : GRIS, 0.08)} borderRadius={12} padding="$3" gap="$2.5">
      <XStack alignItems="center" gap="$2">
        <Text flex={1} fontSize={11} fontWeight="800" color="$textMuted" textTransform="uppercase" letterSpacing={0.5}>
          {vivo ? 'En vivo' : 'Última corrida'} · #{corridaId}
        </Text>
        {segundos != null && <Dato icono={Timer} texto={duracion(segundos)} color={AZUL} />}
      </XStack>
      {vivo && (
        <YStack gap={4}>
          <Barra pct={pct} color={AZUL} alto={6} />
          <Text fontSize="$1" color="$textMuted">
            {esperados ? `Paso ${Math.min(hechos + 1, esperados)} de ~${esperados}` : plural(hechos, 'paso terminado', 'pasos terminados')}
          </Text>
        </YStack>
      )}
      {!!error && <Text fontSize="$1" color={ROJO}>{error}</Text>}
      {!pasos ? <Spinner size="small" color={AZUL} /> : pasos.map(x => {
        const enCurso = !x.Fin
        const color = x.Estado === 'Error' ? ROJO : x.Estado === 'Advertencia' ? NARANJA : VERDE
        const I = x.Estado === 'Error' ? CircleX : x.Estado === 'Advertencia' ? AlertTriangle : CheckCircle2
        const ms = x.Milisegundos
        return (
          <XStack key={x.Orden} gap="$2.5" alignItems="flex-start">
            <View width={22} alignItems="center" paddingTop={1}>
              {enCurso ? <Spinner size="small" color={AZUL} /> : <I size={17} color={color} />}
            </View>
            <YStack flex={1} gap={1}>
              <XStack gap="$2" alignItems="baseline">
                <Text flex={1} fontSize="$2" fontWeight="700" color="$text" numberOfLines={2}>{x.Nombre}</Text>
                <Text fontSize="$1" color={enCurso ? AZUL : '$textMuted'}>
                  {enCurso ? 'corriendo' : ms == null ? '' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`}
                </Text>
              </XStack>
              {!enCurso && (
                <Text fontSize="$1" color="$textMuted" numberOfLines={1}>
                  {x.Filas != null ? `${entero(x.Filas)} filas · ` : ''}{entero(x.LecturasLogicas)} lecturas
                </Text>
              )}
              {!!x.Mensaje && !enCurso && <Text fontSize="$1" color="$textMuted" numberOfLines={2}>{x.Mensaje}</Text>}
            </YStack>
          </XStack>
        )
      })}
      {!vivo && !!resultado && (
        <Text fontSize="$1" color="$text" borderTopWidth={1} borderTopColor="$border" paddingTop="$2">{resultado}</Text>
      )}
    </YStack>
  )
}

/** Ícono dentro de un círculo con el color suave de fondo. */
function Circulo({ icono: I, color, tam }: { icono: Icono; color: string; tam: number }) {
  return (
    <View width={tam} height={tam} borderRadius={tam / 2} backgroundColor={tinte(color, 0.15)}
      alignItems="center" justifyContent="center">
      <I size={Math.round(tam * 0.5)} color={color} />
    </View>
  )
}

/** Una de las tres preguntas del semáforo: ícono, estado a la derecha y una línea de detalle. */
function FilaSemaforo({ icono, nivel, titulo, valor, sub }: {
  icono: Icono
  nivel: Nivel
  titulo: string
  valor: string
  sub: string
}) {
  return (
    <XStack gap="$3" alignItems="center">
      <Circulo icono={icono} color={COLOR_NIVEL[nivel]} tam={36} />
      <YStack flex={1} gap={1}>
        <XStack alignItems="baseline" gap="$2">
          <Text flex={1} fontSize={11} fontWeight="800" color="$textMuted" textTransform="uppercase" letterSpacing={0.5}
            numberOfLines={1}>{titulo}</Text>
          <Text fontSize="$4" fontWeight="900" color={COLOR_NIVEL[nivel]}>{valor}</Text>
        </XStack>
        {!!sub && <Text fontSize="$1" color="$textMuted" numberOfLines={2}>{sub}</Text>}
      </YStack>
    </XStack>
  )
}

/** Tarjeta de sección: ícono, título y un resumen a la derecha con su color. */
function Seccion({ icono: I, titulo, resumen, color, children }: {
  icono: Icono
  titulo: string
  resumen: string
  color: string
  children: React.ReactNode
}) {
  return (
    <YStack backgroundColor="$backgroundElevated" borderRadius="$5" borderWidth={1}
      borderColor="$border" padding="$3.5" gap="$3" {...shadows.sm}>
      <XStack alignItems="center" gap="$2.5">
        <View width={30} height={30} borderRadius={9} backgroundColor={tinte(ACCENT, 0.14)} alignItems="center" justifyContent="center">
          <I size={16} color={ACCENT} />
        </View>
        <Text flex={1} fontSize="$5" fontWeight="900" color="$text">{titulo}</Text>
        <Pastilla color={color} texto={resumen} />
      </XStack>
      {children}
    </YStack>
  )
}

/** Un dato chico con su ícono (hora, duración, lecturas…). */
function Dato({ icono: I, texto, color }: { icono: Icono; texto: string; color?: string }) {
  return (
    <XStack gap={4} alignItems="center" flexShrink={1}>
      <I size={12} color={color ?? GRIS} />
      <Text fontSize="$1" color={color ?? '$textMuted'} flexShrink={1}>{texto}</Text>
    </XStack>
  )
}

/** Barra con riel; sin porcentaje (por construir), solo el riel. */
function Barra({ pct, color, alto }: { pct: number | null; color: string; alto: number }) {
  return (
    <View height={alto} borderRadius={alto / 2} backgroundColor="$border" overflow="hidden">
      {pct != null && (
        <View width={`${Math.max(0, Math.min(100, pct))}%`} height={alto} borderRadius={alto / 2} backgroundColor={color} />
      )}
    </View>
  )
}

/** Pastilla rellena con el color suave y el texto en su color. */
function Pastilla({ color, texto }: { color: string; texto: string }) {
  return (
    <View borderRadius={999} backgroundColor={tinte(color, 0.16)} paddingHorizontal={9} paddingVertical={3}>
      <Text fontSize={11} fontWeight="800" color={color}>{texto}</Text>
    </View>
  )
}
