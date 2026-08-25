import React, { useEffect, useState } from 'react'
import { Input, Spinner, Text, View, XStack, YStack, useTheme } from 'tamagui'
import { AlertCircle, Search } from 'lucide-react-native'

import { ticketsService } from '../../api/modules/mantenimiento/tickets.service'
import { ExecutionResponse } from '../../api/modules/response.type'
import {
  IEsperaAnatomia,
  IMetaParo,
  IPausaDetalle,
  IPausaMotivo,
} from '../../api/modules/mantenimiento/tickets.types'
import {
  ACCENT,
  COLOR_ESPERA,
  COLOR_PAUSA,
  COLOR_REPROCESO,
  COLOR_TRABAJO,
  ESCALA_AZUL,
  ESCALA_NARANJA,
  ESCALA_ROJA,
  colorPrioridad,
  fmtDetenido,
  fmtEntero,
  fmtHM,
  fmtHoras,
  variacion,
} from './mantenimiento.helpers'
import { BarraApilada, HBarList, KpiCard, SectionCard } from './components'

// Pestaña "Análisis" del dashboard de mantenimiento: los mismos KPIs de decisión
// que el dashboard del web (IMCoreWeb › Mantenimiento › Dashboard › Análisis),
// adaptados a pantalla de celular.
//
// Estos indicadores se agregan en SQL, así que el toggle Máquina/Área NO se puede
// filtrar en el cliente: viaja al servidor como tipoDestino.

const pctDe = (parte: number, total: number) => (total ? Math.round((parte / total) * 100) : 0)

// ── Carga de un indicador ────────────────────────────────────────────────────
interface EstadoKpi<T> {
  datos: T[]
  cargando: boolean
  error: unknown
}

function useKpi<T>(fetcher: () => Promise<ExecutionResponse<T[]>>, keys: unknown[]): EstadoKpi<T> {
  const [datos, setDatos] = useState<T[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      setCargando(true)
      setError(null)
      try {
        const resp = await fetcher()
        if (!vivo) return
        if (!resp.Success) throw new Error(resp.ErrorMessage || 'No se pudo cargar el indicador.')
        setDatos(resp.Data ?? [])
      } catch (e) {
        if (vivo) {
          setError(e)
          setDatos([])
        }
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => {
      vivo = false
    }
    // Las dependencias son el rango y el filtro (`keys`); el fetcher se recrea en
    // cada render, así que no puede ir en la lista.
  }, keys)

  return { datos, cargando, error }
}

// Un 404 aquí casi siempre significa "la API desplegada todavía no trae este
// endpoint", no que algo se rompió: se avisa y el resto de la pestaña sigue.
function AvisoIndicador({ error, endpoint }: { error: unknown; endpoint: string }) {
  const status = (error as { status?: number })?.status
  const msg = (error as Error)?.message ?? ''
  const falta = status === 404 || msg.includes('404')
  const color = falta ? '#f59e0b' : '#ef4444'
  return (
    <XStack
      backgroundColor={color + '18'}
      borderRadius="$3"
      padding="$2.5"
      gap="$2"
      alignItems="flex-start"
    >
      <AlertCircle size={16} color={color} />
      <Text fontSize={11} color="$text" lineHeight={16} flex={1}>
        {falta
          ? `Este indicador necesita la API más reciente (endpoint Tickets/${endpoint}). El resto de la pestaña funciona; se ve en cuanto se despliegue.`
          : msg || 'No se pudo cargar el indicador.'}
      </Text>
    </XStack>
  )
}

function Cargando({ alto = 140 }: { alto?: number }) {
  return (
    <YStack height={alto} alignItems="center" justifyContent="center">
      <Spinner size="large" color={ACCENT} />
    </YStack>
  )
}

// ════════ Pestaña ════════
export interface AnalisisProps {
  desde: string
  hasta: string
  // Rango previo del mismo largo: los KPIs del titular muestran su variación
  // contra él. Lo calcula la pantalla (usePeriodo sabe el modo).
  desdePrev: string
  hastaPrev: string
  tipoDest: 'Todos' | 'MAQUINA' | 'AREA'
  // CSV de prioridades ('Alta,Media') o undefined = todas. Va tal cual a los SP.
  prioridades?: string
}

export function DashboardAnalisis({ desde, hasta, desdePrev, hastaPrev, tipoDest, prioridades }: AnalisisProps) {
  // 'Todos' viaja como undefined: el SP interpreta NULL como "sin filtro".
  const tipoParam = tipoDest === 'Todos' ? undefined : tipoDest

  // Una sola llamada a EsperaAnatomia alimenta el titular del paro (Dim=TOTAL),
  // la prioridad (Dim=PRIORIDAD) y las áreas (Dim=AREA).
  const anatomia = useKpi<IEsperaAnatomia>(
    () => ticketsService.getEsperaAnatomia(desde, hasta, tipoParam, prioridades),
    [desde, hasta, tipoParam, prioridades],
  )
  const anatomiaPrev = useKpi<IEsperaAnatomia>(
    () => ticketsService.getEsperaAnatomia(desdePrev, hastaPrev, tipoParam, prioridades),
    [desdePrev, hastaPrev, tipoParam, prioridades],
  )

  const pausas = useKpi<IPausaMotivo>(
    () => ticketsService.getPausasPorMotivo(desde, hasta, tipoParam, prioridades),
    [desde, hasta, tipoParam, prioridades],
  )

  // PausasPorMotivo dice POR QUÉ se pausa; ésta, QUIÉN y EN QUÉ.
  const pausasDet = useKpi<IPausaDetalle>(
    () => ticketsService.getPausasDetalle(desde, hasta, tipoParam, prioridades),
    [desde, hasta, tipoParam, prioridades],
  )

  // Metas de paro (configuración global). No lleva prioridades: no lee tickets.
  const metaParo = useKpi<IMetaParo>(() => ticketsService.getMetaParo(desde, hasta), [desde, hasta])

  return (
    <YStack gap="$3">
      <TitularParo actual={anatomia} previo={anatomiaPrev} />
      <Prioridad actual={anatomia} />
      <EsperaPorArea actual={anatomia} />
      <EsperaPorMaquina actual={anatomia} />
      <ParoPorArea actual={anatomia} meta={metaParo} />
      <PausasPorMotivo actual={pausas} />
      <PausasDetalle actual={pausasDet} />
    </YStack>
  )
}

// ════════ "Esperando ahora" (vive en la pestaña Resumen) ════════
// Lo único del dashboard que NO mira el período: qué está parado en este momento.
// Las filas Dim='ESPERA_AREA'/'ESPERA_MAQUINA' del SP ignoran desde/hasta a
// propósito (script 56), así que un ticket olvidado hace tres semanas sale
// aunque el filtro diga "esta semana".
//
// Detenido = abierto y sin nadie trabajando: sin arrancar, pausado o rechazado.
// La barra es el que MÁS lleva esperando; entre paréntesis, cuántos hay.
const MAQUINAS_AHORA_TOP = 12

export function EsperaAhora({
  desde,
  hasta,
  tipoDest,
  prioridades,
  // Se incrementa al hacer "pull to refresh": obliga a re-pedir el dato vivo.
  recarga = 0,
}: {
  desde: string
  hasta: string
  tipoDest: 'Todos' | 'MAQUINA' | 'AREA'
  prioridades?: string
  recarga?: number
}) {
  const tipoParam = tipoDest === 'Todos' ? undefined : tipoDest
  // Mismo endpoint que ya usa Análisis; el rango va porque el SP lo pide, pero
  // estas filas no lo usan.
  const { datos, cargando, error } = useKpi<IEsperaAnatomia>(
    () => ticketsService.getEsperaAnatomia(desde, hasta, tipoParam, prioridades),
    [desde, hasta, tipoParam, prioridades, recarga],
  )

  if (cargando) return <Cargando alto={120} />
  if (error) return <AvisoIndicador error={error} endpoint="EsperaAnatomia" />

  const areas = datos
    .filter(r => r.Dim === 'ESPERA_AREA')
    .sort((a, b) => b.ParoMin - a.ParoMin)
  const maquinas = datos
    .filter(r => r.Dim === 'ESPERA_MAQUINA')
    .sort((a, b) => b.ParoMin - a.ParoMin)
    .slice(0, MAQUINAS_AHORA_TOP)

  // Si vinieron otras dimensiones pero ninguna "viva", la base tiene el SP viejo.
  if (!areas.length && datos.some(r => r.Dim === 'TOTAL')) {
    return (
      <SectionCard titulo="⏳ Esperando ahora">
        <Text fontSize={11} color="$textMuted" lineHeight={16}>
          Este indicador necesita el script 56 (Esperando ahora) aplicado en la base.
        </Text>
      </SectionCard>
    )
  }
  if (!areas.length) {
    return (
      <SectionCard titulo="⏳ Esperando ahora" subtitulo="Tickets abiertos que nadie está atendiendo">
        <Text fontSize={12} color="$textMuted">
          Nada detenido en este momento: todo lo abierto está en proceso.
        </Text>
      </SectionCard>
    )
  }

  const totalTickets = areas.reduce((s, a) => s + a.Tickets, 0)
  const pie = `${fmtEntero(totalTickets)} ${
    totalTickets === 1 ? 'ticket detenido' : 'tickets detenidos'
  } ahora mismo · sin arrancar, pausados o rechazados`

  return (
    <YStack gap="$3">
      <SectionCard titulo="⏳ Áreas esperando ahora" subtitulo={pie}>
        <HBarList
          datos={areas.map(a => ({
            label: `${a.Bucket ?? '—'} (${a.Tickets})`,
            value: Math.round(a.ParoMin),
          }))}
          escala={ESCALA_NARANJA}
          formato={v => fmtDetenido(v)}
          vacioMsg="Nada detenido en este momento."
        />
      </SectionCard>

      <SectionCard
        titulo="⏳ Máquinas esperando ahora"
        subtitulo={`Lo que lleva parado cada activo · top ${MAQUINAS_AHORA_TOP}`}
      >
        <HBarList
          datos={maquinas.map(m => ({
            label: `${m.Bucket ?? '—'} (${m.Tickets})`,
            value: Math.round(m.ParoMin),
          }))}
          escala={ESCALA_AZUL}
          formato={v => fmtDetenido(v)}
          vacioMsg="Ninguna máquina detenida en este momento (solo tickets de área)."
        />
      </SectionCard>
    </YStack>
  )
}

// ── 1. Anatomía del paro del período ─────────────────────────────────────────
// El número que se muestra en reuniones: de todo el tiempo que las máquinas
// estuvieron paradas, cuánto fue esperando y cuánto fue reparando.
function TitularParo({
  actual,
  previo,
}: {
  actual: EstadoKpi<IEsperaAnatomia>
  previo: EstadoKpi<IEsperaAnatomia>
}) {
  if (actual.cargando) return <Cargando />
  if (actual.error) return <AvisoIndicador error={actual.error} endpoint="EsperaAnatomia" />

  const total = actual.datos.find(r => r.Dim === 'TOTAL')
  const prev = previo.datos.find(r => r.Dim === 'TOTAL')

  // Se avisa "sin datos" solo si no hay NADA. Antes bastaba con ParoMin = 0, y eso
  // tapaba un período donde todos los tickets siguen abiertos: no hay cierres (paro 0)
  // pero sí trabajo y pausa acumulados.
  if (!total || (!total.ParoMin && !total.EsperaMin && !total.TrabajoMin && !total.PausaMin)) {
    return (
      <SectionCard titulo="Anatomía del paro del período">
        <Text fontSize={12} color="$textMuted">
          No hay tiempo de paro registrado en el período.
        </Text>
      </SectionCard>
    )
  }

  /* CUATRO tramos desde el estándar de paro (script 86), no tres: faltaba el
     REPROCESO, que es lo que el mecánico volvió a trabajar después de un rechazo.
     Con los cuatro la suma da EXACTO ParoMin y este bloque cuadra con el reporte de
     paro por área y con el web; con tres se quedaba corto y los dos números del mismo
     bloque parecían un error de cálculo.
     Cada porcentaje se saca sobre la suma de los tramos —que es lo que mide la barra—
     y no sobre ParoMin: así los cuatro cierran en 100. Mismo criterio que el web. */
  const totalTramos = total.EsperaMin + total.TrabajoMin + total.PausaMin + total.ReprocesoMin
  const pctEspera = pctDe(total.EsperaMin, totalTramos)
  const pctTrabajo = pctDe(total.TrabajoMin, totalTramos)
  const pctPausa = pctDe(total.PausaMin, totalTramos)
  const pctReproceso = pctDe(total.ReprocesoMin, totalTramos)

  // Variación contra el período anterior (null si no hay con qué comparar).
  const dParo = prev?.ParoMin ? variacion(total.ParoMin, prev.ParoMin) : null
  // El % del período anterior con el MISMO criterio: comparar contra otra base daría
  // un delta inventado.
  const tramosPrev = prev
    ? prev.EsperaMin + prev.TrabajoMin + prev.PausaMin + prev.ReprocesoMin
    : 0
  const pctEsperaPrev = tramosPrev ? pctDe(prev!.EsperaMin, tramosPrev) : null
  const dPctEspera = pctEsperaPrev ? variacion(pctEspera, pctEsperaPrev) : null

  return (
    <SectionCard
      titulo="Anatomía del paro del período"
      subtitulo="Solo el tiempo de un mecánico: lo que esperó, lo que reparó, lo que pausó y lo que retrabajó"
    >
      <XStack flexWrap="wrap" gap="$2">
        <KpiCard
          titulo="PARO TOTAL"
          valor={fmtHoras(total.ParoMin)}
          hint={`${fmtEntero(total.Tickets)} tickets`}
          delta={dParo}
          invertido
        />
        <KpiCard
          titulo="ESPERANDO"
          valor={`${pctEspera}%`}
          hint={fmtHoras(total.EsperaMin)}
          color={COLOR_ESPERA}
          info="Parte del paro en que todavía nadie estaba trabajando en la máquina: el ticket ya existía, pero el mecánico no había empezado."
          delta={dPctEspera}
          invertido
        />
        <KpiCard
          titulo="REPARANDO"
          valor={`${pctTrabajo}%`}
          hint={fmtHoras(total.TrabajoMin)}
          color={COLOR_TRABAJO}
          info="Parte del paro en que un mecánico sí estaba trabajando en la máquina."
        />
        <KpiCard
          titulo="EN PAUSA"
          valor={`${pctPausa}%`}
          hint={fmtHoras(total.PausaMin)}
          color={COLOR_PAUSA}
          info="Parte del paro en que el trabajo ya había empezado pero se detuvo por algo: falta de repuesto, almuerzo, otra máquina más urgente."
        />
        {/* Solo si hubo: en la mayoría de períodos es 0 y una tarjeta en cero es ruido. */}
        {total.ReprocesoMin > 0 && (
          <KpiCard
            titulo="REPROCESO"
            valor={`${pctReproceso}%`}
            hint={fmtHoras(total.ReprocesoMin)}
            color={COLOR_REPROCESO}
            info="Parte del paro que el mecánico volvió a trabajar después de un rechazo de producción: el ticket pasó otra vez a En proceso. Lo que producción tardó en validar o rechazar NO cuenta acá."
            invertido
          />
        )}
      </XStack>

      <BarraApilada
        tramos={[
          { label: `Espera ${pctEspera}%`, pct: pctEspera, color: COLOR_ESPERA },
          { label: `Trabajo ${pctTrabajo}%`, pct: pctTrabajo, color: COLOR_TRABAJO },
          { label: `Pausa ${pctPausa}%`, pct: pctPausa, color: COLOR_PAUSA },
          ...(pctReproceso > 0
            ? [{ label: `Reproceso ${pctReproceso}%`, pct: pctReproceso, color: COLOR_REPROCESO }]
            : []),
        ]}
      />
    </SectionCard>
  )
}

// ── 2. ¿La prioridad ordena la cola? ─────────────────────────────────────────
// Espera hasta el arranque según la prioridad con la que se reportó el ticket:
// si Alta y Baja esperan lo mismo, el campo no está ordenando nada.
function Prioridad({ actual }: { actual: EstadoKpi<IEsperaAnatomia> }) {
  const titulo = '¿La prioridad ordena la cola?'
  // El subtítulo carga la lectura del KPI: así los tres números van desnudos,
  // sin repetir la misma explicación en tres tarjetas.
  const subtitulo =
    'Espera hasta el arranque según la prioridad con que se reportó · si los tres se parecen, el campo no ordena nada'

  if (actual.cargando) {
    return (
      <SectionCard titulo={titulo} subtitulo={subtitulo}>
        <Cargando />
      </SectionCard>
    )
  }
  // El error del endpoint ya se avisa en el titular; aquí no se repite el aviso.
  if (actual.error) return null

  const prioridades = actual.datos
    .filter(r => r.Dim === 'PRIORIDAD')
    .sort((a, b) => a.Orden - b.Orden)

  return (
    <SectionCard titulo={titulo} subtitulo={subtitulo}>
      {prioridades.length ? (
        // Las tres en una sola fila: el valor de este KPI es comparar Alta contra
        // Baja de un vistazo, y en tarjetas separadas quedaban en dos renglones.
        <XStack alignItems="stretch">
          {prioridades.map((p, i) => (
            <React.Fragment key={p.Bucket ?? String(p.Orden)}>
              {i > 0 && <View width={1} backgroundColor="$border" marginVertical={4} />}
              <YStack flex={1} alignItems="center" gap={2} paddingHorizontal="$1.5">
                <Text fontSize={11} fontWeight="700" color="$textMuted" numberOfLines={1}>
                  {p.Bucket ?? '—'}
                </Text>
                <Text
                  fontSize={19}
                  fontWeight="800"
                  color={p.Bucket ? colorPrioridad(p.Bucket) : '$text'}
                  numberOfLines={1}
                >
                  {fmtHM(p.EsperaProm ?? 0)}
                </Text>
                <Text fontSize={10} color="$textMuted" numberOfLines={1}>
                  mediana {fmtHM(p.EsperaMed ?? 0)}
                </Text>
                <Text fontSize={10} color="$textMuted" numberOfLines={1}>
                  {fmtEntero(p.Tickets)} tickets
                </Text>
              </YStack>
            </React.Fragment>
          ))}
        </XStack>
      ) : (
        <Text fontSize={12} color="$textMuted">
          Sin tickets con prioridad en el período.
        </Text>
      )}
    </SectionCard>
  )
}

// ── 3. Espera por área ───────────────────────────────────────────────────────
// Dónde se acumula la espera. Solo áreas con al menos 3 tickets: con 1 o 2 el
// promedio es anécdota, no señal.
const AREAS_MIN_TICKETS = 3
const AREAS_TOP = 12

function EsperaPorArea({ actual }: { actual: EstadoKpi<IEsperaAnatomia> }) {
  const titulo = 'Espera por área'
  const subtitulo = `Promedio de minutos hasta el arranque · áreas con ${AREAS_MIN_TICKETS} o más tickets`

  if (actual.cargando) {
    return (
      <SectionCard titulo={titulo} subtitulo={subtitulo}>
        <Cargando />
      </SectionCard>
    )
  }
  // El error del endpoint ya se avisa en el titular.
  if (actual.error) return null

  const areas = actual.datos
    .filter(r => r.Dim === 'AREA' && r.Tickets >= AREAS_MIN_TICKETS)
    .sort((a, b) => (b.EsperaProm ?? 0) - (a.EsperaProm ?? 0))
    .slice(0, AREAS_TOP)

  return (
    <SectionCard titulo={titulo} subtitulo={subtitulo}>
      <HBarList
        datos={areas.map(a => ({
          label: `${a.Bucket ?? '—'} (${a.Tickets})`,
          value: Math.round(a.EsperaProm ?? 0),
        }))}
        escala={ESCALA_NARANJA}
        formato={v => `${fmtEntero(v)} min`}
        vacioMsg="Sin áreas con suficientes tickets en el período."
      />
    </SectionCard>
  )
}

// ── 4. Espera por máquina ────────────────────────────────────────────────────
// El área puede verse sana en promedio y tener dentro un activo que se pasa
// horas parado. Aquí NO se filtra por número de tickets: una máquina que esperó
// ocho horas una sola vez también es accionable, y el conteo va en la etiqueta
// para que se note cuándo es un caso aislado.
const MAQUINAS_TOP = 12

function EsperaPorMaquina({ actual }: { actual: EstadoKpi<IEsperaAnatomia> }) {
  const titulo = 'Espera por máquina'
  const subtitulo = `Promedio de minutos hasta el arranque · top ${MAQUINAS_TOP} de activos`

  if (actual.cargando) {
    return (
      <SectionCard titulo={titulo} subtitulo={subtitulo}>
        <Cargando />
      </SectionCard>
    )
  }
  // El error del endpoint ya se avisa en el titular.
  if (actual.error) return null

  const maquinas = actual.datos
    .filter(r => r.Dim === 'MAQUINA')
    .sort((a, b) => (b.EsperaProm ?? 0) - (a.EsperaProm ?? 0))
    .slice(0, MAQUINAS_TOP)

  // Si vinieron otras dimensiones pero ninguna de máquina, la base todavía tiene
  // el SP viejo: se dice cuál falta en vez de mostrar un vacío sin explicación.
  const faltaSp = !maquinas.length && actual.datos.some(r => r.Dim === 'AREA')

  return (
    <SectionCard titulo={titulo} subtitulo={subtitulo}>
      {faltaSp ? (
        <Text fontSize={11} color="$textMuted" lineHeight={16}>
          Este indicador necesita el script 55 (Espera por máquina) aplicado en la base. El resto de la pestaña funciona;
          se ve en cuanto se aplique.
        </Text>
      ) : (
        <HBarList
          datos={maquinas.map(m => ({
            label: `${m.Bucket ?? '—'} (${m.Tickets})`,
            value: Math.round(m.EsperaProm ?? 0),
          }))}
          escala={ESCALA_AZUL}
          formato={v => `${fmtEntero(v)} min`}
          vacioMsg="Sin tickets de máquina en el período."
        />
      )}
    </SectionCard>
  )
}

// ── 5. Minutos de paro por motivo de pausa ───────────────────────────────────
// Le pone precio a cada motivo. El motivo es obligatorio al pausar, así que
// "Sin motivo" solo aparece en pausas anteriores a esa regla.
// ════════ Minutos de paro por área (con la meta configurada) ════════
// El MISMO bloque que el web (Análisis › Espera › "Minutos de paro por área"), para
// que los dos tableros digan lo mismo. Complementa a "Espera por área": ahí se ve
// cuánto TARDA en arrancar un área, acá cuánto tiempo TOTAL estuvo parada — un área
// puede arrancar rapidísimo y acumular el mayor paro solo porque tiene más máquinas.
//
// El total de cada fila es la suma de los CUATRO tramos del estándar de paro
// (script 86): espera + trabajo + pausa + reproceso. Con esos cuatro da exacto el
// ParoMin del SP, así que esta pantalla, el reporte semanal por área y el web dicen
// el mismo número. Se usa la suma porque es lo que mide la barra y así los
// porcentajes cierran en 100.
const PARO_AREAS_TOP = 10

function ParoPorArea({
  actual,
  meta,
}: {
  actual: EstadoKpi<IEsperaAnatomia>
  meta: EstadoKpi<IMetaParo>
}) {
  const titulo = 'Minutos de paro por área'
  const subtitulo = 'Solo el tiempo de un mecánico: espera + trabajo + pausa + reproceso'

  if (actual.cargando) {
    return (
      <SectionCard titulo={titulo} subtitulo={subtitulo}>
        <Cargando />
      </SectionCard>
    )
  }
  // El error del endpoint ya se avisa en el titular.
  if (actual.error) return null

  const tramos = (r: IEsperaAnatomia) => r.EsperaMin + r.TrabajoMin + r.PausaMin + r.ReprocesoMin
  const areas = actual.datos
    .filter(r => r.Dim === 'AREA' && tramos(r) > 0)
    .sort((a, b) => tramos(b) - tramos(a))
    .slice(0, PARO_AREAS_TOP)

  // La meta viene en una sola fila. null = no configurada: no se compara contra nada,
  // en vez de inventar un número.
  const m = meta.datos[0]
  const metaPeriodo = m?.MetaAreaPeriodo ?? null
  const sobreMeta = metaPeriodo != null ? areas.filter(a => tramos(a) > metaPeriodo).length : 0

  if (!areas.length) {
    return (
      <SectionCard titulo={titulo} subtitulo={subtitulo}>
        <Text fontSize={12} color="$textMuted">Sin tickets con paro medible en el período.</Text>
      </SectionCard>
    )
  }

  return (
    <SectionCard titulo={titulo} subtitulo={subtitulo}>
      {metaPeriodo != null && (
        <XStack flexWrap="wrap" gap="$2" marginBottom="$3">
          <KpiCard
            titulo="META POR ÁREA"
            valor={fmtHoras(metaPeriodo)}
            hint={`${fmtEntero(m!.MetaAreaSemanal!)} min/sem × ${m!.SemanasPeriodo}`}
          />
          <KpiCard
            titulo="ÁREAS SOBRE LA META"
            valor={`${sobreMeta} / ${areas.length}`}
            color={sobreMeta > 0 ? COLOR_ESPERA : undefined}
          />
        </XStack>
      )}

      <YStack gap="$3">
        {areas.map(a => {
          const total = tramos(a)
          const pct = (v: number) => Math.round((v / total) * 100)
          const excede = metaPeriodo != null && total > metaPeriodo
          return (
            <YStack key={a.Bucket ?? String(total)} gap="$1">
              <XStack justifyContent="space-between" alignItems="center" gap="$2">
                <Text fontSize={13} fontWeight="700" color="$text" flex={1} numberOfLines={1}>
                  {a.Bucket ?? '—'}
                </Text>
                <Text fontSize={13} fontWeight="800" color="$text">
                  {fmtEntero(total)} min
                </Text>
              </XStack>
              {/* Mismos colores y mismo orden que el web: espera, trabajo, pausa,
                  reproceso. El cuarto solo si hubo: casi siempre es 0. */}
              <BarraApilada
                tramos={[
                  { label: `${pct(a.EsperaMin)}%`, pct: pct(a.EsperaMin), color: COLOR_ESPERA },
                  { label: `${pct(a.TrabajoMin)}%`, pct: pct(a.TrabajoMin), color: COLOR_TRABAJO },
                  { label: `${pct(a.PausaMin)}%`, pct: pct(a.PausaMin), color: COLOR_PAUSA },
                  ...(a.ReprocesoMin > 0
                    ? [{
                        label: `${pct(a.ReprocesoMin)}%`,
                        pct: pct(a.ReprocesoMin),
                        color: COLOR_REPROCESO,
                      }]
                    : []),
                ]}
                altura={22}
              />
              <XStack justifyContent="space-between">
                <Text fontSize={10} color="$textMuted">
                  {a.Tickets} {a.Tickets === 1 ? 'ticket' : 'tickets'} · {pct(a.EsperaMin)}% esperando
                </Text>
                {excede && (
                  <Text fontSize={10} fontWeight="700" color={COLOR_ESPERA}>
                    pasa la meta
                  </Text>
                )}
              </XStack>
            </YStack>
          )
        })}
      </YStack>

      {/* Mismo aviso que el web: nombrar las horas que NO están en la barra, porque
          si no la pregunta "y dónde quedaron" no tiene respuesta en pantalla. */}
      <Text fontSize={10} color="$textMuted" marginTop="$2">
        Los cuatro tramos suman exacto el paro, así que este total es el mismo del reporte semanal por área. Fuera
        quedó lo que producción tardó en validar o rechazar: ahí la máquina ya estaba entregada y ningún mecánico
        estaba trabajando.
      </Text>
    </SectionCard>
  )
}

function PausasPorMotivo({ actual }: { actual: EstadoKpi<IPausaMotivo> }) {
  const titulo = 'Minutos de paro por motivo de pausa'
  const subtitulo = 'Cuánto cuesta en minutos cada motivo (el motivo es obligatorio al pausar)'

  if (actual.cargando) {
    return (
      <SectionCard titulo={titulo} subtitulo={subtitulo}>
        <Cargando />
      </SectionCard>
    )
  }
  if (actual.error) return <AvisoIndicador error={actual.error} endpoint="PausasPorMotivo" />

  const motivos = [...actual.datos].sort((a, b) => b.MinPausa - a.MinPausa)
  if (!motivos.length) {
    return (
      <SectionCard titulo={titulo} subtitulo={subtitulo}>
        <Text fontSize={12} color="$textMuted">
          No hubo pausas en el período.
        </Text>
      </SectionCard>
    )
  }

  const minTotal = motivos.reduce((s, p) => s + p.MinPausa, 0)
  const pausasTotal = motivos.reduce((s, p) => s + p.Pausas, 0)
  const abiertas = motivos.reduce((s, p) => s + p.PausasAbiertas, 0)
  const sinMotivo = motivos.find(p => p.Motivo === 'Sin motivo')
  const top = motivos[0]

  return (
    <SectionCard titulo={titulo} subtitulo={subtitulo}>
      <XStack flexWrap="wrap" gap="$2">
        <KpiCard
          titulo="TOTAL EN PAUSA"
          valor={fmtHM(minTotal)}
          hint={`${fmtEntero(pausasTotal)} pausas`}
          info="Minutos en que un trabajo ya empezado estuvo detenido. No incluye la espera antes de arrancar: eso es otra cosa."
        />
        <KpiCard
          titulo="PAUSAS ABIERTAS"
          valor={fmtEntero(abiertas)}
          hint="sin reanudar: no suman minutos"
          info="Pausas que todavía no se reanudaron. No suman minutos porque no se sabe cuándo terminan; si son muchas, el total de arriba está subestimado."
        />
        <KpiCard
          titulo="MOTIVO MÁS COSTOSO"
          valor={top.Motivo ?? 'Sin motivo'}
          valorTamano={14}
          hint={`${fmtHM(top.MinPausa)} · ${fmtEntero(top.TicketsAfectados)} tickets`}
          info="El motivo de pausa que se llevó más minutos en el período. El motivo lo elige el mecánico al pausar y es obligatorio."
        />
      </XStack>

      <HBarList
        datos={motivos.map(p => ({ label: p.Motivo ?? 'Sin motivo', value: Math.round(p.MinPausa) }))}
        escala={ESCALA_ROJA}
        formato={v => `${fmtEntero(v)} min`}
        vacioMsg="Sin pausas en el período."
      />

      {!!sinMotivo && (
        <Text fontSize={10} color="$textMuted" lineHeight={14}>
          "Sin motivo" son pausas anteriores a que el motivo fuera obligatorio ({fmtEntero(sinMotivo.Pausas)} en este
          período); van desapareciendo solas.
        </Text>
      )}
    </SectionCard>
  )
}

// ── 6. Pausas por mecánico y máquina ─────────────────────────────────────────
// El motivo solo no alcanza: 40 horas de "falta de repuestos" pueden ser una
// máquina que se come el inventario o un mecánico que pausa por costumbre, y la
// decisión es distinta en cada caso.
const PAUSAS_DET_PAGINA = 20

function PausasDetalle({ actual }: { actual: EstadoKpi<IPausaDetalle> }) {
  const theme = useTheme()
  const [busca, setBusca] = useState('')
  const [visibles, setVisibles] = useState(PAUSAS_DET_PAGINA)

  const titulo = 'Pausas por mecánico y máquina'
  const subtitulo = 'Quién pausó, en qué activo y por qué motivo — la pausa se atribuye a quien la ejecutó'

  const filas = actual.datos
  const q = busca.trim().toLowerCase()
  const filtradas = q
    ? filas.filter(f =>
        [f.Mecanico, f.Mecanico_UserCode, f.NumeroMaquina, f.Modelo, f.Area, f.MotivoDominante]
          .filter(Boolean)
          .some(v => v!.toLowerCase().includes(q)),
      )
    : filas

  if (actual.cargando) {
    return (
      <SectionCard titulo={titulo} subtitulo={subtitulo}>
        <Cargando />
      </SectionCard>
    )
  }
  if (actual.error) return <AvisoIndicador error={actual.error} endpoint="PausasDetalle" />

  if (!filas.length) {
    return (
      <SectionCard titulo={titulo} subtitulo={subtitulo}>
        <Text fontSize={12} color="$textMuted">
          No se registraron pausas en el período.
        </Text>
      </SectionCard>
    )
  }

  const minTotal = filas.reduce((s, f) => s + f.MinPausa, 0)
  const pausasTotal = filas.reduce((s, f) => s + f.Pausas, 0)
  const abiertas = filas.reduce((s, f) => s + f.PausasAbiertas, 0)
  const mostradas = filtradas.slice(0, visibles)
  const hayMas = visibles < filtradas.length

  return (
    <SectionCard titulo={titulo} subtitulo={subtitulo}>
      <XStack flexWrap="wrap" gap="$2">
        <KpiCard
          titulo="TOTAL EN PAUSA"
          valor={fmtHM(minTotal)}
          hint={`${fmtEntero(pausasTotal)} pausas`}
          info="Suma de los minutos detenidos por pausas cerradas del período."
        />
        <KpiCard
          titulo="COMBINACIONES"
          valor={fmtEntero(filas.length)}
          hint="mecánico + máquina"
          info="Pares mecánico + máquina con al menos una pausa. Si son pocos y concentran los minutos, el problema tiene nombre."
        />
        <KpiCard
          titulo="PAUSAS SIN REANUDAR"
          valor={fmtEntero(abiertas)}
          hint={abiertas > 0 ? 'tiempo aún corriendo' : 'todas cerradas'}
          info="Pausas que nunca se reanudaron: NO suman minutos porque no hay evento que cierre el intervalo. Es tiempo que todavía está corriendo."
        />
      </XStack>

      <XStack
        alignItems="center"
        gap="$2"
        backgroundColor="$backgroundHover"
        borderRadius="$4"
        paddingHorizontal="$3"
        height={44}
      >
        <Search size={18} color={theme.textMuted?.val} />
        <Input
          flex={1}
          unstyled
          placeholder="Buscar por mecánico, activo, área o motivo"
          placeholderTextColor={theme.textMuted?.val}
          color="$text"
          fontSize="$3"
          value={busca}
          onChangeText={t => {
            setBusca(t)
            setVisibles(PAUSAS_DET_PAGINA)
          }}
          autoCapitalize="none"
        />
        {busca.length > 0 && (
          <Text
            onPress={() => setBusca('')}
            pressStyle={{ opacity: 0.6 }}
            color="$textMuted"
            fontSize="$5"
            paddingHorizontal="$1"
          >
            ×
          </Text>
        )}
      </XStack>

      {!filtradas.length ? (
        <Text fontSize={12} color="$textMuted">
          Ninguna combinación coincide con la búsqueda.
        </Text>
      ) : (
        <YStack gap="$2">
          {mostradas.map(f => (
            <YStack
              key={`pd-${f.Mecanico_UserCode}-${f.NumeroMaquina}`}
              backgroundColor="$card2"
              borderWidth={1}
              borderColor="$border"
              borderRadius="$3"
              padding="$2.5"
              gap="$1"
            >
              <XStack justifyContent="space-between" alignItems="center" gap="$2">
                <Text fontSize={13} fontWeight="800" color="$text" flex={1} numberOfLines={1}>
                  {f.Mecanico || f.Mecanico_UserCode || '—'}
                </Text>
                <Text fontSize={13} fontWeight="800" color="$text">
                  {fmtHM(f.MinPausa)}
                </Text>
              </XStack>
              <Text fontSize={11} color="$text" numberOfLines={1}>
                {f.NumeroMaquina || '(sin máquina)'}
                {f.Modelo ? ` · ${f.Modelo}` : ''}
                {f.Area ? ` · ${f.Area}` : ''}
              </Text>
              <Text fontSize={11} color="$textMuted" numberOfLines={2}>
                {f.MotivoDominante || 'Sin motivo'}
              </Text>
              <XStack gap="$3" flexWrap="wrap">
                <Text fontSize={11} color="$textMuted">
                  {fmtEntero(f.Pausas)} {f.Pausas === 1 ? 'pausa' : 'pausas'}
                </Text>
                {f.PausasAbiertas > 0 && (
                  <Text fontSize={11} fontWeight="700" color={COLOR_ESPERA}>
                    {fmtEntero(f.PausasAbiertas)} sin reanudar
                  </Text>
                )}
                {!!f.UltimaPausa && (
                  <Text fontSize={11} color="$textMuted">
                    Última: {new Date(f.UltimaPausa).toLocaleDateString('es-HN')}
                  </Text>
                )}
              </XStack>
            </YStack>
          ))}

          {hayMas && (
            <Text
              onPress={() => setVisibles(v => v + PAUSAS_DET_PAGINA)}
              pressStyle={{ opacity: 0.6 }}
              fontSize={13}
              fontWeight="700"
              color={ACCENT}
              alignSelf="center"
              paddingVertical="$2"
            >
              Ver más ({fmtEntero(filtradas.length - visibles)} restantes)
            </Text>
          )}

          <XStack
            justifyContent="space-between"
            alignItems="center"
            borderTopWidth={1}
            borderColor="$border"
            paddingTop="$2"
          >
            <Text fontSize={13} fontWeight="800" color="$text">
              Total · {fmtEntero(filas.length)} combinaciones
            </Text>
            <Text fontSize={13} fontWeight="800" color="$text">
              {fmtHM(minTotal)}
            </Text>
          </XStack>
        </YStack>
      )}
    </SectionCard>
  )
}
