import React, { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshControl } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { YStack, XStack, Text, ScrollView, View, Button } from 'tamagui'
import {
  CalendarDays, Coins, MessageSquare, Repeat2, Plus,
  ChevronRight, Wallet,
} from 'lucide-react-native'
import { cooperativaService } from '../../api/modules/cooperativa/cooperativa.service'
import { ISolicitudCliente } from '../../api/modules/cooperativa/cooperativa.types'
import { usePageHeader } from '../../hooks/usePageHeader'
import { handleError } from '../../utils/errorHandler'
import { subscribeOpenMiSolicitud } from '../../services/cooperativaNavigation'
import SkeletonForm from '../../components/Skeletons/SkeletonForm'
import { shadows } from '../../theme/shadows'
import { NotificationBell } from '../../components/notifications/NotificationBell'
import EmptyState from '../AdmSys/EmptyState'
import ErrorState from '../AdmSys/ErrorState'

/**
 * Mis solicitudes (ruta 'RequestCoo').
 *
 * UNA lista, de UNA fuente: Cooperativa.dbo.Solicitud, vía
 * CooInter.SP_GetSolicitudesCliente.
 *
 * Antes eran dos — una en IMCore mientras se aprobaba y otra en Cooperativa
 * cuando ya existía del otro lado — y la pantalla tenía que emparejarlas para
 * no mostrar la misma solicitud dos veces. El esquema de IMCore ya no existe:
 * ahora la solicitud nace y vive en un solo lado desde el primer momento.
 */

const formatFecha = (valor: string | null): string => {
  if (!valor) return '-'
  const fecha = new Date(valor)
  if (isNaN(fecha.getTime())) return '-'
  return fecha.toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Monto en lempiras. Cooperativa maneja HNL. */
const formatMonto = (valor: number | null): string => {
  if (valor == null) return '-'
  return `L ${valor.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Cada cuánto le descuentan, según el tipo de plazo con el que se guardó. */
const CADA_CUANTO: Record<number, string> = {
  0: 'al mes',
  1: 'por quincena',
  2: 'por semana',
}

/**
 * El color y el icono de cada estado.
 *
 * El NOMBRE no está acá: lo manda el servidor, resuelto contra el catálogo de
 * la cooperativa. Acá solo vive cómo se ve — si mañana agregan un estado,
 * aparece con su nombre y el aspecto neutro de abajo, sin tocar el app.
 */
const ASPECTO: Record<number, { color: string; token: string }> = {
  0: { color: '#F59E0B', token: '$warning' },    // Pendiente
  1: { color: '#22C55E', token: '$success' },    // Aprobada
  2: { color: '#EF4444', token: '$error' },      // Rechazada
  /* En aprobación: celeste. El token es el color del TEXTO y decía '$text',
     el gris de cualquier texto, así que la palabra se leía apagada al lado de
     las otras. Literal y no `$info` (#3B82F6), que es más azul que celeste. */
  3: { color: '#0EA5E9', token: '#0EA5E9' },     // En aprobación
  4: { color: '#94A3B8', token: '$textMuted' },  // Anulada
}

const NEUTRO = { color: '#94A3B8', token: '$textMuted' }

/** Rutas a las que navega esta pantalla. */
type NavParams = {
  /** El formulario. Sin `id` crea; con `id` edita. */
  nuevaSolicitudCoo: { id?: number } | undefined
  /** Todos sus préstamos, hayan nacido o no de una solicitud del app. */
  historicoPrestamos: undefined
}


/** Una línea de dato dentro de la tarjeta. */
function Dato({
  icono: Icono,
  etiqueta,
  valor,
}: {
  icono: React.ComponentType<any>
  etiqueta: string
  valor: string
}) {
  return (
    <XStack gap="$1.5" alignItems="center" flex={1}>
      <Icono size={12} color="#94A3B8" />
      <YStack flex={1}>
        <Text fontSize={9} color="$textMuted">
          {etiqueta}
        </Text>
        <Text fontSize={12} fontWeight="600" color="$text">
          {valor}
        </Text>
      </YStack>
    </XStack>
  )
}

/**
 * Qué le pasa ahora a la solicitud, según su estado.
 *
 * Es lo que el socio quiere saber al mirar la lista — el estado dice en qué
 * punto está, esto dice qué significa para él. Sin esto, "Pendiente" y
 * "Aprobada" son dos palabras y ninguna explica si tiene que hacer algo.
 *
 * Devuelve null cuando no hay nada que agregar: en una rechazada o anulada,
 * el motivo que ya se muestra arriba dice más que cualquier frase de acá.
 */
const queSigue = (s: ISolicitudCliente): string | null => {
  switch (s.Estado) {
    case 0:
      return 'Todavía no la revisan.'
    case 3:
      return s.AprobacionesMinimas != null
        ? `En aprobación · ${s.AprobacionesMinimas} ${s.AprobacionesMinimas === 1 ? 'firma' : 'firmas'}`
        : 'En aprobación'
    case 1:
      return s.FechaPrimeraCuota
        ? `Aprobada · primera cuota el ${formatFecha(s.FechaPrimeraCuota)}`
        : 'Aprobada'
    default:
      return null
  }
}

function TarjetaSolicitud({
  solicitud,
  onPress,
  resaltada,
}: {
  solicitud: ISolicitudCliente
  onPress: () => void
  /**
   * La trajo una notificación: se marca unos segundos y se apaga.
   *
   * Es para encontrarla en la lista, no un estado de la solicitud — por eso
   * solo cambia el borde y la sombra, y no toca nada de lo que dice.
   */
  resaltada?: boolean
}) {
  const aspecto = ASPECTO[solicitud.Estado ?? -1] ?? NEUTRO

  // La autorizada manda cuando existe: es la que de verdad se va a cobrar. La
  // cotizada es lo que se calculó al pedirla, y pueden no coincidir — por eso
  // la etiqueta también cambia, para no dar por firme un número que no lo es.
  /**
   * La que el socio ELIGIÓ, y nada más.
   *
   * No la autorizada: esa es del préstamo y se ve en el detalle, bajo "Cómo se
   * le otorgó". Acá la tarjeta habla de la SOLICITUD, y mezclarlas hacía que
   * el mismo renglón cambiara de significado según el estado.
   *
   * Tampoco la solicitada —`CuotaSolicitada`—, que es el número que escribió
   * como referencia para que el sistema calculara. La cotizada es la de la
   * tarjeta que terminó tocando: lo que de verdad pidió pagar.
   */
  const cuota = solicitud.CuotaCotizada

  const deducciones = [
    solicitud.Deduccion13vo ? `13.º ${formatMonto(solicitud.Deduccion13vo)}` : null,
    solicitud.Deduccion14vo ? `14.º ${formatMonto(solicitud.Deduccion14vo)}` : null,
  ].filter(Boolean).join(' · ')

  const pie = queSigue(solicitud)

  return (
    <XStack
      borderRadius="$6"
      backgroundColor={resaltada ? '$backgroundSurface' : '$backgroundElevated'}
      borderWidth={resaltada ? 2 : 1}
      borderColor={resaltada ? '$primary' : '$border'}
      overflow="hidden"
      pressStyle={{ opacity: 0.75 }}
      onPress={onPress}
      // Más sombra mientras está señalada: con el borde solo, en una lista de
      // tarjetas iguales, cuesta que el ojo caiga en la correcta.
      {...(resaltada ? shadows.md : shadows.sm)}
    >
      {/* Franja del color del estado. Deja reconocer de un vistazo en qué anda
          cada una sin leer el badge, que es chico y está del otro lado. */}
      <View width={4} backgroundColor={aspecto.color} />

      <YStack flex={1}>
        {/* Encabezado: primero QUÉ pidió y después CUÁNTO. El tipo es lo que
            distingue una solicitud de otra cuando los montos se parecen. */}
        <XStack
          paddingHorizontal="$3"
          paddingVertical="$2.5"
          gap="$2.5"
          alignItems="center"
          backgroundColor="$backgroundSurface"
        >
          <YStack flex={1} gap="$0.5">
            <Text fontSize={16} fontWeight="800" color="$text">
              {formatMonto(solicitud.Monto)}
            </Text>
            <Text fontSize={10} color="$textMuted">
              {formatFecha(solicitud.FechaSolicitud)}
            </Text>
          </YStack>

          {/* El badge y el chevron en una línea y no apilados: apilados
              obligaban al encabezado a ser tan alto como los dos juntos, y
              era la mitad del aire que sobraba en la tarjeta. */}
          <XStack alignItems="center" gap="$1.5">
            <XStack
              paddingHorizontal="$2"
              paddingVertical="$1"
              borderRadius="$10"
              backgroundColor={`${aspecto.color}1F`}
            >
              <Text fontSize={10} fontWeight="700" color={aspecto.token}>
                {/* Si el catálogo no tuviera el estado, al menos se dice cuál es. */}
                {solicitud.EstadoNombre || `Estado ${solicitud.Estado}`}
              </Text>
            </XStack>

            {/* Que se puede tocar. Sin esto la tarjeta se lee como un cartel. */}
            <ChevronRight size={16} color="#94A3B8" />
          </XStack>
        </XStack>

        <YStack paddingHorizontal="$3" paddingVertical="$2.5" gap="$2">
          {!!solicitud.Descripcion && (
            <Text fontSize={12} color="$text" lineHeight={16} numberOfLines={2}>
              {solicitud.Descripcion}
            </Text>
          )}

          <XStack gap="$3">
            <Dato
              icono={Coins}
              /* Siempre la misma etiqueta, esté la solicitud como esté. Antes
                 cambiaba a "Cuota autorizada" al aprobarse, y el renglón
                 pasaba a decir otra cosa sin avisar. */
              etiqueta="Cuota solicitada"
              valor={
                cuota == null
                  ? '-'
                  : `${formatMonto(cuota)} ${CADA_CUANTO[solicitud.TipoPlazo ?? -1] ?? ''}`.trim()
              }
            />
            <Dato
              icono={CalendarDays}
              etiqueta="Cuotas"
              valor={solicitud.PlazoMeses != null ? String(solicitud.PlazoMeses) : '-'}
            />
          </XStack>

          {/* Solo si el tipo las pidió. Son plata que sale del 13.º o del 14.º,
              no del sueldo, y conviene que no se olvide que las comprometió. */}
          {!!deducciones && (
            <XStack gap="$3">
              <Dato icono={Wallet} etiqueta="Deducciones" valor={deducciones} />
            </XStack>
          )}

        {/* Refinanciamiento: cambia lo que significa el monto, así que se dice.
            Sin esto, el socio ve un número mayor al que pidió y no sabe por qué. */}
        {solicitud.EsRefinanciamiento === true && (
          <XStack
            gap="$2"
            alignItems="center"
            paddingHorizontal="$2.5"
            paddingVertical="$2"
            borderRadius="$3"
            backgroundColor="rgba(59, 130, 246, 0.10)"
          >
            <Repeat2 size={13} color="#3B82F6" />
            <Text fontSize={12} color="$text" flex={1} lineHeight={16}>
              Incluye lo que faltaba de tu préstamo anterior
              {solicitud.PrestamoIdRefinanciar != null
                ? ` (#${solicitud.PrestamoIdRefinanciar})`
                : ''}
              .
            </Text>
          </XStack>
        )}

        {/* El motivo del rechazo o de la anulación. Lo resuelve el servidor
            según el estado; acá solo se muestra si vino. Es lo único que le
            dice al socio qué pasó con su solicitud. */}
        {!!solicitud.Motivo && (
          <XStack
            gap="$2"
            alignItems="flex-start"
            paddingHorizontal="$2.5"
            paddingVertical="$2"
            borderRadius="$3"
            backgroundColor={`${aspecto.color}14`}
          >
            <View marginTop={1}>
              <MessageSquare size={13} color={aspecto.color} />
            </View>
            <Text fontSize={12} color="$text" flex={1} lineHeight={17}>
              {solicitud.Motivo}
            </Text>
          </XStack>
        )}
        </YStack>

        {/* Qué le pasa ahora. Va separado y al pie porque no es un dato de la
            solicitud: es lo que el socio tiene que saber hoy sobre ella.

            Separado por una línea y NO por otro fondo gris: con el encabezado
            gris, el cuerpo claro y el pie gris otra vez, la tarjeta se leía
            como tres bloques pegados en vez de una sola cosa. El único fondo
            distinto es el del encabezado. */}
        {!!pie && (
          <XStack
            paddingHorizontal="$3"
            paddingVertical="$2"
            borderTopWidth={1}
            borderTopColor="$border"
          >
            <Text fontSize={10} color="$textMuted" flex={1} lineHeight={14}>
              {pie}
            </Text>
          </XStack>
        )}
      </YStack>
    </XStack>
  )
}

export default function MisSolicitudesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<NavParams>>()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [solicitudes, setSolicitudes] = useState<ISolicitudCliente[]>([])
  const [error, setError] = useState('')

  // La solicitud que le impide pedir otra, si la hay. El servidor la marca con
  // EnTramite usando la misma condición con la que SP_CrearSolicitud rechaza,
  // así que el "+" nunca puede prometer algo que después se rechaza.
  //
  // Acá NO se comparan estados: si mañana la cooperativa agrega uno que
  // tampoco deja pedir, el servidor lo marca y esta pantalla se entera sola.
  const bloqueante = solicitudes.find(s => s.EnTramite)

  /**
   * Ya tiene un préstamo salido de una solicitud.
   *
   * Con un préstamo encima no puede pedir otro: lo que corresponde es
   * refinanciar, y eso se hace desde "Mis préstamos", sobre el préstamo que
   * quiere refinanciar. Por eso acá el botón cambia en vez de desaparecer: si
   * solo se fuera, el socio no tendría a dónde ir.
   *
   * >>> MIRA LAS SOLICITUDES, NO LOS PRÉSTAMOS <<<
   * O sea que un préstamo migrado o cargado en el sistema de escritorio, que
   * nunca pasó por el app, NO lo detecta. Para cubrir eso habría que mirar
   * dbo.Prestamo — que es lo que lista "Mis préstamos".
   */
  const tieneAprobada = solicitudes.some(s => s.Estado === 1)

  const puedePedir = !bloqueante && !tieneAprobada

  const irAMisPrestamos = () => navigation.navigate('historicoPrestamos')

  /**
   * La solicitud que trajo una notificación.
   *
   * Se marca unos segundos y se apaga: sirve para encontrarla en la lista, no
   * es un estado de la solicitud.
   */
  const [resaltada, setResaltada] = useState<number | null>(null)

  /* El apagado vive en una ref y NO en el cleanup del efecto: la lista se
     vuelve a consultar al enfocar, y un cleanup cancelaría el temporizador sin
     que nadie lo vuelva a armar — el resaltado quedaría encendido para
     siempre. */
  const apagadoRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** En cuál ya se arrancó la cuenta. Sin esto cada recarga la reiniciaría. */
  const contandoRef = useRef<number | null>(null)

  useEffect(() => {
    const unsub = subscribeOpenMiSolicitud(({ solicitudId }) => {
      contandoRef.current = null
      setResaltada(solicitudId)

      /* Red de seguridad: si la solicitud nunca aparece en la lista, el
         resaltado no se queda encendido esperando algo que no va a llegar. */
      setTimeout(
        () => setResaltada(actual => (actual === solicitudId ? null : actual)),
        15000,
      )
    })

    return unsub
  }, [])

  useEffect(() => () => {
    if (apagadoRef.current) clearTimeout(apagadoRef.current)
  }, [])

  /**
   * Los segundos empiezan cuando la tarjeta YA ESTÁ en pantalla, no cuando
   * llega el aviso.
   *
   * Viniendo de una notificación la pantalla arranca cargando: si la cuenta
   * empezara con el aviso, una consulta lenta se comería los cinco segundos y
   * la solicitud aparecería ya apagada — justo cuando más falta hacía
   * señalarla.
   */
  useEffect(() => {
    if (resaltada == null || contandoRef.current === resaltada) return
    if (!solicitudes.some(s => s.SolicitudId === resaltada)) return

    contandoRef.current = resaltada

    if (apagadoRef.current) clearTimeout(apagadoRef.current)
    apagadoRef.current = setTimeout(() => setResaltada(null), 5000)
  }, [resaltada, solicitudes])

  const irANuevaSolicitud = () => navigation.navigate('nuevaSolicitudCoo')

  usePageHeader({
    center: (
      <Text fontSize={16} fontWeight="700" color="$text">
        Mis solicitudes
      </Text>
    ),
    right: <NotificationBell />,
  })

  const consultar = useCallback(async () => {
    try {
      const response = await cooperativaService.getSolicitudesCliente()

      if (response?.Success) {
        setSolicitudes(response.Data ?? [])
        setError('')
      } else {
        setSolicitudes([])
        setError(response?.ErrorMessage || 'No se pudieron consultar tus solicitudes.')
      }
    } catch (err) {
      setSolicitudes([])
      setError(handleError(err).message)
    }
  }, [])

  /** Consulta mostrando el esqueleto: al entrar y al reintentar desde el error. */
  const recargar = useCallback(async () => {
    setLoading(true)
    await consultar()
    setLoading(false)
  }, [consultar])

  // useFocusEffect y no useEffect: el navegador mantiene las pantallas
  // montadas, así que un efecto de montaje solo corre la primera vez y al
  // volver — por ejemplo después de pedir una — se vería la lista vieja.
  useFocusEffect(
    useCallback(() => {
      recargar()
    }, [recargar]),
  )

  const onRefresh = async () => {
    setRefreshing(true)
    await consultar()
    setRefreshing(false)
  }

  if (loading) {
    return (
      <YStack flex={1} backgroundColor="$backgroundPage" padding="$4">
        <SkeletonForm />
      </YStack>
    )
  }

  return (
    <ScrollView
      flex={1}
      backgroundColor="$backgroundPage"
      /* flexGrow para que ErrorState y EmptyState, que son flex={1}, queden
         centrados en la pantalla y no pegados arriba. */
      contentContainerStyle={{ flexGrow: 1, padding: 12, paddingBottom: 32, gap: 8 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {error ? (
        <ErrorState message={error} onRetry={recargar} />
      ) : solicitudes.length === 0 ? (
        /* Sin solicitudes NO es un error: es el estado normal de quien recién
           se afilió. Por eso va EmptyState y no ErrorState. */
        /* La acción es pedir, no recargar: sin ninguna solicitud no hay nada
           que traer. Es el mismo "+" del header, puesto donde el socio está
           mirando. */
        <EmptyState
          title="Todavía no tenés solicitudes"
          message="Acá van a aparecer las que pidas, con el estado en que esté cada una."
          actionLabel="Nueva solicitud"
          actionIcon={Plus}
          onAction={irANuevaSolicitud}
        />
      ) : (
        <>
          {/* A la derecha: es una acción, y las acciones viven de ese lado.
              Pegado a la izquierda competía con el título de la pantalla. */}
          <XStack alignItems="center" gap="$2" paddingHorizontal="$1" justifyContent="flex-end">
            {/* El mismo "+ Nueva solicitud" del estado vacío. Tiene que estar
                también acá: ya con una solicitud en la lista, el estado vacío
                no se vuelve a ver nunca y sin esto no habría por dónde pedir
                la siguiente. */}
            {puedePedir ? (
              <Button
                height={36}
                borderRadius="$3"
                paddingHorizontal="$3"
                backgroundColor="$primary"
                pressStyle={{ opacity: 0.85 }}
                onPress={irANuevaSolicitud}
              >
                <XStack alignItems="center" gap="$1.5">
                  <Plus size={16} color="#FFFFFF" />
                  <Text fontSize={13} fontWeight="700" color="white">
                    Nueva solicitud
                  </Text>
                </XStack>
              </Button>
            ) : tieneAprobada ? (
              /* Con un préstamo encima no puede pedir otro, así que en vez de
                 dejar el espacio vacío se lo manda a donde SÍ puede hacer
                 algo: ahí están sus préstamos y, sobre cada uno, la opción de
                 refinanciar.

                 Va delineado y no relleno: no es la acción principal de esta
                 pantalla, es la salida cuando la principal no está. */
              <Button
                height={36}
                borderRadius="$3"
                paddingHorizontal="$3"
                backgroundColor="transparent"
                borderWidth={1.5}
                borderColor="$primary"
                pressStyle={{ opacity: 0.6 }}
                onPress={irAMisPrestamos}
              >
                <XStack alignItems="center" gap="$1.5">
                  <Wallet size={16} color="#FF551A" />
                  <Text fontSize={13} fontWeight="700" color="$primary">
                    Mis préstamos
                  </Text>
                </XStack>
              </Button>
            ) : null}
          </XStack>
          {/* Todas navegan, esté como esté la solicitud. Qué se puede hacer
              allá lo decide el formulario con el estado que él mismo lee: si
              acá se decidiera, serían dos lugares que tienen que opinar lo
              mismo sobre cuándo se puede editar. */}
          {solicitudes.map(s => (
            <TarjetaSolicitud
              key={s.SolicitudId}
              solicitud={s}
              resaltada={resaltada === s.SolicitudId}
              onPress={() => navigation.navigate('nuevaSolicitudCoo', { id: s.SolicitudId })}
            />
          ))}
        </>
      )}
    </ScrollView>
  )
}
