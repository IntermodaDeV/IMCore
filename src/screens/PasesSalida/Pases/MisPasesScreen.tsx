import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshControl, FlatList, ScrollView } from 'react-native'
import { Text, XStack, YStack, View, useTheme } from 'tamagui'
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native'
import {
  ChevronRight, RotateCcw, Package, Plus, QrCode, Trash2, IdCard, CalendarDays,
} from 'lucide-react-native'
import dayjs from 'dayjs'

import { usePageHeader } from '../../../hooks/usePageHeader'
import { useShowToast } from '../../../utils/useShowToast'
import ConfirmDialog from '../../../components/commons/ConfirmDialog'
import { NotificationBell } from '../../../components/notifications/NotificationBell'
import { subscribeOpenMiPaseSalida } from '../../../services/pasesSalidaNavigation'
import SearchInput from '../../../components/commons/SearchInput'
import RecordCount from '../../../components/commons/RecordCount'
import SkeletonList from '../../../components/Skeletons/SkeletonList'
import ErrorState from '../../AdmSys/ErrorState'
import EmptyState from '../../AdmSys/EmptyState'
import { AppError, handleError } from '../../../utils/errorHandler'
import { useAuth } from '../../../context/AuthContext'
import { shadows } from '../../../theme/shadows'
import {
  ACCENT, ACCENT_BG, ACCESO_SOLICITANTE, ESTADOS_FILTRO, ETIQUETA_ESTADO, PRESS_CARD,
  estadoVisual, fmtFecha, fmtFechaHora, tieneAcceso,
} from '../pasesSalida.helpers'
import { pasesService } from '../../../api/modules/pasesSalida/pases.service'
import {
  armarBitacora, ESTADOS_ABIERTOS, ESTADOS_CERRADOS, EstadoPase, IPaseSalida, IPasoFirma,
} from '../../../api/modules/pasesSalida/pases.types'

/** Las dos pestañas: lo que sigue en curso y lo que ya cerró. */
type TabPases = 'PROC' | 'FIN'

const TABS: { key: TabPases; label: string }[] = [
  { key: 'PROC', label: 'En proceso' },
  { key: 'FIN', label: 'Finalizados' },
]
import PaseQrSheet from './PaseQrSheet'
import LineaFirmas from './LineaFirmas'
import TarjetaResaltable from './TarjetaResaltable'


/**
 * Los pases que creó el usuario. El backend ya filtra por el código del token,
 * así que acá no se manda a quién pertenecen.
 *
 * EL PERÍODO SE FILTRA EN EL SERVIDOR. Traer el histórico completo para
 * descartarlo en el teléfono no escala: con dos años de pases la consulta y la
 * transferencia crecen sin que el usuario gane nada. Por omisión son dos meses,
 * que cubre lo que alguien realmente consulta de sus propios pases.
 *
 * El estado, en cambio, se filtra en el cliente: la lista ya viene acotada por
 * período, así que cambiar de estado es instantáneo y no cuesta un viaje.
 */

/**
 * Ventana de consulta, fija. Seis meses cubre lo que alguien realmente revisa
 * de sus propios pases sin arrastrar el histórico completo en cada carga.
 */
const MESES = 6

export default function MisPasesScreen() {
  const theme = useTheme()
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const { user } = useAuth()
  const { showToast } = useShowToast()

  // Sin el acceso de solicitante no se puede crear: el botón ni aparece. El SP
  // lo valida igual, esto es solo para no ofrecer lo que va a rebotar.
  const puedeCrear = tieneAcceso(user?.Access, ACCESO_SOLICITANTE)

  const [items, setItems] = useState<IPaseSalida[]>([])
  // SearchInput filtra contra `items` y devuelve el resultado acá.
  const [filtered, setFiltered] = useState<IPaseSalida[]>([])
  const [loading, setLoading] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  // Un fallo de la API no es una lista vacía: se muestra como error con
  // reintento, no como "no hay pases".
  const [error, setError] = useState<AppError | null>(null)

  /**
   * La pestaña manda sobre el chip de estado: primero se elige si se está
   * mirando lo que sigue en curso o lo que ya cerró, y dentro de eso se afina.
   * Los ocho chips sueltos obligaban a saber de memoria cuáles eran finales.
   *
   * Una notificación puede abrir la pantalla directo en una pestaña —el pase que
   * venció está en Finalizados, y mandar al usuario a "En proceso" a buscarlo
   * sería mandarlo a donde no está.
   */
  const [tab, setTab] = useState<TabPases>(
    route.params?.tab === 'FIN' ? 'FIN' : 'PROC',
  )
  const [estadoSel, setEstadoSel] = useState<EstadoPase | null>(null)

  /**
   * El pase que trajo la notificación. Se resalta unos segundos y se apaga: es
   * para encontrarlo en la lista, no un estado del pase.
   */
  const [highlightId, setHighlightId] = useState<number | null>(null)

  const estadosDeTab = tab === 'PROC' ? ESTADOS_ABIERTOS : ESTADOS_CERRADOS

  // El pase cuyo QR se está viendo. La hoja decide qué mostrar según el estado.
  const [qrPase, setQrPase] = useState<IPaseSalida | null>(null)
  const [aEliminar, setAEliminar] = useState<IPaseSalida | null>(null)
  // La bitácora de cada pase, indexada por Id. Viene con la lista.
  const [bitacoras, setBitacoras] = useState<Record<number, IPasoFirma[]>>({})

  // Los tres filtros se encadenan, no corren en paralelo: buscador, luego
  // pestaña, luego chip. Si fueran paralelos, uno pisaría al otro.
  const visibles = useMemo(() => {
    const deTab = filtered.filter(p => estadosDeTab.includes(p.Estado))
    return estadoSel ? deTab.filter(p => p.Estado === estadoSel) : deTab
  }, [filtered, estadosDeTab, estadoSel])

  const cargar = useCallback(async () => {
    try {
      const desde = dayjs().subtract(MESES, 'month').startOf('day').format('YYYY-MM-DDTHH:mm:ss')

      // Las dos consultas usan el mismo período. Las firmas vienen de un solo
      // viaje para toda la lista, no una llamada por tarjeta.
      const [rPases, rFirmas] = await Promise.all([
        pasesService.getPases({ desde }),
        pasesService.getFirmasMisPases(desde),
      ])

      const data = rPases.Data ?? []
      setItems(data); setFiltered(data)

      const porPase: Record<number, IPasoFirma[]> = {}
      for (const f of rFirmas.Data ?? []) {
        (porPase[f.PaseSalida_Id] ??= []).push(f as any)
      }
      setBitacoras(
        Object.fromEntries(
          Object.entries(porPase).map(([id, filas]) => [id, armarBitacora(filas as any)]),
        ),
      )
      setError(null)
    } catch (e) {
      setItems([]); setFiltered([]); setBitacoras({})
      setError(handleError(e))
    }
  }, [])

  useEffect(() => { (async () => { setLoading(true); await cargar(); setLoading(false) })() }, [cargar])
  useFocusEffect(useCallback(() => { cargar() }, [cargar]))
  const onRefresh = useCallback(async () => { setRefrescando(true); await cargar(); setRefrescando(false) }, [cargar])

  /** Descarta el pase. No lo borra: pasa a "Eliminado" y deja de aparecer. */
  const eliminar = async () => {
    if (!aEliminar) return
    const p = aEliminar; setAEliminar(null)
    try {
      const res = await pasesService.eliminar(p.Id)
      if (res.Success) { showToast('success', 'Eliminado', res.SuccessMessage || 'El pase fue eliminado'); await cargar() }
      else showToast('error', 'No se pudo eliminar', res.ErrorMessage || 'Intente de nuevo')
    } catch (e: any) { showToast('error', 'Error', e?.message || 'No se pudo eliminar') }
  }

  /**
   * Llegó desde una notificación. La PESTAÑA viaja en el aviso: un pase vencido
   * está en Finalizados, y dejar al usuario en "En proceso" sería mandarlo a
   * buscarlo donde no está.
   *
   * Se limpia el chip de estado por la misma razón: si venía filtrando por
   * "Aprobado", el pase vencido no aparecería y el aviso no serviría de nada.
   */
  const listaRef = useRef<FlatList<IPaseSalida>>(null)
  /* En qué pase ya se hizo foco. Sin esta marca, cada recarga de la lista
     volvería a desplazar la pantalla mientras el resaltado siga vivo. */
  const enfocadoRef = useRef<number | null>(null)
  const apagadoRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const unsub = subscribeOpenMiPaseSalida(({ paseId, tab: destino }) => {
      if (destino) setTab(destino)
      setEstadoSel(null)
      enfocadoRef.current = null
      setHighlightId(paseId)

      /* Red de seguridad: si el pase nunca aparece —lo dejó fuera un filtro, o
         quedó fuera del período de la consulta— el resaltado no se queda
         encendido para siempre. */
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
   * Antes se intentaba una sola vez a los 350 ms. Eso alcanzaba si la pantalla
   * ya estaba abierta, pero no en el caso que de verdad importa: tocar la
   * notificación con el app cerrada monta la pantalla y recién ahí arranca la
   * consulta, así que a los 350 ms la lista todavía está vacía. No se desplazaba
   * nada y el resaltado se apagaba a los 4 segundos sobre una fila que el
   * usuario nunca llegó a ver — se veía como si no resaltara nada.
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

  // La campana acá no es decoración: el aviso de que un pase venció llega
  // mientras el usuario no está mirando, y esta es la pantalla a la que lo
  // manda. Sin ella, el único camino al aviso es el push del momento.
  usePageHeader({
    center: <Text fontSize="$4" fontWeight="700" color="$text">Mis pases</Text>,
    right: <NotificationBell size={20} />,
  })

  return (
    <View flex={1} backgroundColor="$background">
      <YStack paddingHorizontal="$3" paddingTop="$3">
        {/* El buscador ocupa el ancho y el botón lo acompaña. SearchInput trae
            su propio marginBottom, así que el botón se alinea arriba. */}
        <XStack gap="$2" alignItems="flex-start">
          <YStack flex={4}>
            <SearchInput
              data={items}
              searchKeys={['Correlativo', 'TipoSalida', 'EnviadoA', 'Responsable', 'Comentario', 'Estado']}
              onResults={setFiltered}
              placeholder="Buscar..."
            />
          </YStack>

          {puedeCrear ? (
            <View flex={1} onPress={() => navigation.navigate('pasesSalidaPaseCrear')} pressStyle={{ opacity: 0.85 }}
              backgroundColor={ACCENT} borderRadius="$3" height={42}
              alignItems="center" justifyContent="center" flexDirection="row" gap="$1.5">
              <Plus size={15} color="#fff" />
              <Text color="#fff" fontWeight="800" fontSize={14}>Nuevo</Text>
            </View>
          ) : null}
        </XStack>

        {/* Pestañas: primero "¿esto sigue en curso o ya cerró?", que es la
            pregunta con la que uno llega. Los chips de abajo afinan dentro. */}
        <XStack padding={4} gap={4} backgroundColor="$backgroundElevated"
          borderRadius="$4" marginBottom="$2.5" {...shadows.sm}>
          {TABS.map(t => {
            const sel = tab === t.key
            return (
              <XStack key={t.key} flex={1} alignItems="center" justifyContent="center"
                paddingVertical="$2" borderRadius="$3"
                backgroundColor={sel ? ACCENT : 'transparent'}
                pressStyle={{ opacity: 0.7 }}
                onPress={() => {
                  setTab(t.key)
                  // El chip elegido es de la otra pestaña: dejarlo puesto daría
                  // una lista vacía sin explicación.
                  setEstadoSel(null)
                }}>
                <Text fontSize={11} fontWeight={sel ? '800' : '600'}
                  color={sel ? '#FFFFFF' : '$textMuted'} numberOfLines={1}>
                  {t.label}
                </Text>
              </XStack>
            )
          })}
        </XStack>

        {/* Estado: filtra en el cliente, la lista ya viene acotada por período. */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <XStack gap="$2" paddingBottom="$1">
            <View onPress={() => setEstadoSel(null)} pressStyle={{ opacity: 0.8 }}
              borderWidth={1} borderColor={!estadoSel ? ACCENT : '$border'}
              backgroundColor={!estadoSel ? ACCENT_BG : 'transparent'}
              borderRadius="$10" paddingHorizontal="$3" paddingVertical={5}>
              <Text fontSize={11} fontWeight="800" color={!estadoSel ? ACCENT : '$textMuted'}>Todos</Text>
            </View>

            {ESTADOS_FILTRO.filter(c => estadosDeTab.includes(c)).map(code => {
              const on = estadoSel === code
              const est = estadoVisual(code)
              return (
                <View key={code} onPress={() => setEstadoSel(on ? null : code)} pressStyle={{ opacity: 0.8 }}
                  borderWidth={1} borderColor={on ? est.color : '$border'}
                  backgroundColor={on ? est.bg : 'transparent'}
                  borderRadius="$10" paddingHorizontal="$3" paddingVertical={5}>
                  <Text fontSize={11} fontWeight="800" color={on ? est.color : '$textMuted'}>
                    {ETIQUETA_ESTADO[code]}
                  </Text>
                </View>
              )
            })}
          </XStack>
        </ScrollView>

        <RecordCount
          count={visibles.length}
          label={tab === 'PROC' ? 'Pases en proceso' : 'Pases finalizados'}
        />
      </YStack>

      {loading ? (
        <SkeletonList />
      ) : error ? (
        <ErrorState
          type={error.type}
          title={error.title}
          message={error.message}
          errorCode={error.status}
          onRetry={async () => { setLoading(true); await cargar(); setLoading(false) }}
        />
      ) : (
        <FlatList
          ref={listaRef}
          data={visibles}
          keyExtractor={(it) => String(it.Id)}
          /* Las tarjetas tienen alto variable (la línea de firmas crece con los
             pasos), así que no hay getItemLayout y scrollToIndex puede fallar
             si el destino todavía no se renderizó. Se cae a un scroll
             aproximado en vez de reventar. */
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
              title={items.length ? 'Sin resultados' : 'Sin pases'}
              message={items.length
                ? 'Ningún pase coincide con los filtros aplicados.'
                : 'No se han creado pases de salida en los últimos 6 meses.'}
            />
          }
          renderItem={({ item: p }) => {
            const est = estadoVisual(p.Estado)
            const color = est.color
            // El que trajo la notificación, por unos segundos.
            const resaltado = highlightId === p.Id
            return (
              /* El resaltado va en un ANILLO por fuera, no en el fondo ni en el
                 borde de la tarjeta.

                 No es capricho: la tarjeta tiene elevación, y con el fondo y el
                 grosor del borde puestos por un ternario dejaba de verse igual
                 que la de Control de salida al presionarla — la sombra se
                 asomaba por las orillas. Manteniendo la tarjeta con props
                 ESTÁTICAS, idéntica a la de allá, se comporta idéntico; el
                 resaltado vive afuera y no toca su pintura.

                 Y sigue cumpliendo lo suyo: en una lista de tarjetas iguales un
                 borde de 2px se pierde al pasar la vista, así que el anillo
                 tiñe un área, no una línea. */
              <TarjetaResaltable resaltado={resaltado}>
              <YStack backgroundColor="$backgroundElevated" borderRadius="$4"
                borderLeftWidth={4} borderLeftColor={color} borderWidth={1} borderColor="$border"
                paddingVertical="$3" paddingHorizontal="$4" gap="$2" {...shadows.sm}
                /* Mientras se pueda editar, tocarlo abre el formulario: es lo
                  único que se hace con un pase pendiente. Una vez que ya no
                  admite cambios, solo queda consultarlo. */
                onPress={() => navigation.navigate(
                  p.PuedeEditar ? 'pasesSalidaPaseCrear' : 'pasesSalidaPaseDetalle',
                  { id: p.Id, correlativo: p.Correlativo },
                )}
                pressStyle={PRESS_CARD}>

                <XStack alignItems="center" gap="$2">
                  <Text flex={1} fontSize={14} fontWeight="800" color="$text">{p.Correlativo}</Text>
                  <View backgroundColor={est.bg} borderWidth={1} borderColor={color}
                    paddingHorizontal="$2" paddingVertical={3} borderRadius="$10">
                    <Text fontSize={10} fontWeight="700" color={color}>
                      {p.EstadoNombre || est.label}
                    </Text>
                  </View>
                  {/* El botón está siempre: si el pase no está aprobado, la hoja
                      explica que falta aprobarlo. Esconderlo dejaría al usuario
                      buscando dónde está el QR. */}
                  <View onPress={(e: any) => { e?.stopPropagation?.(); setQrPase(p) }}
                    pressStyle={{ opacity: 0.6 }} padding="$1" hitSlop={6}>
                    <QrCode size={18} color={theme.primary?.val} />
                  </View>
                  {/* Misma condición que editar: solo mientras esté pendiente.
                      El SP rechaza cualquier otro estado. */}
                  {p.PuedeEditar ? (
                    <View onPress={(e: any) => { e?.stopPropagation?.(); setAEliminar(p) }}
                      pressStyle={{ opacity: 0.6 }} padding="$1" hitSlop={6}>
                      <Trash2 size={17} color="#ef4444" />
                    </View>
                  ) : null}
                  <ChevronRight size={18} color={theme.textMuted?.val} />
                </XStack>

                <XStack alignItems="center" gap="$2" flexWrap="wrap">
                  <Text fontSize={12} fontWeight="700" color="$primary">{p.TipoSalida}</Text>
                  {p.EnviadoA ? <Text fontSize={12} color="$textMuted">· {p.EnviadoA}</Text> : null}
                </XStack>

                <XStack alignItems="center" gap="$3" flexWrap="wrap">
                  {/* La fecha para la que se pidió. Es la que decide si el pase
                      sigue sirviendo —pasada esa fecha más la gracia, vence— así
                      que va con etiqueta y no como un número suelto. */}
                  {p.FechaSalida ? (
                    <XStack alignItems="center" gap="$1.5">
                      <CalendarDays size={12} color={theme.textMuted?.val} />
                      <Text fontSize={11} color="$textMuted">Fecha de salida: </Text>
                      <Text fontSize={11} color="$text" fontWeight="800">{fmtFecha(p.FechaSalida)}</Text>
                    </XStack>
                  ) : null}
                  <XStack alignItems="center" gap="$1.5">
                    <Package size={12} color={theme.textMuted?.val} />
                    <Text fontSize={11} color="$textMuted">
                      {p.Lineas} {p.Lineas === 1 ? 'línea' : 'líneas'}
                    </Text>
                  </XStack>
                  {/* Quién lo retira: el solicitante suele pedirlo para otro, y
                      es lo que le preguntan cuando alguien va a la puerta. */}
                  {p.Responsable ? (
                    <XStack alignItems="center" gap="$1.5">
                      <IdCard size={12} color={theme.textMuted?.val} />
                      <Text fontSize={11} color="$textMuted">{p.Responsable}</Text>
                    </XStack>
                  ) : null}
                  {p.Retorna && p.FechaRetorno ? (
                    <XStack alignItems="center" gap="$1.5">
                      <RotateCcw size={12} color={theme.textMuted?.val} />
                      <Text fontSize={11} color="$textMuted">Regresó {fmtFecha(p.FechaRetorno)}</Text>
                    </XStack>
                  ) : null}
                </XStack>

                {/* La ruta del pase: dónde nació y por qué firmas va. Es el dato
                    que el solicitante consulta —"¿quién me falta?"— y que el
                    contador "0 de 2" no respondía. */}
                {bitacoras[p.Id]?.length ? (
                  <YStack marginTop="$1.5" paddingTop="$2.5" borderTopWidth={1} borderTopColor="$border">
                    <LineaFirmas
                      pasos={bitacoras[p.Id]}
                      pasoActual={p.PasoActual}
                      creadoPor={p.Solicitante || p.Create_By}
                      creadoEn={p.Creation_Date}
                      fmtFecha={fmtFechaHora}
                    />
                  </YStack>
                ) : null}
              </YStack>
              </TarjetaResaltable>
            )
          }}
        />
      )}

      <PaseQrSheet pase={qrPase} onCerrar={() => setQrPase(null)} />

      <ConfirmDialog
        open={!!aEliminar}
        onOpenChange={(o: boolean) => { if (!o) setAEliminar(null) }}
        title="Eliminar pase"
        message={`¿Eliminar ${aEliminar?.Correlativo ?? 'este pase'}? Dejará de aparecer en las pantallas y no se puede deshacer.`}
        confirmLabel="Eliminar"
        confirmColor="#ef4444"
        onConfirm={eliminar}
      />
    </View>
  )
}
