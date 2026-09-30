import React, { useCallback, useMemo, useState } from 'react'
import { Alert, FlatList, Modal, RefreshControl, TextInput, useWindowDimensions } from 'react-native'
import { Text, XStack, YStack, View, Spinner, useTheme } from 'tamagui'
import { ChevronRight, ScanLine, ClipboardList, History, QrCode, Search, X, RotateCcw } from 'lucide-react-native'
import { useNavigation, useFocusEffect } from '@react-navigation/native'

import { usePageHeader } from '../../hooks/usePageHeader'
import { useAuth } from '../../context/AuthContext'
import { shadows } from '../../theme/shadows'
import { inventarioImpulsadorasService as api, mensajeDeError } from '../../api/modules/inventarioImpulsadoras/inventarioImpulsadoras.service'
import { IMiHistorico, IResumenCodigo } from '../../api/modules/inventarioImpulsadoras/inventarioImpulsadoras.types'
import {
  AsignacionLocal, asignacionesLocales, guardarAsignaciones, idsLocales, limpiarViejas,
} from '../../services/inventarioImpulsadoras/baseLocal'
import { motorEnvio } from '../../services/inventarioImpulsadoras/motorEnvio'
import { ACCENT, BarraAvance, BarraEnvio, ERR, ESTADO_ASIG, OK, WARN, fmtFecha, fmtN, pctDe, textoCodigo, useEstadoMotor } from './components'

// Inventario Clientes › Mis inventarios.
// - «Por hacer»: lo que la persona tiene que escanear, más lo que el equipo todavía tiene
//   que enviar. Primero se pinta lo que hay EN EL EQUIPO (funciona sin señal); después se
//   pregunta al servidor y se actualiza.
// - «Histórico»: lo ya finalizado o cerrado de los últimos 90 días. Sale del SERVIDOR, así
//   que se ve igual en cualquier equipo y aunque reinstalen la app (el viejo solo veía lo
//   guardado en ese equipo). Sin señal se muestra lo que el equipo aún tenga guardado.

type Pestana = 'porHacer' | 'historico'

const fmtFechaHora = (iso?: string | null) => (iso ? `${fmtFecha(iso)} ${iso.slice(11, 16)}` : '')

/** Para buscar sin importar mayúsculas ni tildes. */
const normal = (t?: string | null) => (t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const coincide = (q: string, ...campos: (string | null | undefined)[]) => !q || campos.some(c => normal(c).includes(q))

/** Lo más reciente arriba: fecha del inventario (la que se ve en la tarjeta) y, a igual fecha, el número mayor. */
const masRecientePrimero = <T,>(fecha: (x: T) => string, corr: (x: T) => string) => (a: T, b: T) =>
  (fecha(b) ?? '').slice(0, 10).localeCompare((fecha(a) ?? '').slice(0, 10))
  || corr(b).localeCompare(corr(a), undefined, { numeric: true })

/** Lo que el equipo tiene guardado de algo ya no activo, con la forma del histórico (para verlo sin señal). */
const localComoHistorico = (a: AsignacionLocal): IMiHistorico => ({
  InventarioUsuario_Id: a.iu, Inventario_Id: a.inventario_id, Correlativo: a.correlativo, Fecha: a.fecha,
  Empresa: a.empresa, ClienteCodigo: a.cliente_codigo, ClienteNombre: a.cliente, SucursalNombre: a.sucursal,
  Linea: a.linea, TipoEscaneo: a.tipo_escaneo, Estado: a.estado as IMiHistorico['Estado'], Inicio: null,
  FechaFinalizado: a.finalizada_at, FechaCerrado: null, LecturasServidor: a.lecturas_servidor,
  PiezasServidor: a.piezas_servidor, CodigosServidor: 0, PuedeSolicitar: false,
})

export default function MisInventariosScreen() {
  const theme = useTheme()
  const navigation = useNavigation<any>()
  const { user } = useAuth()
  const userCode = user?.Code ?? ''
  const estadoMotor = useEstadoMotor()
  const { height, width } = useWindowDimensions()
  const compacto = height < 720 || width < 370

  usePageHeader({ center: <Text fontSize="$4" fontWeight="700" color="$text">Mis inventarios</Text> })

  const [pestana, setPestana] = useState<Pestana>('porHacer')
  const [lista, setLista] = useState<AsignacionLocal[]>([])
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  const [historico, setHistorico] = useState<IMiHistorico[] | null>(null)
  const [cargandoHist, setCargandoHist] = useState(false)
  const [avisoHist, setAvisoHist] = useState<string | null>(null)
  const [detalle, setDetalle] = useState<IMiHistorico | null>(null)
  const [buscar, setBuscar] = useState('')
  const q = normal(buscar.trim())

  const pintarLocal = useCallback(() => {
    if (userCode) setLista(asignacionesLocales(userCode))
  }, [userCode])

  const cargar = useCallback(async () => {
    if (!userCode) return
    pintarLocal()
    setCargando(false)
    motorEnvio.iniciar(userCode)
    try {
      const res = await api.misAsignaciones(idsLocales(userCode))
      await guardarAsignaciones(userCode, res.Data ?? [])
      limpiarViejas(userCode)
      setAviso(null)
    } catch (e) {
      setAviso(`Sin conexión: se muestra lo guardado en el equipo. (${mensajeDeError(e)})`)
    } finally {
      pintarLocal()
      setRefrescando(false)
    }
  }, [userCode, pintarLocal])

  const cargarHistorico = useCallback(async () => {
    setCargandoHist(true)
    try {
      setHistorico((await api.historico(90)).Data ?? [])
      setAvisoHist(null)
    } catch (e) {
      setAvisoHist(`Sin conexión: el histórico se consulta en el servidor. Se muestra lo que el equipo tiene guardado. (${mensajeDeError(e)})`)
    } finally {
      setCargandoHist(false)
      setRefrescando(false)
    }
  }, [])

  // El histórico también se pide al entrar: así su conteo (y el del filtro) es real aunque se esté en «Por hacer».
  useFocusEffect(useCallback(() => {
    void cargar()
    void cargarHistorico()
  }, [cargar, cargarHistorico]))

  // Cuando el motor termina un envío, los contadores cambian.
  const pendientes = estadoMotor.pendientes
  React.useEffect(() => { pintarLocal() }, [pendientes, estadoMotor.ultimoEnvioOk, pintarLocal])

  // Por hacer = lo activo + lo que todavía tiene algo que salir del equipo.
  const porHacer = useMemo(
    () => lista.filter(a => a.estado === 'ACTIVA' || a.pendientes > 0 || a.finalizar_pedido === 1)
      .sort(masRecientePrimero<AsignacionLocal>(a => a.fecha, a => a.correlativo)), [lista])
  // Sin señal, el histórico cae a lo que el equipo aún tiene guardado.
  const historicoTodo = useMemo(() => {
    const base = historico && !avisoHist ? historico : (() => {
      const enPorHacer = new Set(porHacer.map(a => a.iu))
      return lista.filter(a => !enPorHacer.has(a.iu)).map(localComoHistorico)
    })()
    return [...base].sort(masRecientePrimero<IMiHistorico>(h => h.Fecha, h => h.Correlativo))
  }, [historico, avisoHist, lista, porHacer])

  // El filtro es uno solo para las dos pestañas: número de inventario, cliente, sucursal o código de cliente.
  const porHacerVisible = useMemo(
    () => porHacer.filter(a => coincide(q, a.correlativo, a.cliente, a.sucursal, a.cliente_codigo)), [porHacer, q])
  const historicoVisible = useMemo(
    () => historicoTodo.filter(h => coincide(q, h.Correlativo, h.ClienteNombre, h.SucursalNombre, h.ClienteCodigo)), [historicoTodo, q])

  const refrescar = () => {
    setRefrescando(true)
    void motorEnvio.disparar('manual')
    void cargar()
    void cargarHistorico()
  }

  const cambiarPestana = (p: Pestana) => {
    setPestana(p)
    if (p === 'historico' && !historico && !cargandoHist) void cargarHistorico()
  }

  const pad = compacto ? '$2.5' : '$3.5'
  const tarjeta = {
    backgroundColor: '$backgroundElevated', borderRadius: '$4', borderWidth: 1, borderColor: '$border',
    padding: pad, marginBottom: compacto ? '$2' : '$3', ...shadows.sm,
  } as const

  const Icono = ({ children }: { children: React.ReactNode }) => (
    <View width={compacto ? 34 : 42} height={compacto ? 34 : 42} borderRadius={21} alignItems="center" justifyContent="center"
      backgroundColor="rgba(255,85,26,0.10)">
      {children}
    </View>
  )

  const Etiqueta = ({ estado }: { estado: string }) => {
    const est = ESTADO_ASIG[estado] ?? ESTADO_ASIG.CERRADO
    return (
      <View borderRadius={6} paddingHorizontal="$2" paddingVertical={2} backgroundColor={est.bg}>
        <Text fontSize="$1" fontWeight="800" color={est.fg}>{est.label}</Text>
      </View>
    )
  }

  const renderPorHacer = ({ item: a }: { item: AsignacionLocal }) => (
    <View onPress={() => navigation.navigate('invImpEscanear', { iu: a.iu })} pressStyle={{ opacity: 0.85 }} {...tarjeta}>
      <XStack alignItems="center" gap="$3">
        <Icono><ScanLine size={compacto ? 17 : 20} color={ACCENT} /></Icono>
        <YStack flex={1} gap="$1">
          <XStack alignItems="center" gap="$2" flexWrap="wrap">
            <Text fontSize={compacto ? '$4' : '$5'} fontWeight="900" color="$text">{a.correlativo}</Text>
            <Etiqueta estado={a.estado} />
            {a.finalizar_pedido === 1 && (
              <View borderRadius={6} paddingHorizontal="$2" paddingVertical={2} backgroundColor="rgba(245,158,11,0.15)">
                <Text fontSize="$1" fontWeight="800" color={WARN}>FINALIZANDO</Text>
              </View>
            )}
          </XStack>
          <Text fontSize="$3" color="$text" numberOfLines={1}>{a.cliente}</Text>
          <Text fontSize="$2" color="$textMuted" numberOfLines={1}>{a.sucursal} · {a.linea} · {fmtFecha(a.fecha)}</Text>
          <XStack gap="$3" flexWrap="wrap">
            <Text fontSize="$2" color={ACCENT} fontWeight="700">{fmtN(a.piezas)} piezas en el equipo</Text>
            {a.pendientes > 0
              ? <Text fontSize="$2" color={WARN} fontWeight="800">{fmtN(a.pendientes)} por enviar</Text>
              : a.lecturas > 0 && <Text fontSize="$2" color={OK} fontWeight="700">todo en el servidor</Text>}
          </XStack>
          {a.pendientes > 0 && a.lecturas > 0 && (
            <YStack gap={2}>
              <Text fontSize="$1" color="$textMuted">
                {fmtN(a.lecturas - a.pendientes)} de {fmtN(a.lecturas)} lecturas en el servidor
              </Text>
              <BarraAvance pct={pctDe(a.lecturas - a.pendientes, a.lecturas)} color={WARN} />
            </YStack>
          )}
        </YStack>
        <ChevronRight size={20} color={theme.textMuted?.val} />
      </XStack>
    </View>
  )

  const renderHistorico = ({ item: h }: { item: IMiHistorico }) => (
    <View onPress={() => setDetalle(h)} pressStyle={{ opacity: 0.85 }} {...tarjeta}>
      <XStack alignItems="center" gap="$3">
        <Icono><History size={compacto ? 17 : 20} color={ACCENT} /></Icono>
        <YStack flex={1} gap="$1">
          <XStack alignItems="center" gap="$2" flexWrap="wrap">
            <Text fontSize={compacto ? '$4' : '$5'} fontWeight="900" color="$text">{h.Correlativo}</Text>
            <Etiqueta estado={h.Estado} />
            {h.SolicitudEstado === 'PENDIENTE' && (
              <View borderRadius={6} paddingHorizontal="$2" paddingVertical={2} backgroundColor="rgba(245,158,11,0.15)">
                <Text fontSize="$1" fontWeight="800" color={WARN}>REAPERTURA SOLICITADA</Text>
              </View>
            )}
          </XStack>
          <Text fontSize="$3" color="$text" numberOfLines={1}>{h.ClienteNombre}</Text>
          <Text fontSize="$2" color="$textMuted" numberOfLines={1}>{h.SucursalNombre} · {h.Linea} · {fmtFecha(h.Fecha)}</Text>
          <Text fontSize="$2" color={ACCENT} fontWeight="700">
            {fmtN(h.PiezasServidor)} piezas{h.CodigosServidor ? ` · ${fmtN(h.CodigosServidor)} códigos` : ''} en el servidor
          </Text>
          <Text fontSize="$1" color="$textMuted">
            {h.Estado === 'CERRADO'
              ? `Cerrado ${fmtFechaHora(h.FechaCerrado)}${h.FechaFinalizado ? ` · finalizaste ${fmtFechaHora(h.FechaFinalizado)}` : ''}`
              : h.Estado === 'FINALIZADA'
                ? `Finalizaste ${fmtFechaHora(h.FechaFinalizado)} · falta que la oficina lo cierre`
                : h.Estado === 'QUITADA' ? 'Te quitaron de este inventario' : 'Inventario desactivado'}
          </Text>
          {h.SolicitudEstado === 'RECHAZADA' && !!h.SolicitudComentario && (
            <Text fontSize="$1" color={ERR} numberOfLines={2}>Reapertura rechazada: {h.SolicitudComentario}</Text>
          )}
        </YStack>
        <ChevronRight size={20} color={theme.textMuted?.val} />
      </XStack>
    </View>
  )

  const vacio = (texto: string, icono: React.ReactNode) => (
    <YStack alignItems="center" justifyContent="center" paddingTop="$10" gap="$3">
      {icono}
      <Text color="$textMuted" textAlign="center">{texto}{'\n'}Desliza hacia abajo para actualizar.</Text>
    </YStack>
  )

  const contenedor = {
    paddingHorizontal: compacto ? 10 : 16, paddingTop: compacto ? 8 : 12, paddingBottom: 96,
    width: '100%' as const, maxWidth: 1000, alignSelf: 'center' as const,
  }
  const refresh = <RefreshControl refreshing={refrescando} onRefresh={refrescar} colors={[ACCENT]} tintColor={ACCENT} />

  return (
    <View flex={1} backgroundColor="$background">
      <YStack paddingHorizontal={compacto ? 10 : 16} paddingTop={compacto ? 8 : 12} gap="$2" width="100%" maxWidth={1000} alignSelf="center">
        <BarraEnvio estado={estadoMotor} compacta={compacto} onPress={() => motorEnvio.disparar('manual')} />
        {!!aviso && <Text fontSize="$2" color={WARN}>{aviso}</Text>}
        <XStack borderWidth={1} borderColor="$border" borderRadius="$4" padding="$1" backgroundColor="$backgroundElevated" gap="$1">
          {([
            ['porHacer', `Por hacer (${porHacerVisible.length})`],
            ['historico', historico || q ? `Histórico (${historicoVisible.length})` : 'Histórico'],
          ] as const).map(([p, t]) => (
            <View key={p} flex={1} onPress={() => cambiarPestana(p)} pressStyle={{ opacity: 0.85 }}
              backgroundColor={pestana === p ? ACCENT : 'transparent'} borderRadius="$3" height={compacto ? 30 : 34}
              alignItems="center" justifyContent="center">
              <Text fontWeight="800" fontSize="$2" color={pestana === p ? '#fff' : '$textMuted'}>{t}</Text>
            </View>
          ))}
        </XStack>
        <XStack alignItems="center" gap="$2" borderWidth={1} borderColor="$border" borderRadius="$4" paddingHorizontal="$3"
          backgroundColor="$backgroundElevated" height={compacto ? 38 : 42}>
          <Search size={16} color={theme.textMuted?.val} />
          <TextInput
            value={buscar}
            onChangeText={setBuscar}
            placeholder="Buscar por número de inventario o cliente"
            placeholderTextColor={theme.textMuted?.val}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            style={{ flex: 1, fontSize: compacto ? 14 : 15, color: theme.text?.val, paddingVertical: 0 }}
          />
          {!!buscar && <View onPress={() => setBuscar('')} hitSlop={10}><X size={16} color={theme.textMuted?.val} /></View>}
        </XStack>
        {pestana === 'historico' && !!avisoHist && <Text fontSize="$2" color={WARN}>{avisoHist}</Text>}
      </YStack>

      {cargando ? (
        <YStack flex={1} alignItems="center" justifyContent="center"><Spinner size="large" color={ACCENT} /></YStack>
      ) : pestana === 'porHacer' ? (
        <FlatList
          data={porHacerVisible}
          keyExtractor={a => String(a.iu)}
          renderItem={renderPorHacer}
          contentContainerStyle={contenedor}
          refreshControl={refresh}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={q
            ? vacio(`Ningún inventario por hacer coincide con «${buscar.trim()}».`, <Search size={42} color={theme.textMuted?.val} />)
            : vacio('No tienes inventarios por hacer.', <ClipboardList size={42} color={theme.textMuted?.val} />)}
        />
      ) : cargandoHist && !historico ? (
        <YStack flex={1} alignItems="center" justifyContent="center"><Spinner size="large" color={ACCENT} /></YStack>
      ) : (
        <FlatList
          data={historicoVisible}
          keyExtractor={h => String(h.InventarioUsuario_Id)}
          renderItem={renderHistorico}
          contentContainerStyle={contenedor}
          refreshControl={refresh}
          ListHeaderComponent={historicoVisible.length
            ? <Text fontSize="$1" color="$textMuted" paddingBottom="$2">Últimos 90 días · toca uno para ver lo que escaneaste</Text> : null}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={q
            ? vacio(`Nada en el histórico coincide con «${buscar.trim()}».`, <Search size={42} color={theme.textMuted?.val} />)
            : vacio('Todavía no tienes inventarios finalizados en los últimos 90 días.', <History size={42} color={theme.textMuted?.val} />)}
        />
      )}

      <DetalleHistorico item={detalle} onCerrar={() => setDetalle(null)}
        onCambio={nuevo => { setDetalle(nuevo); void cargarHistorico() }} />
    </View>
  )
}

/** Lo que el servidor tiene de un inventario del histórico, por código (solo lectura). */
function DetalleHistorico({ item, onCerrar, onCambio }: {
  item: IMiHistorico | null; onCerrar: () => void; onCambio: (nuevo: IMiHistorico) => void
}) {
  const theme = useTheme()
  const [filas, setFilas] = useState<IResumenCodigo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const iu = item?.InventarioUsuario_Id

  React.useEffect(() => {
    if (!iu) return
    setFilas(null)
    setError(null)
    let vivo = true
    api.resumen(iu)
      .then(r => { if (vivo) setFilas(r.Data ?? []) })
      .catch(e => { if (vivo) setError(`No se pudo consultar el servidor: ${mensajeDeError(e)}`) })
    return () => { vivo = false }
  }, [iu])

  return (
    <Modal visible={!!item} animationType="slide" onRequestClose={onCerrar}>
      <View flex={1} backgroundColor="$background">
        <XStack alignItems="center" justifyContent="space-between" paddingHorizontal={16} paddingTop="$6" paddingBottom="$3"
          borderBottomWidth={1} borderColor="$border">
          <YStack flex={1}>
            <Text fontSize="$5" fontWeight="900" color="$text">{item?.Correlativo}</Text>
            <Text fontSize="$2" color="$textMuted" numberOfLines={1}>{item?.ClienteNombre} · {item?.SucursalNombre}</Text>
          </YStack>
          <View onPress={onCerrar} hitSlop={10} padding="$2"><X size={24} color={theme.text?.val} /></View>
        </XStack>
        {!!item && (
          <XStack paddingHorizontal={16} paddingVertical="$2" gap="$3">
            <Text fontSize="$3" fontWeight="800" color={ACCENT}>{fmtN(item.PiezasServidor)} piezas</Text>
            <Text fontSize="$3" color="$textMuted">{fmtN(item.LecturasServidor)} lecturas</Text>
            {!!filas && <Text fontSize="$3" color="$textMuted">{fmtN(filas.length)} códigos</Text>}
          </XStack>
        )}
        {!!item && <Reapertura item={item} onCambio={onCambio} />}
        {error ? (
          <Text color={WARN} paddingHorizontal={16} paddingTop="$4">{error}</Text>
        ) : !filas ? (
          <YStack flex={1} alignItems="center" justifyContent="center"><Spinner size="large" color={ACCENT} /></YStack>
        ) : (
          <FlatList
            data={filas}
            keyExtractor={r => `${r.Tipo}|${r.Codigo}`}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
            renderItem={({ item: r }) => (
              <XStack paddingVertical="$2" borderBottomWidth={1} borderColor="$border" alignItems="center" gap="$2">
                {r.Tipo === 'QR' ? <QrCode size={16} color={ACCENT} /> : <ScanLine size={16} color={r.Tipo === 'NOENCONTRADO' ? WARN : ACCENT} />}
                <Text flex={1} fontSize="$2" color="$text" numberOfLines={1}>{textoCodigo(r.Tipo, r.Codigo)}</Text>
                <Text fontSize="$4" fontWeight="900" color="$text">{fmtN(r.Cantidad)}</Text>
              </XStack>
            )}
            ListEmptyComponent={<Text color="$textMuted" textAlign="center" paddingTop="$6">El servidor no tiene lecturas de este inventario.</Text>}
          />
        )}
      </View>
    </Modal>
  )
}

/**
 * Pedir que me reabran mi parte. Arriba del detalle (no abajo) para que el teclado no tape
 * el motivo en la PDA. El servidor decide si se ofrece (PuedeSolicitar) según las reglas y
 * los parámetros del módulo; aquí solo se pinta lo que dijo.
 */
function Reapertura({ item, onCambio }: { item: IMiHistorico; onCambio: (nuevo: IMiHistorico) => void }) {
  const theme = useTheme()
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  React.useEffect(() => { setAbierto(false); setMotivo(''); setError(null) }, [item.InventarioUsuario_Id])

  const enviar = async () => {
    const m = motivo.trim()
    if (m.length < 5) { setError('Escribe qué te faltó escanear (lo lee la oficina para decidir).'); return }
    setEnviando(true)
    setError(null)
    try {
      const r = (await api.solicitarReapertura(item.InventarioUsuario_Id, m)).Data
      setAbierto(false)
      setMotivo('')
      onCambio({ ...item, Solicitud_Id: r?.Solicitud_Id, SolicitudEstado: 'PENDIENTE',
                 SolicitudFecha: r?.FechaSolicitud ?? null, SolicitudComentario: null, PuedeSolicitar: false })
      Alert.alert('Solicitud enviada', 'Se avisó a la oficina. Cuando la aprueben, el inventario vuelve a «Por hacer».')
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setEnviando(false)
    }
  }

  const cancelar = () => {
    if (!item.Solicitud_Id) return
    Alert.alert('Cancelar solicitud', '¿Ya no necesitas que te reabran este inventario?', [
      { text: 'No', style: 'cancel' },
      { text: 'Sí, cancelar', style: 'destructive', onPress: async () => {
        try {
          await api.cancelarReapertura(item.Solicitud_Id!)
          onCambio({ ...item, SolicitudEstado: 'CANCELADA', PuedeSolicitar: true })
        } catch (e) { Alert.alert('No se pudo cancelar', mensajeDeError(e)) }
      } },
    ])
  }

  const caja = { marginHorizontal: 16, marginBottom: 8, padding: 10, borderRadius: 10, borderWidth: 1 } as const

  if (item.SolicitudEstado === 'PENDIENTE') {
    return (
      <YStack {...caja} borderColor={WARN} backgroundColor="rgba(245,158,11,0.10)" gap="$1">
        <Text fontSize="$2" fontWeight="800" color={WARN}>Pediste reabrirlo{item.SolicitudFecha ? ` el ${fmtFechaHora(item.SolicitudFecha)}` : ''}</Text>
        <Text fontSize="$2" color="$text">La oficina ya recibió el aviso. Cuando la aprueben vuelve a «Por hacer».</Text>
        <Text fontSize="$2" fontWeight="700" color="$textMuted" textDecorationLine="underline" onPress={cancelar} alignSelf="flex-start">
          Cancelar la solicitud
        </Text>
      </YStack>
    )
  }

  const rechazo = item.SolicitudEstado === 'RECHAZADA' && !!item.SolicitudComentario && (
    <Text fontSize="$2" color={ERR} paddingHorizontal={16} paddingBottom="$2">
      La oficina rechazó reabrirlo: {item.SolicitudComentario}
    </Text>
  )
  if (!item.PuedeSolicitar) return rechazo || null

  if (!abierto) {
    return (
      <YStack>
        {rechazo}
        <XStack {...caja} borderColor="$border" alignItems="center" gap="$2" onPress={() => setAbierto(true)} pressStyle={{ opacity: 0.8 }}>
          <RotateCcw size={16} color={ACCENT} />
          <Text flex={1} fontSize="$3" fontWeight="800" color={ACCENT}>¿Te faltó escanear algo? Solicitar reabrir</Text>
        </XStack>
      </YStack>
    )
  }

  return (
    <YStack {...caja} borderColor={ACCENT} gap="$2">
      <Text fontSize="$2" fontWeight="800" color="$text">¿Qué te faltó escanear?</Text>
      <TextInput
        value={motivo}
        onChangeText={setMotivo}
        placeholder="Ej.: me faltó la bodega de atrás"
        placeholderTextColor={theme.textMuted?.val}
        multiline
        maxLength={500}
        autoFocus
        style={{ minHeight: 60, maxHeight: 110, fontSize: 15, color: theme.text?.val, borderWidth: 1,
                 borderColor: theme.border?.val, borderRadius: 8, padding: 8, textAlignVertical: 'top' }}
      />
      {!!error && <Text fontSize="$2" color={ERR}>{error}</Text>}
      <XStack gap="$2" justifyContent="flex-end">
        <View paddingHorizontal="$3" height={38} borderRadius="$3" alignItems="center" justifyContent="center"
          borderWidth={1} borderColor="$border" onPress={() => { setAbierto(false); setError(null) }}>
          <Text fontWeight="700" color="$textMuted">Cancelar</Text>
        </View>
        <View paddingHorizontal="$3" height={38} borderRadius="$3" alignItems="center" justifyContent="center"
          backgroundColor={ACCENT} opacity={enviando ? 0.6 : 1} onPress={enviando ? undefined : enviar}>
          {enviando ? <Spinner color="#fff" /> : <Text fontWeight="800" color="#fff">Enviar solicitud</Text>}
        </View>
      </XStack>
    </YStack>
  )
}
