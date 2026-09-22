import React, { useCallback, useEffect, useState } from 'react'
import { RefreshControl, FlatList } from 'react-native'
import { Text, XStack, YStack, View, Spinner, useTheme } from 'tamagui'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import {
  // `History` se renombra: choca con el tipo global History del DOM y TS resuelve ese.
  ScanLine, Package, User, Building2, Stamp, ChevronDown, ChevronUp, LogOut, Clock,
  IdCard, History as HistoryIcon,
} from 'lucide-react-native'
import dayjs from 'dayjs'

import { usePageHeader } from '../../../hooks/usePageHeader'
import { useShowToast } from '../../../utils/useShowToast'
import AppDatePicker from '../../../components/commons/AppDatePicker'
import SearchInput from '../../../components/commons/SearchInput'
import RecordCount from '../../../components/commons/RecordCount'
import SkeletonList from '../../../components/Skeletons/SkeletonList'
import { NotificationBell } from '../../../components/notifications/NotificationBell'
import ErrorState from '../../AdmSys/ErrorState'
import EmptyState from '../../AdmSys/EmptyState'
import { AppError, handleError } from '../../../utils/errorHandler'
import { shadows } from '../../../theme/shadows'
import { ACCENT, ACCENT_BG, estadoVisual, fmtCantidad, fmtFechaHora } from '../pasesSalida.helpers'
import LineaFirmas from '../Pases/LineaFirmas'
import LineaEstados from '../Pases/LineaEstados'
import EscanerPase from './EscanerPase'
import { pasesService } from '../../../api/modules/pasesSalida/pases.service'
import {
  armarBitacora, BandejaPorteria, IPaseSalida, IPaseSalidaDetalle,
  IPaseSalidaEstado, IPasoFirma,
} from '../../../api/modules/pasesSalida/pases.types'

/** Las tres bandejas. La primera es la cola de trabajo; las otras, consulta. */
const BANDEJAS: { key: BandejaPorteria; label: string }[] = [
  { key: 'PEND', label: 'Pendientes' },
  { key: 'FIN', label: 'Finalizados' },
  { key: 'REG', label: 'Pendiente regreso' },
]

/**
 * Ventana del historial, fija. Aplica solo a Finalizados y Pendiente regreso:
 * Pendientes es una agenda y se mueve con el selector de fecha.
 */
const MESES = 3

/**
 * Portería: qué está autorizado a salir.
 *
 * SOLO APROBADOS, y eso lo decide el servidor. Un pase sin firmas no llega
 * acá ni en gris: si apareciera, tarde o temprano alguien lo deja salir
 * "porque ahí estaba".
 *
 * TRES BANDEJAS, Y CADA UNA SE ORDENA POR UNA FECHA DISTINTA:
 *   · Pendientes es una AGENDA: lo autorizado que todavía no sale, por fecha
 *     prevista. Por eso es la única con selector de fecha — le importa lo que
 *     sale hoy, no lo que se pidió hoy.
 *   · Finalizados y Pendiente regreso son HISTORIAL: se acotan a los últimos
 *     meses contra la fecha REAL de salida, porque la prevista ahí ya no
 *     significa nada.
 *
 * "Pendiente regreso" es la que justifica la pantalla entera: un préstamo que
 * salió hace dos meses y no volvió es un problema de seguridad, y sin esta
 * bandeja no había dónde verlo.
 *
 * La tarjeta es la misma de Aprobaciones —acordeón con el detalle y la bitácora—
 * porque es la misma pregunta hecha por otro: "¿qué es esto y quién lo
 * autorizó?". Sin los botones de firmar, que acá no se decide nada, y sin el QR,
 * que el guardia escanea del papel del solicitante y no de su propia pantalla.
 *
 * El botón de escanear todavía no hace nada: registrar la salida (pasar el pase
 * a PSSAL) viene en la siguiente entrega.
 */

/** Alto del footer fijo: la lista reserva ese espacio para no quedar tapada. */
const FOOTER_H = 84

const HOY = () => dayjs().format('YYYY-MM-DD')

export default function ControlSalidaScreen() {
  const theme = useTheme()
  const navigation = useNavigation<any>()
  const { showToast } = useShowToast()

  const [escaneando, setEscaneando] = useState(false)
  const [buscando, setBuscando] = useState(false)

  const [bandeja, setBandeja] = useState<BandejaPorteria>('PEND')
  const [fecha, setFecha] = useState<string>(HOY())
  const [items, setItems] = useState<IPaseSalida[]>([])
  // SearchInput filtra contra `items` y devuelve el resultado acá.
  const [filtered, setFiltered] = useState<IPaseSalida[]>([])
  const [loading, setLoading] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  // Un fallo de la API no es una lista vacía: se muestra como error con
  // reintento, no como "no hay nada que salga hoy" — que acá sería peligroso.
  const [error, setError] = useState<AppError | null>(null)

  // Acordeón: qué pase está abierto y lo ya traído de cada uno. Se carga al
  // abrir y se guarda: volver a abrirlo no vuelve a consultar.
  const [abierto, setAbierto] = useState<number | null>(null)
  const [detalles, setDetalles] = useState<Record<number, IPaseSalidaDetalle[]>>({})
  const [bitacoras, setBitacoras] = useState<Record<number, IPasoFirma[]>>({})
  const [historiales, setHistoriales] = useState<Record<number, IPaseSalidaEstado[]>>({})
  const [cargandoDet, setCargandoDet] = useState<number | null>(null)

  const esHoy = fecha === HOY()
  // La fecha es una agenda del día: solo tiene sentido en Pendientes. En el
  // historial se manda igual pero el servidor la ignora.
  const conFecha = bandeja === 'PEND'

  const cargar = useCallback(async () => {
    try {
      const r = await pasesService.getPasesParaSalida(bandeja, fecha, MESES)
      const data = r.Data ?? []
      setItems(data); setFiltered(data)
      setError(null)
    } catch (e) {
      setItems([]); setFiltered([])
      setError(handleError(e))
    }
  }, [bandeja, fecha])

  useEffect(() => { (async () => { setLoading(true); await cargar(); setLoading(false) })() }, [cargar])
  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  const onRefresh = useCallback(async () => {
    setRefrescando(true)
    // Lo traído deja de ser confiable después de recargar.
    setDetalles({}); setBitacoras({}); setAbierto(null)
    await cargar()
    setRefrescando(false)
  }, [cargar])

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
   * Un QR leído. Lo que codifica es el CORRELATIVO, así que hay que levantar el
   * pase antes de poder mostrar nada.
   *
   * La consulta trae el pase en cualquier estado a propósito: un pase rechazado
   * tiene que poder verse como rechazado, no como "código inválido". Quién puede
   * salir lo decide la pantalla de verificación.
   */
  const escaneado = async (codigo: string) => {
    setBuscando(true)
    try {
      const r = await pasesService.getPasePorCorrelativo(codigo)
      const p = r.Data?.[0]
      if (!p) {
        setEscaneando(false)
        showToast('error', 'Código no reconocido',
          `No hay ningún pase con el código "${codigo}".`)
        return
      }
      setEscaneando(false)
      navigation.navigate('pasesSalidaVerificarSalida', { id: p.Id, correlativo: p.Correlativo })
    } catch (e) {
      setEscaneando(false)
      showToast('error', 'Error', handleError(e).message)
    } finally { setBuscando(false) }
  }

  usePageHeader({
    center: <Text fontSize="$4" fontWeight="700" color="$text">Control de salida</Text>,
    right: <NotificationBell size={20} />,
  })

  return (
    <View flex={1} backgroundColor="$background">
      {/* Fecha, buscador y contador quedan fuera del condicional: al recargar no
          desaparecen y la pantalla no salta. */}
      <YStack paddingHorizontal="$3" paddingTop="$3">
        {/* Selector segmentado, igual que el de Aprobaciones y el dashboard de
            horas extra. Cambiar de bandeja vuelve a consultar: cada una es una
            consulta distinta. */}
        <XStack padding={4} gap={4} backgroundColor="$backgroundElevated"
          borderRadius="$4" marginBottom="$3" {...shadows.sm}>
          {BANDEJAS.map(b => {
            const sel = bandeja === b.key
            return (
              <XStack key={b.key} flex={1} alignItems="center" justifyContent="center"
                paddingVertical="$2" paddingHorizontal={2} borderRadius="$3"
                backgroundColor={sel ? ACCENT : 'transparent'}
                pressStyle={{ opacity: 0.7 }}
                onPress={() => {
                  setBandeja(b.key)
                  // Lo desplegado es de la bandeja anterior: dejarlo abierto
                  // mostraría el detalle de otro pase bajo una tarjeta nueva.
                  setAbierto(null)
                }}>
                <Text fontSize={11} fontWeight={sel ? '800' : '600'}
                  color={sel ? '#FFFFFF' : '$textMuted'} numberOfLines={1}>
                  {b.label}
                </Text>
              </XStack>
            )
          })}
        </XStack>

        {/* La fecha es la agenda del día: solo aplica a Pendientes. En el
            historial sería un filtro que no filtra nada. */}
        {conFecha ? (
          /* AppDatePicker trae su propio paddingTop de 8 y marginBottom, así que
             el botón se envuelve con los mismos para que las dos cajas queden a
             la misma altura. Alinear por abajo lo dejaba descuadrado. */
          <XStack alignItems="flex-start" gap="$2.5">
            <YStack flex={1}>
              <AppDatePicker
                label="Salidas del día"
                value={fecha}
                onChange={(v: string | null) => setFecha(v ?? HOY())}
              />
            </YStack>
            {/* Volver a hoy con un toque. Solo aparece cuando hace falta: un
                botón que no hace nada enseña a ignorarlo. */}
            {esHoy ? null : (
              <YStack paddingTop={8} marginBottom="$2">
                <View onPress={() => setFecha(HOY())} pressStyle={{ opacity: 0.8 }}
                  borderWidth={1} borderColor={ACCENT} backgroundColor={ACCENT_BG}
                  borderRadius={6} height={44} paddingHorizontal="$3.5"
                  alignItems="center" justifyContent="center">
                  <Text fontSize={13} fontWeight="800" color={ACCENT}>Hoy</Text>
                </View>
              </YStack>
            )}
          </XStack>
        ) : null}

        <SearchInput
          data={items}
          // El responsable es clave acá: alguien llega a la puerta y lo primero
          // que dice es su nombre, no el correlativo del pase.
          searchKeys={['Correlativo', 'Responsable', 'EnviadoA', 'Solicitante', 'TipoSalida']}
          onResults={setFiltered}
          placeholder="Buscar por pase, quién retira o destino..."
        />
        <RecordCount
          count={filtered.length}
          label={bandeja === 'PEND' ? 'Pases autorizados'
            : bandeja === 'REG' ? 'Afuera, deben regresar'
              : 'Pases finalizados'}
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
          data={filtered}
          keyExtractor={(p) => String(p.Id)}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 12, paddingBottom: FOOTER_H + 16, flexGrow: 1 }}
          ItemSeparatorComponent={() => <View height={10} />}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} tintColor={ACCENT} />}
          ListEmptyComponent={
            <EmptyState
              title={items.length ? 'Sin resultados'
                : bandeja === 'PEND' ? 'Nada autorizado para esta fecha'
                  : bandeja === 'REG' ? 'Nada pendiente de regreso'
                    : 'Sin pases finalizados'}
              message={items.length
                ? 'Ningún pase coincide con la búsqueda.'
                : bandeja === 'PEND'
                  ? `No hay pases aprobados con salida el ${dayjs(fecha).format('DD/MM/YYYY')}.`
                  : bandeja === 'REG'
                    ? 'Todo lo que salió y debía volver ya regresó.'
                    : `No hay pases cerrados en los últimos ${MESES} meses.`}
            />
          }
          renderItem={({ item: p }) => {
            const est = estadoVisual(p.Estado)
            const open = abierto === p.Id
            const lineas = detalles[p.Id]

            return (
              <YStack backgroundColor="$backgroundElevated" borderRadius="$4"
                borderLeftWidth={4} borderLeftColor={est.color} borderWidth={1} borderColor="$border"
                paddingVertical="$3" paddingHorizontal="$4" gap="$2" {...shadows.sm}
                onPress={() => alternar(p.Id)} pressStyle={{ opacity: 0.85 }}>

                {/* ── Encabezado ── */}
                <XStack alignItems="center" gap="$2">
                  <Text flex={1} fontSize={14} fontWeight="800" color="$text">{p.Correlativo}</Text>
                  <View backgroundColor={est.bg} borderWidth={1} borderColor={est.color}
                    paddingHorizontal="$2" paddingVertical={3} borderRadius="$10">
                    <Text fontSize={10} fontWeight="700" color={est.color}>
                      {p.EstadoNombre || est.label}
                    </Text>
                  </View>
                  {open
                    ? <ChevronUp size={18} color={theme.textMuted?.val} />
                    : <ChevronDown size={18} color={theme.textMuted?.val} />}
                </XStack>

                {/* El tipo de salida manda: define si la cosa regresa, que es lo
                    que el guardia tiene que saber ANTES de dejarla pasar. */}
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

                {/* Quién lo pide y de qué empresa. En Pendientes la fecha no va:
                    toda la lista es la misma y ya está en el selector. */}
                {/* Quién puede retirarlo. En esta pantalla es el dato que el
                    guardia compara contra la persona que tiene enfrente, así que
                    va en su propia línea y en el color de marca, no perdido
                    entre el solicitante y la empresa. */}
                {p.Responsable ? (
                  <XStack alignItems="center" gap="$1.5">
                    <IdCard size={13} color={ACCENT} />
                    <Text fontSize={12} fontWeight="800" color="$text">{p.Responsable}</Text>
                    <Text fontSize={10} color="$textMuted">retira</Text>
                  </XStack>
                ) : null}

                <XStack alignItems="center" gap="$3" flexWrap="wrap">
                  <XStack alignItems="center" gap="$1.5">
                    <User size={12} color={theme.textMuted?.val} />
                    <Text fontSize={11} color="$textMuted">{p.Solicitante || p.Create_By}</Text>
                  </XStack>
                  {p.Empresa ? (
                    <XStack alignItems="center" gap="$1.5">
                      <Building2 size={12} color={theme.textMuted?.val} />
                      <Text fontSize={11} color="$textMuted">{p.Empresa}</Text>
                    </XStack>
                  ) : null}
                  {/* En el historial la fecha REAL sí importa: es cuándo cruzó
                      la puerta, y varía pase a pase. */}
                  {!conFecha && p.FechaSalidaReal ? (
                    <XStack alignItems="center" gap="$1.5">
                      <LogOut size={12} color={theme.textMuted?.val} />
                      <Text fontSize={11} color="$textMuted">Salió {fmtFechaHora(p.FechaSalidaReal)}</Text>
                    </XStack>
                  ) : null}
                </XStack>

                {/* Cuánto lleva afuera. Es lo que convierte la bandeja en algo
                    accionable: 40 días afuera no es lo mismo que 2, y a partir
                    de un mes se pinta en rojo para que salte solo. */}
                {p.DiasAfuera != null ? (
                  <XStack alignItems="center" gap="$1.5" alignSelf="flex-start"
                    backgroundColor={p.DiasAfuera >= 30 ? 'rgba(239, 68, 68, 0.15)' : ACCENT_BG}
                    borderWidth={1} borderColor={p.DiasAfuera >= 30 ? '#ef4444' : ACCENT}
                    borderRadius="$3" paddingHorizontal="$2" paddingVertical={3}>
                    <Clock size={11} color={p.DiasAfuera >= 30 ? '#ef4444' : ACCENT} />
                    <Text fontSize={10} fontWeight="800"
                      color={p.DiasAfuera >= 30 ? '#ef4444' : ACCENT}>
                      {p.DiasAfuera === 0 ? 'Salió hoy'
                        : p.DiasAfuera === 1 ? 'Afuera desde ayer'
                          : `${p.DiasAfuera} días afuera`}
                    </Text>
                  </XStack>
                ) : null}

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

                    {/* La bitácora: quién autorizó esto. Acá ya está toda dada
                        —el pase está aprobado—, y sirve para responder "¿y esto
                        quién lo permitió?" sin llamar a nadie. */}
                    {bitacoras[p.Id]?.length ? (
                      <YStack gap="$2" marginTop="$2" paddingTop="$2.5"
                        borderTopWidth={1} borderTopColor="$border">
                        <XStack alignItems="center" gap="$1.5">
                          <Stamp size={12} color={theme.primary?.val} />
                          <Text fontSize={11} fontWeight="900" color="$textMuted">FIRMAS</Text>
                        </XStack>
                        <LineaFirmas
                          pasos={bitacoras[p.Id]}
                          pasoActual={p.PasoActual}
                          creadoPor={p.Solicitante || p.Create_By}
                          creadoEn={p.Creation_Date}
                          fmtFecha={fmtFechaHora}
                        />
                      </YStack>
                    ) : null}

                    {/* El movimiento del pase. Acá es lo que responde "¿y este
                        cuándo salió y quién lo despachó?" sin llamar a nadie. */}
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
            )
          }}
        />
      )}

      {/* Footer fijo: escanear es LA acción de esta pantalla, así que vive
          siempre a la mano y no escondida en el encabezado. */}
      <YStack position="absolute" left={0} right={0} bottom={0}
        backgroundColor="$background" borderTopWidth={1} borderTopColor="$border"
        paddingHorizontal="$3" paddingTop="$2.5" paddingBottom="$3">
        <View
          onPress={() => setEscaneando(true)}
          pressStyle={{ opacity: 0.85 }}
          backgroundColor={ACCENT} borderRadius="$4" height={48}
          alignItems="center" justifyContent="center" flexDirection="row" gap="$2">
          <ScanLine size={18} color="#fff" />
          <Text color="#fff" fontWeight="800" fontSize="$3">Escanear para registrar salida</Text>
        </View>
      </YStack>

      <EscanerPase
        abierto={escaneando}
        buscando={buscando}
        onCerrar={() => setEscaneando(false)}
        onLeer={escaneado}
      />
    </View>
  )
}
