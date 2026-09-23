import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshControl, FlatList } from 'react-native'
import { Text, XStack, YStack, View, Spinner, useTheme } from 'tamagui'
import { useFocusEffect } from '@react-navigation/native'
import {
  // `History` se renombra: choca con el tipo global History del DOM y TS resuelve ese.
  Stamp, Package, User, ChevronDown, ChevronUp, CalendarDays, Check, X as Equis,
  IdCard, History as HistoryIcon,
} from 'lucide-react-native'

import { usePageHeader } from '../../../hooks/usePageHeader'
import { useShowToast } from '../../../utils/useShowToast'
import AppInput from '../../../components/commons/AppInput'
import AppSelect from '../../../components/commons/AppSelect'
import ConfirmDialog from '../../../components/commons/ConfirmDialog'
import { NotificationBell } from '../../../components/notifications/NotificationBell'
import { subscribeOpenPaseSalidaFirma } from '../../../services/pasesSalidaNavigation'
import SearchInput from '../../../components/commons/SearchInput'
import RecordCount from '../../../components/commons/RecordCount'
import SkeletonList from '../../../components/Skeletons/SkeletonList'
import ErrorState from '../../AdmSys/ErrorState'
import EmptyState from '../../AdmSys/EmptyState'
import { AppError, handleError } from '../../../utils/errorHandler'
import { shadows } from '../../../theme/shadows'
import { ACCENT, ACCENT_BG, PRESS_CARD, estadoVisual, fmtCantidad, fmtFecha, fmtFechaHora } from '../pasesSalida.helpers'
import LineaFirmas from '../Pases/LineaFirmas'
import TarjetaResaltable from '../Pases/TarjetaResaltable'
import LineaEstados from '../Pases/LineaEstados'
import { pasesService } from '../../../api/modules/pasesSalida/pases.service'
import {
  armarBitacora, BandejaFirma, IFirmaUsuario, IPaseSalida, IPaseSalidaDetalle,
  IPaseSalidaEstado, IPasoFirma,
} from '../../../api/modules/pasesSalida/pases.types'

/** Las tres pestañas. La primera es la cola de trabajo; las otras, historial. */
const BANDEJAS: { key: BandejaFirma; label: string }[] = [
  { key: 'PEND', label: 'Pendientes' },
  { key: 'APR', label: 'Aprobadas' },
  { key: 'REJ', label: 'Rechazadas' },
]

const VERDE = '#22c55e'
const ROJO = '#ef4444'

/**
 * Qué se muestra dentro de la bandeja de Aprobadas.
 *
 * Un pase que firmé y que después venció sin usarse no es lo mismo que uno que
 * firmé y salió: el primero no es historial de trabajo hecho, es trabajo que se
 * perdió. Mezclados, la bandeja no responde "¿qué aprobé?" ni "¿qué se me
 * venció?".
 *
 * Arranca en VIG —lo que sirvió o sigue vivo— porque es la lectura normal. Los
 * vencidos se piden aparte, y el control ni aparece cuando no hay ninguno.
 */
type VistaApr = 'VIG' | 'VEN' | 'TODO'

const VISTAS_APR: { key: VistaApr; label: string }[] = [
  { key: 'VIG', label: 'Aprobados' },
  { key: 'VEN', label: 'Vencidos' },
  { key: 'TODO', label: 'Todos' },
]

/**
 * Los pases que esperan MI firma.
 *
 * UNA SOLA PANTALLA, NO UNA POR FIRMA. La consulta se hace por acceso: se
 * traen los accesos de firma del usuario y se pregunta por uno. Lo normal es
 * que tenga uno solo, y en ese caso el selector ni aparece — se usa ese y
 * punto. Con varios (el caso de pruebas) se elige cuál bandeja se está viendo.
 *
 * NO SE FILTRA POR PERÍODO, a diferencia de Mis pases. Acá la lista ya está
 * acotada por naturaleza — solo lo pendiente — y esconder un pase viejo sería
 * esconder trabajo atrasado, que es justamente lo que hay que ver.
 *
 * Firmar y rechazar todavía no: esta entrega es la consulta.
 */
export default function AprobacionesScreen() {
  const theme = useTheme()
  const { showToast } = useShowToast()

  const [firmas, setFirmas] = useState<IFirmaUsuario[]>([])
  const [firmaId, setFirmaId] = useState<string>('')

  const [items, setItems] = useState<IPaseSalida[]>([])
  // SearchInput filtra contra `items` y devuelve el resultado acá.
  const [filtered, setFiltered] = useState<IPaseSalida[]>([])
  const [loading, setLoading] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  // Un fallo de la API NO es una lista vacía: se guarda y se muestra como error,
  // con su reintento. Tragárselo hacía que "se cayó el servidor" se leyera como
  // "no tiene firmas asignadas".
  const [error, setError] = useState<AppError | null>(null)

  // Acordeón: qué pase está abierto y el detalle ya traído de cada uno.
  // Se carga al abrir y se guarda: volver a abrirlo no vuelve a consultar.
  const [abierto, setAbierto] = useState<number | null>(null)
  const [detalles, setDetalles] = useState<Record<number, IPaseSalidaDetalle[]>>({})
  const [bitacoras, setBitacoras] = useState<Record<number, IPasoFirma[]>>({})
  const [historiales, setHistoriales] = useState<Record<number, IPaseSalidaEstado[]>>({})
  const [cargandoDet, setCargandoDet] = useState<number | null>(null)

  const [bandeja, setBandeja] = useState<BandejaFirma>('PEND')
  const [vistaApr, setVistaApr] = useState<VistaApr>('VIG')
  // La acción que está por confirmarse. El diálogo sale de acá.
  const [accion, setAccion] = useState<{ pase: IPaseSalida; tipo: 'aprobar' | 'rechazar' } | null>(null)
  // El motivo del rechazo. Vive fuera de `accion` para no reescribir el objeto
  // en cada tecla.
  const [motivo, setMotivo] = useState('')

  const [firmando, setFirmando] = useState(false)

  /**
   * El pase que trajo la notificación. Se resalta unos segundos y se apaga: es
   * para encontrarlo en la lista, no un estado del pase.
   */
  const [highlightId, setHighlightId] = useState<number | null>(null)

  /**
   * Cuántos de los que firmé vencieron sin usarse. Se cuenta sobre la bandeja
   * COMPLETA y no sobre lo buscado: el control no puede desaparecer a mitad de
   * una búsqueda, que es justo cuando uno lo iba a usar.
   */
  const vencidos = useMemo(() => items.filter(p => p.Estado === 'PSVEN').length, [items])

  /** El corte solo existe si hay algo que cortar. */
  const hayCorte = bandeja === 'APR' && vencidos > 0

  const visibles = useMemo(() => {
    if (!hayCorte || vistaApr === 'TODO') return filtered
    return vistaApr === 'VEN'
      ? filtered.filter(p => p.Estado === 'PSVEN')
      : filtered.filter(p => p.Estado !== 'PSVEN')
  }, [filtered, hayCorte, vistaApr])

  const abrirAccion = (pase: IPaseSalida, tipo: 'aprobar' | 'rechazar') => {
    setMotivo('')
    setAccion({ pase, tipo })
  }

  /**
   * Registra la firma. El paso no se manda: lo resuelve el servidor tomando el
   * actual de la cadena, y de paso mueve el estado del pase —En aprobación si
   * faltan firmas, Aprobado si era la última, Rechazado al rechazar.
   */
  const firmar = async () => {
    if (!accion || !firmaId) return
    const { pase, tipo } = accion

    if (tipo === 'rechazar' && !motivo.trim()) {
      showToast('warning', 'Falta el motivo', 'Indique por qué se rechaza el pase')
      return
    }

    setFirmando(true)
    try {
      const res = await pasesService.firmar({
        Id: pase.Id,
        Access_Id: Number(firmaId),
        IsAuth: tipo === 'aprobar',
        Comentario: motivo.trim() || null,
      })

      if (res.Success) {
        setAccion(null)
        showToast('success', tipo === 'aprobar' ? 'Firmado' : 'Rechazado',
          res.SuccessMessage || 'La firma quedó registrada')
        // El pase sale de esta bandeja y entra a otra: hay que recargar las dos
        // cosas, y el detalle guardado ya no refleja las firmas.
        setDetalles({}); setBitacoras({}); setAbierto(null)
        await cargarPases()
      } else {
        showToast('error', 'No se pudo registrar', res.ErrorMessage || 'Intente de nuevo')
      }
    } catch (e: any) {
      showToast('error', 'Error', e?.message || 'No se pudo registrar la firma')
    } finally { setFirmando(false) }
  }

  // Las firmas se cargan una vez; la bandeja se recarga cada vez que cambia
  // cuál se está viendo.
  const cargarFirmas = useCallback(async () => {
    try {
      const r = await pasesService.getMisFirmas()
      const data = r.Data ?? []
      setFirmas(data)
      setFirmaId(prev => (prev && data.some(f => String(f.Id) === prev) ? prev : (data[0] ? String(data[0].Id) : '')))
      setError(null)
    } catch (e) {
      setFirmas([]); setFirmaId('')
      setError(handleError(e))
    }
  }, [])

  const cargarPases = useCallback(async () => {
    if (!firmaId) { setItems([]); setFiltered([]); return }
    try {
      const r = await pasesService.getPasesPorFirmar(Number(firmaId), bandeja)
      const data = r.Data ?? []
      setItems(data); setFiltered(data)
      setError(null)
    } catch (e) {
      setItems([]); setFiltered([])
      setError(handleError(e))
    }
  }, [firmaId, bandeja])

  useEffect(() => { (async () => { setLoading(true); await cargarFirmas(); setLoading(false) })() }, [cargarFirmas])
  useEffect(() => { cargarPases() }, [cargarPases])
  useFocusEffect(useCallback(() => { cargarPases() }, [cargarPases]))

  const onRefresh = useCallback(async () => {
    setRefrescando(true)
    // Lo traído deja de ser confiable después de recargar.
    setDetalles({}); setBitacoras({})
    await cargarFirmas(); await cargarPases()
    setRefrescando(false)
  }, [cargarFirmas, cargarPases])

  /**
   * Abre o cierra el acordeón. Detalle y bitácora se traen juntos la primera
   * vez y se guardan: volver a abrir el mismo pase no vuelve a consultar.
   */
  const alternar = async (id: number) => {
    if (abierto === id) { setAbierto(null); return }
    setAbierto(id)
    if (detalles[id]) return

    setCargandoDet(id)
    try {
      const [rDet, rFirmas, rHist] = await Promise.all([
        pasesService.getDetalle(id),
        pasesService.getFirmasPase(id),
        pasesService.getHistorialPase(id),
      ])
      setDetalles(prev => ({ ...prev, [id]: rDet.Data ?? [] }))
      setBitacoras(prev => ({ ...prev, [id]: armarBitacora(rFirmas.Data ?? []) }))
      setHistoriales(prev => ({ ...prev, [id]: rHist.Data ?? [] }))
    } catch {
      setDetalles(prev => ({ ...prev, [id]: [] }))
      setBitacoras(prev => ({ ...prev, [id]: [] }))
      setHistoriales(prev => ({ ...prev, [id]: [] }))
    } finally { setCargandoDet(null) }
  }

  /**
   * Llegó desde una notificación: se abre en Pendientes —que es donde está lo
   * que espera firma— y se resalta el pase.
   *
   * El destino puede llegar ANTES de que la lista esté cargada; no importa,
   * `highlightId` solo pinta el borde cuando la tarjeta aparece.
   */
  const listaRef = useRef<FlatList<IPaseSalida>>(null)
  /* En qué pase ya se hizo foco. Sin esta marca, cada recarga de la bandeja
     volvería a desplazar la pantalla mientras el resaltado siga vivo. */
  const enfocadoRef = useRef<number | null>(null)
  const apagadoRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const unsub = subscribeOpenPaseSalidaFirma(({ paseId, bandeja: destino }) => {
      // La bandeja viaja en el aviso: "te toca firmar" apunta a Pendientes,
      // pero "el pase que autorizaste no ha regresado" apunta a Aprobadas.
      // Sin esto el segundo caso dejaba al usuario donde el pase no está.
      setBandeja(destino ?? 'PEND')
      // Un pase atrasado llega por Aprobadas y estaría escondido si el corte
      // quedó en "solo vencidos": este no venció, salió.
      setVistaApr(destino === 'APR' ? 'TODO' : 'VIG')
      setAbierto(null)
      enfocadoRef.current = null
      setHighlightId(paseId)

      /* Red de seguridad: si el pase nunca aparece en la bandeja elegida, el
         resaltado no se queda encendido para siempre. */
      setTimeout(
        () => setHighlightId(actual => (actual === paseId ? null : actual)),
        15000,
      )
    })
    return unsub
  }, [])

  /**
   * Desplaza hasta el pase, pero ESPERANDO A QUE EXISTA EN LA LISTA.
   *
   * Acá el retraso es peor que en Mis pases: cambiar de bandeja no filtra lo que
   * ya está, VUELVE A CONSULTAR. A los 350 ms la lista es todavía la de la
   * bandeja anterior, así que el desplazamiento apuntaba a la fila equivocada o
   * a ninguna, y el resaltado se apagaba a los 4 segundos sin que se viera.
   *
   * Ahora los 4 segundos arrancan cuando la fila ya está en pantalla.
   */
  useEffect(() => {
    if (highlightId == null || enfocadoRef.current === highlightId) return

    const i = visibles.findIndex(x => x.Id === highlightId)
    // Todavía no llegó: se reintenta solo, cuando cambie la lista.
    if (i < 0) return

    enfocadoRef.current = highlightId
    listaRef.current?.scrollToIndex({ index: i, animated: true, viewPosition: 0 })

    /* El apagado NO va en el cleanup del efecto: `visibles` cambia con cada
       recarga, y el cleanup lo cancelaría sin que nadie lo vuelva a armar. */
    if (apagadoRef.current) clearTimeout(apagadoRef.current)
    apagadoRef.current = setTimeout(() => setHighlightId(null), 4000)
  }, [highlightId, visibles])

  useEffect(() => () => { if (apagadoRef.current) clearTimeout(apagadoRef.current) }, [])

  usePageHeader({
    center: <Text fontSize="$4" fontWeight="700" color="$text">Aprobaciones</Text>,
    right: <NotificationBell size={20} />,
  })

  if (loading) {
    return (
      <View flex={1} backgroundColor="$background">
        <SkeletonList />
      </View>
    )
  }

  // El error se muestra antes que cualquier otra cosa: si la API falló, no se
  // sabe si hay firmas o no, y decir "no tiene firmas" sería inventar.
  if (error) {
    return (
      <View flex={1} backgroundColor="$background">
        <ErrorState
          type={error.type}
          title={error.title}
          message={error.message}
          errorCode={error.status}
          onRetry={async () => {
            setLoading(true); await cargarFirmas(); await cargarPases(); setLoading(false)
          }}
        />
      </View>
    )
  }

  // Sin acceso de firma no hay bandeja que mostrar.
  if (!firmas.length) {
    return (
      <View flex={1} backgroundColor="$background">
        <EmptyState
          title="Sin firmas asignadas"
          message="Esta pantalla muestra los pases que esperan su firma. Solicite al administrador que le conceda un acceso de firma."
          onAction={async () => { setLoading(true); await cargarFirmas(); setLoading(false) }}
        />
      </View>
    )
  }

  return (
    <View flex={1} backgroundColor="$background">
      <YStack paddingHorizontal="$3" paddingTop="$3">
        {/* Con una sola firma no hay nada que elegir ni que aclarar: se usa esa
            y la pantalla arranca directo en las pestañas. */}
        {firmas.length > 1 ? (
          <AppSelect
            label="Firmando como"
            value={firmaId}
            onValueChange={(v) => setFirmaId(String(v))}
            options={firmas.map(f => ({ label: f.Name.replace(/^Firma /, ''), value: String(f.Id) }))}
          />
        ) : null}

        {/* Selector segmentado, igual que el del dashboard de horas extra: en un
            teléfono el subrayado es un blanco chico para el dedo y a contraluz
            no se distingue cuál está activo. Cambiar de bandeja vuelve a
            consultar; cada una es una consulta distinta. */}
        <XStack padding={4} gap={4} backgroundColor="$backgroundElevated"
          borderRadius="$4" marginBottom="$3" {...shadows.sm}>
          {BANDEJAS.map(b => {
            const sel = bandeja === b.key
            return (
              <XStack key={b.key} flex={1} alignItems="center" justifyContent="center"
                paddingVertical="$2" borderRadius="$3"
                backgroundColor={sel ? ACCENT : 'transparent'}
                pressStyle={{ opacity: 0.7 }}
                onPress={() => {
                  setBandeja(b.key); setAbierto(null)
                  // Cada bandeja se entra desde cero: dejar puesto "solo
                  // vencidos" al volver daría una lista recortada sin que nadie
                  // lo haya pedido.
                  setVistaApr('VIG')
                }}>
                <Text fontSize={11} fontWeight={sel ? '800' : '600'}
                  color={sel ? '#FFFFFF' : '$textMuted'} numberOfLines={1}>
                  {b.label}
                </Text>
              </XStack>
            )
          })}
        </XStack>

        <SearchInput
          data={items}
          searchKeys={['Correlativo', 'TipoSalida', 'EnviadoA', 'Responsable', 'Solicitante', 'Comentario']}
          onResults={setFiltered}
          placeholder="Buscar..."
        />

        {/* El corte solo aparece si hay vencidos. Sin ellos, tres chips con dos
            listas iguales serían ruido. */}
        {hayCorte ? (
          <YStack gap="$1.5" marginBottom="$2">
            <XStack gap="$2">
              {VISTAS_APR.map(v => {
                const on = vistaApr === v.key
                const rojo = v.key === 'VEN'
                const color = rojo ? ROJO : ACCENT
                return (
                  <View key={v.key} onPress={() => setVistaApr(v.key)} pressStyle={{ opacity: 0.8 }}
                    borderWidth={1} borderColor={on ? color : '$border'}
                    backgroundColor={on ? (rojo ? `${ROJO}1F` : ACCENT_BG) : 'transparent'}
                    borderRadius="$10" paddingHorizontal="$3" paddingVertical={5}>
                    <Text fontSize={11} fontWeight="800" color={on ? color : '$textMuted'}>
                      {v.label}
                      {v.key === 'VEN' ? ` (${vencidos})` : ''}
                    </Text>
                  </View>
                )
              })}
            </XStack>
            <Text fontSize={10} color="$textMuted">
              {vencidos === 1
                ? 'Un pase que aprobó venció sin usarse: se le pasó la fecha de salida y el plazo de gracia, así que nunca salió.'
                : `${vencidos} pases que aprobó vencieron sin usarse: se les pasó la fecha de salida y el plazo de gracia, así que nunca salieron.`}
            </Text>
          </YStack>
        ) : null}

        <RecordCount
          count={visibles.length}
          label={bandeja === 'PEND' ? 'Por firmar'
            : bandeja === 'REJ' ? 'Rechazadas'
              : hayCorte && vistaApr === 'VEN' ? 'Vencidas'
                : 'Aprobadas'}
        />
      </YStack>

      <FlatList
        ref={listaRef}
        data={visibles}
        keyExtractor={(it) => String(it.Id)}
        /* Las tarjetas tienen alto variable (el acordeón), así que no hay
           getItemLayout y scrollToIndex puede fallar si el destino todavía no
           se renderizó. Se cae a un scroll aproximado en vez de reventar. */
        onScrollToIndexFailed={(info) => {
          listaRef.current?.scrollToOffset({
            offset: info.averageItemLength * info.index,
            animated: true,
          })
        }}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 12, paddingBottom: 40, flexGrow: 1 }}
        ItemSeparatorComponent={() => <View height={10} />}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} tintColor={ACCENT} />}
        ListEmptyComponent={
          <EmptyState
            title={items.length ? 'Sin resultados' : 'Nada por firmar'}
            message={
              /* Con el corte puesto, "sin resultados" a secas haría pensar que
                 la bandeja está vacía cuando lo que pasa es que se está mirando
                 una de las dos mitades. */
              hayCorte && vistaApr === 'VEN' && !visibles.length
                ? 'Ningún pase vencido coincide con la búsqueda.'
                : hayCorte && vistaApr === 'VIG' && !visibles.length
                  ? 'Todos los pases de esta bandeja vencieron sin usarse. Véalos en "Vencidos".'
                  : items.length
                    ? 'Ningún pase coincide con la búsqueda.'
                    : bandeja === 'PEND'
                      ? 'No hay pases esperando esta firma.'
                      : 'Todavía no hay pases en este historial.'}
          />
        }
        renderItem={({ item: p }) => {
          const est = estadoVisual(p.Estado)
          const open = abierto === p.Id
          const lineas = detalles[p.Id]
          // El que trajo la notificación, por unos segundos.
          const resaltado = highlightId === p.Id

          return (
            /* El resaltado va en un ANILLO por fuera, para que la tarjeta quede
               con props ESTÁTICAS e idéntica a la de Control de salida: con el
               fondo y el borde puestos por un ternario, al presionarla la sombra
               de la elevación se asomaba por las orillas. Ver TarjetaResaltable. */
            <TarjetaResaltable resaltado={resaltado}>
            <YStack backgroundColor="$backgroundElevated" borderRadius="$4"
              borderLeftWidth={4} borderLeftColor={est.color} borderWidth={1} borderColor="$border"
              paddingVertical="$3" paddingHorizontal="$4" gap="$2" {...shadows.sm}
              onPress={() => alternar(p.Id)} pressStyle={PRESS_CARD}>

              {/* ── Encabezado ── */}
              <XStack alignItems="center" gap="$2">
                <Text flex={1} fontSize={14} fontWeight="800" color="$text">{p.Correlativo}</Text>
                <View backgroundColor={est.bg} borderWidth={1} borderColor={est.color}
                  paddingHorizontal="$2" paddingVertical={3} borderRadius="$10">
                  <Text fontSize={10} fontWeight="700" color={est.color}>
                    {p.EstadoNombre || est.label}
                  </Text>
                </View>

                {/* Aprobar y rechazar, al lado del estado: la decisión vive
                    junto al dato que la justifica. Solo en Pendientes — en el
                    historial no hay nada que decidir. */}
                {bandeja === 'PEND' ? (
                  <XStack gap="$1.5">
                    <View onPress={(e: any) => { e?.stopPropagation?.(); abrirAccion(p, 'rechazar') }}
                      pressStyle={{ opacity: 0.7 }} hitSlop={6}
                      width={30} height={28} borderRadius="$2"
                      borderWidth={1.5} borderColor={ROJO} backgroundColor={`${ROJO}1F`}
                      alignItems="center" justifyContent="center">
                      <Equis size={14} color={ROJO} />
                    </View>
                    <View onPress={(e: any) => { e?.stopPropagation?.(); abrirAccion(p, 'aprobar') }}
                      pressStyle={{ opacity: 0.7 }} hitSlop={6}
                      width={30} height={28} borderRadius="$2"
                      borderWidth={1.5} borderColor={VERDE} backgroundColor={`${VERDE}1F`}
                      alignItems="center" justifyContent="center">
                      <Check size={15} color={VERDE} />
                    </View>
                  </XStack>
                ) : null}

                {open
                  ? <ChevronUp size={18} color={theme.textMuted?.val} />
                  : <ChevronDown size={18} color={theme.textMuted?.val} />}
              </XStack>

              {/* El tipo de salida manda: define quién firma y si la cosa
                  regresa. Va en píldora llena, no como texto suelto. */}
              <XStack alignItems="center" gap="$2" flexWrap="wrap">
                <View backgroundColor={ACCENT} borderRadius="$3"
                  paddingHorizontal="$2.5" paddingVertical={4}>
                  <Text fontSize={12} fontWeight="900" color="#fff">{p.TipoSalida}</Text>
                </View>
                {p.Retorna ? (
                  <View backgroundColor={ACCENT_BG} borderWidth={1} borderColor={ACCENT}
                    borderRadius="$3" paddingHorizontal="$2" paddingVertical={4}>
                    <Text fontSize={10} fontWeight="800" color={ACCENT}>Regresa</Text>
                  </View>
                ) : null}
                {p.EnviadoA ? (
                  <Text flex={1} fontSize={12} color="$textMuted" numberOfLines={1}>→ {p.EnviadoA}</Text>
                ) : null}
              </XStack>

              {/* Quién lo pide y cuándo sale. El "creado" no va acá: es la
                  primera parada de la línea de firmas, dentro del acordeón. */}
              <XStack alignItems="center" gap="$3" flexWrap="wrap">
                <XStack alignItems="center" gap="$1.5">
                  <User size={12} color={theme.textMuted?.val} />
                  <Text fontSize={11} color="$textMuted">{p.Solicitante || p.Create_By}</Text>
                </XStack>
                {/* Quién lo retira, que no es quien lo pide. Al firmante le
                    importa: está autorizando que ESA persona saque eso. */}
                {p.Responsable ? (
                  <XStack alignItems="center" gap="$1.5">
                    <IdCard size={12} color={theme.textMuted?.val} />
                    <Text fontSize={11} color="$textMuted">Retira {p.Responsable}</Text>
                  </XStack>
                ) : null}
                {/* Etiqueta completa y no un "Sale 18/09": el firmante está
                    autorizando PARA ESA FECHA, y con la fecha suelta se lee como
                    un dato más en vez de como parte de lo que aprueba. */}
                {p.FechaSalida ? (
                  <XStack alignItems="center" gap="$1.5">
                    <CalendarDays size={12} color={theme.textMuted?.val} />
                    <Text fontSize={11} color="$textMuted">Fecha de salida: </Text>
                    <Text fontSize={11} color="$text" fontWeight="800">{fmtFecha(p.FechaSalida)}</Text>
                  </XStack>
                ) : null}
              </XStack>

              {/* ── Detalle desplegable ── */}
              {open ? (
                <YStack gap="$2" marginTop="$1" paddingTop="$2.5"
                  borderTopWidth={1} borderTopColor="$border">

                  <XStack alignItems="center" gap="$1.5">
                    <Package size={12} color={theme.primary?.val} />
                    <Text fontSize={11} fontWeight="900" color="$textMuted">
                      QUÉ SALE ({p.Lineas})
                    </Text>
                  </XStack>

                  {cargandoDet === p.Id ? (
                    <XStack alignItems="center" gap="$2" paddingVertical="$2">
                      <Spinner size="small" color={ACCENT} />
                      <Text fontSize={11} color="$textMuted">Cargando detalle…</Text>
                    </XStack>
                  ) : (lineas ?? []).map(d => (
                    <YStack key={d.Id} gap={2} backgroundColor="$backgroundHover"
                      borderRadius="$3" paddingHorizontal="$3" paddingVertical="$2">

                      <XStack alignItems="flex-start" gap="$2">
                        <Text flex={1} fontSize={12} fontWeight="800" color="$text">{d.Material}</Text>
                        <Text fontSize={12} fontWeight="900" color="$primary">
                          {fmtCantidad(d.Cantidad)}{d.UnidadMedida ? ` ${d.UnidadMedida}` : ''}
                        </Text>
                      </XStack>

                      {d.Descripcion ? (
                        <Text fontSize={11} color="$text">{d.Descripcion}</Text>
                      ) : null}

                      {/* Marca siempre; modelo y serie solo si es equipo. En una
                          sola línea separada por puntos para no gastar alto. */}
                      {d.Marca || d.Modelo || d.Serie ? (
                        <Text fontSize={10} color="$textMuted">
                          {[
                            d.Marca ? `Marca: ${d.Marca}` : null,
                            d.Modelo ? `Modelo: ${d.Modelo}` : null,
                            d.Serie ? `Serie: ${d.Serie}` : null,
                          ].filter(Boolean).join('  ·  ')}
                        </Text>
                      ) : null}
                    </YStack>
                  ))}

                  {lineas && lineas.length === 0 && cargandoDet !== p.Id ? (
                    <Text fontSize={11} color="$textMuted">Este pase no tiene líneas.</Text>
                  ) : null}

                  {/* La bitácora: por dónde va la cadena y quién falta. */}
                  {bitacoras[p.Id]?.length ? (
                    <YStack gap="$2" marginTop="$2" paddingTop="$2.5"
                      borderTopWidth={1} borderTopColor="$border">
                      <XStack alignItems="center" gap="$1.5">
                        <Stamp size={12} color={theme.primary?.val} />
                        <Text fontSize={11} fontWeight="900" color="$textMuted">FIRMAS</Text>
                      </XStack>
                      <LineaFirmas
                        pasos={bitacoras[p.Id]}
                        pasoActual={p.MiPaso}
                        creadoPor={p.Solicitante || p.Create_By}
                        creadoEn={p.Creation_Date}
                        fmtFecha={fmtFechaHora}
                      />
                    </YStack>
                  ) : null}

                  {/* El movimiento del pase: qué le fue pasando y cuándo. Va
                      aparte de las firmas porque responde otra pregunta — esas
                      dicen qué falta, esto dice qué pasó. */}
                  {historiales[p.Id]?.length ? (
                    <YStack gap="$2" marginTop="$2" paddingTop="$2.5"
                      borderTopWidth={1} borderTopColor="$border">
                      <XStack alignItems="center" gap="$1.5">
                        <HistoryIcon size={12} color={theme.primary?.val} />
                        <Text fontSize={11} fontWeight="900" color="$textMuted">MOVIMIENTO</Text>
                      </XStack>
                      <LineaEstados movimientos={historiales[p.Id]} />
                    </YStack>
                  ) : null}
                </YStack>
              ) : null}
            </YStack>
            </TarjetaResaltable>
          )
        }}
      />

      <ConfirmDialog
        open={!!accion}
        onOpenChange={(o: boolean) => { if (!o && !firmando) setAccion(null) }}
        loading={firmando}
        title={accion?.tipo === 'aprobar' ? 'Aprobar pase' : 'Rechazar pase'}
        message={
          accion?.tipo === 'aprobar'
            ? `¿Aprobar ${accion?.pase.Correlativo}? Su firma queda registrada y el pase avanza al siguiente paso.`
            : `¿Rechazar ${accion?.pase.Correlativo}? El pase no podrá salir.`
        }
        /* Un rechazo sin motivo deja al solicitante sin saber qué corregir, así
           que el campo va dentro del mismo diálogo en vez de un modal aparte. */
        extra={accion?.tipo === 'rechazar' ? (
          <YStack gap="$1.5">
            <AppInput
              label="Motivo del rechazo"
              value={motivo}
              onChangeText={setMotivo}
              placeholder="Explique por qué no procede"
              multiline
            />
            <Text fontSize={10} color="$textMuted">
              Lo verá el solicitante junto al pase rechazado.
            </Text>
          </YStack>
        ) : undefined}
        confirmLabel={accion?.tipo === 'aprobar' ? 'Aprobar' : 'Rechazar'}
        confirmColor={accion?.tipo === 'aprobar' ? VERDE : ROJO}
        onConfirm={firmar}
      />
    </View>
  )
}
