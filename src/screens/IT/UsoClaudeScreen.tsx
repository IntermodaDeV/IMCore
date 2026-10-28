import React, { useCallback, useMemo, useRef, useState } from 'react'
import { RefreshControl, ScrollView } from 'react-native'
import { Spinner, Text, View, XStack, YStack, useThemeName } from 'tamagui'
import { ChevronLeft, ChevronRight } from 'lucide-react-native'
import { useFocusEffect } from '@react-navigation/native'

import { usePageHeader } from '../../hooks/usePageHeader'
import { useShowToast } from '../../utils/useShowToast'
import { usoClaudeService as svc } from '../../api/modules/usoClaude/usoClaude.service'
import { IUsoClaude } from '../../api/modules/usoClaude/usoClaude.types'
import { shadows } from '../../theme/shadows'

/* ============================================================================
   USO DE CLAUDE en el teléfono — el resumen del mes, nada más.

   Cuánto costó (estimado), cuántas personas lo usaron de cuántos asientos, qué
   asientos no se usaron, el costo y las personas por día, semana o mes, y las
   10 cuentas con más tokens. Los modelos, las herramientas,
   el maestro de cuentas y la importación del CSV quedan en el web: es la misma
   opción de menú ('itUsoClaude'), cada plataforma muestra lo suyo.

   Dos fuentes cruzadas por correo, igual que en el web: la telemetría de Claude
   Code y Cowork (OpenTelemetry) y el CSV de la consola de claude.ai. El costo es
   A PRECIO DE API: con asientos de Team no es lo facturado.
   ============================================================================ */

const ACCENT = '#FF551A'
const PRODUCTOS = ['Todos', 'Code', 'Cowork']

/** yyyy-MM-01 del mes `delta` meses antes del actual. */
const mes = (delta: number) => {
  const h = new Date()
  const d = new Date(h.getFullYear(), h.getMonth() - delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
const finDeMes = (p: string) => {
  const [a, m] = p.split('-').map(Number)
  return `${p.slice(0, 8)}${String(new Date(a, m, 0).getDate()).padStart(2, '0')}`
}
const mesDe = (s: string) => `${s.slice(0, 7)}-01`
/** Solo la primera letra: textTransform capitalize la pone en cada palabra («Octubre De 2026»). */
const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const nombreMes = (p: string) =>
  mayuscula(new Date(Number(p.slice(0, 4)), Number(p.slice(5, 7)) - 1, 1).toLocaleDateString('es-HN', { month: 'long', year: 'numeric' }))

const usd = (n: number) => (n > 0 && n < 0.01 ? '< US$ 0.01'
  : `US$ ${n.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
const entero = (n: number) => Math.round(n).toLocaleString('es-HN')
/** Tiempo activo: minutos hasta una hora, después horas con un decimal. */
const horas = (segundos: number) =>
  segundos <= 0 ? '—' : segundos < 3600 ? `${Math.round(segundos / 60)} min` : `${(segundos / 3600).toFixed(1)} h`
const corto = (n: number) => {
  const a = Math.abs(n)
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M`
  if (a >= 10_000) return `${Math.round(n / 1000).toLocaleString('es-HN')} K`
  return entero(n)
}

/* ── Gráficas por día, semana o mes ──────────────────────────────────────
   Compacto respecto del web: por semana 8 (no 12) y por mes 6 (no 12), y en vez
   de ejes, se toca una barra y arriba sale su valor. Colores del web (paleta
   validada): Code azul, Cowork naranja, personas violeta. */

type Escala = 'dia' | 'semana' | 'mes'
const ESCALAS: { v: Escala; t: string }[] = [{ v: 'dia', t: 'Día' }, { v: 'semana', t: 'Semana' }, { v: 'mes', t: 'Mes' }]
const SEMANAS = 8
const MESES_GRAFICA = 6

const COLOR_PRODUCTO = (oscuro: boolean): Record<string, string> => ({
  Code: oscuro ? '#3987e5' : '#2a78d6',
  Cowork: oscuro ? '#d95926' : '#eb6834',
})
const COLOR_CON_USO = (oscuro: boolean) => (oscuro ? '#9085e9' : '#4a3aa7')

const diaDe = (s: string) => new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)))
const isoDe = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const sumarDias = (s: string, n: number) => {
  const d = diaDe(s)
  d.setDate(d.getDate() + n)
  return isoDe(d)
}
const diaMes = (s: string) => diaDe(s).toLocaleDateString('es-HN', { day: 'numeric', month: 'short' })

interface Tramo { desde: string; hasta: string; etiqueta: string; corta: string }

/** Por día, los del mes hasta hoy; por semana (lunes a domingo), las 8 que terminan en ese día; por mes, 6. */
function tramos(escala: Escala, periodo: string): Tramo[] {
  const r: Tramo[] = []
  if (escala === 'mes') {
    for (let i = MESES_GRAFICA - 1; i >= 0; i--) {
      const d = new Date(Number(periodo.slice(0, 4)), Number(periodo.slice(5, 7)) - 1 - i, 1)
      const p = isoDe(d)
      r.push({ desde: p, hasta: finDeMes(p), etiqueta: nombreMes(p), corta: d.toLocaleDateString('es-HN', { month: 'short' }) })
    }
    return r
  }
  const hoy = isoDe(new Date())
  const fin = finDeMes(periodo) < hoy ? finDeMes(periodo) : hoy
  if (escala === 'dia') {
    for (let d = periodo; d <= fin; d = sumarDias(d, 1)) {
      r.push({
        desde: d, hasta: d, corta: String(Number(d.slice(8, 10))),
        etiqueta: mayuscula(diaDe(d).toLocaleDateString('es-HN', { weekday: 'long', day: 'numeric', month: 'long' })),
      })
    }
    return r
  }
  const lunes = sumarDias(fin, -((diaDe(fin).getDay() + 6) % 7))
  for (let i = SEMANAS - 1; i >= 0; i--) {
    const desde = sumarDias(lunes, -7 * i)
    const hasta = sumarDias(desde, 6)
    r.push({ desde, hasta, etiqueta: `Semana del ${diaMes(desde)} al ${diaMes(hasta)}`, corta: diaMes(desde) })
  }
  return r
}
const enTramo = (fecha: string, t: Tramo) => fecha.slice(0, 10) >= t.desde && fecha.slice(0, 10) <= t.hasta

interface Persona {
  email: string
  nombre: string | null
  conAsiento: boolean
  conCuenta: boolean
  dias: number
  diasCsv: number
  sesiones: number
  prompts: number
  costo: number
  tokens: number
  /** Los tokens por producto (Code, Cowork), para la barra del top 10. */
  tokensPor: Record<string, number>
  lineas: number
  commits: number
  /** Tiempo activo de Claude Code (active_time.total, user + cli). */
  segundos: number
  csvActivo: boolean
  /** Lo usó en el mes según un archivo de 30/60/90 días que termina en el mes (sin días ni detalle). */
  consola: boolean
}

/**
 * El archivo de 30, 60 o 90 días que termina en el mes, el más reciente. De él solo vale la
 * última actividad, y solo para ese mes: si cae en el mes lo usó; si cae antes, no lo usó del 1
 * hasta el fin del archivo. Igual que el web (usoClaudeUi.ts › ventanaDelMes).
 */
function ventanaDelMes(datos: IUsoClaude, periodo: string) {
  let mejor: { id: number; desde: string; hasta: string } | null = null
  for (const v of datos.Ventanas ?? []) {
    if (mesDe(v.Hasta) !== periodo) continue
    if (!mejor || v.Hasta > mejor.hasta || (v.Hasta === mejor.hasta && v.Desde < mejor.desde)) {
      mejor = { id: v.ImportacionId, desde: v.Desde, hasta: v.Hasta }
    }
  }
  return mejor
}

/** La persona del mes por correo. El producto filtra SOLO la telemetría: el CSV no viene partido por producto. */
function personasDelMes(datos: IUsoClaude, periodo: string, producto: string): Persona[] {
  const mapa = new Map<string, Persona>()
  const de = (email: string, nombre?: string | null) => {
    const e = email.toLowerCase()
    let p = mapa.get(e)
    if (!p) {
      p = { email: e, nombre: nombre ?? null, conAsiento: false, conCuenta: false, dias: 0, diasCsv: 0, sesiones: 0,
        prompts: 0, costo: 0, tokens: 0, tokensPor: {}, lineas: 0, commits: 0, segundos: 0, csvActivo: false, consola: false }
      mapa.set(e, p)
    } else if (!p.nombre && nombre) p.nombre = nombre
    return p
  }
  for (const a of datos.Asientos) {
    if (mesDe(a.Periodo) !== periodo) continue
    const p = de(a.Email, a.Nombre)
    p.conAsiento = true
    p.conCuenta = true
  }
  for (const m of datos.Mensual) {
    if (mesDe(m.Periodo) !== periodo || (producto !== 'Todos' && m.Producto !== producto)) continue
    const p = de(m.Email, m.Nombre)
    if (m.CuentaId) p.conCuenta = true
    p.dias = (producto === 'Todos' ? m.DiasActivosTotal : m.DiasActivos) ?? 0
    p.sesiones += m.Sesiones
    p.prompts += m.Prompts
    p.costo += m.CostoUsd
    const tokens = m.TokensEntrada + m.TokensSalida + m.TokensCacheLectura + m.TokensCacheCreacion
    p.tokens += tokens
    p.tokensPor[m.Producto] = (p.tokensPor[m.Producto] ?? 0) + tokens
    p.lineas += m.LineasAgregadas
    p.commits += m.Commits
    p.segundos += m.SegundosUsuario + m.SegundosCli
  }
  for (const v of datos.Csv) {
    if (mesDe(v.Periodo) !== periodo) continue
    const p = de(v.Email, v.Nombre)
    if (v.Clave === 'dias_activos') p.diasCsv = Math.max(p.diasCsv, v.Valor)
    if (v.Clave !== 'gasto_estimado_usd' && v.Valor > 0) p.csvActivo = true
  }
  const ventana = ventanaDelMes(datos, periodo)
  for (const v of datos.Ventanas ?? []) {
    if (v.ImportacionId !== ventana?.id || !v.UltimaActividad || v.UltimaActividad.slice(0, 10) < periodo) continue
    de(v.Email, v.Nombre).consola = true
  }
  return [...mapa.values()]
}

const conUso = (p: Persona) => p.dias > 0 || p.costo > 0 || p.diasCsv > 0 || p.csvActivo || p.consola
/** Una ventana dice QUE lo usó, no cuántos días: el promedio es de quien los tiene medidos. */
const conDias = (p: Persona) => p.dias > 0 || p.diasCsv > 0

export default function UsoClaudeScreen() {
  const { showToast } = useShowToast()
  const oscuro = String(useThemeName()).includes('dark')

  usePageHeader({
    center: <Text fontSize="$4" fontWeight="700" color="$text">Uso de Claude</Text>,
  })

  // Se puede ir hasta 11 meses atrás, como el web.
  const [atras, setAtras] = useState(0)
  const [producto, setProducto] = useState('Todos')
  const [escala, setEscala] = useState<Escala>('dia')
  const [datos, setDatos] = useState<IUsoClaude | null>(null)
  /** El mes de `datos`: cambiar de escala recarga sin tapar la pantalla; cambiar de mes, sí. */
  const [periodoDatos, setPeriodoDatos] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [sel, setSel] = useState<{ clave: string; i: number } | null>(null)
  const pedido = useRef(0)

  const periodo = mes(atras)
  const anterior = mes(atras + 1)
  const barras = useMemo(() => tramos(escala, periodo), [escala, periodo])
  // El mes anterior siempre (la comparación del costo); más atrás, lo que pida la gráfica.
  const desde = barras[0] && mesDe(barras[0].desde) < anterior ? mesDe(barras[0].desde) : anterior

  const cargar = useCallback(async () => {
    const n = ++pedido.current
    try {
      const res = await svc.obtener(desde, finDeMes(periodo))
      if (n !== pedido.current) return
      if (res.Success) {
        setDatos(res.Data)
        setPeriodoDatos(periodo)
      } else showToast('error', 'No se pudo cargar', res.ErrorMessage || 'Intentá de nuevo')
    } catch (e: any) {
      if (n === pedido.current) showToast('error', 'Error', e?.message || 'No se pudo cargar el uso')
    } finally {
      if (n === pedido.current) {
        setCargando(false)
        setRefrescando(false)
      }
    }
  }, [periodo, desde, showToast])

  useFocusEffect(useCallback(() => { setCargando(true); cargar() }, [cargar]))

  const personas = useMemo(() => (datos ? personasDelMes(datos, periodo, producto) : []), [datos, periodo, producto])

  const k = useMemo(() => {
    const usan = personas.filter(conUso)
    const conHoras = usan.filter(p => p.dias > 0 && p.segundos > 0)
    const suma = (f: (p: Persona) => number) => personas.reduce((a, p) => a + f(p), 0)
    const costoAnterior = datos ? datos.Mensual
      .filter(m => mesDe(m.Periodo) === anterior && (producto === 'Todos' || m.Producto === producto))
      .reduce((a, m) => a + m.CostoUsd, 0) : 0
    return {
      costo: suma(p => p.costo),
      costoAnterior,
      activos: usan.length,
      asientos: personas.filter(p => p.conAsiento).length,
      sinUso: personas.filter(p => p.conAsiento && !conUso(p)),
      sinAsiento: usan.filter(p => !p.conCuenta).length,
      conDias: usan.filter(conDias).length,
      dias: usan.some(conDias) ? usan.filter(conDias).reduce((a, p) => a + Math.max(p.dias, p.diasCsv), 0) / usan.filter(conDias).length : 0,
      sesiones: suma(p => p.sesiones),
      prompts: suma(p => p.prompts),
      tokens: suma(p => p.tokens),
      lineas: suma(p => p.lineas),
      commits: suma(p => p.commits),
      // Tiempo activo entre días con uso: la cuenta con más y el promedio de todas.
      masHoras: conHoras.reduce<Persona | null>((m, p) => (!m || p.segundos / p.dias > m.segundos / m.dias ? p : m), null),
      horasEquipo: conHoras.length ? conHoras.reduce((a, p) => a + p.segundos, 0) / conHoras.reduce((a, p) => a + p.dias, 0) : 0,
      // Las 10 con más tokens, como el web. Quien solo sale en la consola no tiene tokens: no entra.
      top: usan.filter(p => p.tokens > 0).sort((a, b) => b.tokens - a.tokens).slice(0, 10),
    }
  }, [personas, datos, anterior, producto])

  const delta = k.costoAnterior > 0 ? ((k.costo - k.costoAnterior) * 100) / k.costoAnterior : null

  /* ── Costo y personas por tramo ──────────────────────────────────────────
     Por mes, de lo mensual (las personas suman la consola); por día y por semana,
     de la telemetría diaria: la consola no trae días. */
  const productos = useMemo(() => (producto === 'Todos' ? ['Code', 'Cowork'] : [producto]), [producto])
  const colores = COLOR_PRODUCTO(oscuro)
  const sinDiario = escala !== 'mes' && !!datos && !datos.Diario
  const serie = useMemo(() => {
    if (!datos) return []
    const diario = (datos.Diario ?? []).filter(d => producto === 'Todos' || d.Producto === producto)
    return barras.map(t => ({
      ...t,
      costo: productos.map(prod => (escala === 'mes'
        ? datos.Mensual.filter(m => mesDe(m.Periodo) === t.desde && m.Producto === prod).reduce((a, m) => a + m.CostoUsd, 0)
        : diario.filter(d => d.Producto === prod && enTramo(d.Fecha, t)).reduce((a, d) => a + d.CostoUsd, 0))),
      personas: escala === 'mes'
        ? personasDelMes(datos, t.desde, producto).filter(conUso).length
        : new Set(diario.filter(d => enTramo(d.Fecha, t)).map(d => d.Email.toLowerCase())).size,
    }))
  }, [datos, barras, escala, producto, productos])
  const clave = `${escala}|${periodo}|${producto}`
  const iSel = sel?.clave === clave && sel.i < serie.length ? sel.i : serie.length - 1
  const tramoSel = serie[iSel]
  const maxTokens = k.top[0]?.tokens ?? 0

  /** Hasta dónde llega lo de la consola en este mes: el mes en curso se importa por partes. */
  const cobertura = useMemo(() => {
    const dia = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`
    const v = datos?.Csv.find(x => mesDe(x.Periodo) === periodo && x.Desde && x.Hasta)
    if (!v) {
      const w = datos ? ventanaDelMes(datos, periodo) : null
      return w ? `Consola: quién lo usó al ${dia(w.hasta)} (archivo del ${dia(w.desde)} al ${dia(w.hasta)})` : null
    }
    const tramo = Math.round((new Date(v.Hasta!).getTime() - new Date(v.Desde!).getTime()) / 86400000) + 1
    return `Consola: del ${dia(v.Desde!)} al ${dia(v.Hasta!)}${(v.DiasCubiertos ?? tramo) < tramo ? ' (con huecos)' : ''}`
  }, [datos, periodo])

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}
      refreshControl={
        <RefreshControl refreshing={refrescando} tintColor={ACCENT}
          onRefresh={() => { setRefrescando(true); cargar() }} />
      }
    >
      {/* Mes: anterior / siguiente. Doce opciones no caben en una fila y un
          desplegable sería un toque más para lo que más se cambia. */}
      <XStack alignItems="center" justifyContent="space-between" borderWidth={1} borderColor="$border"
        borderRadius="$4" backgroundColor="$backgroundElevated" paddingHorizontal="$2" height={44}>
        <View padding="$2" opacity={atras >= 11 ? 0.3 : 1} pressStyle={{ opacity: 0.6 }}
          onPress={() => atras < 11 && setAtras(atras + 1)}>
          <ChevronLeft size={20} />
        </View>
        <Text fontWeight="800" fontSize="$4" color="$text">{nombreMes(periodo)}</Text>
        <View padding="$2" opacity={atras === 0 ? 0.3 : 1} pressStyle={{ opacity: 0.6 }}
          onPress={() => atras > 0 && setAtras(atras - 1)}>
          <ChevronRight size={20} />
        </View>
      </XStack>

      <XStack borderWidth={1} borderColor="$border" borderRadius="$4" padding="$1"
        backgroundColor="$backgroundElevated" gap="$1">
        {PRODUCTOS.map(p => (
          <View key={p} flex={1} onPress={() => setProducto(p)} pressStyle={{ opacity: 0.85 }}
            backgroundColor={producto === p ? ACCENT : 'transparent'} borderRadius="$3" height={34}
            alignItems="center" justifyContent="center">
            <Text fontWeight="800" fontSize="$2" color={producto === p ? '#fff' : '$textMuted'}>{p}</Text>
          </View>
        ))}
      </XStack>

      {!cargando && datos && (
        <Text fontSize="$1" color="$textMuted" textAlign="center">{cobertura ?? 'Sin CSV de la consola para este mes'}</Text>
      )}

      {cargando && periodoDatos !== periodo ? (
        <YStack alignItems="center" paddingTop="$8"><Spinner size="large" color={ACCENT} /></YStack>
      ) : !datos ? null : k.activos === 0 && k.asientos === 0 ? (
        <Text color="$textMuted" textAlign="center" paddingTop="$6">Sin actividad en {nombreMes(periodo).toLowerCase()}.</Text>
      ) : (
        <>
          <YStack backgroundColor="$backgroundElevated" borderRadius="$4" borderWidth={1}
            borderColor="$border" padding="$4" gap="$1" {...shadows.sm}>
            <Text fontSize="$2" fontWeight="800" color="$textMuted" textTransform="uppercase">Costo estimado</Text>
            <Text fontSize={38} fontWeight="900" lineHeight={44} color="$text">{usd(k.costo)}</Text>
            <Text fontSize="$2" color="$textMuted">
              A precio de API{delta == null ? '' : ` · ${delta >= 0 ? '+' : ''}${delta.toFixed(0)}% contra el mes anterior`}
            </Text>
          </YStack>

          <XStack gap="$3">
            <Mini titulo="Personas con uso" valor={entero(k.activos)}
              pie={k.asientos ? `de ${entero(k.asientos)} asientos` : 'sin asientos registrados'} />
            <Mini titulo="Asientos sin uso" valor={entero(k.sinUso.length)}
              color={k.sinUso.length > 0 ? '#ea580c' : undefined}
              pie={k.sinAsiento ? `${k.sinAsiento} con uso y sin asiento` : 'con asiento y sin actividad'} />
          </XStack>
          <XStack gap="$3">
            <Mini titulo="Días con uso" valor={k.conDias ? k.dias.toFixed(1) : '—'}
              pie={k.conDias < k.activos ? `promedio de ${k.conDias} con días medidos` : 'promedio por persona'} />
            <Mini titulo="Más horas al día" valor={k.masHoras ? horas(k.masHoras.segundos / k.masHoras.dias) : '—'}
              pie={k.masHoras ? `${k.masHoras.nombre || k.masHoras.email} · promedio ${horas(k.horasEquipo)}` : 'sin tiempo activo medido'} />
          </XStack>
          <XStack gap="$3">
            <Mini titulo="Sesiones" valor={entero(k.sesiones)} pie={`${entero(k.prompts)} prompts`} />
            <Mini titulo="Tokens" valor={corto(k.tokens)} pie="entrada, salida y caché" />
          </XStack>
          {producto !== 'Cowork' && (
            <Mini titulo="Código" valor={`+${corto(k.lineas)}`} pie={`líneas · ${entero(k.commits)} commits`} />
          )}

          {serie.length > 0 && tramoSel && (
            <YStack backgroundColor="$backgroundElevated" borderRadius="$4" borderWidth={1}
              borderColor="$border" padding="$3.5" gap="$2.5" {...shadows.sm}>
              <XStack borderWidth={1} borderColor="$border" borderRadius="$3" padding={2} gap={2}>
                {ESCALAS.map(e => (
                  <View key={e.v} flex={1} onPress={() => setEscala(e.v)} pressStyle={{ opacity: 0.85 }}
                    backgroundColor={escala === e.v ? ACCENT : 'transparent'} borderRadius="$2" height={28}
                    alignItems="center" justifyContent="center">
                    <Text fontWeight="800" fontSize="$1" color={escala === e.v ? '#fff' : '$textMuted'}>{e.t}</Text>
                  </View>
                ))}
              </XStack>

              <XStack justifyContent="center" alignItems="center" gap="$2" minHeight={18}>
                <Text fontSize="$2" fontWeight="700" color="$text" numberOfLines={1}>
                  {tramoSel.etiqueta}
                </Text>
                {cargando && <Spinner size="small" color={ACCENT} />}
              </XStack>
              {sinDiario && (
                <Text fontSize="$1" color="#ea580c" textAlign="center">La API publicada todavía no trae el detalle por día.</Text>
              )}

              <YStack gap="$1.5">
                <XStack justifyContent="space-between" alignItems="baseline">
                  <Text fontSize={10} fontWeight="800" color="$textMuted" textTransform="uppercase">Costo estimado</Text>
                  <Text fontSize="$4" fontWeight="800" color="$text">{usd(tramoSel.costo.reduce((a, x) => a + x, 0))}</Text>
                </XStack>
                <Columnas valores={serie.map(t => t.costo)} colores={productos.map(p => colores[p])}
                  sel={iSel} onSel={i => setSel({ clave, i })} alto={76} oscuro={oscuro} />
              </YStack>

              <YStack gap="$1.5">
                <XStack justifyContent="space-between" alignItems="baseline">
                  <Text fontSize={10} fontWeight="800" color="$textMuted" textTransform="uppercase">
                    Personas con uso{escala === 'mes' ? '' : ' (telemetría)'}
                  </Text>
                  <Text fontSize="$4" fontWeight="800" color="$text">{entero(tramoSel.personas)}</Text>
                </XStack>
                <Columnas valores={serie.map(t => [t.personas])} colores={[COLOR_CON_USO(oscuro)]}
                  sel={iSel} onSel={i => setSel({ clave, i })} alto={52} oscuro={oscuro} />
                <XStack gap={separacion(serie.length)} height={14}>
                  {serie.map((t, i) => (
                    <View key={t.desde} flex={1}>
                      {(escala === 'dia' ? i % 7 === 0 : escala === 'semana' ? (serie.length - 1 - i) % 2 === 0 : true) && (
                        <Text position="absolute" left="50%" marginLeft={-24} width={48} textAlign="center"
                          fontSize={9} color="$textMuted" numberOfLines={1}>{t.corta}</Text>
                      )}
                    </View>
                  ))}
                </XStack>
              </YStack>

              <XStack justifyContent="space-between" alignItems="center">
                <XStack gap="$3">
                  {productos.length > 1 && productos.map(p => (
                    <XStack key={p} gap={5} alignItems="center">
                      <View width={8} height={8} borderRadius={4} backgroundColor={colores[p]} />
                      <Text fontSize="$1" color="$textMuted">{p}</Text>
                    </XStack>
                  ))}
                </XStack>
                <Text fontSize="$1" color="$textMuted">Toca una barra</Text>
              </XStack>
            </YStack>
          )}

          {k.top.length > 0 && (
            <YStack backgroundColor="$backgroundElevated" borderRadius="$4" borderWidth={1}
              borderColor="$border" padding="$3.5" gap="$2.5" {...shadows.sm}>
              <Text fontSize="$2" fontWeight="800" color="$textMuted" textTransform="uppercase">Top 10 cuentas por tokens</Text>
              {k.top.map((p, i) => (
                <YStack key={p.email} gap={5}
                  borderTopWidth={i === 0 ? 0 : 1} borderTopColor="$border" paddingTop={i === 0 ? 0 : '$2.5'}>
                  <XStack justifyContent="space-between" alignItems="center" gap="$2">
                    <Text flex={1} fontSize="$3" color="$text" numberOfLines={1}>{p.nombre || p.email}</Text>
                    <Text fontSize="$3" fontWeight="800" color="$text">{corto(p.tokens)}</Text>
                  </XStack>
                  <XStack width={`${maxTokens > 0 ? Math.max(2, (p.tokens * 100) / maxTokens) : 0}%`} height={6} gap={2}>
                    {productos.filter(prod => (p.tokensPor[prod] ?? 0) > 0).map((prod, j, lista) => (
                      <View key={prod} flex={p.tokensPor[prod]} backgroundColor={colores[prod]}
                        borderTopLeftRadius={j === 0 ? 3 : 0} borderBottomLeftRadius={j === 0 ? 3 : 0}
                        borderTopRightRadius={j === lista.length - 1 ? 3 : 0} borderBottomRightRadius={j === lista.length - 1 ? 3 : 0} />
                    ))}
                  </XStack>
                  <Text fontSize="$1" color="$textMuted" numberOfLines={1}>
                    {usd(p.costo)} · {plural(Math.max(p.dias, p.diasCsv), 'día', 'días')}{p.sesiones ? ` · ${plural(p.sesiones, 'sesión', 'sesiones')}` : ''}
                  </Text>
                </YStack>
              ))}
            </YStack>
          )}

          {k.sinUso.length > 0 && (
            <YStack backgroundColor="$backgroundElevated" borderRadius="$4" borderWidth={1}
              borderColor="$border" padding="$3.5" gap="$2" {...shadows.sm}>
              <Text fontSize="$2" fontWeight="800" color="$textMuted" textTransform="uppercase">
                Asientos sin uso ({k.sinUso.length})
              </Text>
              {k.sinUso.map(p => (
                <YStack key={p.email}>
                  <Text fontSize="$3" color="$text" numberOfLines={1}>{p.nombre || p.email}</Text>
                  {p.nombre && <Text fontSize="$1" color="$textMuted" numberOfLines={1}>{p.email}</Text>}
                </YStack>
              ))}
            </YStack>
          )}

          <Text fontSize="$1" color="$textMuted" textAlign="center">
            Modelos, herramientas, cuentas e importación del CSV están en el sistema web.
          </Text>
        </>
      )}
    </ScrollView>
  )
}

const separacion = (n: number) => (n > 16 ? 2 : 6)
const plural = (n: number, uno: string, varios: string) => `${entero(n)} ${n === 1 ? uno : varios}`

/**
 * Columnas hechas a mano (apiladas si hay más de un valor por tramo): con 31 días hay que poder
 * tocar cada una, y toda la altura de la columna es el blanco del toque, no solo la barra.
 */
function Columnas({ valores, colores, sel, onSel, alto, oscuro }: {
  valores: number[][]
  colores: string[]
  sel: number
  onSel: (i: number) => void
  alto: number
  oscuro: boolean
}) {
  const max = Math.max(0, ...valores.map(v => v.reduce((a, x) => a + x, 0)))
  return (
    <XStack height={alto} alignItems="flex-end" gap={separacion(valores.length)}
      borderBottomWidth={1} borderBottomColor="$border">
      {valores.map((v, i) => (
        <YStack key={i} flex={1} height="100%" justifyContent="flex-end" gap={1} borderTopLeftRadius={3} borderTopRightRadius={3}
          backgroundColor={i === sel ? (oscuro ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.07)') : 'transparent'}
          onPress={() => onSel(i)}>
          {/* De abajo hacia arriba en el orden de la serie: el primero queda en la base. */}
          {v.map((x, j) => ({ x, j })).filter(s => s.x > 0).reverse().map((s, k) => (
            <View key={s.j} height={max > 0 ? Math.max(2, (s.x / max) * (alto - 6)) : 0} backgroundColor={colores[s.j]}
              borderTopLeftRadius={k === 0 ? 2 : 0} borderTopRightRadius={k === 0 ? 2 : 0} />
          ))}
        </YStack>
      ))}
    </XStack>
  )
}

function Mini({ titulo, valor, pie, color }: { titulo: string; valor: string; pie: string; color?: string }) {
  return (
    <YStack flex={1} backgroundColor="$backgroundElevated" borderRadius="$4" borderWidth={1}
      borderColor="$border" padding="$3" gap="$1" {...shadows.sm}>
      <Text fontSize={10} fontWeight="800" color="$textMuted" textTransform="uppercase">{titulo}</Text>
      <Text fontSize="$7" fontWeight="800" color={color ?? '$text'}>{valor}</Text>
      <Text fontSize="$1" color="$textMuted">{pie}</Text>
    </YStack>
  )
}
