import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, RefreshControl, useWindowDimensions, FlatList } from 'react-native'
import { Text, XStack, YStack, View, Spinner, Input, useTheme } from 'tamagui'
import { Search, Plus, Wrench, RefreshCw } from 'lucide-react-native'
import { useNavigation, useFocusEffect } from '@react-navigation/native'
// ScrollView de gesture-handler: permite scroll horizontal fiable AUN dentro del
// pager horizontal (coordina el gesto), a diferencia del ScrollView de RN.
import { ScrollView as GestureScrollView } from 'react-native-gesture-handler'

import { usePageHeader } from '../../../hooks/usePageHeader'
import { useAuth } from '../../../context/AuthContext'
import { useShowToast } from '../../../utils/useShowToast'
import AppSelect from '../../../components/commons/AppSelect'
import { ticketsService } from '../../../api/modules/mantenimiento/tickets.service'
import { ITicket, IArea, IPrioridad, IEstado } from '../../../api/modules/mantenimiento/tickets.types'
import { colorEstado, colorPrioridad, ACCENT, estadoVisual, puedeCrearTickets, puedeVerPool, scopeInicialTickets } from '../mantenimiento.helpers'
import TicketsResumen from './TicketsResumen'
import { usePeriodo, PeriodoFiltro, fmtLocal } from '../periodo'
import { shadows } from '../../../theme/shadows'
import { NotificationBell } from '../../../components/notifications/NotificationBell'

type Vista = 'resumen' | 'listado'

// Filtros Área/Prioridad OCULTOS: el buscador de texto ya cubre esos campos
// (área, prioridad, máquina, ticket, etc.) y así se libera espacio. El estado y
// los catálogos se conservan; poner en true para volver a mostrar los dropdowns.
const MOSTRAR_FILTROS_DROPDOWN = false

const fmtFecha = (iso: string | null): string => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' })
}

export default function TicketsListScreen() {
  usePageHeader({
    center: (
      <Text fontSize="$4" fontWeight="700" color="$text">
        Tickets de Mantenimiento
      </Text>
    ),
    right: <NotificationBell size={20} />,
  })

  const theme = useTheme()
  const navigation = useNavigation<any>()
  const { user } = useAuth()
  const { showToast } = useShowToast()

  // Responsive: en pantallas anchas centramos el contenido (maxWidth).
  // El listado es siempre de 1 columna en todos los dispositivos.
  const { width } = useWindowDimensions()
  const CONTENT_MAX = 1000

  // Vista por defecto: Resumen (home de tickets); se alterna con el listado.
  const [vista, setVista] = useState<Vista>('resumen')

  // Pager con swipe nativo: Resumen (página 0) ⇄ Listado (página 1).
  const pagerRef = useRef<any>(null)
  const scrollX = useRef(new Animated.Value(0)).current
  // 0 en Resumen, 1 en Listado; sigue el gesto en tiempo real (FAB + toggle).
  const slide = scrollX.interpolate({ inputRange: [0, width || 1], outputRange: [0, 1], extrapolate: 'clamp' })

  const irAVista = useCallback((v: Vista) => {
    setVista(v)
    pagerRef.current?.scrollTo({ x: v === 'listado' ? width : 0, animated: true })
  }, [width])

  const onPagerScrollEnd = useCallback((e: any) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / (width || 1))
    setVista(page === 1 ? 'listado' : 'resumen')
  }, [width])

  const [tickets, setTickets] = useState<ITicket[]>([])
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  // Recarga por cambio de filtro/alcance (feedback al mover Míos/Todos).
  const [recargando, setRecargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Catálogos para filtros
  const [estados, setEstados] = useState<IEstado[]>([])
  const [areas, setAreas] = useState<IArea[]>([])
  const [prioridades, setPrioridades] = useState<IPrioridad[]>([])

  // Filtros
  const [estadoId, setEstadoId] = useState<number | undefined>(undefined)
  const [areaId, setAreaId] = useState<number | undefined>(undefined)
  const [prioridadId, setPrioridadId] = useState<number | undefined>(undefined)
  const [search, setSearch] = useState('')
  // "Del turno anterior": lo que se reportó antes de que arrancara la jornada en
  // curso y nadie arrancó. Se pide APARTE porque ignora el período —un lunes a las
  // 7 am el que quedó del viernes cae fuera de "esta semana"— y para poder mostrar
  // el conteo sin que el mecánico tenga que ir a buscarlo.
  const [soloTurno, setSoloTurno] = useState(false)
  const [colgados, setColgados] = useState<ITicket[]>([])
  // Alcance: 'mias' (por rol) | 'todos' (pool). Default 'mias', salvo el
  // despachador de repuestos (sin tickets propios) que arranca en 'todos'.
  const [scope, setScope] = useState<'mias' | 'todos'>(() => scopeInicialTickets(user?.Roles, user?.Access))
  // Filtro de período (mismo selector del Resumen). Acota la carga en el servidor:
  // el SP solo trae los tickets del rango, no todos. Default: semana actual.
  const periodo = usePeriodo('semana')

  const puedeCrear = useMemo(
    () => puedeCrearTickets(user?.Roles, user?.Access),
    [user],
  )
  // ¿Puede ver el pool "Todos"? (mecánico/técnico/sup. mtto/admin o acceso). Solo
  // entonces mostramos el toggle Mías/Todos.
  const verPool = useMemo(
    () => puedeVerPool(user?.Roles, user?.Access),
    [user],
  )

  const cargarCatalogos = useCallback(async () => {
    try {
      const [e, a, p] = await Promise.all([
        ticketsService.getEstados(),
        ticketsService.getAreas(),
        ticketsService.getPrioridades(),
      ])
      setEstados(e.Data ?? [])
      setAreas(a.Data ?? [])
      setPrioridades(p.Data ?? [])
    } catch {
      // Los filtros pueden quedar vacíos sin romper la pantalla.
    }
  }, [])

  // El conteo de colgados va aparte del listado: tiene que estar aunque el chip
  // este apagado, porque es justo lo que invita a prenderlo.
  const cargarColgados = useCallback(async () => {
    try {
      const res = await ticketsService.getTickets({ scope, soloTurnoAnterior: true, take: 200 })
      setColgados(res.Success ? (res.Data ?? []) : [])
    } catch {
      setColgados([])
    }
  }, [scope])

  const cargarTickets = useCallback(async () => {
    setError(null)
    setRecargando(true)
    try {
      const res = await ticketsService.getTickets(
        soloTurno
          ? { scope, soloTurnoAnterior: true, take: 200 }
          : {
              estado_Id: estadoId,
              prioridad_Id: prioridadId,
              area_Id: areaId,
              search: search.trim() || undefined,
              scope,
              desde: fmtLocal(periodo.desde),
              hasta: fmtLocal(periodo.hasta),
              take: 100,
            },
      )
      if (!res.Success) {
        setError(res.ErrorMessage || 'No se pudieron cargar los tickets')
        setTickets([])
        return
      }
      setTickets(res.Data ?? [])
    } catch (e: any) {
      setError(e?.message || 'Error de conexión')
      setTickets([])
    } finally {
      setRecargando(false)
    }
  }, [estadoId, prioridadId, areaId, search, scope, periodo.desde, periodo.hasta, soloTurno])

  useEffect(() => {
    ;(async () => {
      setCargando(true)
      await cargarCatalogos()
      await cargarTickets()
      setCargando(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // El conteo de colgados se refresca al montar y cuando cambia el alcance.
  useEffect(() => {
    cargarColgados()
  }, [cargarColgados])

  // Búsqueda: recarga con debounce (evita pegarle a la API en cada tecla).
  const primerBusqueda = useRef(true)
  useEffect(() => {
    if (primerBusqueda.current) { primerBusqueda.current = false; return }
    const t = setTimeout(() => { cargarTickets() }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  // Alcance (Míos/Todos) y filtros: recarga inmediata (sin retardo ni doble carga).
  const primerFiltro = useRef(true)
  useEffect(() => {
    if (primerFiltro.current) { primerFiltro.current = false; return }
    cargarTickets()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, estadoId, areaId, prioridadId, periodo.desde, periodo.hasta])

  const onRefresh = useCallback(async () => {
    setRefrescando(true)
    await cargarTickets()
    setRefrescando(false)
  }, [cargarTickets])

  const irADetalle = (t: ITicket) => {
    navigation.navigate('mantenimientoTicketDetalle', { id: t.Id })
  }

  const irANuevo = () => {
    navigation.navigate('mantenimientoTicketNuevo')
  }

  // Recarga la lista al volver de crear/editar (sin spinner; silencioso).
  const primerFoco = React.useRef(true)
  useFocusEffect(
    useCallback(() => {
      if (primerFoco.current) {
        primerFoco.current = false
        return
      }
      cargarTickets()
    }, [cargarTickets]),
  )

  // El valor "todas" usa un centinela no vacío ('all') para que el label de
  // AppSelect flote (con value vacío el label se encimaría con el placeholder).
  const opcionesArea = useMemo(
    () => [{ label: 'Todas las áreas', value: 'all' }, ...areas.map(a => ({ label: a.Name, value: String(a.Id) }))],
    [areas],
  )
  const opcionesPrioridad = useMemo(
    () => [{ label: 'Todas las prioridades', value: 'all' }, ...prioridades.map(p => ({ label: p.Name, value: String(p.Id) }))],
    [prioridades],
  )

  // Total de tickets del alcance/filtros actuales (COUNT(*) OVER() viaja en cada fila).
  const totalTickets = tickets.length ? (tickets[0].TotalCount ?? tickets.length) : 0
  // Conteo / indicador de recarga (feedback al mover Míos↔Todos o filtros).
  const countNode = recargando ? (
    <XStack alignItems="center" gap="$1.5">
      <Spinner size="small" color={ACCENT} />
      <Text fontSize="$2" color="$textMuted">Actualizando…</Text>
    </XStack>
  ) : (
    <Text fontSize="$2" fontWeight="700" color={ACCENT}>{totalTickets} {totalTickets === 1 ? 'ticket' : 'tickets'}</Text>
  )

  return (
    <View flex={1} backgroundColor="$background">
      {/* Toggle Resumen | Listado */}
      <XStack
        gap="$2"
        paddingHorizontal="$3"
        paddingTop="$3"
        width="100%"
        maxWidth={CONTENT_MAX}
        alignSelf="center"
      >
        <VistaTab label="Resumen" active={vista === 'resumen'} onPress={() => irAVista('resumen')} />
        <VistaTab label="Listado" active={vista === 'listado'} onPress={() => irAVista('listado')} />
      </XStack>

      {/* Pager horizontal con swipe nativo (paginado) */}
      <Animated.ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: true },
        )}
        onMomentumScrollEnd={onPagerScrollEnd}
        style={{ flex: 1 }}
      >

      {/* Página: Resumen */}
      <View width={width} height="100%">
        <TicketsResumen />
      </View>

      {/* Página: Listado */}
      <View width={width} height="100%">
      {/* Filtros */}
      <YStack paddingHorizontal="$3" paddingTop="$3" gap="$2" width="100%" maxWidth={CONTENT_MAX} alignSelf="center">
        {/* Filtro de período (mismo selector del Resumen). Acota la carga: el servidor
            solo trae los tickets del rango seleccionado. */}
        <PeriodoFiltro {...periodo} />

        {/* Lo que quedó colgado del turno anterior, a un toque. Solo aparece si hay
            algo: un chip en cero es ruido. Al prenderlo el período deja de aplicar,
            porque el que quedó del viernes no sale un lunes con "esta semana". */}
        {colgados.length > 0 && (
          <XStack alignItems="center" gap="$2">
            <EstadoChip
              label={`Del turno anterior (${colgados.length})`}
              active={soloTurno}
              color="#f59e0b"
              onPress={() => setSoloTurno(v => !v)}
            />
            {soloTurno && (
              <Text fontSize="$1" color="$textMuted" flex={1}>
                Sin filtro de período: es lo que nadie ha arrancado.
              </Text>
            )}
          </XStack>
        )}

        {/* Alcance Mías / Todos (solo para quien puede ver el pool). "Todos" muestra
            el universo para descubrir y autoasignarse; combina con el filtro de Área. */}
        {verPool ? (
          <XStack alignItems="center" gap="$2">
            <Text fontSize="$2" color="$textMuted" fontWeight="700">Ver:</Text>
            <EstadoChip label="Míos" active={scope === 'mias'} color={ACCENT} onPress={() => setScope('mias')} />
            <EstadoChip label="Todos" active={scope === 'todos'} color={ACCENT} onPress={() => setScope('todos')} />
            <View flex={1} />
            {countNode}
          </XStack>
        ) : (
          <XStack justifyContent="flex-end">{countNode}</XStack>
        )}

        {/* Buscador */}
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
            placeholder="Buscar: ticket, máquina, área, prioridad…"
            placeholderTextColor={theme.textMuted?.val}
            color="$text"
            fontSize="$3"
            value={search}
            onChangeText={setSearch}
          />
        </XStack>

        {/* Chips de estado en una sola línea con scroll horizontal (gesture-handler
            para que funcione dentro del pager). paddingRight deja respirar al último. */}
        <GestureScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingVertical: 4, paddingRight: 16, alignItems: 'center' }}
        >
          <EstadoChip label="Todos" active={estadoId === undefined} color={ACCENT} onPress={() => setEstadoId(undefined)} />
          {estados.map(e => (
            <EstadoChip
              key={e.Id}
              label={e.Name}
              active={estadoId === e.Id}
              color={colorEstado(e.Name)}
              onPress={() => setEstadoId(prev => (prev === e.Id ? undefined : e.Id))}
            />
          ))}
        </GestureScrollView>

        {/* Área / Prioridad — OCULTOS (el buscador ya cubre estos campos). */}
        {MOSTRAR_FILTROS_DROPDOWN && (
        <XStack gap="$2">
          <View flex={1}>
            <AppSelect
              label="Área"
              value={areaId !== undefined ? String(areaId) : 'all'}
              options={opcionesArea}
              onValueChange={v => setAreaId(v === 'all' || v == null ? undefined : Number(v))}
            />
          </View>
          <View flex={1}>
            <AppSelect
              label="Prioridad"
              value={prioridadId !== undefined ? String(prioridadId) : 'all'}
              options={opcionesPrioridad}
              onValueChange={v => setPrioridadId(v === 'all' || v == null ? undefined : Number(v))}
            />
          </View>
        </XStack>
        )}
      </YStack>

      {/* Lista */}
      {cargando ? (
        <YStack flex={1} alignItems="center" justifyContent="center" gap="$3">
          <Spinner size="large" color={ACCENT} />
          <Text color="$textMuted">Cargando tickets…</Text>
        </YStack>
      ) : (
        // FlatList (virtualizado) en vez de ScrollView + map: evita renderizar de
        // golpe todas las tarjetas (hasta 100) y saturar el hilo de JS al montar/
        // hacer scroll, lo que provocaba jank y contribuía al drawer pegado.
        // Siempre 1 columna (numColumns por defecto), en todos los dispositivos.
        <FlatList
          data={error ? [] : tickets}
          keyExtractor={(t) => String(t.Id)}
          style={{ flex: 1, opacity: recargando ? 0.45 : 1 }}
          contentContainerStyle={{ padding: 12, paddingBottom: 96, width: '100%', maxWidth: CONTENT_MAX, alignSelf: 'center', flexGrow: 1 }}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={9}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} tintColor={ACCENT} />}
          ListEmptyComponent={
            error ? (
              <EmptyState
                icon={<RefreshCw size={28} color={theme.textMuted?.val} />}
                title="No se pudieron cargar los tickets"
                subtitle={error}
              />
            ) : (
              <EmptyState
                icon={<Wrench size={28} color={theme.textMuted?.val} />}
                title="Sin tickets"
                subtitle="No hay tickets que coincidan con los filtros."
              />
            )
          }
          renderItem={({ item: t }) => (
            <View width="100%" marginBottom="$2.5">
              <TicketCard t={t} onPress={() => irADetalle(t)} theme={theme} />
            </View>
          )}
        />
      )}
      </View>
      </Animated.ScrollView>

      {/* FAB Crear ticket: solo en Listado, con fade + slide */}
      {puedeCrear && (
        <Animated.View
          pointerEvents={vista === 'listado' ? 'auto' : 'none'}
          style={{
            position: 'absolute',
            right: 20,
            bottom: 24,
            opacity: slide,
            transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [80, 0] }) }],
          }}
        >
          <View
            onPress={irANuevo}
            pressStyle={{ opacity: 0.85 }}
            backgroundColor={ACCENT}
            borderRadius={28}
            height={56}
            paddingHorizontal="$4"
            alignItems="center"
            justifyContent="center"
            flexDirection="row"
            gap="$2"
            shadowColor="#000"
            shadowOpacity={0.25}
            shadowRadius={8}
            shadowOffset={{ width: 0, height: 4 }}
          >
            <Plus size={22} color="#fff" />
            <Text color="#fff" fontWeight="700" fontSize="$3">Crear ticket</Text>
          </View>
        </Animated.View>
      )}
    </View>
  )
}

function VistaTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <View
      onPress={onPress}
      pressStyle={{ opacity: 0.8 }}
      flex={1}
      height={32}
      borderRadius="$3"
      alignItems="center"
      justifyContent="center"
      backgroundColor={active ? ACCENT : '$backgroundHover'}
    >
      <Text fontSize="$2" fontWeight="800" color={active ? '#fff' : '$textMuted'}>{label}</Text>
    </View>
  )
}

function EstadoChip({ label, active, color, onPress }: { label: string; active: boolean; color: string; onPress: () => void }) {
  return (
    <View
      onPress={onPress}
      pressStyle={{ opacity: 0.7 }}
      borderRadius="$10"
      paddingHorizontal="$3"
      height={32}
      alignItems="center"
      justifyContent="center"
      borderWidth={1.5}
      borderColor={color}
      backgroundColor={active ? color : 'transparent'}
    >
      <Text fontSize="$2" fontWeight="600" color={active ? '#fff' : color}>{label}</Text>
    </View>
  )
}

function TicketCard({ t, onPress, theme }: { t: ITicket; onPress: () => void; theme: any }) {
  const estadoVis = estadoVisual(t.EstadoCode, t.Estado, t.Mecanico_UserCode)
  const estadoC = estadoVis.color
  const prioC = colorPrioridad(t.Prioridad ?? '')
  // Prioridad Alta: realce sutil en rojo para captar la atención en el listado
  // (fondo levemente teñido + marco rojo tenue + halo suave en iOS).
  const esAlta = t.Prioridad === 'Alta'
  return (
    <View
      onPress={onPress}
      pressStyle={{ opacity: 0.9, scale: 0.997 }}
      backgroundColor={esAlta ? 'rgba(239, 68, 68, 0.06)' : '$backgroundElevated'}
      borderRadius="$5"
      borderLeftWidth={4}
      borderLeftColor={estadoC}
      borderWidth={esAlta ? 1.5 : 1}
      borderColor={esAlta ? 'rgba(239, 68, 68, 0.43)' : '$border'}
      padding="$3"
      gap="$2"
      {...shadows.sm}
      {...(esAlta ? { shadowColor: '#EF4444', shadowOpacity: 0.19 } : {})}
    >
      <XStack alignItems="center" justifyContent="space-between">
        <XStack alignItems="center" gap="$2" flex={1}>
          <Text fontSize="$4" fontWeight="800" color="$text">{t.CodigoTicket}</Text>
          {/* Viene colgado del turno anterior: pegado al folio, para que se lea en
              la tarjeta sin tener que abrirla. */}
          {t.DelTurnoAnterior && (
            <View backgroundColor="#f59e0b" borderRadius="$10" paddingHorizontal="$2" paddingVertical="$0.5">
              <Text fontSize="$1" fontWeight="700" color="#fff">turno ant.</Text>
            </View>
          )}
        </XStack>
        <View backgroundColor={estadoC} borderRadius="$10" paddingHorizontal="$2.5" paddingVertical="$1">
          <Text fontSize="$1" fontWeight="700" color="#fff">{estadoVis.label}</Text>
        </View>
      </XStack>

      <XStack alignItems="center" gap="$2" flexWrap="wrap">
        {!!t.Prioridad && (
          <XStack alignItems="center" gap="$1.5">
            <View width={8} height={8} borderRadius={4} backgroundColor={prioC} />
            <Text fontSize="$2" color={esAlta ? prioC : '$textMuted'} fontWeight={esAlta ? '800' : '400'}>{t.Prioridad}</Text>
          </XStack>
        )}
        {!!t.Area && <Text fontSize="$2" color="$textMuted">· {t.Area}</Text>}
        {!!t.Operacion && <Text fontSize="$2" color="$textMuted">· {t.Operacion}</Text>}
        {!!t.ValidadoPor && (
          <View backgroundColor="rgba(5,150,105,0.15)" borderRadius="$10" paddingHorizontal="$2" paddingVertical={2}>
            <Text fontSize={10} color="#059669" fontWeight="800">✓ Validado</Text>
          </View>
        )}
      </XStack>

      <XStack alignItems="center" justifyContent="space-between">
        <Text fontSize="$2" color="$text" flex={1} numberOfLines={1}>
          {t.TipoDestino === 'AREA'
            ? `🛠 ${t.Objeto || 'Trabajo de área'}`
            : ([t.Modelo, t.NumeroMaquina].filter(Boolean).join('  ·  ') || 'Sin máquina')}
        </Text>
        <Text fontSize="$1" color="$textMuted">{fmtFecha(t.Fecha)}</Text>
      </XStack>

      {!!t.Mecanico && (
        <Text fontSize="$2" color="$textMuted">Asignado a: <Text color="$text">{t.Mecanico}</Text></Text>
      )}
    </View>
  )
}

function EmptyState({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <YStack alignItems="center" justifyContent="center" paddingVertical="$10" gap="$2">
      {icon}
      <Text fontSize="$4" fontWeight="700" color="$text">{title}</Text>
      {!!subtitle && <Text fontSize="$2" color="$textMuted" textAlign="center">{subtitle}</Text>}
    </YStack>
  )
}
