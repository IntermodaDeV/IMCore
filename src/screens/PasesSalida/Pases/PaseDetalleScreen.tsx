import React, { useCallback, useEffect, useState } from 'react'
import { RefreshControl, ScrollView } from 'react-native'
import { Text, XStack, YStack, View, useTheme } from 'tamagui'
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native'
import {
  ArrowLeft, Check, Package, RotateCcw, Send, QrCode, Stamp, User, Clock, CalendarDays,
  // `History` se renombra: choca con el tipo global History del DOM y TS resuelve ese.
  MessageSquare, LogOut, Ban, IdCard, History as HistoryIcon, Route, HandHeart,
} from 'lucide-react-native'

import { usePageHeader } from '../../../hooks/usePageHeader'
import SkeletonList from '../../../components/Skeletons/SkeletonList'
import AppInput from '../../../components/commons/AppInput'
import ErrorState from '../../AdmSys/ErrorState'
import { AppError, handleError } from '../../../utils/errorHandler'
import { shadows } from '../../../theme/shadows'
import {
  ACCENT, ACCENT_BG, ACCESO_REGRESO_PARCIAL, ESTADOS_ABIERTOS, estadoVisual,
  fmtCantidad, fmtFecha, fmtFechaHora, situacionQr, tieneAcceso,
} from '../pasesSalida.helpers'
import { useAuth } from '../../../context/AuthContext'
import { useShowToast } from '../../../utils/useShowToast'
import LineaFirmas from './LineaFirmas'
import LineaEstados from './LineaEstados'
import LineaRecorrido from './LineaRecorrido'
import PaseQrSheet from './PaseQrSheet'
import { pasesService } from '../../../api/modules/pasesSalida/pases.service'
import {
  armarBitacora, IPaseBitacora, IPaseSalida, IPaseSalidaAuth, IPaseSalidaDetalle,
  IPaseSalidaEstado, IPasoFirma,
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
  /** El Id de la línea que se está guardando, para bloquear solo esa. */
  const [guardandoParcial, setGuardandoParcial] = useState<number | null>(null)
  /** El recorrido por los portones. Es contra esto que se firma el recibo. */
  const [recorrido, setRecorrido] = useState<IPaseBitacora[]>([])
  /** Las filas crudas de firma: la bitácora armada trae el nombre, no el código. */
  const [firmasRaw, setFirmasRaw] = useState<IPaseSalidaAuth[]>([])
  const [recibiendo, setRecibiendo] = useState(false)
  /* El cierre con faltante vive acá y no en un modal: hay que poder mirar el
     recorrido y las líneas mientras se escribe por qué no volvió el material. */
  const [motivoCierre, setMotivoCierre] = useState('')
  const [cerrando, setCerrando] = useState(false)

  const { user } = useAuth()
  const { showToast } = useShowToast()

  /**
   * Si acá se puede poner y quitar la marca de regreso parcial.
   *
   * Es la ÚNICA edición que se admite con el pase ya aprobado, y por eso las
   * cuatro condiciones: la decisión de si algo puede volver de a poco aparece
   * cuando ya está afuera, pero eso no abre la puerta a editar lo demás.
   *
   * El servidor revalida exactamente lo mismo; esto solo decide qué se dibuja.
   */
  const puedeEditarParcial =
    !!pase
    && tieneAcceso(user?.Access, ACCESO_REGRESO_PARCIAL)
    && pase.Retorna
    && ESTADOS_ABIERTOS.includes(pase.Estado)
    && (pase.Create_By ?? '') === (user?.Code ?? '\u0000')

  /**
   * Guarda al instante, sin botón: es un solo dato y ya se está mirando el
   * pase, no una pantalla de edición.
   *
   * No hay estado optimista: se espera la respuesta y se recarga. Si el
   * servidor rechaza —el pase cerró mientras tanto, se revocó el acceso—, la
   * casilla no debe quedar marcada mostrando algo que no se guardó.
   */
  const alternarParcial = async (detalleId: number, valor: boolean) => {
    setGuardandoParcial(detalleId)
    try {
      const r = await pasesService.cambiarRegresoParcial(detalleId, valor)
      if (r.Success) {
        showToast('success', 'Listo', r.SuccessMessage || 'Marca actualizada')
        await cargar()
      } else {
        showToast('error', 'No se pudo cambiar', r.ErrorMessage || 'Intente de nuevo')
      }
    } catch (e: any) {
      showToast('error', 'Error', e?.message || 'No se pudo cambiar')
    } finally { setGuardandoParcial(null) }
  }

  /**
   * Si acá se puede dar por recibido.
   *
   * SOLO SE RECIBE LO QUE YA PASÓ POR EL GUARDIA. Esa es la regla que sostiene
   * todo lo demás: si un pase se pudiera cerrar sin un regreso registrado en un
   * portón, el control dejaría de existir — alguien podría finalizar un pase con
   * el material todavía afuera. Por eso las dos únicas puertas son:
   *
   *   PSRET   seguridad registró que entró todo
   *   PSREPA  entró una parte y esa entrega todavía no se recibe
   *
   * Un PSREPA sin entregas pendientes no entra: ese pase está esperando
   * material, no una firma.
   *
   * QUIÉN: el solicitante o quien firmó. El segundo camino existe para que el
   * pase no se quede atorado con el material adentro porque el solicitante salió
   * de vacaciones. El servidor revalida lo mismo; esto solo decide qué se pinta.
   */
  const hayQueRecibir =
    !!pase && pase.Retorna
    && (pase.Estado === 'PSRET' || (pase.Estado === 'PSREPA' && (pase.EntregasSinRecibir ?? 0) > 0))

  /**
   * Los tres números del regreso, sumando todas las líneas.
   *
   * Son TRES y no dos porque desde que el regreso tiene dos actos hay un estado
   * intermedio que no existía: material que el guardia ya dejó entrar y que
   * nadie ha confirmado. Mostrarlo junto con lo recibido lo escondería, y es
   * justo lo que hay que ir a cerrar.
   *
   * Las líneas sin cantidad —las de Camión— quedan fuera: no hay unidades que
   * sumar, y meterlas como cero diría «0 de 0», que no significa nada.
   */
  const conCantidad = detalle.filter(d => d.Cantidad != null)
  const suma = (f: (d: IPaseSalidaDetalle) => number | null | undefined) =>
    conCantidad.reduce((t, d) => t + (f(d) ?? 0), 0)

  const totalUnidades = suma(d => d.Cantidad)
  const recibidas     = suma(d => d.CantidadRecibida)
  const entraron      = suma(d => d.CantidadRetornada)
  const porConfirmar  = Math.max(0, entraron - recibidas)
  const afuera        = Math.max(0, totalUnidades - entraron)

  /* Cuántas ENTRADAS distintas se acumularon sin confirmar, que es otra cosa
     que cuántas unidades: 3 unidades pueden haber entrado de una vez o en tres
     viajes, y al recibir hay que contar contra lo que haya enfrente. */
  const entregasSinRecibir = pase?.EntregasSinRecibir ?? 0

  /* Solo tiene sentido en un pase que debe regresar y que ya salió: antes de
     eso los tres números serían «0, 0, todo afuera», que es ruido. */
  const hayResumen = !!pase && pase.Retorna && conCantidad.length > 0
    && ['PSSAL', 'PSREPA', 'PSRET', 'PSFIN'].includes(pase.Estado)

  const esMio = !!pase && (pase.Create_By ?? '') === (user?.Code ?? '\u0000')
  const loFirme = firmasRaw.some(f => f.IsAuth === true && f.UserAuth === user?.Code)
  const puedeActuar = esMio || loFirme
  const puedeRecibir = hayQueRecibir && puedeActuar

  /**
   * Si acá se puede cerrar el pase dando de baja lo que no volvió.
   *
   * Es OTRA decisión que recibir, y aparece en otro momento: mientras haya algo
   * que confirmar, eso va primero. Dar por perdido material sin haber revisado
   * lo que acaba de entrar es declarar perdido algo que puede estar en la
   * bodega desde ayer.
   */
  const hayQueCerrar =
    !!pase && pase.Retorna && afuera > 0 && !hayQueRecibir
    && ['PSSAL', 'PSREPA', 'PSRET'].includes(pase.Estado)

  const puedeCerrar = hayQueCerrar && puedeActuar

  const cerrar = async () => {
    /* El mínimo se revisa acá para no gastar un viaje, pero el servidor lo
       revalida: es el único registro de por qué faltó material. */
    if (motivoCierre.trim().length < 10) {
      showToast('warning', 'Falta el motivo',
        'Explique por qué se cierra sin que vuelva todo. Al menos 10 caracteres.')
      return
    }
    setCerrando(true)
    try {
      const r = await pasesService.cerrarConFaltante(id, motivoCierre.trim())
      if (r.Success) {
        showToast('success', 'Pase cerrado', r.SuccessMessage || 'Quedó registrado el motivo')
        setMotivoCierre('')
        await cargar()
      } else {
        showToast('error', 'No se pudo cerrar', r.ErrorMessage || 'Intente de nuevo')
      }
    } catch (e: any) {
      showToast('error', 'Error', e?.message || 'No se pudo cerrar')
    } finally { setCerrando(false) }
  }

  /**
   * Da por recibidas TODAS las entregas pendientes de una vez.
   *
   * No se pregunta cuáles: si el guardia registró dos y la persona aparece
   * hasta el viernes, tiene las dos enfrente. Pedirle que las marque una por una
   * sería inventarle trabajo para un dato que ya es evidente.
   */
  const recibir = async () => {
    setRecibiendo(true)
    try {
      const r = await pasesService.recibirPase(id)
      if (r.Success) {
        showToast('success', 'Listo', r.SuccessMessage || 'Pase recibido')
        await cargar()
      } else {
        showToast('error', 'No se pudo recibir', r.ErrorMessage || 'Intente de nuevo')
      }
    } catch (e: any) {
      showToast('error', 'Error', e?.message || 'No se pudo recibir')
    } finally { setRecibiendo(false) }
  }

  const cargar = useCallback(async () => {
    try {
      const [rPase, rDet, rFirmas, rHist, rRuta] = await Promise.all([
        pasesService.getPase(id),
        pasesService.getDetalle(id),
        pasesService.getFirmasPase(id),
        pasesService.getHistorialPase(id),
        /* El recorrido no bloquea la pantalla: si falla, el pase se ve igual y
           simplemente no hay línea de portones que mostrar. Es información de
           respaldo, no el contenido. */
        pasesService.getBitacora(id).catch(() => undefined),
      ])
      // El SP devuelve una fila; el arreglo trae 0 o 1 elemento.
      setPase(rPase.Data?.[0] ?? null)
      setDetalle(rDet.Data ?? [])
      setFirmasRaw(rFirmas.Data ?? [])
      setBitacora(armarBitacora(rFirmas.Data ?? []))
      setMovimientos(rHist.Data ?? [])
      setRecorrido(rRuta?.Data ?? [])
      setError(null)
    } catch (e) {
      setPase(null); setDetalle([]); setBitacora([]); setMovimientos([])
      setFirmasRaw([]); setRecorrido([])
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
            {/* La salida REAL, con hora, la escribe seguridad al dejarlo pasar.
                Va junto a la prevista para que se vea si salió cuando tocaba. */}
            <Dato
              icon={LogOut}
              label="Salió"
              /* Con dos portones, "salió" sin decir POR DÓNDE deja a medias la
                 única pregunta que importa después: si pasó por seguridad o se
                 fue directo por planta. */
              value={pase.FechaSalidaReal
                ? `${fmtFechaHora(pase.FechaSalidaReal)}${
                    pase.SalidaPuesto ? ` · ${pase.SalidaPuesto}` : ''
                  }${
                    pase.SalidaPorNombre || pase.SalidaPor
                      ? ` · ${pase.SalidaPorNombre || pase.SalidaPor}`
                      : ''
                  }`
                : null}
            />
            {pase.Retorna ? (
              <Dato icon={RotateCcw} label="Regresó"
                value={pase.FechaRetorno
                  ? `${fmtFechaHora(pase.FechaRetorno)}${
                      pase.RetornoPuesto ? ` · ${pase.RetornoPuesto}` : ''
                    }${
                      pase.RetornoPorNombre || pase.RetornoPor
                        ? ` · ${pase.RetornoPorNombre || pase.RetornoPor}`
                        : ''
                    }`
                  : null} />
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
                {/* Sin cantidad lo que sale es un camión: se dice, en vez de
                    pintar un badge vacío que parecería un dato perdido. */}
                {d.Cantidad == null ? (
                  <View borderWidth={1} borderColor="$border"
                    borderRadius="$3" paddingHorizontal="$2.5" paddingVertical={3}>
                    <Text fontSize={11} fontWeight="800" color="$textMuted">Camión</Text>
                  </View>
                ) : (
                  <View backgroundColor={ACCENT_BG} borderWidth={1} borderColor={ACCENT}
                    borderRadius="$3" paddingHorizontal="$2.5" paddingVertical={3}>
                    <Text fontSize={12} fontWeight="900" color={ACCENT}>
                      {fmtCantidad(d.Cantidad)}{d.UnidadMedida ? ` ${d.UnidadMedida}` : ''}
                    </Text>
                  </View>
                )}
              </XStack>

              {d.Descripcion ? (
                <Text fontSize={12} color="$text">{d.Descripcion}</Text>
              ) : null}

              {/* Si algo de esta línea ya volvió, el badge de arriba dice la
                  cantidad que SALIÓ y por sí solo daría a entender que sigue
                  todo afuera. Acá se dice cuánto volvió y cuánto falta. */}
              {(d.CantidadRetornada ?? 0) > 0 ? (
                <XStack alignItems="center" gap="$1.5" marginTop={2}>
                  <RotateCcw size={12} color={(d.CantidadPendiente ?? 0) > 0 ? ACCENT : '#22c55e'} />
                  <Text flex={1} fontSize={11} fontWeight="800"
                    color={(d.CantidadPendiente ?? 0) > 0 ? ACCENT : '#22c55e'}>
                    {(d.CantidadPendiente ?? 0) > 0
                      ? `Regresaron ${fmtCantidad(d.CantidadRetornada)} · faltan ${fmtCantidad(d.CantidadPendiente)}`
                      : 'Regresó completo'}
                  </Text>
                </XStack>
              ) : null}

              {d.Marca || d.Modelo || d.Serie ? (
                <XStack flexWrap="wrap" gap="$2" marginTop={2}>
                  <Ficha label="Marca" value={d.Marca} />
                  <Ficha label="Modelo" value={d.Modelo} />
                  <Ficha label="Serie" value={d.Serie} />
                </XStack>
              ) : null}

              {/* Editable si se puede; si no, se muestra igual cuando está
                  marcada. Un firmante o quien mire un pase ajeno necesita ver
                  que esa línea puede volver de a poco, aunque no pueda
                  cambiarlo. */}
              {puedeEditarParcial ? (
                <XStack alignItems="center" gap="$2.5" marginTop={4}
                  opacity={guardandoParcial === d.Id ? 0.5 : 1}
                  onPress={guardandoParcial === d.Id
                    ? undefined
                    : () => alternarParcial(d.Id, d.RegresoParcial !== true)}
                  pressStyle={{ opacity: 0.6 }} hitSlop={6}>
                  <View width={18} height={18} borderRadius="$1" borderWidth={1.5}
                    borderColor={d.RegresoParcial === true ? ACCENT : '$border'}
                    backgroundColor={d.RegresoParcial === true ? ACCENT : 'transparent'}
                    alignItems="center" justifyContent="center">
                    {d.RegresoParcial === true ? <Check size={12} color="#fff" /> : null}
                  </View>
                  <Text fontSize={12} fontWeight="800" color="$text">Puede regresar por partes</Text>
                </XStack>
              ) : d.RegresoParcial === true ? (
                <XStack alignItems="center" gap="$1.5" marginTop={4}>
                  <RotateCcw size={12} color={ACCENT} />
                  <Text fontSize={11} fontWeight="800" color={ACCENT}>
                    Puede regresar por partes
                  </Text>
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

        {/* ── El recorrido por los portones ──
             Va al final de las líneas de tiempo y justo antes del recibo: es lo
             último que se lee antes de firmar, y es contra lo que se firma. */}
        {recorrido.length ? (
          <>
            <Seccion icon={Route} titulo="Recorrido por los portones" />
            <YStack backgroundColor="$backgroundElevated" borderRadius="$4" borderWidth={1}
              borderColor="$border" padding="$4" {...shadows.sm}>
              <LineaRecorrido eventos={recorrido} />
            </YStack>
            <View height={16} />
          </>
        ) : null}
        
        {/* El marcador del regreso, antes de las líneas: la pregunta con la que
            uno abre el pase es «¿cuánto llevo?», no «¿qué había en la línea 3?».

            Una línea y no tres columnas con números grandes: esto se lee en un
            teléfono, y tres bloques de 22px se comían media pantalla para decir
            lo que cabe en un renglón. Los ceros ni se dibujan —un cero no pide
            nada— así que un pase completo queda en «5 recibidas de 5». */}
        {hayResumen ? (
          <YStack backgroundColor="$backgroundElevated" borderRadius="$3" borderWidth={1}
            borderColor="$border" paddingVertical="$2" paddingHorizontal="$2.5"
            marginBottom="$2.5" gap={3} {...shadows.sm}>

            <XStack flexWrap="wrap" alignItems="center" gap="$1.5">
              {[
                { n: recibidas,    label: 'recibidas',     color: '#22c55e', fijo: true },
                { n: porConfirmar, label: 'por confirmar', color: '#f59e0b', fijo: false },
                { n: afuera,       label: 'afuera',        color: ACCENT,    fijo: false },
              ]
                .filter(c => c.fijo || c.n > 0)
                .map((c, i) => (
                  <XStack key={c.label} alignItems="center" gap="$1.5">
                    {i > 0 ? <Text fontSize={11} color="$textMuted">·</Text> : null}
                    <Text fontSize={12} fontWeight="900" color={c.color}>{fmtCantidad(c.n)}</Text>
                    <Text fontSize={11} color="$textMuted">{c.label}</Text>
                  </XStack>
                ))}
              <Text fontSize={11} color="$textMuted">de {fmtCantidad(totalUnidades)}</Text>
            </XStack>

            {/* Cuántas ENTRADAS se acumularon sin confirmar. El número de
                unidades no alcanza: tres unidades pueden ser una entrega o
                tres, y eso cambia contra qué hay que contar al recibir. */}
            {porConfirmar > 0 ? (
              <Text fontSize={10.5} color="#f59e0b">
                {entregasSinRecibir >= 2
                  ? `${entregasSinRecibir} entradas sin confirmar suman ${fmtCantidad(porConfirmar)}. Al recibir se cierran todas.`
                  : `Entró ${fmtCantidad(porConfirmar)} y falta darla por recibida.`}
              </Text>
            ) : null}
          </YStack>
        ) : null}
        

        {/* ── Dar por recibido ──
             El segundo acto del regreso. Que el material cruce un portón no es
             que llegue a manos de quien lo prestó; esto cierra ese tramo. */}
        {hayQueRecibir ? (
          <>
            <Seccion icon={HandHeart} titulo="Recibir el material" />
            <YStack backgroundColor="$backgroundElevated" borderRadius="$4"
              borderWidth={1} borderColor="#22c55e" borderLeftWidth={4} borderLeftColor="#22c55e"
              padding="$4" gap="$3" {...shadows.sm}>

              <Text fontSize={13} fontWeight="800" color="$text">
                {pase.Estado === 'PSRET'
                  ? 'Seguridad ya dejó entrar todo lo que faltaba.'
                  : entregasSinRecibir >= 2
                    ? `Seguridad registró ${entregasSinRecibir} entregas que todavía no ha recibido.`
                    : 'Seguridad registró una entrega que todavía no ha recibido.'}
              </Text>

              <Text fontSize={12} color="$textMuted">
                {/* Cuando se acumularon varias, decir el total evita la cuenta
                    mental: el botón las cierra todas de un toque y hay que
                    contar contra ese número, no contra la última entrega. */}
                {entregasSinRecibir >= 2
                  ? `Son ${fmtCantidad(porConfirmar)} unidades en total y se reciben de una sola vez. Revise el recorrido de arriba contra lo que tiene enfrente.`
                  : pase.Estado === 'PSRET'
                    ? 'Revise el recorrido de arriba contra lo que tiene enfrente. Al darlo por recibido el pase queda finalizado.'
                    : 'Revise el recorrido de arriba contra lo que tiene enfrente. Lo que falta sigue afuera, así que el pase seguirá abierto.'}
              </Text>

              {puedeRecibir ? (
                <View onPress={recibiendo ? undefined : recibir}
                  pressStyle={{ opacity: 0.85 }} opacity={recibiendo ? 0.5 : 1}
                  backgroundColor="#22c55e" borderRadius="$4" height={46} width="100%"
                  alignItems="center" justifyContent="center" flexDirection="row" gap="$2">
                  <Check size={17} color="#fff" />
                  <Text color="#fff" fontWeight="800" fontSize="$3">
                    {recibiendo ? 'Registrando…' : 'Dar por recibido'}
                  </Text>
                </View>
              ) : (
                /* Se ve el estado pero no el botón: así quien no puede recibir
                   entiende qué falta y a quién buscar, en vez de creer que la
                   pantalla no cargó. */
                <Text fontSize={11} color="$textMuted" fontStyle="italic">
                  Solo {pase.Solicitante || pase.Create_By} —que fue quien pidió el
                  pase— o alguien que lo haya firmado puede darlo por recibido.
                </Text>
              )}
            </YStack>
            <View height={16} />
          </>
        ) : null}

        {/* ── Cerrar con faltante ──
             Aparece solo cuando ya no queda nada por confirmar y sigue faltando
             material: entonces sí hay una decisión que tomar. */}
        {hayQueCerrar ? (
          <>
            <Seccion icon={Ban} titulo="Cerrar el pase" />
            <YStack backgroundColor="$backgroundElevated" borderRadius="$4"
              borderWidth={1} borderColor="#f59e0b" borderLeftWidth={4} borderLeftColor="#f59e0b"
              padding="$4" gap="$3" {...shadows.sm}>

              <Text fontSize={13} fontWeight="800" color="$text">
                Faltan {fmtCantidad(afuera)} de {fmtCantidad(totalUnidades)} unidades por volver.
              </Text>

              <Text fontSize={12} color="$textMuted">
                Si ya no van a regresar —se donaron, se vendieron, se quedaron en
                el cliente— puede cerrar el pase acá. Las unidades quedan
                registradas como no devueltas.
              </Text>

              {puedeCerrar ? (
                <>
                  <AppInput
                    label="¿Por qué no volvió?"
                    value={motivoCierre}
                    onChangeText={setMotivoCierre}
                    // placeholder="Ej: se donaron 3 de los 5 pantalones en la feria"
                    multiline
                  />
                  {/* El mínimo se explica, no se esconde: un contador que baja
                      es más claro que un botón que no responde. */}
                  <Text fontSize={10}
                    color={motivoCierre.trim().length < 10 ? '#f59e0b' : '$textMuted'}>
                    {motivoCierre.trim().length < 10
                      ? `Faltan ${10 - motivoCierre.trim().length} caracteres. Alguien va a leer esto auditando faltantes.`
                      : 'Queda guardado con su nombre y la fecha.'}
                  </Text>

                  <View onPress={cerrando ? undefined : cerrar}
                    pressStyle={{ opacity: 0.85 }}
                    opacity={cerrando || motivoCierre.trim().length < 10 ? 0.45 : 1}
                    backgroundColor="#f59e0b" borderRadius="$4" height={46} width="100%"
                    alignItems="center" justifyContent="center" flexDirection="row" gap="$2">
                    <Ban size={17} color="#fff" />
                    <Text color="#fff" fontWeight="800" fontSize="$3">
                      {cerrando ? 'Cerrando…' : 'Cerrar pase'}
                    </Text>
                  </View>
                </>
              ) : (
                <Text fontSize={11} color="$textMuted" fontStyle="italic">
                  Solo {pase.Solicitante || pase.Create_By} —que fue quien pidió el
                  pase— o alguien que lo haya firmado puede cerrarlo.
                </Text>
              )}
            </YStack>
            <View height={16} />
          </>
        ) : null}

        {/* ── Por qué se cerró sin volver todo ──
             Después del cierre, el motivo es el único registro de qué pasó con
             el material. Va visible y no escondido en un historial. */}
        {pase.MotivoCierre ? (
          <>
            <Seccion icon={Ban} titulo="Cerrado con faltante" />
            <YStack backgroundColor="$backgroundElevated" borderRadius="$4"
              borderWidth={1} borderColor="$border" borderLeftWidth={4} borderLeftColor="#f59e0b"
              padding="$4" gap="$2" {...shadows.sm}>
              <Text fontSize={13} color="$text">{pase.MotivoCierre}</Text>
              <Text fontSize={10} color="$textMuted">
                {[
                  afuera > 0 ? `${fmtCantidad(afuera)} sin devolver` : null,
                  pase.RecibidoPorNombre || pase.RecibidoPor,
                  fmtFechaHora(pase.RecibidoFecha),
                ].filter(Boolean).join('  ·  ')}
              </Text>
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
