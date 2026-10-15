import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FlatList, RefreshControl, TextInput } from 'react-native'
import { Text, XStack, YStack, View, Spinner, useTheme } from 'tamagui'
import { Check, ChevronDown, ChevronRight, Search, X } from 'lucide-react-native'
import { useFocusEffect } from '@react-navigation/native'

import { shadows } from '../../theme/shadows'
import { HttpError } from '../../api/core/httpClient'
import { inventarioImpulsadorasService as api, mensajeDeError } from '../../api/modules/inventarioImpulsadoras/inventarioImpulsadoras.service'
import {
  IDashboardAsesorInventario, IDashboardAsesorPersona, TipoPersonaInventario,
} from '../../api/modules/inventarioImpulsadoras/inventarioImpulsadoras.types'
import { ACCENT, BarraAvance, ERR, OK, WARN, coincide, fmtFecha, fmtN, normal } from './components'

// Dashboard › «Por asesor» (el mismo del web): lo abierto hoy y lo del mes, agrupado por el asesor
// de la cartera del cliente en AX o por la persona asignada. Mismo permiso, mismas empresas (las del
// usuario) y mismo mes que el resto del dashboard; la API lo vuelve a validar.

const REFRESCO_MS = 60_000
const AZUL = '#2563eb'
const GRIS = '#6b7280'

const TIPO_PERSONA: Record<TipoPersonaInventario, { t: string; c: string }> = {
  ASESOR: { t: 'Asesor', c: AZUL },
  IMPULSADORA: { t: 'Impulsadora', c: '#9333ea' },
  INVENTARIO: { t: 'Inventarios', c: '#0891b2' },
  OFICINA: { t: 'Oficina', c: GRIS },
}
const ESTADO: Record<IDashboardAsesorInventario['Estado'], { t: string; c: string }> = {
  CERRADO: { t: 'Cerrado', c: OK },
  LISTO: { t: 'Listo para cerrar', c: OK },
  EN_PROCESO: { t: 'Escaneando', c: AZUL },
  SIN_INICIAR: { t: 'Sin iniciar', c: GRIS },
  SIN_PERSONAS: { t: 'Sin personas', c: WARN },
}

type Vista = 'asesor' | 'persona'
type FiltroTipo = 'TODOS' | 'ASESOR' | 'IMPULSADORA' | 'OTROS'

const plural = (v: number, uno: string, varios: string) => `${fmtN(v)} ${v === 1 ? uno : varios}`
const hace = (iso: string | null | undefined) => {
  if (!iso) return null
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`
}

/** Un inventario dentro de un grupo; en la vista por persona, `parte` = lo de esa persona. */
interface Fila { x: IDashboardAsesorInventario; parte?: IDashboardAsesorPersona }
interface Grupo {
  clave: string; nombre: string; detalle: string; tipo?: TipoPersonaInventario; filas: Fila[]
  abiertos: number; escaneando: number; listos: number; sinIniciar: number; sinPersonas: number; vencidos: number
  piezasAbiertas: number; finalizadas: number; asignadas: number
  delMes: number; cerradosMes: number; piezasMes: number; ultimoContacto: string | null
}

const abiertoHoy = (x: IDashboardAsesorInventario, hoy: string) => x.Abierto && x.Fecha.slice(0, 10) <= hoy

function armarGrupos(inv: IDashboardAsesorInventario[], vista: Vista, hoy: string): Grupo[] {
  const m = new Map<string, Grupo>()
  const grupo = (clave: string, nombre: string, detalle: string, tipo?: TipoPersonaInventario) => {
    let g = m.get(clave)
    if (!g) {
      g = { clave, nombre, detalle, tipo, filas: [], abiertos: 0, escaneando: 0, listos: 0, sinIniciar: 0, sinPersonas: 0,
            vencidos: 0, piezasAbiertas: 0, finalizadas: 0, asignadas: 0, delMes: 0, cerradosMes: 0, piezasMes: 0, ultimoContacto: null }
      m.set(clave, g)
    }
    return g
  }
  const sumar = (g: Grupo, x: IDashboardAsesorInventario, parte?: IDashboardAsesorPersona) => {
    g.filas.push({ x, parte })
    const piezas = parte ? parte.Piezas : x.Piezas
    const contacto = parte ? parte.UltimoContacto : x.UltimoContacto
    if (abiertoHoy(x, hoy)) {
      g.abiertos++
      if (x.Estado === 'EN_PROCESO') g.escaneando++
      if (x.Estado === 'LISTO') g.listos++
      if (x.Estado === 'SIN_INICIAR') g.sinIniciar++
      if (x.Estado === 'SIN_PERSONAS') g.sinPersonas++
      if (x.DiasAtraso > 0) g.vencidos++
      g.piezasAbiertas += piezas
      g.finalizadas += parte ? (parte.Finalizada ? 1 : 0) : x.Finalizadas
      g.asignadas += parte ? 1 : x.Asignadas
      if (contacto && (!g.ultimoContacto || contacto > g.ultimoContacto)) g.ultimoContacto = contacto
    }
    if (x.DelMes) {
      g.delMes++
      if (!x.Abierto) { g.cerradosMes++; g.piezasMes += piezas }
    }
  }
  for (const x of inv) {
    if (vista === 'asesor') {
      const clave = x.AsesorId != null ? `a${x.AsesorId}` : x.AsesorUsuario ? `u${x.AsesorUsuario}` : 'sin'
      const detalle = x.AsesorUsuario ? `usuario ${x.AsesorUsuario}`
        : x.AsesorCodigoAx ? `sin usuario en IMCore · AX: ${x.AsesorCodigoAx}`
        : 'el cliente no tiene cartera en AX'
      sumar(grupo(clave, x.Asesor ?? 'Sin asesor', detalle), x)
    } else {
      for (const p of x.Personas) {
        const clave = p.User_Code ? `u${p.User_Code}` : `n${p.Nombre ?? ''}`
        sumar(grupo(clave, p.Nombre ?? p.User_Code ?? '(sin nombre)', p.User_Code ?? 'histórico del sistema anterior', p.Tipo), x, p)
      }
    }
  }
  const lista = [...m.values()]
  for (const g of lista) {
    // Primero lo abierto (los más atrasados arriba), luego lo programado a futuro y al final lo cerrado.
    const orden = (f: Fila) => (abiertoHoy(f.x, hoy) ? 0 : f.x.Abierto ? 1 : 2)
    g.filas.sort((a, b) => orden(a) - orden(b) || b.x.DiasAtraso - a.x.DiasAtraso || a.x.Fecha.localeCompare(b.x.Fecha))
  }
  return lista.sort((a, b) => (a.clave === 'sin' ? 1 : 0) - (b.clave === 'sin' ? 1 : 0)
    || b.abiertos - a.abiertos || b.delMes - a.delMes || a.nombre.localeCompare(b.nombre))
}

export function PorAsesor({ companyId, mes, verAnteriores, selectorMes, pad, compacto, ancho }: {
  companyId: number | null
  mes: string
  /** Los abiertos del sistema anterior sin movimiento en IMCore (el mismo interruptor del resumen). */
  verAnteriores: boolean
  /** El mismo selector de mes del resumen. */
  selectorMes: React.ReactNode
  pad: number
  compacto: boolean
  ancho: object
}) {
  const theme = useTheme()
  const [inv, setInv] = useState<IDashboardAsesorInventario[] | null>(null)
  const [hoy, setHoy] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [vista, setVista] = useState<Vista>('asesor')
  const [tipo, setTipo] = useState<FiltroTipo>('TODOS')
  const [buscar, setBuscar] = useState('')
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const pedido = useRef(0)

  const cargar = useCallback(async () => {
    const n = ++pedido.current
    setCargando(true)
    try {
      const r = await api.asesores({ companyId, mes, verAnteriores })
      if (n !== pedido.current) return
      setInv(r.Data?.Inventarios ?? [])
      setHoy((r.Data?.Hoy ?? '').slice(0, 10))
      setError(null)
    } catch (e) {
      // 404 = el servidor todavía no tiene esta pestaña (la app salió antes que la API).
      if (n === pedido.current) {
        setError(e instanceof HttpError && e.status === 404
          ? '«Por asesor» todavía no está en el servidor. «Resumen» funciona igual que siempre.'
          : mensajeDeError(e))
      }
    } finally {
      if (n === pedido.current) { setCargando(false); setRefrescando(false) }
    }
  }, [companyId, mes, verAnteriores])
  useEffect(() => { void cargar() }, [cargar])
  useFocusEffect(useCallback(() => {
    const t = setInterval(() => { void cargar() }, REFRESCO_MS)
    return () => clearInterval(t)
  }, [cargar]))

  const q = normal(buscar.trim())
  const grupos = useMemo(() => {
    if (!inv) return []
    const filtrados = !q ? inv : inv.filter(x => coincide(q, x.Correlativo, x.Cliente, x.ClienteCodigo, x.Sucursal, x.Asesor,
      x.AsesorUsuario, ...x.Personas.flatMap(p => [p.Nombre, p.User_Code])))
    let gs = armarGrupos(filtrados, vista, hoy)
    if (vista === 'persona' && tipo !== 'TODOS')
      gs = gs.filter(g => (tipo === 'OTROS' ? g.tipo === 'INVENTARIO' || g.tipo === 'OFICINA' : g.tipo === tipo))
    return gs
  }, [inv, q, vista, tipo, hoy])

  const alternar = (clave: string) => setAbiertos(s => {
    const x = new Set(s)
    if (x.has(clave)) x.delete(clave); else x.add(clave)
    return x
  })

  const tarjeta = {
    backgroundColor: '$backgroundElevated', borderRadius: '$4', borderWidth: 1, borderColor: '$border',
    padding: compacto ? '$2.5' : '$3', ...shadows.sm,
  } as const
  const Etiqueta = ({ texto, color }: { texto: string; color: string }) => (
    <View borderRadius={6} paddingHorizontal="$2" paddingVertical={2} backgroundColor={`${color}22`}>
      <Text fontSize="$1" fontWeight="800" color={color}>{texto}</Text>
    </View>
  )
  const Chip = ({ on, texto, onPress }: { on: boolean; texto: string; onPress: () => void }) => (
    <View onPress={onPress} pressStyle={{ opacity: 0.85 }} backgroundColor={on ? ACCENT : 'transparent'}
      borderWidth={1} borderColor={on ? ACCENT : '$border'} borderRadius="$10" paddingHorizontal="$3" height={30}
      alignItems="center" justifyContent="center">
      <Text fontSize={12} fontWeight="700" color={on ? '#fff' : '$textMuted'}>{texto}</Text>
    </View>
  )

  const filaInventario = ({ x, parte }: Fila) => {
    const est = ESTADO[x.Estado]
    const futuro = x.Abierto && !abiertoHoy(x, hoy)
    const piezas = parte ? parte.Piezas : x.Piezas
    // Sin lecturas todavía, el % contra el anterior no dice nada.
    const ref = x.PiezasAnterior && x.PiezasAnterior > 0 && (x.Piezas > 0 || !x.Abierto)
      ? Math.round((x.Piezas * 100) / x.PiezasAnterior) : null
    return (
      <YStack key={`${x.Inventario_Id}-${parte?.User_Code ?? ''}`} paddingTop="$2" marginTop="$2" borderTopWidth={1} borderTopColor="$border" gap={2}>
        <XStack justifyContent="space-between" alignItems="center" gap="$2">
          <Text fontSize="$3" fontWeight="900" color="$text">{x.Correlativo}</Text>
          <Etiqueta texto={est.t} color={est.c} />
        </XStack>
        <Text fontSize="$2" color="$text" numberOfLines={1}>{x.Cliente}</Text>
        <Text fontSize="$1" color="$textMuted" numberOfLines={1}>
          {x.Sucursal && x.Sucursal !== x.Cliente ? `${x.Sucursal} · ` : ''}{x.Linea} · {x.Empresa}
        </Text>
        <Text fontSize="$1" color="$textMuted">
          {fmtFecha(x.Fecha)}
          {x.DiasAtraso > 0 ? <Text fontSize="$1" color={WARN} fontWeight="800">{` · ${plural(x.DiasAtraso, 'día', 'días')} de atraso`}</Text> : null}
          {futuro ? ' · programado' : ''}
          {!x.Abierto && x.FechaCerrado ? ` · cerrado ${fmtFecha(x.FechaCerrado)}` : ''}
        </Text>
        <Text fontSize="$1" color="$text">
          {plural(piezas, 'pieza', 'piezas')}{parte && x.Personas.length > 1 ? ` de ${fmtN(x.Piezas)}` : ''}
          {ref != null ? <Text fontSize="$1" color="$textMuted">{` · ${ref}% del anterior (${x.AnteriorCorrelativo}: ${fmtN(x.PiezasAnterior ?? 0)})`}</Text> : null}
        </Text>
        {!x.Personas.length
          ? <Text fontSize="$1" color={WARN} fontWeight="700">Nadie asignado</Text>
          : x.Personas.map((p, i) => (
            <XStack key={i} alignItems="center" gap={6}>
              {p.Finalizada ? <Check size={12} color={OK} /> : <View width={12} />}
              <Text fontSize="$1" color="$text" fontWeight={parte && p.User_Code === parte.User_Code ? '800' : '400'} flexShrink={1} numberOfLines={1}>
                {p.Nombre}
              </Text>
              <Text fontSize={10} fontWeight="800" color={TIPO_PERSONA[p.Tipo]?.c ?? GRIS}>{TIPO_PERSONA[p.Tipo]?.t ?? p.Tipo}</Text>
              {x.Abierto && p.SinEnviar > 0 ? <Text fontSize="$1" color={WARN}>+{fmtN(p.SinEnviar)} sin enviar</Text> : null}
            </XStack>
          ))}
      </YStack>
    )
  }

  const tarjetaGrupo = (g: Grupo) => {
    const abierto = abiertos.has(g.clave)
    const avance = g.delMes ? Math.round((g.cerradosMes * 100) / g.delMes) : 0
    const contacto = hace(g.ultimoContacto)
    return (
      <YStack {...tarjeta} gap={4} marginBottom="$2">
        <YStack gap={4} onPress={() => alternar(g.clave)} pressStyle={{ opacity: 0.85 }}>
          <XStack justifyContent="space-between" alignItems="center" gap="$2">
            <YStack flex={1} gap={1}>
              <Text fontSize="$3" fontWeight="800" color="$text" numberOfLines={2}>{g.nombre}</Text>
              <XStack alignItems="center" gap={6}>
                {g.tipo && <Text fontSize={10} fontWeight="800" color={TIPO_PERSONA[g.tipo].c}>{TIPO_PERSONA[g.tipo].t.toUpperCase()}</Text>}
                <Text fontSize="$1" color="$textMuted" flexShrink={1} numberOfLines={1}>{g.detalle}</Text>
              </XStack>
            </YStack>
            <YStack alignItems="flex-end">
              <Text fontSize="$7" fontWeight="900" color={g.abiertos ? '$text' : '$textMuted'}>{fmtN(g.abiertos)}</Text>
              <Text fontSize="$1" color="$textMuted">{g.abiertos === 1 ? 'abierto' : 'abiertos'}</Text>
            </YStack>
          </XStack>
          {g.abiertos > 0 && (
            <XStack flexWrap="wrap" gap={4}>
              {g.vencidos > 0 && <Etiqueta texto={plural(g.vencidos, 'vencido', 'vencidos')} color={WARN} />}
              {g.escaneando > 0 && <Etiqueta texto={`${fmtN(g.escaneando)} escaneando`} color={AZUL} />}
              {g.listos > 0 && <Etiqueta texto={plural(g.listos, 'listo', 'listos')} color={OK} />}
              {g.sinIniciar > 0 && <Etiqueta texto={`${fmtN(g.sinIniciar)} sin iniciar`} color={GRIS} />}
              {g.sinPersonas > 0 && <Etiqueta texto={`${fmtN(g.sinPersonas)} sin personas`} color={WARN} />}
            </XStack>
          )}
          {g.abiertos > 0 && (
            <Text fontSize="$1" color="$textMuted">
              {plural(g.piezasAbiertas, 'pieza contada', 'piezas contadas')} · {fmtN(g.finalizadas)} de {fmtN(g.asignadas)} finalizaron
              {contacto ? ` · ${contacto}` : ''}
            </Text>
          )}
          {g.delMes ? (
            <YStack gap={2}>
              <XStack justifyContent="space-between">
                <Text fontSize="$1" color="$text">Del mes: {fmtN(g.cerradosMes)} de {fmtN(g.delMes)} cerrados
                  {g.cerradosMes > 0 ? <Text fontSize="$1" color="$textMuted">{` · ${plural(g.piezasMes, 'pieza', 'piezas')}`}</Text> : null}
                </Text>
                <Text fontSize="$1" fontWeight="800" color={avance >= 100 ? OK : '$text'}>{avance}%</Text>
              </XStack>
              <BarraAvance pct={Math.min(100, avance)} color={avance >= 100 ? OK : AZUL} />
            </YStack>
          ) : <Text fontSize="$1" color="$textMuted">Nada programado en el mes</Text>}
          <XStack alignItems="center" gap={2}>
            {abierto ? <ChevronDown size={14} color={ACCENT} /> : <ChevronRight size={14} color={ACCENT} />}
            <Text fontSize="$1" fontWeight="800" color={ACCENT}>
              {abierto ? 'Ocultar' : 'Ver'} {plural(g.filas.length, 'inventario', 'inventarios')}
            </Text>
          </XStack>
        </YStack>
        {abierto && g.filas.map(filaInventario)}
      </YStack>
    )
  }

  return (
    <YStack flex={1}>
      <YStack paddingHorizontal={pad} paddingBottom="$2" gap="$2" {...ancho}>
        {selectorMes}
        <XStack gap="$2" alignItems="center" flexWrap="wrap">
          <Chip on={vista === 'asesor'} texto="Por cartera" onPress={() => { setVista('asesor'); setAbiertos(new Set()) }} />
          <Chip on={vista === 'persona'} texto="Por quién cuenta" onPress={() => { setVista('persona'); setAbiertos(new Set()) }} />
          {cargando && inv !== null && <Spinner size="small" color={ACCENT} />}
        </XStack>
        {vista === 'persona' && (
          <XStack gap="$2" flexWrap="wrap">
            {([['TODOS', 'Todos'], ['ASESOR', 'Asesores'], ['IMPULSADORA', 'Impulsadoras'], ['OTROS', 'Otros']] as const).map(([v, t]) => (
              <Chip key={v} on={tipo === v} texto={t} onPress={() => setTipo(v)} />
            ))}
          </XStack>
        )}
        <XStack alignItems="center" gap="$2" borderWidth={1} borderColor="$border" borderRadius="$4" paddingHorizontal="$3"
          backgroundColor="$backgroundElevated" height={compacto ? 38 : 42}>
          <Search size={16} color={theme.textMuted?.val} />
          <TextInput
            value={buscar}
            onChangeText={setBuscar}
            placeholder="Buscar asesor, persona, cliente o número"
            placeholderTextColor={theme.textMuted?.val}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            style={{ flex: 1, fontSize: compacto ? 14 : 15, color: theme.text?.val, paddingVertical: 0 }}
          />
          {!!buscar && <View onPress={() => setBuscar('')} hitSlop={10}><X size={16} color={theme.textMuted?.val} /></View>}
        </XStack>
      </YStack>
      {inv === null ? (
        <YStack flex={1} alignItems="center" justifyContent="center" padding="$6" gap="$3">
          {error && !cargando ? (
            <>
              <Text color={ERR} textAlign="center">{error}</Text>
              <View onPress={() => void cargar()} pressStyle={{ opacity: 0.85 }}
                backgroundColor={ACCENT} borderRadius="$4" paddingHorizontal="$4" paddingVertical="$2">
                <Text color="#fff" fontWeight="800">Reintentar</Text>
              </View>
            </>
          ) : <Spinner size="large" color={ACCENT} />}
        </YStack>
      ) : (
        <FlatList
          data={grupos}
          keyExtractor={g => g.clave}
          renderItem={({ item }) => tarjetaGrupo(item)}
          contentContainerStyle={{ paddingHorizontal: pad, paddingBottom: 60, ...ancho }}
          refreshControl={<RefreshControl refreshing={refrescando}
            onRefresh={() => { setRefrescando(true); void cargar() }} colors={[ACCENT]} tintColor={ACCENT} />}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          initialNumToRender={10}
          ListHeaderComponent={
            <YStack paddingBottom="$2" gap={4}>
              {!!error && <Text fontSize="$2" color={WARN}>{error} (se muestra lo último que llegó)</Text>}
              <Text fontSize="$1" color="$textMuted">
                {vista === 'asesor'
                  ? 'Por cartera: los inventarios de los clientes de cada asesor (su cartera en AX), los cuente quien los cuente. '
                  : 'Por quién cuenta: lo que cada persona tiene asignado para contar y las piezas que ella lleva. '}
                «Abiertos» son los que tienen fecha hasta hoy; «Del mes» cuenta por la fecha programada.
              </Text>
            </YStack>
          }
          ListEmptyComponent={
            <Text color="$textMuted" textAlign="center" paddingVertical="$6">
              {q ? `Nada coincide con «${buscar.trim()}».` : 'No hay inventarios abiertos ni del mes.'}
            </Text>
          }
        />
      )}
    </YStack>
  )
}
