import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshControl } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { YStack, XStack, Text, ScrollView, View } from 'tamagui'
import { ChevronRight } from 'lucide-react-native'
import { cooperativaService } from '../../api/modules/cooperativa/cooperativa.service'
import { ISolicitudPorAprobar } from '../../api/modules/cooperativa/cooperativa.types'
import { usePageHeader } from '../../hooks/usePageHeader'
import { handleError } from '../../utils/errorHandler'
import { subscribeOpenSolicitudAprobacion } from '../../services/cooperativaNavigation'
import SkeletonForm from '../../components/Skeletons/SkeletonForm'
import { shadows } from '../../theme/shadows'
import { NotificationBell } from '../../components/notifications/NotificationBell'
import EmptyState from '../AdmSys/EmptyState'
import ErrorState from '../AdmSys/ErrorState'

/**
 * Solicitudes de préstamo (ruta 'RequestSocio').
 *
 * Lo que el aprobador tiene asignado, en tres pestañas. UNA fuente:
 * CooInter.SP_GetSolicitudesPorAprobador, que devuelve todo junto con un
 * `Grupo` por fila; acá solo se reparte.
 *
 * ── Grupo no es Estado ──────────────────────────────────────────────────────
 * `Grupo` es lo que hizo ÉL con la solicitud. `EstadoNombre` es cómo quedó la
 * solicitud. Son distintas a propósito: puede haberla aprobado y que después
 * otro la rechazara, y mostrarlas como una sola le diría que algo salió como
 * su voto cuando no fue así.
 *
 * ── Esta pantalla todavía no resuelve ───────────────────────────────────────
 * Por ahora solo lista. Aprobar y rechazar es el paso siguiente; cuando se
 * agregue, el botón va sobre las que tienen `MeToca`.
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

/** Cada cuánto le descuentan, según el tipo de plazo de su planilla. */
const CADA_CUANTO: Record<number, string> = {
  0: 'al mes',
  1: 'por quincena',
  2: 'por semana',
}

/**
 * Las tres pestañas.
 *
 * Las claves son los `Grupo` que manda el servidor, resueltos contra el
 * catálogo EstadoAprobacion de la cooperativa. No se traducen acá: si mañana
 * agregan un estado de firma, su grupo no cae en ninguna pestaña y se ve en la
 * primera con su nombre, en vez de desaparecer sin que nadie se entere.
 */
const TABS = [
  { clave: 'Pendiente', titulo: 'Pendientes' },
  { clave: 'Aprobada', titulo: 'Aprobadas' },
  { clave: 'Rechazada', titulo: 'Rechazadas' },
] as const

/**
 * El color del badge del estado de la SOLICITUD.
 *
 * Son los mismos de "Mis solicitudes" y van por el mismo número de estado: una
 * Pendiente tiene que verse igual la mire el socio o la mire el aprobador. Que
 * cambiara de color según la pantalla haría dudar de si es lo mismo.
 *
 * Solo colores, sin ícono. El NOMBRE no está acá: lo manda el servidor
 * resuelto contra el catálogo, así que un estado nuevo aparece con su nombre y
 * el gris neutro de abajo, sin tocar el app.
 */
const COLOR_ESTADO: Record<number, { color: string; token: string }> = {
  0: { color: '#F59E0B', token: '$warning' },    // Pendiente
  1: { color: '#22C55E', token: '$success' },    // Aprobada
  2: { color: '#EF4444', token: '$error' },      // Rechazada
  /* En aprobación: celeste.
     El `token` es el color del TEXTO del badge, y acá decía '$text' — o sea
     el gris oscuro de cualquier texto. El celeste solo se usaba para la
     franja y el fondo, así que la palabra se leía apagada al lado de las
     otras tres, que sí van con su color.

     Va el valor literal y no un token: el tema tiene `$info` (#3B82F6), que
     es más azul que celeste. Los status del tema valen lo mismo en claro y
     en oscuro, así que escribirlo a mano no pierde nada. */
  3: { color: '#0EA5E9', token: '#0EA5E9' },     // En aprobación
  4: { color: '#94A3B8', token: '$textMuted' },  // Anulada
}

const ESTADO_NEUTRO = { color: '#94A3B8', token: '$textMuted' }

/** Rutas a las que navega esta pantalla. */
type NavParams = {
  /** El detalle, para revisarla y resolverla. */
  detalleAprobacion: { solicitudId: number }
}

/**
 * Una solicitud en el listado.
 *
 * Lo mínimo para decidir si vale la pena abrirla: quién, cuánto, cuándo y cómo
 * la paga. Todo lo demás — tipo, descripción, firmas, refinanciamiento — vive
 * en el detalle.
 *
 * Tampoco dice "te toca firmar": la pestaña Pendientes ya es eso. Repetirlo en
 * cada tarjeta ocupa una línea para no agregar nada.
 */
function TarjetaSolicitud({
  solicitud,
  onPress,
  resaltada,
}: {
  solicitud: ISolicitudPorAprobar
  onPress: () => void
  /**
   * La trajo una notificación: se marca unos segundos y se apaga.
   *
   * Es para encontrarla en la lista, no un estado de la solicitud — por eso
   * solo cambia el borde y el fondo, y no toca nada de lo que la tarjeta dice.
   */
  resaltada?: boolean
}) {
  const aspecto = COLOR_ESTADO[solicitud.Estado ?? -1] ?? ESTADO_NEUTRO

  // La autorizada manda cuando existe: es la que de verdad se va a cobrar. La
  // cotizada es lo que se calculó al pedirla, y pueden no coincidir.
  const cuota = solicitud.CuotaAutorizada ?? solicitud.CuotaCotizada ?? solicitud.CuotaSolicitada

  const comoLaPaga = [
    cuota != null ? `${formatMonto(cuota)} ${CADA_CUANTO[solicitud.TipoPlazo ?? -1] ?? ''}`.trim() : null,
    solicitud.Plazo != null ? `${solicitud.Plazo} cuotas` : null,
  ].filter(Boolean).join(' · ')

  return (
    <XStack
      borderRadius="$5"
      backgroundColor={resaltada ? '$backgroundSurface' : '$backgroundElevated'}
      borderWidth={resaltada ? 2 : 1}
      borderColor={resaltada ? '$primary' : '$border'}
      overflow="hidden"
      pressStyle={{ opacity: 0.75 }}
      onPress={onPress}
      // Más sombra mientras está señalada: con el borde solo, en una lista de
      // tarjetas todas iguales, cuesta que el ojo caiga en la correcta.
      {...(resaltada ? shadows.md : shadows.sm)}
    >
      {/* La franja va del color del ESTADO, el mismo del badge.
          Antes iba por el grupo —lo que votó él— y las dos cosas no siempre
          coinciden: una que él aprobó y otro rechazó salía con la franja
          verde y el badge rojo, como si se contradijeran. */}
      <View width={3} backgroundColor={aspecto.color} />

      <XStack flex={1} padding="$3" gap="$2.5" alignItems="flex-start">
        <YStack flex={1} gap="$0.5">
          {/* Primero QUIÉN pide: es lo que el aprobador mira para decidir. */}
          <Text fontSize={12} fontWeight="700" color="$text" numberOfLines={1}>
            {solicitud.SocioNombre || solicitud.SocioCodigo || 'Socio'}
          </Text>

          <Text fontSize={16} fontWeight="800" color="$text">
            {formatMonto(solicitud.Monto)}
          </Text>

          {!!comoLaPaga && (
            <Text fontSize={11} color="$text">
              {comoLaPaga}
            </Text>
          )}

          <Text fontSize={10} color="$textMuted">
            {solicitud.SocioCodigo} · {formatFecha(solicitud.FechaSolicitud)}
          </Text>
        </YStack>

        {/* El estado de la SOLICITUD, que NO es lo que votó él. En las
            resueltas es lo único que distingue "la aprobé y salió" de "la
            aprobé y otro la rechazó". */}
        <YStack alignItems="flex-end" gap="$2">
          <XStack
            paddingHorizontal="$2"
            paddingVertical="$1"
            borderRadius="$10"
            backgroundColor={`${aspecto.color}1F`}
          >
            <Text fontSize={10} fontWeight="700" color={aspecto.token} numberOfLines={1}>
              {solicitud.EstadoNombre || `Estado ${solicitud.Estado}`}
            </Text>
          </XStack>

          {/* Que se puede tocar. Sin esto la tarjeta se lee como un cartel, y
              decirlo con un texto ocuparía una línea para algo que el chevron
              dice solo. */}
          <ChevronRight size={16} color="#94A3B8" />
        </YStack>
      </XStack>
    </XStack>
  )
}

export default function AprobacionPrestamosScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<NavParams>>()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [solicitudes, setSolicitudes] = useState<ISolicitudPorAprobar[]>([])
  const [error, setError] = useState('')
  const [tab, setTab] = useState<string>('Pendiente')

  usePageHeader({
    center: (
      <Text fontSize={16} fontWeight="700" color="$text">
        Solicitudes
      </Text>
    ),
    right: <NotificationBell />,
  })

  const consultar = useCallback(async () => {
    try {
      const response = await cooperativaService.getSolicitudesPorAprobador()

      if (response?.Success) {
        setSolicitudes(response.Data ?? [])
        setError('')
      } else {
        setSolicitudes([])
        setError(response?.ErrorMessage || 'No se pudieron consultar las solicitudes.')
      }
    } catch (err) {
      setSolicitudes([])
      setError(handleError(err).message)
    }
  }, [])

  const recargar = useCallback(async () => {
    setLoading(true)
    await consultar()
    setLoading(false)
  }, [consultar])

  // useFocusEffect y no useEffect: el navegador mantiene las pantallas
  // montadas, así que al volver de resolver una se vería la lista vieja.
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

  /**
   * La solicitud que trajo una notificación.
   *
   * Se marca unos segundos y se apaga: sirve para encontrarla en la lista, no
   * es un estado de la solicitud.
   */
  const [resaltada, setResaltada] = useState<number | null>(null)

  /* El apagado vive en una ref y NO en el cleanup del efecto. La lista se
     vuelve a consultar al enfocar la pantalla, y un cleanup cancelaría el
     temporizador sin que nadie lo vuelva a armar: el resaltado se quedaría
     encendido para siempre. */
  const apagadoRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** En cuál ya se arrancó la cuenta. Sin esto cada recarga la reiniciaría. */
  const contandoRef = useRef<number | null>(null)

  useEffect(() => {
    const unsub = subscribeOpenSolicitudAprobacion(({ solicitudId, tab: destino }) => {
      /* La pestaña viaja en el aviso. "Te toca firmar" apunta a Pendientes;
         "ya no hace falta tu firma" no fuerza ninguna, porque esa solicitud ya
         no está ahí y llevarlo a Pendientes sería mandarlo a buscarla donde no
         está. */
      if (destino) setTab(destino)

      contandoRef.current = null
      setResaltada(solicitudId)

      /* Red de seguridad: si la solicitud nunca aparece —la resolvió otro, o
         quedó en otra pestaña— el resaltado no se queda encendido para
         siempre esperando algo que no va a llegar. */
      setTimeout(
        () => setResaltada(actual => (actual === solicitudId ? null : actual)),
        15000,
      )
    })

    return unsub
  }, [])

  // Si la pantalla se desmonta con el temporizador vivo.
  useEffect(() => () => {
    if (apagadoRef.current) clearTimeout(apagadoRef.current)
  }, [])

  /**
   * Se reparte una sola vez por carga y no en cada render.
   *
   * Un `Grupo` que no sea ninguno de los tres cae en Pendientes: es la pestaña
   * que el aprobador abre, así que un estado nuevo se ve ahí con su nombre en
   * vez de quedar invisible en una lista que nadie mira.
   */
  const porGrupo = useMemo(() => {
    const mapa: Record<string, ISolicitudPorAprobar[]> = {
      Pendiente: [], Aprobada: [], Rechazada: [],
    }

    for (const s of solicitudes) {
      const destino = s.Grupo && mapa[s.Grupo] ? s.Grupo : 'Pendiente'
      mapa[destino].push(s)
    }

    return mapa
  }, [solicitudes])

  const visibles = porGrupo[tab] ?? []

  /**
   * Los segundos del resaltado empiezan cuando la tarjeta YA ESTÁ en pantalla,
   * no cuando llega el aviso.
   *
   * Al venir de una notificación la pantalla arranca cargando: si la cuenta
   * empezara con el aviso, una consulta lenta se comería los cinco segundos y
   * la solicitud aparecería ya apagada — que es justo el caso en el que el
   * usuario más necesitaba que se la señalaran.
   */
  useEffect(() => {
    if (resaltada == null || contandoRef.current === resaltada) return

    // Todavía no llegó a la lista: se reintenta solo cuando ésta cambie.
    if (!visibles.some(s => s.SolicitudId === resaltada)) return

    contandoRef.current = resaltada

    if (apagadoRef.current) clearTimeout(apagadoRef.current)
    apagadoRef.current = setTimeout(() => setResaltada(null), 5000)
  }, [resaltada, visibles])

  if (loading) {
    return (
      <YStack flex={1} backgroundColor="$backgroundPage" padding="$4">
        <SkeletonForm />
      </YStack>
    )
  }

  if (error) {
    return (
      <YStack flex={1} backgroundColor="$backgroundPage">
        <ErrorState message={error} onRetry={recargar} />
      </YStack>
    )
  }

  return (
    <YStack flex={1} backgroundColor="$backgroundPage">
      <ScrollView
        flex={1}
        contentContainerStyle={{ flexGrow: 1, padding: 12, paddingBottom: 32, gap: 10 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Las tres pestañas. Van arriba de todo: eligen qué se está mirando. */}
        <XStack
          gap="$1"
          padding="$1"
          borderRadius="$4"
          backgroundColor="$backgroundSurface"
          borderWidth={1}
          borderColor="$border"
        >
          {TABS.map(t => {
            const activa = tab === t.clave

            return (
              <View
                key={t.clave}
                flex={1}
                paddingVertical="$2.5"
                borderRadius="$3"
                alignItems="center"
                backgroundColor={activa ? '$primary' : 'transparent'}
                pressStyle={{ opacity: 0.7 }}
                onPress={() => setTab(t.clave)}
              >
                <Text
                  fontSize={13}
                  fontWeight={activa ? '700' : '600'}
                  color={activa ? 'white' : '$textMuted'}
                >
                  {t.titulo}
                </Text>
              </View>
            )
          })}
        </XStack>

        {visibles.length === 0 ? (
          <EmptyState
            title={
              tab === 'Pendiente'
                ? 'No tenés solicitudes por revisar'
                : tab === 'Aprobada'
                  ? 'Todavía no aprobaste ninguna'
                  : 'Todavía no rechazaste ninguna'
            }
            message={
              tab === 'Pendiente'
                ? 'Acá van a aparecer las que te asignen para firmar.'
                : 'Acá queda el historial de lo que resolvés.'
            }
            onAction={recargar}
          />
        ) : (
          visibles.map(s => (
            <TarjetaSolicitud
              key={s.SolicitudAprobadorId}
              solicitud={s}
              resaltada={resaltada === s.SolicitudId}
              onPress={() =>
                navigation.navigate('detalleAprobacion', { solicitudId: s.SolicitudId })
              }
            />
          ))
        )}
      </ScrollView>
    </YStack>
  )
}
