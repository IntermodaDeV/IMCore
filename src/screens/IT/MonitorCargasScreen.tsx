import React, { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshControl, ScrollView } from 'react-native'
import { Spinner, Text, View, XStack, YStack } from 'tamagui'
import { AlertTriangle } from 'lucide-react-native'
import { useFocusEffect } from '@react-navigation/native'

import { usePageHeader } from '../../hooks/usePageHeader'
import { HttpError } from '../../api/core/httpClient'
import { monitorCargasService as svc } from '../../api/modules/monitorCargas/monitorCargas.service'
import {
  CapaAnalitica, EstadoCorrida, EstadoFuente, IAdvertenciaMonitor, ICapaMonitor, IFuenteMonitor, IMedicionMonitor,
  IProcesoMonitor,
} from '../../api/modules/monitorCargas/monitorCargas.types'
import { shadows } from '../../theme/shadows'

/* ============================================================================
   MONITOR DE CARGAS en el teléfono — el resumen, nada más.

   Si nuestras cargas corrieron, si las fuentes llegaron a su ritmo y si se
   publicó a IMCore; el % de cada fuente y de cada capa de IMAnalitica, las
   advertencias vigentes y cada proceso. Es la misma opción de menú del web
   ('itMonitorCargas') y los mismos endpoints; ejecutar, reintentar, corridas,
   gráficas y conexiones quedan en el web. La lógica del semáforo y de los %
   es la del web (IMCoreWeb/src/pages/it/monitorCargasUi.ts): si cambia allá,
   cambia aquí.

   Se pone al día sola mientras está abierta: cada 10 s si algo corre, cada 60 s
   si no (por datos móviles, más espaciado que el web).
   ============================================================================ */

const ACCENT = '#FF551A'
const VERDE = '#16a34a'
const NARANJA = '#ea580c'
const ROJO = '#dc2626'
const AZUL = '#2a78d6'
const RAPIDO = 10_000
const NORMAL = 60_000

type Nivel = 'ok' | 'aviso' | 'error' | 'info'
const COLOR_NIVEL: Record<Nivel, string> = { ok: VERDE, aviso: NARANJA, error: ROJO, info: '$textMuted' }

const ESTADO_CORRIDA: Record<EstadoCorrida, { color: string; label: string }> = {
  Corriendo: { color: AZUL, label: 'Corriendo' },
  OK: { color: VERDE, label: 'OK' },
  Advertencia: { color: NARANJA, label: 'Con hallazgos' },
  Error: { color: ROJO, label: 'Error' },
  Cancelada: { color: '$textMuted', label: 'Cortada' },
}

/** Las fuentes que vigila hoy la vigilancia, en el orden del flujo. CRONO es solo referencia (D-15). */
const FUENTES_PRINCIPALES = [
  { sistema: 'Replica de AX', titulo: 'Réplica de AX' },
  { sistema: 'IMClientesIV', titulo: 'IMClientesIV' },
  { sistema: 'CRONO', titulo: 'CRONO' },
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
  pct == null || nivel === 'info' ? '$textMuted' : nivel === 'error' ? ROJO : pct >= 100 ? VERDE : NARANJA

const colorCapa = (c?: ICapaMonitor) =>
  !c || c.Estado === 'PorConstruir' ? '$textMuted' : c.Estado === 'Error' ? ROJO : c.Estado === 'AlDia' ? VERDE : NARANJA

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

  const cargar = useCallback(async () => {
    const n = ++pedido.current
    try {
      const [p, f, m, c, a] = await Promise.all([
        svc.procesos(), svc.fuentes(), svc.mediciones(1), svc.capas(), svc.advertencias(7),
      ])
      if (n !== pedido.current) return
      const mal = [p, f, m, c, a].find(r => !r.Success)
      if (mal) {
        setError(mal.ErrorMessage || 'No se pudo cargar el monitor.')
        return
      }
      setDatos({ procesos: p.Data, fuentes: f.Data, mediciones: m.Data, capas: c.Data, advertencias: a.Data })
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
  useEffect(() => {
    if (!enFoco) return
    const t = setInterval(cargar, hayCorriendo ? RAPIDO : NORMAL)
    return () => clearInterval(t)
  }, [enFoco, hayCorriendo, cargar])

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
  const nivelFuentes: Nivel = datos ? nivelDe(vigiladas.map(f => f.Estado), vigiladas.map(f => f.Estructura)) : 'info'

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

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}
      refreshControl={
        <RefreshControl refreshing={refrescando} tintColor={ACCENT}
          onRefresh={() => { setRefrescando(true); cargar() }} />
      }
    >
      {error && (
        <XStack backgroundColor="$backgroundElevated" borderRadius="$4" borderWidth={1} borderColor={ROJO}
          padding="$3" gap="$2" alignItems="center">
          <AlertTriangle size={16} color={ROJO} />
          <Text flex={1} fontSize="$2" color="$text">{error}</Text>
        </XStack>
      )}

      {cargando && !datos ? (
        <YStack alignItems="center" paddingTop="$8"><Spinner size="large" color={ACCENT} /></YStack>
      ) : !datos ? null : (
        <>
          <XStack justifyContent="center" alignItems="center" gap="$2">
            <Text fontSize="$1" color="$textMuted">Actualizado {hora(actualizado)} · se pone al día sola</Text>
            {hayCorriendo && <Spinner size="small" color={AZUL} />}
          </XStack>

          <Semaforo nivel={nivelCargas} titulo="Nuestras cargas"
            valor={nivelCargas === 'ok' ? 'Al día' : nivelCargas === 'error' ? `${conError.length} con error` : 'Sin correr'}
            sub={vigilancia ? `Vigilancia ${hace(vigilancia.Inicio, ahora)} · próxima ${enCuanto(vigilancia.ProximaCorrida, ahora)}` : ''} />
          <Semaforo nivel={nivelFuentes} titulo="Fuentes"
            valor={fuentesMal.length === 0 ? 'Al día' : plural(fuentesMal.length, 'aviso', 'avisos')}
            sub={fuentesMal.length ? fuentesMal.map(f => f.Nombre).join(', ') : `${vigiladas.length} partes vigiladas en 3 fuentes`} />
          <Semaforo nivel="info" titulo="Publicación a IMCore" valor="Por construir"
            sub="Paso 6: solo resúmenes que cambien, con la hora de los datos" />

          <Tarjeta titulo="Fuentes">
            {nodos.map((n, i) => (
              <YStack key={n.sistema} gap={4}
                borderTopWidth={i === 0 ? 0 : 1} borderTopColor="$border" paddingTop={i === 0 ? 0 : '$2.5'}>
                <XStack justifyContent="space-between" alignItems="center" gap="$2">
                  <Text fontSize="$3" fontWeight="700" color="$text">{n.titulo}</Text>
                  {n.sistema === 'CRONO' && <Text flex={1} fontSize="$1" color="$textMuted">solo referencia</Text>}
                  <Text fontSize="$2" fontWeight="800" color={colorPorcentaje(n.pct, n.nivel)}>
                    {n.pct == null ? '—' : `${n.pct} %`}
                  </Text>
                </XStack>
                <Barra pct={n.pct} color={colorPorcentaje(n.pct, n.nivel)} />
                <Text fontSize="$2" color="$text">{n.metrica}</Text>
                {!!n.detalle && <Text fontSize="$1" color="$textMuted" numberOfLines={2}>{n.detalle}</Text>}
                {n.sistema === 'CRONO' && (
                  // El mismo aviso del web (D-15): sutil, pero como advertencia.
                  <XStack gap={6} alignItems="flex-start" borderLeftWidth={3} borderLeftColor={NARANJA}
                    paddingLeft="$2" paddingVertical={2}>
                    <AlertTriangle size={12} color={NARANJA} style={{ marginTop: 2 }} />
                    <Text flex={1} fontSize="$1" color="$textMuted">
                      Solo comparamos: de CRONO leemos su bitácora de cargas y sus totales. Ningún dato entra a IMAnalitica.
                    </Text>
                  </XStack>
                )}
              </YStack>
            ))}
          </Tarjeta>

          <Tarjeta titulo="IMAnalitica por capa">
            {CAPAS.map(c => {
              const d = datos.capas.find(x => x.Capa === c.capa)
              const porConstruir = !d || d.Estado === 'PorConstruir'
              return (
                <YStack key={c.capa} gap={4}>
                  <XStack justifyContent="space-between" alignItems="baseline" gap="$2">
                    <Text flex={1} fontSize="$2" color="$text" numberOfLines={1}>{c.nombre}</Text>
                    <Text fontSize="$1" color="$textMuted">
                      {porConstruir ? `por construir · ${c.cuando}` : `${plural(d.Tablas, 'tabla', 'tablas')} · ${entero(d.Filas)} filas`}
                    </Text>
                  </XStack>
                  <Barra pct={porConstruir ? null : d.Porcentaje} color={colorCapa(d)} />
                </YStack>
              )
            })}
          </Tarjeta>

          <Tarjeta titulo={`Advertencias vigentes (${vigentes.length})`}>
            {vigentes.length === 0 ? (
              <Text fontSize="$2" color={VERDE}>Ninguna: la última revisión de cada proceso salió limpia.</Text>
            ) : (
              <>
                {vigentes.slice(0, MAX_ADVERTENCIAS).map((a, i) => (
                  <YStack key={`${a.Fuente}|${a.Clave}|${a.Tipo}|${a.Resultado}|${a.Proceso}`} gap={2}
                    borderTopWidth={i === 0 ? 0 : 1} borderTopColor="$border" paddingTop={i === 0 ? 0 : '$2'}>
                    <XStack gap="$2" alignItems="center">
                      <View width={8} height={8} borderRadius={4} backgroundColor={a.Resultado === 'Error' ? ROJO : NARANJA} />
                      <Text flex={1} fontSize="$3" fontWeight="600" color="$text" numberOfLines={1}>
                        {nombreSistema(a.Sistema)} · {a.NombreClave ?? a.Fuente}
                      </Text>
                    </XStack>
                    <Text fontSize="$1" color="$textMuted">
                      {a.Tipo} · desde {hace(a.PrimeraVez, ahora).replace('hace ', '')} · {plural(a.Veces, 'vez', 'veces')}
                    </Text>
                    {!!a.UltimoDetalle && <Text fontSize="$1" color="$textMuted" numberOfLines={2}>{a.UltimoDetalle}</Text>}
                  </YStack>
                ))}
                {vigentes.length > MAX_ADVERTENCIAS && (
                  <Text fontSize="$1" color="$textMuted">Y {vigentes.length - MAX_ADVERTENCIAS} más en el sistema web.</Text>
                )}
              </>
            )}
          </Tarjeta>

          <Tarjeta titulo="Procesos">
            {procesos.map((p, i) => {
              const e = p.Estado ? ESTADO_CORRIDA[p.Estado] : null
              return (
                <YStack key={p.Codigo} gap={3}
                  borderTopWidth={i === 0 ? 0 : 1} borderTopColor="$border" paddingTop={i === 0 ? 0 : '$2.5'}>
                  <XStack justifyContent="space-between" alignItems="center" gap="$2">
                    <Text flex={1} fontSize="$3" fontWeight="700" color="$text" numberOfLines={1}>{p.Nombre}</Text>
                    {e ? <Pastilla color={e.color} texto={e.label} /> : <Pastilla color="$textMuted" texto="Sin correr" />}
                  </XStack>
                  <Text fontSize="$1" color="$textMuted">
                    {p.Estado === 'Corriendo'
                      ? `Empezó ${hace(p.Inicio, ahora)}${p.PasoActual ? ` · ${p.PasoActual}` : ''}`
                      : `Última ${hace(p.Inicio, ahora)} · duró ${duracion(p.Segundos)} · ${entero(p.LecturasLogicas)} lecturas`}
                  </Text>
                  {atrasado(p, ahora) ? (
                    <Text fontSize="$1" color={NARANJA}>Debía correr {hace(p.ProximaCorrida, ahora)}: revisar el orquestador.</Text>
                  ) : p.Activo && p.ProximaCorrida ? (
                    <Text fontSize="$1" color="$textMuted">Próxima {enCuanto(p.ProximaCorrida, ahora)}</Text>
                  ) : null}
                  {!!p.ErrorMensaje && <Text fontSize="$1" color={ROJO} numberOfLines={3}>{p.ErrorMensaje}</Text>}
                </YStack>
              )
            })}
          </Tarjeta>

          <Text fontSize="$1" color="$textMuted" textAlign="center">
            Ejecutar, corridas, gráficas y conexiones están en el sistema web.
          </Text>
        </>
      )}
    </ScrollView>
  )
}

/** Una de las tres preguntas: franja de color a la izquierda, el estado y una línea de detalle. */
function Semaforo({ nivel, titulo, valor, sub }: { nivel: Nivel; titulo: string; valor: string; sub: string }) {
  return (
    <YStack backgroundColor="$backgroundElevated" borderRadius="$4" borderWidth={1} borderColor="$border"
      borderLeftWidth={4} borderLeftColor={COLOR_NIVEL[nivel]} paddingVertical="$2.5" paddingHorizontal="$3"
      gap={2} {...shadows.sm}>
      <XStack justifyContent="space-between" alignItems="baseline" gap="$2">
        <Text fontSize={10} fontWeight="800" color="$textMuted" textTransform="uppercase">{titulo}</Text>
        <Text fontSize="$4" fontWeight="800" color={nivel === 'info' ? '$textMuted' : COLOR_NIVEL[nivel]}>{valor}</Text>
      </XStack>
      {!!sub && <Text fontSize="$1" color="$textMuted" numberOfLines={2}>{sub}</Text>}
    </YStack>
  )
}

function Tarjeta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <YStack backgroundColor="$backgroundElevated" borderRadius="$4" borderWidth={1}
      borderColor="$border" padding="$3.5" gap="$2.5" {...shadows.sm}>
      <Text fontSize="$2" fontWeight="800" color="$textMuted" textTransform="uppercase">{titulo}</Text>
      {children}
    </YStack>
  )
}

/** Barra delgada; sin porcentaje (por construir), solo el riel. */
function Barra({ pct, color }: { pct: number | null; color: string }) {
  return (
    <View height={4} borderRadius={2} backgroundColor="$border" overflow="hidden">
      {pct != null && <View width={`${Math.max(0, Math.min(100, pct))}%`} height={4} borderRadius={2} backgroundColor={color} />}
    </View>
  )
}

function Pastilla({ color, texto }: { color: string; texto: string }) {
  return (
    <View borderRadius={10} borderWidth={1} borderColor={color} paddingHorizontal={8} paddingVertical={1}>
      <Text fontSize={10} fontWeight="800" color={color}>{texto}</Text>
    </View>
  )
}
