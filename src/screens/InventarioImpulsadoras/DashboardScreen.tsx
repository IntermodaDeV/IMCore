import React, { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshControl, useWindowDimensions } from 'react-native'
import { ScrollView, Text, XStack, YStack, View, Spinner, useTheme } from 'tamagui'
import { ChevronLeft, ChevronRight, CircleHelp } from 'lucide-react-native'
import { useFocusEffect } from '@react-navigation/native'

import { usePageHeader } from '../../hooks/usePageHeader'
import { shadows } from '../../theme/shadows'
import { inventarioImpulsadorasService as api, mensajeDeError } from '../../api/modules/inventarioImpulsadoras/inventarioImpulsadoras.service'
import {
  IDashboard, IDashboardEnCurso, IDashboardInventario, IDashboardSucursal, IProximoInventario,
} from '../../api/modules/inventarioImpulsadoras/inventarioImpulsadoras.types'
import { ACCENT, BarraAvance, ERR, OK, WARN, fmtFecha, fmtN } from './components'

// Inventario Clientes › Dashboard (el mismo del web, en pantalla de teléfono).
// El permiso ES la opción de menú invImpDashboard: la API la valida contra la BD.
// El mes cuenta por la fecha programada; «Ahora» es lo abierto hoy. Lo desactivado no cuenta.

const REFRESCO_MS = 60_000
const AZUL = '#2563eb'
const GRIS = '#6b7280'

const primeroDeMes = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
const moverMes = (iso: string, delta: number) => {
  const [y, m] = iso.split('-').map(Number)
  return primeroDeMes(new Date(y, m - 1 + delta, 1))
}
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const nombreMes = (iso: string) => {
  const [y, m] = iso.split('-').map(Number)
  return `${MESES[m - 1].charAt(0).toUpperCase()}${MESES[m - 1].slice(1)} ${y}`
}
const mesCorto = (iso: string) => MESES[Number(iso.slice(5, 7)) - 1].slice(0, 3)
const haceMin = (min: number | null | undefined) => {
  if (min == null) return '—'
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`
}
const dias = (v: number) => `${v} ${v === 1 ? 'día' : 'días'}`
const plural = (v: number, uno: string, varios: string) => `${fmtN(v)} ${v === 1 ? uno : varios}`
/** % contra meta o programado (igual que el web): no llega a 100 mientras falte algo y puede pasar de 100. */
const pct = (a: number, b: number) => (b <= 0 ? 0 : a >= b ? Math.round((a * 100) / b) : Math.min(99, Math.floor((a * 100) / b)))

type Lista = 'listos' | 'vencidos' | 'escaneando' | 'sinPersonas' | 'sinSeguimiento'
const MAX_FILAS = 40

// Qué es cada número, en lenguaje llano (las mismas frases que el web). Se ven al tocar: sin hover
// en el teléfono, la tarjeta, el título de la sección o el «?» de «Ahora» las muestran y las ocultan.
const AYUDA = {
  Programados: 'Inventarios activos con fecha programada en el mes. Los desactivados no cuentan.',
  Cerrados: 'De los programados del mes, los que ya se cerraron (tienen su detalle procesado).',
  Pendientes: 'De los programados del mes, los que siguen abiertos: listos para cerrar, en proceso, sin iniciar o sin personas.',
  Cumplimiento: 'Cerrados contra la meta del mes. Si el mes no tiene meta cargada, contra los programados.',
  Ahora: 'Lo abierto hoy, sin importar el mes elegido. Toca un número para ver su lista abajo.',
  PorPais: 'Programados, cerrados y pendientes del mes por empresa. La barra es el avance contra la meta, o contra lo programado si no hay meta. Vencido = su fecha ya pasó y no está listo.',
  Meses: 'Inventarios programados por mes: en verde lo cerrado y en ámbar lo que sigue abierto. El número de arriba es el total del mes.',
  Proximos: 'Los inventarios que tocan en los próximos días según la periodicidad de cada cliente (último cierre + su ciclo): '
    + 'los ya creados, los que faltan crear y los atrasados (último cierre en el último año). Se programan solo desde el web, en Programación.',
} as const
const AYUDA_AHORA: Record<string, string> = {
  'Listos para cerrar': 'Todas las personas finalizaron su parte: falta que alguien lo cierre en el web.',
  Vencidos: 'Abiertos con la fecha programada ya pasada que no están listos.',
  'Escaneando ahora': 'Personas con su parte abierta que ya mandaron lecturas.',
  'Sin contacto': 'Escaneando, pero su equipo lleva más de 10 min sin comunicarse (sin señal, app cerrada o apagado).',
  'Sin personas': 'Inventarios abiertos sin nadie asignado, también los programados a futuro.',
  'Lecturas sin enviar': 'Lo que los equipos dijeron tener guardado sin enviar en su último contacto.',
  'Dobles conteos': 'Personas con la misma talla/color contada por barra suelta y por QR.',
  'QR dañado repetido': 'La misma barra de «QR dañado» más de una vez: puede ser la misma pieza.',
  'Piden reabrir': 'Solicitudes de reapertura sin contestar.',
  'Cierres con error': 'Su último intento de cierre falló: se puede reintentar.',
  'Lecturas tardías': 'Llegaron después del cierre (últimos 30 días): están guardadas pero no entraron al detalle.',
  'Sin próximo inventario': 'Sucursales con inventario en el último año que no tienen ninguno abierto ni programado.',
}
const LEYENDA_LISTA: Record<Lista, string> = {
  listos: 'Todas las personas finalizaron: falta cerrarlos en el web.',
  vencidos: 'Su fecha ya pasó y todavía no están listos. Primero los más atrasados.',
  escaneando: 'Quién tiene su parte abierta y ya mandó lecturas. Primero los que no se comunican.',
  sinPersonas: 'Abiertos sin nadie asignado: hay que asignar personas en el web antes de su fecha.',
  sinSeguimiento: 'Sucursales que se quedaron sin inventario abierto ni programado.',
}

// Próximos inventarios: ventana, y qué se cuenta como atrasado (los muy viejos son sucursales que se dejaron de visitar).
const VENTANAS = [30, 60, 90] as const
const ATRASO_MAX_DIAS = 365
const ESTADO_PROXIMO: Record<'PROGRAMADO' | 'POR_PROGRAMAR' | 'ATRASADO', { t: string; c: string }> = {
  PROGRAMADO: { t: 'Programado', c: OK },
  POR_PROGRAMAR: { t: 'Por programar', c: '#2563eb' },
  ATRASADO: { t: 'Atrasado', c: WARN },
}

export default function DashboardScreen() {
  const theme = useTheme()
  const { width, height } = useWindowDimensions()
  const compacto = height < 720 || width < 370
  usePageHeader({ center: <Text fontSize="$4" fontWeight="700" color="$text">Dashboard</Text> })

  const [companyId, setCompanyId] = useState<number | null>(null)
  const [mes, setMes] = useState(() => primeroDeMes())
  const [d, setD] = useState<IDashboard | null>(null)
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lista, setLista] = useState<Lista>('listos')
  // Explicaciones abiertas (por clave). Nada abierto al entrar: la pantalla queda limpia.
  const [ayuda, setAyuda] = useState<Record<string, boolean>>({})
  const [ventana, setVentana] = useState<(typeof VENTANAS)[number]>(30)
  const [proximos, setProximos] = useState<IProximoInventario[] | null>(null)
  const [errorProximos, setErrorProximos] = useState<string | null>(null)
  const alternar = (k: string) => setAyuda(a => ({ ...a, [k]: !a[k] }))
  const pedido = useRef(0)

  const cargar = useCallback(async () => {
    const n = ++pedido.current
    try {
      const r = await api.dashboard({ companyId, mes })
      if (n !== pedido.current) return        // llegó tarde: ya se pidió otro mes/empresa
      setD(r.Data)
      setError(null)
    } catch (e) {
      if (n === pedido.current) setError(mensajeDeError(e))
    } finally {
      if (n === pedido.current) { setCargando(false); setRefrescando(false) }
    }
  }, [companyId, mes])

  useEffect(() => { setCargando(true); void cargar() }, [cargar])

  // Próximos: aparte del dashboard (otra ventana de tiempo) y sin bloquearlo si tarda o falla.
  const pedidoProx = useRef(0)
  const cargarProximos = useCallback(async () => {
    const n = ++pedidoProx.current
    try {
      const r = await api.proximos({ companyId, dias: ventana })
      if (n !== pedidoProx.current) return
      setProximos((r.Data ?? []).filter(x => x.Estado !== 'SIN_HISTORIAL'
        && (x.Estado !== 'ATRASADO' || (x.DiasDesdeCierre ?? 0) <= ATRASO_MAX_DIAS)))
      setErrorProximos(null)
    } catch (e) {
      if (n === pedidoProx.current) setErrorProximos(mensajeDeError(e))
    }
  }, [companyId, ventana])
  useEffect(() => { void cargarProximos() }, [cargarProximos])
  // Mientras la pantalla está al frente, se pone al día sola cada minuto.
  useFocusEffect(useCallback(() => {
    const t = setInterval(() => { void cargar() }, REFRESCO_MS)
    return () => clearInterval(t)
  }, [cargar]))

  const pad = compacto ? 10 : 16
  const tarjeta = {
    backgroundColor: '$backgroundElevated', borderRadius: '$4', borderWidth: 1, borderColor: '$border',
    padding: compacto ? '$2.5' : '$3', ...shadows.sm,
  } as const
  const Titulo = ({ children }: { children: React.ReactNode }) => (
    <Text fontSize="$1" fontWeight="800" color="$textMuted" letterSpacing={0.5}>{children}</Text>
  )
  const Interrogacion = () => <CircleHelp size={13} color={theme.textMuted?.val} opacity={0.6} />
  /** Título de sección que al tocarlo muestra/oculta qué significa. */
  const Encabezado = ({ k, titulo, texto, derecha }: { k: string; titulo: string; texto: string; derecha?: React.ReactNode }) => (
    <YStack gap={4}>
      <XStack justifyContent="space-between" alignItems="center" gap="$2">
        <XStack alignItems="center" gap={6} flexShrink={1} onPress={() => alternar(k)} hitSlop={8} pressStyle={{ opacity: 0.7 }}>
          <Titulo>{titulo}</Titulo>
          <Interrogacion />
        </XStack>
        {derecha}
      </XStack>
      {ayuda[k] && <Text fontSize="$1" color="$textMuted" lineHeight={15}>{texto}</Text>}
    </YStack>
  )

  if (cargando && !d) {
    return <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor="$background"><Spinner size="large" color={ACCENT} /></YStack>
  }
  if (!d) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor="$background" padding="$6" gap="$3">
        <Text color={ERR} textAlign="center">{error ?? 'No se pudo cargar el dashboard.'}</Text>
        <View onPress={() => { setCargando(true); void cargar() }} pressStyle={{ opacity: 0.85 }}
          backgroundColor={ACCENT} borderRadius="$4" paddingHorizontal="$4" paddingVertical="$2">
          <Text color="#fff" fontWeight="800">Reintentar</Text>
        </View>
      </YStack>
    )
  }

  const r = d.Resumen
  const base = r.Meta ?? r.Programados
  const cumple = pct(r.Cerrados, base)
  const maxMes = Math.max(1, ...d.Tendencia.map(t => t.Programados))

  const kpis = [
    { t: 'Programados', v: fmtN(r.Programados), h: 'en el mes', c: '$text' },
    { t: 'Cerrados', v: fmtN(r.Cerrados), h: `${pct(r.Cerrados, r.Programados)}% de los programados`, c: OK },
    { t: 'Pendientes', v: fmtN(r.Abiertos), h: `${plural(r.Listos, 'listo', 'listos')} · ${fmtN(r.EnProceso)} en proceso`, c: r.Abiertos ? WARN : '$text' },
    { t: 'Cumplimiento', v: `${cumple}%`, h: r.Meta != null ? `${fmtN(r.Cerrados)} de ${fmtN(r.Meta)} de meta` : 'sin meta: contra lo programado', c: cumple >= 100 ? OK : '$text' },
  ]
  const a = d.Alertas
  const ahora: { t: string; v: number; c: string; l?: Lista }[] = [
    { t: 'Listos para cerrar', v: d.Listos.length, c: OK, l: 'listos' },
    { t: 'Vencidos', v: d.Vencidos.length, c: WARN, l: 'vencidos' },
    { t: 'Escaneando ahora', v: d.EnCurso.length, c: AZUL, l: 'escaneando' },
    { t: 'Sin contacto', v: a.SinContacto, c: WARN, l: 'escaneando' },
    { t: 'Sin personas', v: d.SinPersonas.length, c: WARN, l: 'sinPersonas' },
    { t: 'Lecturas sin enviar', v: a.LecturasSinEnviar, c: WARN, l: 'escaneando' },
    { t: 'Dobles conteos', v: a.DoblesConteo, c: ERR },
    { t: 'QR dañado repetido', v: a.QrDanadoRepetido, c: WARN },
    { t: 'Piden reabrir', v: a.SolicitudesPendientes, c: WARN },
    { t: 'Cierres con error', v: a.CierresConError, c: ERR },
    { t: 'Lecturas tardías', v: a.LecturasTardias, c: '#9333ea' },
    { t: 'Sin próximo inventario', v: d.SinSeguimiento.length, c: GRIS, l: 'sinSeguimiento' },
  ]
  const LISTAS: { k: Lista; t: string; n: number }[] = [
    { k: 'listos', t: 'Listos', n: d.Listos.length },
    { k: 'vencidos', t: 'Vencidos', n: d.Vencidos.length },
    { k: 'escaneando', t: 'Escaneando', n: d.EnCurso.length },
    { k: 'sinPersonas', t: 'Sin personas', n: d.SinPersonas.length },
    { k: 'sinSeguimiento', t: 'Sin próximo', n: d.SinSeguimiento.length },
  ]

  const Chip = ({ on, texto, onPress }: { on: boolean; texto: string; onPress: () => void }) => (
    <View onPress={onPress} pressStyle={{ opacity: 0.85 }} backgroundColor={on ? ACCENT : 'transparent'}
      borderWidth={1} borderColor={on ? ACCENT : '$border'} borderRadius="$10" paddingHorizontal="$3" height={30}
      alignItems="center" justifyContent="center">
      <Text fontSize={12} fontWeight="700" color={on ? '#fff' : '$textMuted'}>{texto}</Text>
    </View>
  )

  const Inv = ({ x, derecha, abajo }: { x: IDashboardInventario; derecha: React.ReactNode; abajo?: React.ReactNode }) => (
    <YStack {...tarjeta} gap={2} marginBottom="$2">
      <XStack justifyContent="space-between" alignItems="center" gap="$2">
        <Text fontSize="$3" fontWeight="900" color="$text">{x.Correlativo}</Text>
        {derecha}
      </XStack>
      <Text fontSize="$2" color="$text" numberOfLines={1}>{x.Cliente}</Text>
      <Text fontSize="$1" color="$textMuted" numberOfLines={1}>
        {x.Sucursal && x.Sucursal !== x.Cliente ? `${x.Sucursal} · ` : ''}{x.Linea} · {fmtFecha(x.Fecha)}
      </Text>
      {abajo}
    </YStack>
  )
  const Etiqueta = ({ texto, color }: { texto: string; color: string }) => (
    <View borderRadius={6} paddingHorizontal="$2" paddingVertical={2} backgroundColor={`${color}22`}>
      <Text fontSize="$1" fontWeight="800" color={color}>{texto}</Text>
    </View>
  )

  const filasLista = (): React.ReactNode[] => {
    switch (lista) {
      case 'listos':
        return d.Listos.map(x => <Inv key={x.Inventario_Id} x={x} derecha={<Etiqueta texto="LISTO" color={OK} />}
          abajo={<Text fontSize="$1" color="$textMuted">{fmtN(x.Personas)} {x.Personas === 1 ? 'persona' : 'personas'} · {fmtN(x.Piezas)} piezas · última {fmtFecha(x.UltimaFinalizacion)}</Text>} />)
      case 'vencidos':
        return d.Vencidos.map(x => {
          const at = x.DiasAtraso ?? 0
          return <Inv key={x.Inventario_Id} x={x} derecha={<Etiqueta texto={dias(at)} color={at > 30 ? ERR : WARN} />}
            abajo={<Text fontSize="$1" color="$textMuted">
              {x.Estado === 'SIN_PERSONAS' ? 'Sin personas' : x.Estado === 'SIN_INICIAR' ? 'Sin iniciar' : 'En proceso'}
              {x.Personas ? ` · ${x.Finalizadas} de ${x.Personas} finalizaron` : ''}{x.Lecturas ? ` · ${fmtN(x.Lecturas)} lecturas` : ''}
            </Text>} />
        })
      case 'escaneando':
        return d.EnCurso.map((x: IDashboardEnCurso) => (
          <YStack key={x.InventarioUsuario_Id} {...tarjeta} gap={2} marginBottom="$2">
            <XStack justifyContent="space-between" alignItems="center" gap="$2">
              <Text fontSize="$3" fontWeight="800" color="$text" flex={1} numberOfLines={1}>{x.Persona}</Text>
              <Text fontSize="$1" fontWeight={x.SinContacto ? '800' : '400'} color={x.SinContacto ? WARN : '$textMuted'}>
                {x.SinContacto ? `sin contacto ${haceMin(x.MinutosSinContacto)}` : haceMin(x.MinutosSinContacto)}
              </Text>
            </XStack>
            <Text fontSize="$2" color="$text" numberOfLines={1}>{x.Correlativo} · {x.Cliente}</Text>
            <Text fontSize="$1" color="$textMuted">
              {fmtN(x.Lecturas)} lecturas · {fmtN(x.Piezas)} piezas
              {x.SinEnviar > 0 ? <Text fontSize="$1" color={WARN} fontWeight="800">{` · ${fmtN(x.SinEnviar)} sin enviar`}</Text> : null}
            </Text>
          </YStack>
        ))
      case 'sinPersonas':
        return d.SinPersonas.map(x => {
          const dd = x.DiasParaFecha ?? 0
          return <Inv key={x.Inventario_Id} x={x}
            derecha={<Etiqueta texto={dd === 0 ? 'hoy' : dd > 0 ? `en ${dias(dd)}` : `hace ${dias(-dd)}`} color={dd < 0 ? WARN : dd <= 7 ? '#ca8a04' : GRIS} />} />
        })
      case 'sinSeguimiento':
        return d.SinSeguimiento.map((x: IDashboardSucursal) => (
          <YStack key={x.Sucursal_Id} {...tarjeta} gap={2} marginBottom="$2">
            <XStack justifyContent="space-between" alignItems="center" gap="$2">
              <Text fontSize="$2" fontWeight="800" color="$text" flex={1} numberOfLines={1}>{x.Cliente}</Text>
              <Etiqueta texto={dias(x.DiasSinInventario)} color={GRIS} />
            </XStack>
            <Text fontSize="$1" color="$textMuted" numberOfLines={1}>
              {x.Sucursal && x.Sucursal !== x.Cliente ? `${x.Sucursal} · ` : ''}{x.Empresa} · último {x.UltimoCorrelativo} ({fmtFecha(x.UltimaFecha)})
            </Text>
          </YStack>
        ))
    }
  }
  const filas = filasLista()
  const vacio: Record<Lista, string> = {
    listos: 'Nada esperando cierre.',
    vencidos: 'No hay inventarios vencidos.',
    escaneando: 'Nadie está escaneando en este momento.',
    sinPersonas: 'Todos los abiertos tienen personas.',
    sinSeguimiento: 'Todas las sucursales tienen un inventario abierto o programado.',
  }

  return (
    <ScrollView flex={1} backgroundColor="$background" showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); void cargar(); void cargarProximos() }} colors={[ACCENT]} tintColor={ACCENT} />}>
      <YStack paddingHorizontal={pad} paddingTop={compacto ? 8 : 12} paddingBottom={60} gap="$2.5"
        width="100%" maxWidth={1000} alignSelf="center">

        {/* Empresa y mes */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <XStack gap="$2">
            <Chip on={companyId === null} texto="Todas" onPress={() => setCompanyId(null)} />
            {d.Empresas.map(e => (
              <Chip key={e.Company_Id} on={companyId === e.Company_Id} texto={e.Empresa} onPress={() => setCompanyId(e.Company_Id)} />
            ))}
          </XStack>
        </ScrollView>
        <XStack alignItems="center" justifyContent="space-between" {...tarjeta} padding="$1.5">
          <View onPress={() => setMes(moverMes(mes, -1))} padding="$2" hitSlop={8}><ChevronLeft size={20} color={theme.text?.val} /></View>
          <View onPress={() => setMes(primeroDeMes())} flex={1} alignItems="center">
            <Text fontSize="$4" fontWeight="800" color="$text">{nombreMes(mes)}</Text>
            {cargando && <Text fontSize="$1" color="$textMuted">Actualizando…</Text>}
          </View>
          <View onPress={() => setMes(moverMes(mes, 1))} padding="$2" hitSlop={8}><ChevronRight size={20} color={theme.text?.val} /></View>
        </XStack>
        {!!error && <Text fontSize="$2" color={WARN}>{error} (se muestra lo último que llegó)</Text>}

        {/* KPIs del mes */}
        <XStack flexWrap="wrap" gap="$2">
          {kpis.map(k => (
            <YStack key={k.t} {...tarjeta} width={`${(100 - 3) / 2}%` as any} gap={1}
              onPress={() => alternar(k.t)} pressStyle={{ opacity: 0.85 }}>
              <XStack justifyContent="space-between" alignItems="center">
                <Titulo>{k.t.toUpperCase()}</Titulo>
                <Interrogacion />
              </XStack>
              <Text fontSize={compacto ? '$7' : '$8'} fontWeight="900" color={k.c}>{k.v}</Text>
              <Text fontSize="$1" color="$textMuted" numberOfLines={2}>{k.h}</Text>
              {ayuda[k.t] && (
                <Text fontSize="$1" color="$textMuted" lineHeight={15} marginTop={4} paddingTop={4}
                  borderTopWidth={1} borderTopColor="$border">{AYUDA[k.t as keyof typeof AYUDA]}</Text>
              )}
            </YStack>
          ))}
        </XStack>
        <Text fontSize="$1" color="$textMuted">
          {fmtN(r.PiezasCerradas)} piezas contadas en lo cerrado del mes. El mes cuenta por la fecha programada.
        </Text>

        {/* Ahora */}
        <YStack {...tarjeta} gap="$1.5">
          {/* Con la ayuda abierta, cada renglón lleva su explicación debajo (uno por fila para que quepa). */}
          <Encabezado k="Ahora" titulo="AHORA" texto={AYUDA.Ahora} />
          <XStack flexWrap="wrap" rowGap="$1.5">
            {ahora.map(x => (
              <YStack key={x.t} width={ayuda.Ahora ? '100%' : '50%'} paddingRight="$1" gap={1}
                onPress={x.l ? () => setLista(x.l!) : undefined} pressStyle={x.l ? { opacity: 0.7 } : undefined}>
                <XStack alignItems="center" gap="$2">
                  <View minWidth={36} paddingHorizontal={6} height={24} borderRadius={12} alignItems="center" justifyContent="center"
                    backgroundColor={x.v ? x.c : `${GRIS}22`}>
                    <Text fontSize="$2" fontWeight="900" color={x.v ? '#fff' : '$textMuted'}>{fmtN(x.v)}</Text>
                  </View>
                  <Text fontSize="$2" color="$text" flex={1} numberOfLines={2}>{x.t}</Text>
                </XStack>
                {ayuda.Ahora && (
                  <Text fontSize="$1" color="$textMuted" lineHeight={15} paddingLeft={44}>{AYUDA_AHORA[x.t]}</Text>
                )}
              </YStack>
            ))}
          </XStack>
        </YStack>

        {/* Por país */}
        <YStack {...tarjeta} gap="$2">
          <Encabezado k="PorPais" titulo={`POR PAÍS · ${nombreMes(mes).toUpperCase()}`} texto={AYUDA.PorPais} />
          {d.PorPais.map(p => {
            const v = pct(p.Cerrados, p.Meta ?? p.Programados)
            return (
              <YStack key={p.Company_Id} gap={2}>
                <XStack justifyContent="space-between" alignItems="baseline">
                  <Text fontSize="$3" fontWeight="800" color="$text">{p.Empresa} <Text fontSize="$1" color="$textMuted" fontWeight="400">{p.Nombre}</Text></Text>
                  <Text fontSize="$2" color="$text">{fmtN(p.Cerrados)} de {fmtN(p.Meta ?? p.Programados)}</Text>
                </XStack>
                <BarraAvance pct={Math.min(100, v)} color={v >= 100 ? OK : AZUL} />
                <Text fontSize="$1" color="$textMuted">
                  {plural(p.Abiertos, 'pendiente', 'pendientes')}{p.Listos ? ` · ${plural(p.Listos, 'listo', 'listos')}` : ''}
                  {p.Vencidos ? <Text fontSize="$1" color={WARN} fontWeight="700">{` · ${plural(p.Vencidos, 'vencido', 'vencidos')}`}</Text> : null}
                  {p.Meta == null ? ' · sin meta' : ''}
                </Text>
              </YStack>
            )
          })}
        </YStack>

        {/* Últimos 12 meses: columnas apiladas cerrados (verde) + abiertos (ámbar) */}
        <YStack {...tarjeta} gap="$2">
          <Encabezado k="Meses" titulo="ÚLTIMOS 12 MESES" texto={AYUDA.Meses} derecha={
            <XStack gap="$2" alignItems="center">
              <View width={8} height={8} borderRadius={4} backgroundColor={OK} /><Text fontSize="$1" color="$textMuted">cerrados</Text>
              <View width={8} height={8} borderRadius={4} backgroundColor={WARN} /><Text fontSize="$1" color="$textMuted">abiertos</Text>
            </XStack>
          } />
          <XStack height={110} alignItems="flex-end" gap={3}>
            {d.Tendencia.map(t => (
              <YStack key={t.Mes} flex={1} alignItems="center" justifyContent="flex-end" height="100%">
                <Text fontSize={9} color="$textMuted">{t.Programados || ''}</Text>
                <View width="80%" height={`${(t.Abiertos / maxMes) * 80}%` as any} backgroundColor={WARN}
                  borderTopLeftRadius={3} borderTopRightRadius={3} />
                <View width="80%" height={`${(t.Cerrados / maxMes) * 80}%` as any} backgroundColor={OK}
                  borderTopLeftRadius={t.Abiertos ? 0 : 3} borderTopRightRadius={t.Abiertos ? 0 : 3} />
              </YStack>
            ))}
          </XStack>
          <XStack gap={3}>
            {d.Tendencia.map(t => (
              <Text key={t.Mes} flex={1} textAlign="center" fontSize={9} color={t.Mes.slice(0, 10) === mes ? '$text' : '$textMuted'}
                fontWeight={t.Mes.slice(0, 10) === mes ? '800' : '400'}>{mesCorto(t.Mes)}</Text>
            ))}
          </XStack>
        </YStack>

        {/* Próximos inventarios según la periodicidad (solo consulta; se programan en el web) */}
        <YStack {...tarjeta} gap="$2">
          <Encabezado k="Proximos" titulo="PRÓXIMOS INVENTARIOS" texto={AYUDA.Proximos} />
          <XStack gap="$2">
            {VENTANAS.map(v => <Chip key={v} on={ventana === v} texto={`${v} días`} onPress={() => setVentana(v)} />)}
          </XStack>
          {proximos === null
            ? (errorProximos
                ? <Text fontSize="$2" color={WARN}>{errorProximos}</Text>
                : <Spinner color={ACCENT} />)
            : (() => {
                const cuenta = (e: keyof typeof ESTADO_PROXIMO) => proximos.filter(x => x.Estado === e).length
                const fecha = (x: IProximoInventario) => (x.Estado === 'PROGRAMADO' ? x.ProgramadoFecha : x.FechaSugerida) ?? ''
                const orden = [...proximos].sort((a, b) => fecha(a).localeCompare(fecha(b)) || a.ClienteNombre.localeCompare(b.ClienteNombre))
                return (
                  <>
                    <XStack gap="$2">
                      {(Object.keys(ESTADO_PROXIMO) as (keyof typeof ESTADO_PROXIMO)[]).map(e => (
                        <YStack key={e} flex={1} alignItems="center" paddingVertical="$1.5" borderRadius="$3" backgroundColor={`${ESTADO_PROXIMO[e].c}18`}>
                          <Text fontSize="$6" fontWeight="900" color={ESTADO_PROXIMO[e].c}>{fmtN(cuenta(e))}</Text>
                          <Text fontSize="$1" color="$textMuted" textAlign="center">{ESTADO_PROXIMO[e].t}</Text>
                        </YStack>
                      ))}
                    </XStack>
                    {orden.length === 0
                      ? <Text color="$textMuted" textAlign="center" paddingVertical="$2">Nada en los próximos {ventana} días.</Text>
                      : orden.slice(0, MAX_FILAS).map(x => {
                          const est = ESTADO_PROXIMO[x.Estado as keyof typeof ESTADO_PROXIMO]
                          return (
                            <YStack key={x.Sucursal_Id} gap={1} paddingVertical="$1.5" borderTopWidth={1} borderTopColor="$border">
                              <XStack justifyContent="space-between" alignItems="center" gap="$2">
                                <Text fontSize="$2" fontWeight="800" color="$text" flex={1} numberOfLines={1}>{x.ClienteNombre}</Text>
                                <Etiqueta texto={x.Estado === 'PROGRAMADO' ? x.ProgramadoCorrelativo ?? est.t : est.t} color={est.c} />
                              </XStack>
                              <Text fontSize="$1" color="$textMuted" numberOfLines={1}>
                                {x.SucursalNombre && x.SucursalNombre !== x.ClienteNombre ? `${x.SucursalNombre} · ` : ''}{x.Empresa}
                                {` · ${fmtFecha(fecha(x))} · cada ${x.CicloDias ?? 30} días`}
                                {x.UltimoCierre ? ` · último ${fmtFecha(x.UltimoCierre)}` : ''}
                              </Text>
                            </YStack>
                          )
                        })}
                    {orden.length > MAX_FILAS && (
                      <Text fontSize="$1" color="$textMuted" textAlign="center">y {fmtN(orden.length - MAX_FILAS)} más (en el web, Programación)</Text>
                    )}
                    <Text fontSize="$1" color="$textMuted">Para crear los que faltan: web › Inventario Clientes › Programación.</Text>
                  </>
                )
              })()}
        </YStack>

        {/* Listas de hoy */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <XStack gap="$2">
            {LISTAS.map(x => <Chip key={x.k} on={lista === x.k} texto={`${x.t} (${x.n})`} onPress={() => setLista(x.k)} />)}
          </XStack>
        </ScrollView>
        <Text fontSize="$1" color="$textMuted" marginTop={-4}>{LEYENDA_LISTA[lista]}</Text>
        <YStack>
          {filas.length === 0
            ? <Text color="$textMuted" textAlign="center" paddingVertical="$4">{vacio[lista]}</Text>
            : filas.slice(0, MAX_FILAS)}
          {filas.length > MAX_FILAS && (
            <Text fontSize="$1" color="$textMuted" textAlign="center">y {fmtN(filas.length - MAX_FILAS)} más (en el web se ven todos)</Text>
          )}
        </YStack>
      </YStack>
    </ScrollView>
  )
}
