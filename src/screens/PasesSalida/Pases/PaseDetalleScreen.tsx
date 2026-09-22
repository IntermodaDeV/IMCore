import React, { useCallback, useEffect, useState } from 'react'
import { RefreshControl, ScrollView } from 'react-native'
import { Text, XStack, YStack, View, useTheme } from 'tamagui'
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native'
import {
  ArrowLeft, Package, RotateCcw, Send, QrCode, Stamp, User, Clock, CalendarDays,
  // `History` se renombra: choca con el tipo global History del DOM y TS resuelve ese.
  MessageSquare, LogOut, Ban, IdCard, History as HistoryIcon,
} from 'lucide-react-native'

import { usePageHeader } from '../../../hooks/usePageHeader'
import SkeletonList from '../../../components/Skeletons/SkeletonList'
import ErrorState from '../../AdmSys/ErrorState'
import { AppError, handleError } from '../../../utils/errorHandler'
import { shadows } from '../../../theme/shadows'
import {
  ACCENT, ACCENT_BG, estadoVisual, fmtCantidad, fmtFecha, fmtFechaHora, situacionQr,
} from '../pasesSalida.helpers'
import LineaFirmas from './LineaFirmas'
import LineaEstados from './LineaEstados'
import PaseQrSheet from './PaseQrSheet'
import { pasesService } from '../../../api/modules/pasesSalida/pases.service'
import {
  armarBitacora, IPaseSalida, IPaseSalidaDetalle, IPaseSalidaEstado, IPasoFirma,
} from '../../../api/modules/pasesSalida/pases.types'

/**
 * El pase en solo lectura. Acá se llega cuando ya no admite cambios — los
 * pendientes abren el formulario directo desde la lista.
 *
 * Cuatro bloques, en el orden en que se consultan: qué es el pase, qué sale, su
 * ruta de aprobación y el QR. El detalle va antes que la ruta porque es lo que
 * se viene a ver; la ruta responde "¿y cómo va?", que es la siguiente pregunta.
 */

/** Una fila etiqueta/valor del encabezado. No se pinta si no hay valor. */
function Dato({ icon: Icon, label, value }: { icon: any; label: string; value?: string | null }) {
  const theme = useTheme()
  if (!value) return null
  return (
    <XStack alignItems="flex-start" gap="$2.5">
      <Icon size={13} color={theme.textMuted?.val} style={{ marginTop: 1 }} />
      <YStack flex={1} gap={1}>
        <Text fontSize={10} color="$textMuted">{label}</Text>
        <Text fontSize={12} color="$text" fontWeight="600">{value}</Text>
      </YStack>
    </XStack>
  )
}

/**
 * Un dato del detalle en su propia cajita.
 *
 * Con etiqueta arriba y valor abajo en vez de "Marca: Truper" en una línea: el
 * ojo encuentra el número de serie sin leer, que es lo que hace el guardia.
 */
function Ficha({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <YStack borderWidth={1} borderColor="$border" borderRadius="$3"
      paddingHorizontal="$2.5" paddingVertical={5} gap={1} minWidth={84}>
      <Text fontSize={9} color="$textMuted" fontWeight="700">{label.toUpperCase()}</Text>
      <Text fontSize={11} color="$text" fontWeight="800">{value}</Text>
    </YStack>
  )
}

/** Encabezado de sección: ícono, título y una línea que ocupa el resto. */
function Seccion({ icon: Icon, titulo }: { icon: any; titulo: string }) {
  const theme = useTheme()
  return (
    <XStack alignItems="center" gap="$2" paddingBottom="$2">
      <Icon size={13} color={theme.primary?.val} />
      <Text fontSize={11} fontWeight="900" color="$textMuted">{titulo.toUpperCase()}</Text>
      <View flex={1} height={1} backgroundColor="$border" />
    </XStack>
  )
}

export default function PaseDetalleScreen() {
  const theme = useTheme()
  const route = useRoute<any>()
  const navigation = useNavigation<any>()

  const id: number = route.params?.id
  const correlativo: string = route.params?.correlativo ?? 'Pase'

  const [pase, setPase] = useState<IPaseSalida | null>(null)
  const [detalle, setDetalle] = useState<IPaseSalidaDetalle[]>([])
  const [bitacora, setBitacora] = useState<IPasoFirma[]>([])
  const [movimientos, setMovimientos] = useState<IPaseSalidaEstado[]>([])
  const [loading, setLoading] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [error, setError] = useState<AppError | null>(null)
  const [qrAbierto, setQrAbierto] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const [rPase, rDet, rFirmas, rHist] = await Promise.all([
        pasesService.getPase(id),
        pasesService.getDetalle(id),
        pasesService.getFirmasPase(id),
        pasesService.getHistorialPase(id),
      ])
      // El SP devuelve una fila; el arreglo trae 0 o 1 elemento.
      setPase(rPase.Data?.[0] ?? null)
      setDetalle(rDet.Data ?? [])
      setBitacora(armarBitacora(rFirmas.Data ?? []))
      setMovimientos(rHist.Data ?? [])
      setError(null)
    } catch (e) {
      setPase(null); setDetalle([]); setBitacora([]); setMovimientos([])
      setError(handleError(e))
    }
  }, [id])

  useEffect(() => { (async () => { setLoading(true); await cargar(); setLoading(false) })() }, [cargar])
  useFocusEffect(useCallback(() => { cargar() }, [cargar]))
  const onRefresh = useCallback(async () => { setRefrescando(true); await cargar(); setRefrescando(false) }, [cargar])

  // Sin acciones: acá se llega solo cuando el pase ya no admite cambios.
  usePageHeader({
    left: <ArrowLeft color={theme.text?.val} onPress={() => navigation.goBack()} />,
    center: <Text fontSize="$4" fontWeight="700" color="$text" numberOfLines={1}>{pase?.Correlativo ?? correlativo}</Text>,
  })

  if (loading) {
    return <View flex={1} backgroundColor="$background"><SkeletonList /></View>
  }

  if (error) {
    return (
      <View flex={1} backgroundColor="$background">
        <ErrorState
          type={error.type} title={error.title} message={error.message} errorCode={error.status}
          onRetry={async () => { setLoading(true); await cargar(); setLoading(false) }}
        />
      </View>
    )
  }

  if (!pase) {
    return (
      <View flex={1} backgroundColor="$background">
        <ErrorState
          type="general"
          title="No se encontró el pase"
          message="Puede haber sido eliminado o ya no tiene acceso a él."
          onRetry={() => navigation.goBack()}
          retryLabel="Volver"
        />
      </View>
    )
  }

  const est = estadoVisual(pase.Estado)
  /* Tres situaciones, no dos: disponible, todavía no, y cerrado — que no se
     resuelve esperando, así que no puede dar el mismo mensaje que "todavía no". */
  const situacion = situacionQr(pase.Estado)
  const conQr = situacion.situacion === 'disponible'
  const cerrado = situacion.situacion === 'cerrado'
  const qr = {
    motivo: situacion.motivo,
    color: cerrado
      ? { bg: 'rgba(100, 116, 139, 0.18)', borde: '#64748b' }
      : conQr
        ? { bg: ACCENT_BG, borde: ACCENT }
        : { bg: 'rgba(245, 158, 11, 0.18)', borde: '#f59e0b' },
  }

  return (
    <View flex={1} backgroundColor="$background">
      <ScrollView
        contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} tintColor={ACCENT} />}
      >
        {/* ── Qué es el pase ── */}
        <YStack backgroundColor="$backgroundElevated" borderRadius="$4"
          borderLeftWidth={4} borderLeftColor={est.color} borderWidth={1} borderColor="$border"
          padding="$4" gap="$3" {...shadows.sm}>

          <XStack alignItems="center" gap="$2">
            <Text flex={1} fontSize={18} fontWeight="900" color="$text">{pase.Correlativo}</Text>
            <View backgroundColor={est.bg} borderWidth={1} borderColor={est.color}
              paddingHorizontal="$2.5" paddingVertical={4} borderRadius="$10">
              <Text fontSize={10} fontWeight="800" color={est.color}>
                {pase.EstadoNombre || est.label}
              </Text>
            </View>
          </XStack>

          {/* El tipo manda: define quién firma y si la cosa regresa. */}
          <XStack alignItems="center" gap="$2" flexWrap="wrap">
            <View backgroundColor={ACCENT} borderRadius="$3" paddingHorizontal="$3" paddingVertical={5}>
              <Text fontSize={12} fontWeight="900" color="#fff">{pase.TipoSalida}</Text>
            </View>
            <View backgroundColor={pase.Retorna ? ACCENT_BG : 'transparent'}
              borderWidth={1} borderColor={pase.Retorna ? ACCENT : '$border'}
              borderRadius="$3" paddingHorizontal="$2.5" paddingVertical={5}
              flexDirection="row" alignItems="center" gap={5}>
              {pase.Retorna
                ? <RotateCcw size={11} color={ACCENT} />
                : <Send size={11} color={theme.textMuted?.val} />}
              <Text fontSize={10} fontWeight="800" color={pase.Retorna ? ACCENT : '$textMuted'}>
                {pase.Retorna ? 'Debe regresar' : 'Salida definitiva'}
              </Text>
            </View>
          </XStack>

          <YStack gap="$2.5">
            <Dato icon={Send} label="Enviado a" value={pase.EnviadoA} />
            <Dato icon={IdCard} label="Retira" value={pase.Responsable} />
            <Dato icon={User} label="Solicitante" value={pase.Solicitante || pase.Create_By} />
            <Dato icon={Clock} label="Creado" value={fmtFechaHora(pase.Creation_Date)} />
            {/* Es la fecha en que SE PLANEA sacarlo, no un hecho: el pase todavía
                no ha salido. Decir solo "Salida" se leía como que ya ocurrió. */}
            <Dato icon={CalendarDays} label="Fecha prevista de salida" value={fmtFecha(pase.FechaSalida)} />
            {/* La salida REAL, con hora, la escribe portería al dejarlo pasar.
                Va junto a la prevista para que se vea si salió cuando tocaba. */}
            <Dato
              icon={LogOut}
              label="Salió"
              value={pase.FechaSalidaReal
                ? `${fmtFechaHora(pase.FechaSalidaReal)}${
                    pase.SalidaPorNombre || pase.SalidaPor
                      ? ` · ${pase.SalidaPorNombre || pase.SalidaPor}`
                      : ''
                  }`
                : null}
            />
            {pase.Retorna ? (
              <Dato icon={RotateCcw} label="Regresó" value={fmtFechaHora(pase.FechaRetorno)} />
            ) : null}
            <Dato icon={MessageSquare} label="Comentario" value={pase.Comentario} />
          </YStack>
        </YStack>

        <View height={16} />

        {/* ── Qué sale ── */}
        <Seccion icon={Package} titulo={`Qué sale (${detalle.length})`} />
        <YStack gap="$2.5">
          {detalle.map(d => (
            <YStack key={d.Id} backgroundColor="$backgroundElevated" borderRadius="$4"
              borderWidth={1} borderColor="$border" padding="$4" gap="$2" {...shadows.sm}>

              <XStack alignItems="flex-start" gap="$2">
                <Text flex={1} fontSize={14} fontWeight="800" color="$text">{d.Material}</Text>
                <View backgroundColor={ACCENT_BG} borderWidth={1} borderColor={ACCENT}
                  borderRadius="$3" paddingHorizontal="$2.5" paddingVertical={3}>
                  <Text fontSize={12} fontWeight="900" color={ACCENT}>
                    {fmtCantidad(d.Cantidad)}{d.UnidadMedida ? ` ${d.UnidadMedida}` : ''}
                  </Text>
                </View>
              </XStack>

              {d.Descripcion ? (
                <Text fontSize={12} color="$text">{d.Descripcion}</Text>
              ) : null}

              {d.Marca || d.Modelo || d.Serie ? (
                <XStack flexWrap="wrap" gap="$2" marginTop={2}>
                  <Ficha label="Marca" value={d.Marca} />
                  <Ficha label="Modelo" value={d.Modelo} />
                  <Ficha label="Serie" value={d.Serie} />
                </XStack>
              ) : null}
            </YStack>
          ))}

          {detalle.length === 0 ? (
            <YStack alignItems="center" paddingVertical="$6" gap="$2">
              <Package size={24} color={theme.textMuted?.val} />
              <Text fontSize="$2" color="$textMuted">Este pase no tiene líneas.</Text>
            </YStack>
          ) : null}
        </YStack>

        <View height={16} />

        {/* ── La ruta de aprobación ── */}
        {bitacora.length ? (
          <>
            <Seccion icon={Stamp} titulo="Ruta de aprobación" />
            <YStack backgroundColor="$backgroundElevated" borderRadius="$4" borderWidth={1}
              borderColor="$border" padding="$4" {...shadows.sm}>
              <LineaFirmas
                pasos={bitacora}
                pasoActual={pase.PasoActual}
                creadoPor={pase.Solicitante || pase.Create_By}
                creadoEn={pase.Creation_Date}
                fmtFecha={fmtFechaHora}
              />
            </YStack>
            <View height={16} />
          </>
        ) : null}

        {/* ── El movimiento del pase ──
             Va después de la ruta de firmas y no mezclado con ella: la ruta dice
             qué falta, esto dice qué pasó. */}
        {movimientos.length ? (
          <>
            <Seccion icon={HistoryIcon} titulo="Movimiento del pase" />
            <YStack backgroundColor="$backgroundElevated" borderRadius="$4" borderWidth={1}
              borderColor="$border" padding="$4" {...shadows.sm}>
              <LineaEstados movimientos={movimientos} />
            </YStack>
            <View height={16} />
          </>
        ) : null}

        {/* ── El QR ── */}
        <Seccion icon={QrCode} titulo="Código de salida" />
        <YStack backgroundColor="$backgroundElevated" borderRadius="$4" borderWidth={1}
          borderColor="$border" padding="$4" gap="$3" alignItems="center" {...shadows.sm}>

          <View width={54} height={54} borderRadius={27}
            backgroundColor={qr.color.bg}
            borderWidth={1} borderColor={qr.color.borde}
            alignItems="center" justifyContent="center">
            {cerrado
              ? <Ban size={26} color={qr.color.borde} />
              : <QrCode size={26} color={qr.color.borde} />}
          </View>

          {cerrado ? (
            <Text fontSize={13} fontWeight="800" color="$text" textAlign="center">
              Este código ya no se puede generar
            </Text>
          ) : null}

          <Text fontSize={12} color="$textMuted" textAlign="center">{qr.motivo}</Text>

          {conQr ? (
            <View onPress={() => setQrAbierto(true)} pressStyle={{ opacity: 0.85 }}
              backgroundColor={ACCENT} borderRadius="$4" height={44} width="100%"
              alignItems="center" justifyContent="center" flexDirection="row" gap="$2">
              <QrCode size={16} color="#fff" />
              <Text color="#fff" fontWeight="800" fontSize="$3">Ver y compartir código</Text>
            </View>
          ) : null}
        </YStack>
      </ScrollView>

      <PaseQrSheet pase={qrAbierto ? pase : null} onCerrar={() => setQrAbierto(false)} />
    </View>
  )
}
