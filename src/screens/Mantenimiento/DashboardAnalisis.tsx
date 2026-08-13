import React, { useEffect, useState } from 'react'
import { Input, Spinner, Text, View, XStack, YStack, useTheme } from 'tamagui'
import { AlertCircle, Search } from 'lucide-react-native'

import { ticketsService } from '../../api/modules/mantenimiento/tickets.service'
import { ExecutionResponse } from '../../api/modules/response.type'
import {
  IEsperaAnatomia,
  IPausaDetalle,
  IPausaMotivo,
} from '../../api/modules/mantenimiento/tickets.types'
import {
  ACCENT,
  COLOR_ESPERA,
  COLOR_PAUSA,
  COLOR_TRABAJO,
  ESCALA_AZUL,
  ESCALA_NARANJA,
  ESCALA_ROJA,
  colorPrioridad,
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

// Lo detenido "ahora" se mide en días, no en horas: 12 646 min es 8d 19h, y
// "210h 46m" no lo lee nadie.
const fmtDetenido = (min: number) => {
  const m = Math.max(0, Math.round(min))
  if (m < 1440) return fmtHM(m)
  const d = Math.floor(m / 1440)
  const h = Math.round((m % 1440) / 60)
  return h > 0 ? `${d}d ${h}h` : `${d}d`
}

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
}

export function DashboardAnalisis({ desde, hasta, desdePrev, hastaPrev, tipoDest }: AnalisisProps) {
  // 'Todos' viaja como undefined: el SP interpreta NULL como "sin filtro".
  const tipoParam = tipoDest === 'Todos' ? undefined : tipoDest

  // Una sola llamada a EsperaAnatomia alimenta el titular del paro (Dim=TOTAL),
  // la prioridad (Dim=PRIORIDAD) y las áreas (Dim=AREA).
  const anatomia = useKpi<IEsperaAnatomia>(
    () => ticketsService.getEsperaAnatomia(desde, hasta, tipoParam),
    [desde, hasta, tipoParam],
  )
  const anatomiaPrev = useKpi<IEsperaAnatomia>(
    () => ticketsService.getEsperaAnatomia(desdePrev, hastaPrev, tipoParam),
    [desdePrev, hastaPrev, tipoParam],
  )

  const pausas = useKpi<IPausaMotivo>(
    () => ticketsService.getPausasPorMotivo(desde, hasta, tipoParam),
    [desde, hasta, tipoParam],
  )

  // PausasPorMotivo dice POR QUÉ se pausa; ésta, QUIÉN y EN QUÉ.
  const pausasDet = useKpi<IPausaDetalle>(
    () => ticketsService.getPausasDetalle(desde, hasta, tipoParam),
    [desde, hasta, tipoParam],
  )

  return (
    <YStack gap="$3">
      <TitularParo actual={anatomia} previo={anatomiaPrev} />
      <Prioridad actual={anatomia} />
      <EsperaPorArea actual={anatomia} />
      <EsperaPorMaquina actual={anatomia} />
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
  // Se incrementa al hacer "pull to refresh": obliga a re-pedir el dato vivo.
  recarga = 0,
}: {
  desde: string
  hasta: string
  tipoDest: 'Todos' | 'MAQUINA' | 'AREA'
  recarga?: number
}) {
  const tipoParam = tipoDest === 'Todos' ? undefined : tipoDest
  // Mismo endpoint que ya usa Análisis; el rango va porque el SP lo pide, pero
  // estas filas no lo usan.
  const { datos, cargando, error } = useKpi<IEsperaAnatomia>(
    () => ticketsService.getEsperaAnatomia(desde, hasta, tipoParam),
    [desde, hasta, tipoParam, recarga],
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

  if (!total || !total.ParoMin) {
    return (
      <SectionCard titulo="Anatomía del paro del período">
        <Text fontSize={12} color="$textMuted">
          No hay tiempo de paro registrado en el período.
        </Text>
      </SectionCard>
    )
  }

  const pctEspera = pctDe(total.EsperaMin, total.ParoMin)
  const pctTrabajo = pctDe(total.TrabajoMin, total.ParoMin)
  // El resto, para que los tres tramos siempre sumen 100 aunque se redondee.
  const pctPausa = Math.max(0, 100 - pctEspera - pctTrabajo)

  // Variación contra el período anterior (null si no hay con qué comparar).
  const dParo = prev?.ParoMin ? variacion(total.ParoMin, prev.ParoMin) : null
  const pctEsperaPrev = prev?.ParoMin ? pctDe(prev.EsperaMin, prev.ParoMin) : null
  const dPctEspera = pctEsperaPrev ? variacion(pctEspera, pctEsperaPrev) : null

  return (
    <SectionCard
      titulo="Anatomía del paro del período"
      subtitulo="Todo el tiempo que las máquinas estuvieron paradas, partido en lo que se esperó y lo que se reparó"
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
      </XStack>

      <BarraApilada
        tramos={[
          { label: `Espera ${pctEspera}%`, pct: pctEspera, color: COLOR_ESPERA },
          { label: `Trabajo ${pctTrabajo}%`, pct: pctTrabajo, color: COLOR_TRABAJO },
          { label: `Pausa ${pctPausa}%`, pct: pctPausa, color: COLOR_PAUSA },
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
