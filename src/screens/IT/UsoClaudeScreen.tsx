import React, { useCallback, useMemo, useState } from 'react'
import { RefreshControl, ScrollView } from 'react-native'
import { Spinner, Text, View, XStack, YStack } from 'tamagui'
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
   asientos no se usaron, y quiénes lo usan más. Los modelos, las herramientas,
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
const nombreMes = (p: string) =>
  new Date(Number(p.slice(0, 4)), Number(p.slice(5, 7)) - 1, 1).toLocaleDateString('es-HN', { month: 'long', year: 'numeric' })

const usd = (n: number) => (n > 0 && n < 0.01 ? '< US$ 0.01'
  : `US$ ${n.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
const entero = (n: number) => Math.round(n).toLocaleString('es-HN')
const corto = (n: number) => {
  const a = Math.abs(n)
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M`
  if (a >= 10_000) return `${Math.round(n / 1000).toLocaleString('es-HN')} K`
  return entero(n)
}

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
  lineas: number
  commits: number
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
        prompts: 0, costo: 0, tokens: 0, lineas: 0, commits: 0, csvActivo: false, consola: false }
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
    p.tokens += m.TokensEntrada + m.TokensSalida + m.TokensCacheLectura + m.TokensCacheCreacion
    p.lineas += m.LineasAgregadas
    p.commits += m.Commits
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

  usePageHeader({
    center: <Text fontSize="$4" fontWeight="700" color="$text">Uso de Claude</Text>,
  })

  // Se puede ir hasta 11 meses atrás, como el web.
  const [atras, setAtras] = useState(0)
  const [producto, setProducto] = useState('Todos')
  const [datos, setDatos] = useState<IUsoClaude | null>(null)
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)

  const periodo = mes(atras)
  const anterior = mes(atras + 1)

  const cargar = useCallback(async () => {
    try {
      const res = await svc.obtener(anterior, finDeMes(periodo))
      if (res.Success) setDatos(res.Data)
      else showToast('error', 'No se pudo cargar', res.ErrorMessage || 'Intentá de nuevo')
    } catch (e: any) {
      showToast('error', 'Error', e?.message || 'No se pudo cargar el uso')
    } finally {
      setCargando(false)
      setRefrescando(false)
    }
  }, [periodo, anterior, showToast])

  useFocusEffect(useCallback(() => { setCargando(true); cargar() }, [cargar]))

  const personas = useMemo(() => (datos ? personasDelMes(datos, periodo, producto) : []), [datos, periodo, producto])

  const k = useMemo(() => {
    const usan = personas.filter(conUso)
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
      // Quien solo sale en un archivo de 30/60/90 días no tiene con qué ordenarse: no entra a la lista.
      top: usan.filter(p => p.costo > 0 || conDias(p))
        .sort((a, b) => b.costo - a.costo || Math.max(b.dias, b.diasCsv) - Math.max(a.dias, a.diasCsv)).slice(0, 10),
    }
  }, [personas, datos, anterior, producto])

  const delta = k.costoAnterior > 0 ? ((k.costo - k.costoAnterior) * 100) / k.costoAnterior : null

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
        <Text fontWeight="800" fontSize="$4" color="$text" textTransform="capitalize">{nombreMes(periodo)}</Text>
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

      {cargando ? (
        <YStack alignItems="center" paddingTop="$8"><Spinner size="large" color={ACCENT} /></YStack>
      ) : !datos ? null : k.activos === 0 && k.asientos === 0 ? (
        <Text color="$textMuted" textAlign="center" paddingTop="$6">Sin actividad en {nombreMes(periodo)}.</Text>
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
            <Mini titulo="Sesiones" valor={entero(k.sesiones)} pie={`${entero(k.prompts)} prompts`} />
          </XStack>
          <XStack gap="$3">
            <Mini titulo="Tokens" valor={corto(k.tokens)} pie="entrada, salida y caché" />
            {producto !== 'Cowork'
              ? <Mini titulo="Código" valor={`+${corto(k.lineas)}`} pie={`líneas · ${entero(k.commits)} commits`} />
              : <View flex={1} />}
          </XStack>

          {k.top.length > 0 && (
            <YStack backgroundColor="$backgroundElevated" borderRadius="$4" borderWidth={1}
              borderColor="$border" padding="$3.5" gap="$2.5" {...shadows.sm}>
              <Text fontSize="$2" fontWeight="800" color="$textMuted" textTransform="uppercase">Quiénes más lo usan</Text>
              {k.top.map((p, i) => (
                <XStack key={p.email} justifyContent="space-between" alignItems="center" gap="$2"
                  borderTopWidth={i === 0 ? 0 : 1} borderTopColor="$border" paddingTop={i === 0 ? 0 : '$2.5'}>
                  <YStack flex={1}>
                    <Text fontSize="$3" color="$text" numberOfLines={1}>{p.nombre || p.email}</Text>
                    <Text fontSize="$1" color="$textMuted" numberOfLines={1}>
                      {Math.max(p.dias, p.diasCsv)} días{p.sesiones ? ` · ${entero(p.sesiones)} sesiones` : ''}
                    </Text>
                  </YStack>
                  <Text fontSize="$3" fontWeight="800" color="$text">{p.costo > 0 ? usd(p.costo) : '—'}</Text>
                </XStack>
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
