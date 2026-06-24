import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshControl, useWindowDimensions } from 'react-native'
import { ScrollView, Text, XStack, YStack, View, Spinner, Input, useTheme } from 'tamagui'
import { Search, Plus, Wrench, RefreshCw } from 'lucide-react-native'
import { useNavigation, useFocusEffect } from '@react-navigation/native'

import { usePageHeader } from '../../../hooks/usePageHeader'
import { useAuth } from '../../../context/AuthContext'
import { useShowToast } from '../../../utils/useShowToast'
import AppSelect from '../../../components/commons/AppSelect'
import { ticketsService } from '../../../api/modules/mantenimiento/tickets.service'
import { ITicket, IArea, IPrioridad, IEstado } from '../../../api/modules/mantenimiento/tickets.types'
import { colorEstado, colorPrioridad, ACCENT } from '../mantenimiento.helpers'

// Roles que pueden reportar un paro (crear ticket).
const ROLES_CREAR = ['Supervisor de Producción', 'Administrador']

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
  })

  const theme = useTheme()
  const navigation = useNavigation<any>()
  const { user } = useAuth()
  const { showToast } = useShowToast()

  // Responsive: en tablets/pantallas anchas centramos el contenido y usamos
  // grid de 2 columnas para aprovechar el espacio.
  const { width } = useWindowDimensions()
  const isWide = width >= 700
  const CONTENT_MAX = 1000

  const [tickets, setTickets] = useState<ITicket[]>([])
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
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

  const puedeCrear = useMemo(
    () => (user?.Roles ?? []).some(r => ROLES_CREAR.includes(r.RoleName)),
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

  const cargarTickets = useCallback(async () => {
    setError(null)
    try {
      const res = await ticketsService.getTickets({
        estado_Id: estadoId,
        prioridad_Id: prioridadId,
        area_Id: areaId,
        search: search.trim() || undefined,
        take: 100,
      })
      if (!res.Success) {
        setError(res.ErrorMessage || 'No se pudieron cargar los tickets')
        setTickets([])
        return
      }
      setTickets(res.Data ?? [])
    } catch (e: any) {
      setError(e?.message || 'Error de conexión')
      setTickets([])
    }
  }, [estadoId, prioridadId, areaId, search])

  useEffect(() => {
    ;(async () => {
      setCargando(true)
      await cargarCatalogos()
      await cargarTickets()
      setCargando(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Recarga al cambiar filtros (con pequeño debounce para la búsqueda).
  useEffect(() => {
    const t = setTimeout(() => {
      cargarTickets()
    }, 350)
    return () => clearTimeout(t)
  }, [estadoId, prioridadId, areaId, search, cargarTickets])

  const onRefresh = useCallback(async () => {
    setRefrescando(true)
    await cargarTickets()
    setRefrescando(false)
  }, [cargarTickets])

  const irADetalle = (t: ITicket) => {
    // TODO (siguiente paso): navegar a la pantalla de Detalle.
    showToast('info', t.CodigoTicket, 'Detalle del ticket — próximamente')
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

  return (
    <View flex={1} backgroundColor="$background">
      {/* Filtros */}
      <YStack paddingHorizontal="$3" paddingTop="$3" gap="$2" width="100%" maxWidth={CONTENT_MAX} alignSelf="center">
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
            placeholder="Buscar por folio, máquina o modelo"
            placeholderTextColor={theme.textMuted?.val}
            color="$text"
            fontSize="$3"
            value={search}
            onChangeText={setSearch}
          />
        </XStack>

        {/* Chips de estado */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <XStack gap="$2" paddingVertical="$1">
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
          </XStack>
        </ScrollView>

        {/* Área / Prioridad */}
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
      </YStack>

      {/* Lista */}
      {cargando ? (
        <YStack flex={1} alignItems="center" justifyContent="center" gap="$3">
          <Spinner size="large" color={ACCENT} />
          <Text color="$textMuted">Cargando tickets…</Text>
        </YStack>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 12, paddingBottom: 96 }}
          refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} tintColor={ACCENT} />}
        >
          {error ? (
            <EmptyState
              icon={<RefreshCw size={28} color={theme.textMuted?.val} />}
              title="No se pudieron cargar los tickets"
              subtitle={error}
            />
          ) : tickets.length === 0 ? (
            <EmptyState
              icon={<Wrench size={28} color={theme.textMuted?.val} />}
              title="Sin tickets"
              subtitle="No hay tickets que coincidan con los filtros."
            />
          ) : (
            <View
              width="100%"
              maxWidth={CONTENT_MAX}
              alignSelf="center"
              flexDirection="row"
              flexWrap="wrap"
              justifyContent="space-between"
            >
              {tickets.map(t => (
                <View key={t.Id} width={isWide ? '49%' : '100%'} marginBottom="$2.5">
                  <TicketCard t={t} onPress={() => irADetalle(t)} theme={theme} />
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* FAB Reportar paro (según rol) */}
      {puedeCrear && (
        <View position="absolute" right={20} bottom={24}>
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
        </View>
      )}
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
  const estadoC = colorEstado(t.Estado ?? '')
  const prioC = colorPrioridad(t.Prioridad ?? '')
  return (
    <View
      onPress={onPress}
      pressStyle={{ opacity: 0.9, scale: 0.997 }}
      backgroundColor="$backgroundHover"
      borderRadius="$5"
      borderLeftWidth={4}
      borderLeftColor={estadoC}
      padding="$3"
      gap="$2"
    >
      <XStack alignItems="center" justifyContent="space-between">
        <Text fontSize="$4" fontWeight="800" color="$text">{t.CodigoTicket}</Text>
        <View backgroundColor={estadoC} borderRadius="$10" paddingHorizontal="$2.5" paddingVertical="$1">
          <Text fontSize="$1" fontWeight="700" color="#fff">{t.Estado}</Text>
        </View>
      </XStack>

      <XStack alignItems="center" gap="$2" flexWrap="wrap">
        {!!t.Prioridad && (
          <XStack alignItems="center" gap="$1.5">
            <View width={8} height={8} borderRadius={4} backgroundColor={prioC} />
            <Text fontSize="$2" color="$textMuted">{t.Prioridad}</Text>
          </XStack>
        )}
        {!!t.Area && <Text fontSize="$2" color="$textMuted">· {t.Area}</Text>}
        {!!t.Operacion && <Text fontSize="$2" color="$textMuted">· {t.Operacion}</Text>}
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
        <Text fontSize="$2" color="$textMuted">Mecánico: <Text color="$text">{t.Mecanico}</Text></Text>
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
