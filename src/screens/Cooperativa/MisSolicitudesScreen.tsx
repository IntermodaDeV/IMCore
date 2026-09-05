import React, { useCallback, useEffect, useState } from 'react'
import { RefreshControl } from 'react-native'
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { YStack, XStack, Text, ScrollView, View, Button } from 'tamagui'
import {
  FilePlus2, CalendarDays, Coins, TriangleAlert, User, PlusCircle,
  Clock, CheckCircle2, XCircle, Tag, Pencil, Users, MessageSquare, Calculator,
  Info, Wallet,
} from 'lucide-react-native'
import { cooperativaService } from '../../api/modules/cooperativa/cooperativa.service'
import {
  ISolicitudCliente,
  ISolicitudPrestamo,
  IPrestamoResumen,
  ESTADO_SOLICITUD_COO,
  ESTADO_SOLICITUD,
} from '../../api/modules/cooperativa/cooperativa.types'
import { ExecutionResponse } from '../../api/modules/response.type'
import { usePageHeader } from '../../hooks/usePageHeader'
import { handleError } from '../../utils/errorHandler'
import SkeletonForm from '../../components/Skeletons/SkeletonForm'
import { shadows } from '../../theme/shadows'
import { NotificationBell } from '../../components/notifications/NotificationBell'

/**
 * Mis solicitudes (ruta 'RequestCoo', menú 1046).
 *
 * El menú se le asigna al socio al aprobarse su afiliación
 * (CooInter_04_MenuAlAprobar.sql).
 *
 * Muestra DOS listas, porque una solicitud vive en dos lugares distintos según
 * en qué punto va:
 *
 *  1. En revisión  -> CooInter.SolicitudesPrestamo, en IMCore. Todavía no
 *                     llegó a Cooperativa. Mientras esté pendiente el socio
 *                     puede editarla con el lápiz.
 *  2. En la cooperativa -> Cooperativa.dbo.Solicitud, vía proxy. Ya fue
 *                     aprobada y existe del otro lado.
 *
 * Se muestran separadas y no en una sola lista mezclada: son cosas distintas.
 * Una todavía se puede cambiar, la otra ya está en firme.
 *
 * Crear va por el botón del header, que navega a NuevaSolicitudScreen — mismo
 * patrón que Gastos de Viaje.
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

function Linea({
  icono: Icono,
  etiqueta,
  valor,
}: {
  icono: React.ComponentType<any>
  etiqueta: string
  valor: string
}) {
  return (
    <XStack gap="$2.5" alignItems="center">
      <Icono size={14} color="#94A3B8" />
      <Text fontSize={13} color="$textMuted" flex={1}>
        {etiqueta}
      </Text>
      <Text fontSize={13} color="$text" fontWeight="600">
        {valor}
      </Text>
    </XStack>
  )
}

/**
 * Rutas a las que navega esta pantalla.
 *
 * El formulario recibe un `id` opcional: sin el crea, con el edita. Se declara
 * en vez de usar `as never` porque ese truco solo funciona para navegar sin
 * parametros.
 */
type NavParams = {
  nuevaSolicitudCoo: { id?: number } | undefined
  /**
   * El plan de cuotas de un préstamo. Desde acá se navega con SolicitudId;
   * el histórico usa la misma pantalla con PrestamoId.
   */
  detallePrestamo: { solicitudId?: number; prestamoId?: number }
  /** El simulador. Sin parámetros: el monto y el plazo se eligen allá. */
  simuladorPrestamo: undefined
  /** Todos sus préstamos, incluidos los que no tienen solicitud. */
  historicoPrestamos: undefined
}

export default function MisSolicitudesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<NavParams>>()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [solicitudes, setSolicitudes] = useState<ISolicitudCliente[]>([])
  // Las que siguen en IMCore esperando aprobación.
  const [enRevision, setEnRevision] = useState<ISolicitudPrestamo[]>([])
  const [error, setError] = useState<string | null>(null)

  /**
   * TODOS sus préstamos, para saber si ya está pagando alguno.
   *
   * No se muestran acá — para eso está el histórico — pero son los únicos que
   * responden bien la pregunta: los préstamos cargados en escritorio o
   * migrados no tienen solicitud, así que mirando solo la lista de arriba se
   * le habilitaría pedir otro teniendo uno abierto.
   *
   * null = no se pudieron consultar. Se distingue de la lista vacía: vacía
   * significa "no tiene ninguno" y sí habilita pedir.
   */
  const [prestamos, setPrestamos] = useState<IPrestamoResumen[] | null>(null)

  // Navegación por notificación: cuál resaltar al llegar.
  const route = useRoute()
  const [resaltada, setResaltada] = useState<number | null>(null)

  usePageHeader({
    center: (
      <Text fontSize={16} fontWeight="700" color="$text">
        Mis solicitudes
      </Text>
    ),
    // La campana en vez del '+': crear ya tiene su propio botón en la
    // pantalla, y el aviso de que una solicitud se aprobó llega por acá.
    right: <NotificationBell size={18} />,
  })

  const consultar = useCallback(async () => {
    // Las de IMCore primero y por separado: son las que el socio acaba de
    // mandar, y si Cooperativa no responde igual tiene que poder verlas.
    //
    // Un fallo acá NO se muestra como error de pantalla: la lista de abajo
    // puede haber cargado bien, y decir "no se pudieron cargar tus
    // solicitudes" sobre una lista que sí está sería mentira.
    try {
      const revision = await cooperativaService.getMisSolicitudesPrestamo()
      setEnRevision(revision?.Success ? revision.Data ?? [] : [])
    } catch {
      setEnRevision([])
    }

    // Los préstamos, solo para saber si ya está pagando alguno. Un fallo acá
    // tampoco es error de pantalla: deja el botón a lo que diga la lista de
    // solicitudes, que es lo que se hacía antes de tener este endpoint.
    try {
      const todos = await cooperativaService.getPrestamosCliente()
      setPrestamos(todos?.Success ? todos.Data ?? [] : null)
    } catch {
      setPrestamos(null)
    }

    try {
      const response: ExecutionResponse<ISolicitudCliente[]> =
        await cooperativaService.getSolicitudesCliente()

      if (response?.Success) {
        setSolicitudes(response.Data ?? [])
        setError(null)
      } else {
        setSolicitudes([])
        setError(response?.ErrorMessage || 'No se pudieron cargar tus solicitudes.')
      }
    } catch (err) {
      const e = handleError(err)
      setSolicitudes([])
      setError(e.message)
    }
  }, [])

  // useFocusEffect y no useEffect: el navegador mantiene las pantallas montadas.
  // Además así la lista se refresca al volver de crear una solicitud.
  useFocusEffect(
    useCallback(() => {
      ;(async () => {
        setLoading(true)
        await consultar()
        setLoading(false)
      })()
    }, [consultar]),
  )

  const onRefresh = async () => {
    setRefreshing(true)
    await consultar()
    setRefreshing(false)
  }

  /**
   * Las de IMCore que todavía hay que mostrar arriba.
   *
   * Sin las aprobadas: en cuanto la cadena termina, la solicitud se registra en
   * Cooperativa y aparece abajo, en "Ya aprobadas". Mostrarla en las dos listas
   * la hacía ver como dos préstamos.
   *
   * Las RECHAZADAS sí se quedan acá aunque también viajen a Cooperativa: esta
   * tarjeta muestra el motivo del rechazo, que es lo único que le dice al socio
   * qué corregir, y la de abajo no lo trae.
   */
  const enRevisionVisibles = enRevision.filter(
    r => r.Status_Code !== ESTADO_SOLICITUD.APROBADO,
  )

  /**
   * Si puede pedir otro préstamo.
   *
   * Dos razones para que no:
   *
   *  1. Ya tiene una esperando resolución — pendiente o en la cadena de
   *     aprobación. Esto lo rechaza también el servidor; el botón se esconde
   *     para que no llegue a intentarlo y se coma un error.
   *
   *  2. Todavía está pagando un préstamo. Esta regla vive SOLO acá: el
   *     servidor no la valida, así que esconder el botón es lo que la aplica.
   */

  // PEND y EAPR nombrados, no "todo lo que no esté rechazado": son los MISMOS
  // dos estados que rechaza el SP al crear, así que la pantalla y el servidor
  // coinciden por construcción y no por casualidad.
  //
  // Se mira la lista COMPLETA y no enRevisionVisibles: esa está filtrada para
  // pintar tarjetas, y usarla ataba esta regla a una decisión de diseño.
  const hayEnProceso = enRevision.some(
    r => r.Status_Code === ESTADO_SOLICITUD.PENDIENTE
      || r.Status_Code === ESTADO_SOLICITUD.EN_APROBACION,
  )

  // La lista de préstamos manda cuando se pudo consultar: es la única que ve
  // TODOS, incluidos los que no nacieron de una solicitud del app — cargados
  // en escritorio o migrados. Mirando solo las solicitudes se le habilitaría
  // pedir otro teniendo uno abierto de esos.
  const hayPrestamoVigente = prestamos != null
    ? prestamos.some(p => !p.Cancelado)
    : solicitudes.some(s => {
      // Sin esa lista, lo que se puede saber desde las solicitudes. Se mira
      // PrestamoCancelado y no "tiene una aprobada": una aprobada hace tres
      // años y ya pagada no debería bloquearlo de por vida.
      if (s.PrestamoId != null) return !s.PrestamoCancelado

      // Sin PrestamoId — el servidor todavía no trae esas columnas, o la
      // solicitud se aprobó antes de que el préstamo se creara — una aprobada
      // cuenta como préstamo vigente. Ante la duda no se deja pedir otro, que
      // es el lado seguro de equivocarse.
      return s.Estado === ESTADO_SOLICITUD_COO.APROBADO
    })

  const puedePedir = !hayEnProceso && !hayPrestamoVigente

  /**
   * Llegó desde una notificación: se resalta la solicitud del aviso.
   *
   * Solo puede enganchar con las de IMCore, que son las que llevan ese Id. Una
   * ya aprobada vive abajo con el Id de Cooperativa, que es otro — ahí no se
   * resalta nada y la pantalla se ve normal.
   */
  useEffect(() => {
    const target = Number((route.params as any)?.solicitud ?? 0)
    if (target <= 0) return

    setResaltada(target)
    navigation.setParams({ solicitud: undefined } as never)

    // Se apaga sola: es para encontrarla, no un estado.
    const t = setTimeout(() => setResaltada(null), 3000)
    return () => clearTimeout(t)
  }, [route.params, navigation])

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
      contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Las acciones, arriba a la derecha. Chicas pero CON NOMBRE: el '+' del
          header no se leía como "crear" para quien no usa mucho el teléfono, y
          esta pantalla es justo para ellos.

          Simular va primero y sin relleno: es el paso previo — averiguar la
          cuota antes de pedir — y con los dos en naranja competían, cuando el
          que cierra la tarea es el de solicitar. */}
      {/* flexWrap: con tres acciones ya no entran en una línea de teléfono.
          Envolviendo, "Solicitar préstamo" baja solo y las dos chicas quedan
          arriba; cuando el de solicitar no está, las dos entran juntas. */}
      <XStack justifyContent="flex-end" gap="$2" flexWrap="wrap">
        <Button
          height={40}
          borderRadius="$3"
          paddingHorizontal="$3"
          backgroundColor="transparent"
          borderWidth={1}
          borderColor="$border"
          pressStyle={{ opacity: 0.7 }}
          onPress={() => navigation.navigate('simuladorPrestamo')}
        >
          <XStack alignItems="center" gap="$2">
            <Calculator size={17} color="#FF551A" />
            <Text fontSize={14} fontWeight="700" color="$primary">
              Simular
            </Text>
          </XStack>
        </Button>

        {/* El histórico. Va siempre, tenga o no solicitudes: los préstamos que
            muestra son en su mayoría los que nunca pasaron por una — cargados
            en escritorio o migrados — así que esta pantalla puede estar vacía
            y el socio tener préstamos igual. */}
        <Button
          height={40}
          borderRadius="$3"
          paddingHorizontal="$3"
          backgroundColor="transparent"
          borderWidth={1}
          borderColor="$border"
          pressStyle={{ opacity: 0.7 }}
          onPress={() => navigation.navigate('historicoPrestamos')}
        >
          <XStack alignItems="center" gap="$2">
            <Wallet size={17} color="#FF551A" />
            <Text fontSize={14} fontWeight="700" color="$primary">
              Mis préstamos
            </Text>
          </XStack>
        </Button>

        {/* Solicitar solo cuando de verdad puede. Simular queda SIEMPRE: sirve
            justo para hacerse una idea del próximo préstamo mientras termina
            de pagar el que tiene. */}
        {puedePedir && (
          <Button
            height={40}
            borderRadius="$3"
            paddingHorizontal="$3"
            backgroundColor="$primary"
            pressStyle={{ opacity: 0.85 }}
            onPress={() => navigation.navigate('nuevaSolicitudCoo')}
          >
            <XStack alignItems="center" gap="$2">
              <PlusCircle size={17} color="#FFFFFF" />
              <Text fontSize={14} fontWeight="700" color="white">
                Solicitar préstamo
              </Text>
            </XStack>
          </Button>
        )}
      </XStack>

      {/* Por qué no está el botón. Un botón que desaparece sin decir nada se
          lee como que la pantalla se rompió, y el socio termina llamando a
          preguntar. */}
      {!puedePedir && (
        <XStack
          gap="$2"
          alignItems="flex-start"
          padding="$3"
          borderRadius="$3"
          backgroundColor="$backgroundSurface"
        >
          <View marginTop={1}>
            <Info size={14} color="#94A3B8" />
          </View>
          <Text fontSize={12} color="$textMuted" flex={1} lineHeight={17}>
            {hayEnProceso
              ? 'Ya tiene una solicitud en trámite. Puede pedir otra cuando esta se resuelva.'
              // Se nombra el botón: el préstamo que lo bloquea puede no estar
              // en esta pantalla — si nunca pasó por una solicitud, solo se ve
              // en el histórico.
              : 'Todavía está pagando un préstamo. Puede verlo en Mis préstamos, y pedir otro cuando termine de cancelarlo.'}
          </Text>
        </XStack>
      )}

      {/* ── En revisión: siguen en IMCore ──────────────────────────────── */}
      {enRevisionVisibles.length > 0 && (
        <>
          {/* Solo el título. La explicación de qué se espera va DENTRO de
              cada tarjeta: ahí puede decir el estado concreto de esa solicitud
              — cuántas firmas faltan — en vez de una frase general para todas. */}


          {enRevisionVisibles.map(r => {
            const pendiente = r.Status_Code === ESTADO_SOLICITUD.PENDIENTE
            const rechazada = r.Status_Code === ESTADO_SOLICITUD.RECHAZADO
            const aprobada = r.Status_Code === ESTADO_SOLICITUD.APROBADO
            const total = r.AprobacionesTotal ?? 0
            const hechas = r.AprobacionesHechas ?? 0
            const faltan = total - hechas

            return (
              <YStack
                key={`rev-${r.Id}`}
                gap="$3"
                padding="$4"
                borderRadius="$4"
                backgroundColor="$backgroundElevated"
                borderWidth={1}
                // Resaltada al llegar desde una notificación. Se apaga sola.
                borderColor={resaltada === r.Id ? '$primary' : '$border'}
                {...shadows.sm}
              >
                <XStack alignItems="flex-start" gap="$2">
                  <YStack flex={1} gap="$1">
                    <Text fontSize={20} fontWeight="700" color="$text">
                      {formatMonto(r.Monto)}
                    </Text>
                    <Text fontSize={13} color="$textMuted">
                      #{r.Id} · {formatFecha(r.Creation_Date)}
                    </Text>
                  </YStack>

                  {/* El estado y, debajo, el avance de la cadena. Alineados a la
                      derecha en la misma columna: los dos dicen "en qué va", y
                      el avance suelto entre los datos del préstamo se leía como
                      un dato más del monto. */}
                  <YStack alignItems="flex-end" gap="$1.5">
                    {/* Tres colores y no dos: la aprobada salía ámbar con
                        reloj, igual que una en trámite. */}
                    <XStack
                      alignItems="center"
                      gap="$1.5"
                      paddingHorizontal="$2.5"
                      paddingVertical="$1"
                      borderRadius="$10"
                      backgroundColor={
                        rechazada
                          ? 'rgba(239, 68, 68, 0.12)'
                          : aprobada
                            ? 'rgba(34, 197, 94, 0.12)'
                            : 'rgba(245, 158, 11, 0.12)'
                      }
                    >
                      {rechazada
                        ? <XCircle size={13} color="#EF4444" />
                        : aprobada
                          ? <CheckCircle2 size={13} color="#22C55E" />
                          : <Clock size={13} color="#f59e0b" />}
                      <Text
                        fontSize={12}
                        fontWeight="600"
                        color={rechazada ? '$error' : aprobada ? '$success' : '$warning'}
                      >
                        {r.Status_Name ?? r.Status_Code ?? '-'}
                      </Text>
                    </XStack>

                    {/* Solo el número: '1/3' con el ícono de gente ya dice que
                        son firmas, y la palabra completa competía con el estado
                        que va justo arriba. */}
                    {total > 0 && (
                      <XStack alignItems="center" gap="$1">
                        <Users size={11} color="#94A3B8" />
                        <Text fontSize={11} fontWeight="600" color="$textMuted">
                          {hechas}/{total}
                        </Text>
                      </XStack>
                    )}
                  </YStack>
                </XStack>

                {!!r.Descripcion && (
                  <Text fontSize={14} color="$text" lineHeight={20}>
                    {r.Descripcion}
                  </Text>
                )}

                <YStack gap="$2" paddingTop="$1" borderTopWidth={1} borderTopColor="$border">
                  {!!r.TipoSolicitudDesc && (
                    <Linea icono={Tag} etiqueta="Tipo" valor={r.TipoSolicitudDesc} />
                  )}
                  {!!r.PlazoDesc && (
                    <Linea icono={CalendarDays} etiqueta="Plazo" valor={r.PlazoDesc} />
                  )}
                  {/* Las deducciones solo si las lleva: un préstamo a secas no
                      descuenta de ningún salario extra, y dos ceros hacen pensar
                      que falta un dato. */}
                  {r.Deduccion13vo > 0 && (
                    <Linea icono={Coins} etiqueta="Del 13.º" valor={formatMonto(r.Deduccion13vo)} />
                  )}
                  {r.Deduccion14vo > 0 && (
                    <Linea icono={Coins} etiqueta="Del 14.º" valor={formatMonto(r.Deduccion14vo)} />
                  )}
                  {!!r.Modification_Date && (
                    <Linea
                      icono={CalendarDays}
                      etiqueta="Editada"
                      valor={formatFecha(r.Modification_Date)}
                    />
                  )}
                </YStack>

                {!rechazada && !aprobada && (
                  <XStack
                    gap="$2"
                    alignItems="flex-start"
                    padding="$2.5"
                    borderRadius="$3"
                    backgroundColor="$backgroundSurface"
                  >
                    <View marginTop={1}>
                      <Clock size={13} color="#f59e0b" />
                    </View>
                    <Text fontSize={12} color="$textMuted" flex={1} lineHeight={17}>
                      {total === 0
                        ? 'Todavía nadie la ha revisado. Te avisamos cuando haya respuesta.'
                        : faltan > 0
                          ? `Falta${faltan === 1 ? '' : 'n'} ${faltan} de ${total} aprobaciones. Te avisamos cuando haya respuesta.`
                          : 'Ya tiene todas las aprobaciones. Te avisamos en cuanto quede registrada.'}
                    </Text>
                  </XStack>
                )}

                {!!r.Rejection_Reason && (
                  <YStack
                    gap="$1.5"
                    padding="$3"
                    borderRadius="$3"
                    backgroundColor="$backgroundSurface"
                    borderWidth={1}
                    borderColor="$border"
                  >
                    <XStack alignItems="center" gap="$1.5">
                      <MessageSquare size={13} color="#94A3B8" />
                      <Text fontSize={11} fontWeight="600" color="$textMuted">
                        Motivo del rechazo
                      </Text>
                    </XStack>
                    <Text fontSize={14} color="$text" lineHeight={19}>
                      {r.Rejection_Reason}
                    </Text>
                  </YStack>
                )}
                {pendiente && (
                  <XStack
                    alignItems="center"
                    justifyContent="center"
                    gap="$2"
                    height={42}
                    borderRadius="$3"
                    borderWidth={1}
                    borderColor="$border"
                    backgroundColor="$backgroundSurface"
                    pressStyle={{ opacity: 0.7 }}
                    onPress={() => navigation.navigate('nuevaSolicitudCoo', { id: r.Id })}
                  >
                    <Pencil size={15} color="#FF551A" />
                    <Text fontSize={14} fontWeight="700" color="$primary">
                      Editar solicitud
                    </Text>
                  </XStack>
                )}
              </YStack>
            )
          })}
        </>
      )}

      {error ? (
        <YStack
          gap="$3"
          padding="$4"
          borderRadius="$4"
          backgroundColor="$backgroundSurface"
          borderWidth={1}
          borderColor="$border"
          alignItems="center"
        >
          <TriangleAlert size={26} color="#94A3B8" />
          <Text fontSize={14} color="$text" textAlign="center" lineHeight={20}>
            {error}
          </Text>
        </YStack>
      ) : solicitudes.length === 0 && enRevisionVisibles.length === 0 ? (
        <YStack gap="$3" padding="$6" alignItems="center">
          <View
            width={72}
            height={72}
            borderRadius={36}
            backgroundColor="$backgroundSurface"
            alignItems="center"
            justifyContent="center"
          >
            <FilePlus2 size={32} color="#94A3B8" />
          </View>
          <Text fontSize={17} fontWeight="700" color="$text" textAlign="center">
            Todavía no tiene solicitudes
          </Text>
          {/* Se nombra el botón en vez de señalar un ícono: "el +" obliga a
              buscarlo, "Pedir un préstamo" se reconoce de una. */}
          <Text fontSize={14} color="$textMuted" textAlign="center" lineHeight={20}>
            Cuando necesite un préstamo o un adelanto, toque{' '}
            <Text fontWeight="700" color="$text">Solicitar préstamo</Text> y llene
            los datos. Nosotros le avisamos cuando se apruebe.
          </Text>
        </YStack>
      ) : (
        solicitudes.map(s => {
          const aprobada = s.Estado === ESTADO_SOLICITUD_COO.APROBADO
          const rechazada = s.Estado === ESTADO_SOLICITUD_COO.RECHAZADO

          // Que exista el préstamo, no que la solicitud esté aprobada: las
          // que se aprobaron antes de que el préstamo se creara con su plan
          // están aprobadas y no tienen nada que mostrar.
          const esPrestamo = s.PrestamoId != null

          return (
            <YStack
              key={s.SolicitudId}
              gap="$3"
              padding="$4"
              borderRadius="$4"
              backgroundColor="$backgroundElevated"
              borderWidth={1}
              borderColor="$border"
              {...shadows.sm}
            >
              {/* El monto es lo que el socio busca de un vistazo */}
              <XStack alignItems="flex-start" gap="$2">
                <YStack flex={1} gap="$1">
                  <Text fontSize={20} fontWeight="700" color="$text">
                    {formatMonto(s.Monto)}
                  </Text>
                  <Text fontSize={13} color="$textMuted">
                    {formatFecha(s.FechaSolicitud)}
                  </Text>
                </YStack>

                <XStack
                  alignItems="center"
                  gap="$1.5"
                  paddingHorizontal="$2.5"
                  paddingVertical="$1"
                  borderRadius="$10"
                  backgroundColor={
                    aprobada
                      ? 'rgba(34, 197, 94, 0.12)'
                      : rechazada
                        ? 'rgba(239, 68, 68, 0.12)'
                        : 'rgba(245, 158, 11, 0.12)'
                  }
                >
                  {aprobada
                    ? <CheckCircle2 size={13} color="#22C55E" />
                    : rechazada
                      ? <XCircle size={13} color="#EF4444" />
                      : <Clock size={13} color="#f59e0b" />}
                  <Text
                    fontSize={12}
                    fontWeight="600"
                    color={aprobada ? '$success' : rechazada ? '$error' : '$warning'}
                  >
                    {s.EstadoNombre ?? String(s.Estado ?? '-')}
                  </Text>
                </XStack>
              </XStack>

              {/* ── EL PRÉSTAMO ────────────────────────────────────────
                  Una vez aprobada, la solicitud ES un préstamo, y lo que pidió
                  hace ocho meses ya no le sirve: lo que necesita saber es
                  cuánto debe hoy y cuándo cae el próximo descuento.

                  Va arriba de los datos del pedido, no abajo, porque es lo
                  presente; lo de abajo es el registro de cómo empezó. */}
              {esPrestamo && (
                <YStack
                  gap="$2.5"
                  padding="$3"
                  borderRadius="$3"
                  backgroundColor="$backgroundSurface"
                  borderWidth={1}
                  borderColor="$border"
                >
                  {s.PrestamoCancelado ? (
                    // Terminó de pagarlo. Es una buena noticia y merece leerse
                    // como tal, no como un saldo en cero.
                    <XStack alignItems="center" gap="$2">
                      <CheckCircle2 size={15} color="#22C55E" />
                      <Text fontSize={14} fontWeight="700" color="$success">
                        Préstamo cancelado
                      </Text>
                    </XStack>
                  ) : (
                    <>
                      <YStack gap="$0.5">
                        <Text fontSize={11} color="$textMuted">Le queda debiendo</Text>
                        <Text fontSize={20} fontWeight="700" color="$text">
                          {formatMonto(s.SaldoPendiente)}
                        </Text>
                      </YStack>

                      <XStack gap="$2.5">
                        <YStack flex={1}>
                          <XStack gap="$1.5" alignItems="center">
                            <CalendarDays size={11} color="#94A3B8" />
                            <Text fontSize={10} color="$textMuted">Próximo pago</Text>
                          </XStack>
                          <Text fontSize={13} color="$text" fontWeight="600" lineHeight={18}>
                            {formatFecha(s.ProximoPago)}
                          </Text>
                        </YStack>

                        <YStack flex={1}>
                          <XStack gap="$1.5" alignItems="center">
                            <Coins size={11} color="#94A3B8" />
                            <Text fontSize={10} color="$textMuted">Cuota</Text>
                          </XStack>
                          <Text fontSize={13} color="$text" fontWeight="600" lineHeight={18}>
                            {formatMonto(s.ProximaCuota)}
                          </Text>
                        </YStack>
                      </XStack>
                    </>
                  )}

                  {/* El avance, en cuotas: es como lo piensa quien paga por
                      planilla. Solo si hay plan — los préstamos viejos no lo
                      tienen y "0 de 0" no dice nada. */}
                  {s.CuotasTotal > 0 && (
                    <YStack gap="$1.5">
                      <XStack alignItems="center" gap="$2">
                        <Text fontSize={11} color="$textMuted" flex={1}>Cuotas pagadas</Text>
                        <Text fontSize={12} fontWeight="700" color="$text">
                          {s.CuotasPagadas} de {s.CuotasTotal}
                        </Text>
                      </XStack>
                      <View height={5} borderRadius={3} backgroundColor="$border" overflow="hidden">
                        <View
                          height={5}
                          borderRadius={3}
                          backgroundColor={s.PrestamoCancelado ? '#22C55E' : '#FF551A'}
                          width={`${Math.round((s.CuotasPagadas / s.CuotasTotal) * 100)}%`}
                        />
                      </View>
                    </YStack>
                  )}
                </YStack>
              )}

              {!!s.Descripcion && (
                <Text fontSize={14} color="$text" lineHeight={20}>
                  {s.Descripcion}
                </Text>
              )}

              <YStack gap="$2" paddingTop="$1" borderTopWidth={1} borderTopColor="$border">
                {!!s.TipoSolicitudDescripcion && (
                  <Linea icono={Tag} etiqueta="Tipo" valor={s.TipoSolicitudDescripcion} />
                )}
                {!!s.PlazoDescripcion && (
                  <Linea icono={CalendarDays} etiqueta="Plazo" valor={s.PlazoDescripcion} />
                )}
                {/* Solo las que lleva. Un préstamo a secas no descuenta de
                    ningún salario extra, y dos ceros hacen pensar que falta un
                    dato o que algo se calculó mal. Mismo criterio que las
                    tarjetas de arriba. */}
                {(s.Deduccion13vo ?? 0) > 0 && (
                  <Linea icono={Coins} etiqueta="Deducción 13.º" valor={formatMonto(s.Deduccion13vo)} />
                )}
                {(s.Deduccion14vo ?? 0) > 0 && (
                  <Linea icono={Coins} etiqueta="Deducción 14.º" valor={formatMonto(s.Deduccion14vo)} />
                )}

                {!!s.FechaGestion && (
                  <Linea icono={CalendarDays} etiqueta="Gestionada" valor={formatFecha(s.FechaGestion)} />
                )}

                {/* Solo uno de los dos viene lleno, según cómo se resolvió */}
                {!!s.UsuarioAprobo && (
                  <Linea icono={User} etiqueta="Aprobó" valor={s.UsuarioAprobo} />
                )}
                {!!s.UsuarioRechazo && (
                  <Linea icono={User} etiqueta="Rechazó" valor={s.UsuarioRechazo} />
                )}
              </YStack>

              {/* El plan de cuotas. Solo en la APROBADA: es la única que tiene
                  préstamo, y por lo tanto cuotas que ver.

                  Responde lo que el socio pregunta cuando le aprueban una:
                  cuánto le van a descontar, cada cuándo y hasta cuándo. */}
              {esPrestamo && (
                <XStack
                  alignItems="center"
                  justifyContent="center"
                  gap="$2"
                  height={42}
                  borderRadius="$3"
                  borderWidth={1}
                  borderColor="$border"
                  backgroundColor="$backgroundSurface"
                  pressStyle={{ opacity: 0.7 }}
                  onPress={() =>
                    navigation.navigate('detallePrestamo', { solicitudId: s.SolicitudId })
                  }
                >
                  <CalendarDays size={15} color="#FF551A" />
                  <Text fontSize={14} fontWeight="700" color="$primary">
                    Ver detalle de cuotas
                  </Text>
                </XStack>
              )}
            </YStack>
          )
        })
      )}
    </ScrollView>
  )
}
