import React, { useCallback, useEffect, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView as RNScrollView, Keyboard } from 'react-native'
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native'
import { YStack, XStack, Text, Button, View, Spinner, styled } from 'tamagui'
import {
  Info, ArrowLeft, RefreshCcw, TriangleAlert, Check, Coins, Repeat2, MessageSquare,
  FileText, Wallet, ChevronUp, ChevronDown,
} from 'lucide-react-native'
import AppInput from '../../components/commons/AppInput'
import AppSelect from '../../components/commons/AppSelect'
import { cooperativaService } from '../../api/modules/cooperativa/cooperativa.service'
import {
  ICuotaPlan, ICuotaPrestamo, ILimitesPrestamo, IOpcionCuota, ISolicitudCliente,
  ITipoSolicitud,
} from '../../api/modules/cooperativa/cooperativa.types'
import AccordionSection from '../../components/commons/AccordionSection'
import { shadows } from '../../theme/shadows'
import { usePageHeader } from '../../hooks/usePageHeader'
import { handleError } from '../../utils/errorHandler'
import { useShowToast } from '../../utils/useShowToast'
import SkeletonForm from '../../components/Skeletons/SkeletonForm'

/**
 * Nueva solicitud a la cooperativa.
 *
 * El socio elige el tipo, dice cuánto necesita y CUÁNTO PUEDE PAGAR por
 * período. Con eso el servidor le devuelve tres formas de pagarlo — la cuota
 * mínima, una ajustada a lo que pidió y la máxima — y él elige una.
 *
 * ── El plazo ya no se pide ──────────────────────────────────────────────────
 * Antes había un combo de plazo. Se quitó porque el plazo no es una decisión
 * independiente: sale del monto y de la cuota. Pidiendo los tres por separado
 * el socio podía armar una combinación que no existe, y el servidor se la
 * rechazaba después. Ahora elige la cuota y el plazo viene con ella.
 *
 * ── Qué se calcula acá: nada ────────────────────────────────────────────────
 * Ni la cuota, ni el plazo, ni los intereses. Todo sale de
 * CooInter.SP_GetOpcionesCuotaPorCodigo, que por debajo usa dbo.ResolverCuota
 * — la MISMA función con la que el servidor guarda la solicitud. Lo que el
 * socio ve acá es lo que después se le cobra.
 *
 * El refinanciamiento tampoco se decide acá: si el socio tiene un préstamo de
 * planilla vigente, el servidor lo detecta solo y lo incluye en el cálculo. La
 * pantalla únicamente lo muestra.
 */

// El header cae al botón del drawer cuando no se le pasa `left`. Acá es una
// pantalla hija a la que se llega desde el listado, así que corresponde volver.
const ArrowLeftStyled = styled(ArrowLeft, { color: '$text' })

/** Cada cuánto le descuentan, según el tipo de plazo de su planilla. */
const CADA_CUANTO: Record<number, string> = {
  0: 'al mes',
  1: 'por quincena',
  2: 'por semana',
}

/** Solo dígitos y un punto decimal, para que el monto no llegue con basura. */
const soloDecimal = (v: string): string => {
  const limpio = v.replace(/[^0-9.]/g, '')
  const partes = limpio.split('.')
  return partes.length <= 2 ? limpio : `${partes[0]}.${partes.slice(1).join('')}`
}

/** El texto de un campo numérico como número, o null si no hay nada usable. */
const aNumero = (v: string): number | null => {
  const t = v.trim()
  if (t === '') return null
  const n = Number(t)
  return isNaN(n) ? null : n
}

/** Monto en lempiras. Cooperativa maneja HNL. */
const formatMonto = (valor: number | null | undefined): string => {
  if (valor == null) return '-'
  return `L ${Number(valor).toLocaleString('es-HN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/**
 * Cuánto se espera antes de pedir las opciones.
 *
 * Sin esto cada tecla del monto o de la cuota sería un viaje a la base, y el
 * socio vería las opciones parpadear con números de cifras incompletas
 * mientras todavía está escribiendo.
 */
const ESPERA_MS = 600

/** Una línea "etiqueta ....... valor". */
function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <XStack alignItems="center" gap="$2">
      <Text fontSize={12} color="$textMuted" flex={1}>
        {etiqueta}
      </Text>
      <Text fontSize={13} fontWeight="600" color="$text">
        {valor}
      </Text>
    </XStack>
  )
}

/**
 * El monto para las tarjetas angostas.
 *
 * Lleva moneda y centavos igual que el resto, solo que con tipografía más
 * chica: es plata que la persona va a pagar, y redondearla para ganar ancho
 * sería mostrarle un número que no es el suyo.
 */
const formatCorto = formatMonto

const formatFecha = (valor: string | null): string => {
  if (!valor) return '-'
  const fecha = new Date(valor)
  if (isNaN(fecha.getTime())) return '-'
  return fecha.toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

/**
 * El nombre corto de cada opción.
 *
 * El servidor manda etiquetas largas ("Cuota minima posible") que en una
 * tarjeta de un tercio de pantalla se parten en tres renglones. Acá solo se
 * acorta lo que ya vino: si aparece una clave nueva, cae en su `Etiqueta`
 * original y se ve larga, pero se ve — no desaparece.
 */
const NOMBRE_CORTO: Record<string, string> = {
  minima: 'Mínima',
  personalizada: 'Sugerida',
  maxima: 'Máxima',
}

/**
 * Una de las tres formas de pagar el préstamo, en columna angosta.
 *
 * Van las tres en fila para poder COMPARARLAS: la decisión es entre ellas, y
 * apiladas el socio tenía que recordar el número de arriba mientras miraba el
 * de abajo. Por eso cada una muestra solo lo que cambia — cuota, cuántas y
 * total — y lo común (cada cuánto se paga) está una sola vez, arriba de la
 * fila.
 */
function TarjetaOpcion({
  opcion,
  elegida,
  onElegir,
}: {
  opcion: IOpcionCuota
  elegida: boolean
  onElegir: () => void
}) {
  // El servidor pudo resolver las otras y no esta. Se muestra apagada en vez
  // de esconderla: si desapareciera, el socio no sabría que existió, y el
  // motivo va debajo de la fila, donde sí hay ancho para leerlo.
  const resuelta = opcion.Ok !== false && opcion.Cuota != null

  return (
    <YStack
      flex={1}
      gap="$1.5"
      paddingBottom="$2.5"
      borderRadius="$4"
      overflow="hidden"
      alignItems="center"
      // Mismo fondo esté elegida o no, y SIN sombra.
      //
      // Antes la elegida se teñía con el naranja al 7%. Un color translúcido
      // tan bajo sobre el fondo de la tarjeta no se lee como naranja: se lava
      // y queda gris sucio, justo en la que se supone que resalta. La sombra
      // sumaba otro halo gris alrededor.
      //
      // La selección se marca con lo que no se ensucia: el borde y la cinta
      // del título, los dos en naranja pleno.
      backgroundColor="$backgroundElevated"
      borderWidth={elegida ? 2 : 1}
      borderColor={elegida ? '$primary' : '$border'}
      opacity={resuelta ? 1 : 0.45}
      pressStyle={resuelta ? { opacity: 0.75 } : undefined}
      onPress={resuelta ? onElegir : undefined}
    >
      {/* La cinta del título: naranja pleno con texto blanco en la elegida.
          Es lo que se ve de lejos sin tener que leer los números. */}
      <XStack
        width="100%"
        justifyContent="center"
        alignItems="center"
        gap="$1"
        paddingVertical="$1.5"
        backgroundColor={elegida ? '$primary' : '$backgroundSurface'}
      >
        {elegida && <Check size={11} color="#FFFFFF" />}
        <Text
          fontSize={10}
          fontWeight="800"
          letterSpacing={0.4}
          color={elegida ? 'white' : '$textMuted'}
          numberOfLines={1}
        >
          {(NOMBRE_CORTO[opcion.Clave ?? ''] ?? opcion.Etiqueta ?? '').toUpperCase()}
        </Text>
      </XStack>

      {/* El padding va acá y no en la tarjeta: la cinta del título tiene que
          llegar hasta los bordes. */}
      {!resuelta ? (
        <Text fontSize={11} color="$textMuted" paddingVertical="$2">
          No disponible
        </Text>
      ) : (
        <YStack alignItems="center" gap="$1.5" width="100%" paddingHorizontal="$1.5">
          <Text
            fontSize={13}
            fontWeight="800"
            color="$text"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {formatCorto(opcion.Cuota)}
          </Text>

          <Text fontSize={10} color="$textMuted">
            {opcion.Plazo != null ? `${opcion.Plazo} cuotas` : '-'}
          </Text>

          <YStack
            alignItems="center"
            width="100%"
            paddingTop="$1.5"
            borderTopWidth={1}
            borderTopColor="$border"
          >
            <Text fontSize={9} color="$textMuted">
              total
            </Text>
            <Text
              fontSize={10}
              fontWeight="600"
              color="$text"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {formatCorto(opcion.TotalAPagar)}
            </Text>
          </YStack>
        </YStack>
      )}
    </YStack>
  )
}

/**
 * Parámetros de la ruta.
 *
 * Sin `id` la pantalla crea. Con `id` abre una solicitud que ya existe, y qué
 * se puede hacer con ella lo decide el ESTADO que trae, no quien navegó: así
 * no hay dos lugares opinando sobre cuándo se puede tocar.
 */
type RutaParams = {
  nuevaSolicitudCoo?: { id?: number }
}

/** Una línea "etiqueta → valor" de la vista. */
function Linea({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <XStack alignItems="flex-start" gap="$3" paddingVertical="$2">
      <Text fontSize={12} color="$textMuted" width={130}>
        {etiqueta}
      </Text>
      <Text fontSize={13} fontWeight="600" color="$text" flex={1}>
        {valor}
      </Text>
    </XStack>
  )
}

/**
 * El color del estado de la solicitud.
 *
 * Los mismos de "Mis solicitudes" y del listado del aprobador: una Pendiente
 * tiene que verse igual en las tres pantallas. Acá solo se usa para teñir el
 * ícono de la cabecera de cada tarjeta.
 */
const COLOR_ESTADO: Record<number, { color: string }> = {
  0: { color: '#F59E0B' },  // Pendiente
  1: { color: '#22C55E' },  // Aprobada
  2: { color: '#EF4444' },  // Rechazada
  3: { color: '#0EA5E9' },  // En aprobación
  4: { color: '#94A3B8' },  // Anulada
}

/**
 * Una tarjeta con encabezado, igual que en el detalle del aprobador.
 *
 * El título va DENTRO, sobre una franja de otro fondo, y no suelto encima: así
 * cada bloque se lee como una pieza y no como una lista de datos con una
 * etiqueta flotando arriba.
 *
 * Un solo fondo distinto —el del encabezado— para no caer en la banda
 * gris/claro/gris, que hace ver la tarjeta como tres cosas pegadas.
 */
function Tarjeta({
  titulo,
  icono: Icono,
  color = '#94A3B8',
  destacada,
  children,
}: {
  titulo: string
  icono: React.ComponentType<any>
  color?: string
  /**
   * La tarjeta principal de la pantalla.
   *
   * El borde y el encabezado toman el color, en vez del gris de siempre. Es la
   * única diferencia: lo que el socio vino a ver tiene que saltar, pero sin
   * cambiar de forma — si además fuera más ancha o con otro radio se leería
   * como otro tipo de cosa.
   */
  destacada?: boolean
  children: React.ReactNode
}) {
  return (
    <YStack
      borderRadius="$5"
      backgroundColor="$backgroundElevated"
      borderWidth={destacada ? 1.5 : 1}
      borderColor={destacada ? `${color}66` : '$border'}
      overflow="hidden"
      {...(destacada ? shadows.md : shadows.sm)}
    >
      <XStack
        alignItems="center"
        gap="$2"
        paddingHorizontal="$3.5"
        paddingVertical="$2.5"
        backgroundColor={destacada ? `${color}1A` : '$backgroundSurface'}
        borderBottomWidth={1}
        borderBottomColor={destacada ? `${color}33` : '$border'}
      >
        <Icono size={14} color={color} />
        <Text fontSize={11} fontWeight="800" color="$text" letterSpacing={0.3} flex={1}>
          {titulo.toUpperCase()}
        </Text>
      </XStack>

      <YStack paddingHorizontal="$3.5" paddingVertical="$1.5">
        {children}
      </YStack>
    </YStack>
  )
}

/**
 * Un plegable de una línea, para lo que va DENTRO de una tarjeta.
 *
 * AccordionSection no sirve ahí: es una tarjeta entera —fondo propio, borde y
 * un chevron en un círculo— y metida adentro de otra se lee como una caja
 * dentro de una caja. Esto ocupa lo que mide una línea de texto.
 */
function Plegable({
  titulo,
  onOpenChange,
  children,
}: {
  titulo: string
  /** Para cargar el contenido recién al abrir, no antes. */
  onOpenChange?: (abierto: boolean) => void
  children: React.ReactNode
}) {
  const [abierto, setAbierto] = useState(false)

  return (
    <YStack paddingTop="$2" borderTopWidth={1} borderTopColor="$border">
      <XStack
        alignItems="center"
        gap="$1.5"
        paddingVertical="$1"
        pressStyle={{ opacity: 0.6 }}
        onPress={() => {
          const siguiente = !abierto
          setAbierto(siguiente)
          onOpenChange?.(siguiente)
        }}
      >
        <Text fontSize={11} fontWeight="700" color="$primary" flex={1}>
          {titulo}
        </Text>
        {abierto
          ? <ChevronUp size={14} color="#94A3B8" />
          : <ChevronDown size={14} color="#94A3B8" />}
      </XStack>

      {abierto && <YStack paddingTop="$1">{children}</YStack>}
    </YStack>
  )
}

/**
 * Una solicitud que ya existe, de solo lectura.
 *
 * Es una pantalla aparte y no el formulario con los campos apagados. Un
 * formulario deshabilitado sigue pareciendo un formulario: el socio intenta
 * tocar, no pasa nada y no sabe por qué. Y además acá hay cosas que el
 * formulario no tiene — quién la resolvió, el motivo, la cuota autorizada —
 * que son justamente las que se viene a mirar.
 */
function DetalleSolicitud({ solicitud }: { solicitud: ISolicitudCliente }) {
  const cadaCuanto = CADA_CUANTO[solicitud.TipoPlazo ?? -1] ?? ''

  // El plan de pagos, al abrir el acordeón y no antes.
  const [abierto, setAbierto] = useState(false)
  const [plan, setPlan] = useState<ICuotaPlan[]>([])
  const [cargandoPlan, setCargandoPlan] = useState(false)
  const [errorPlan, setErrorPlan] = useState('')

  /**
   * El préstamo que salió de esta solicitud, si ya se otorgó.
   *
   * >>> LO QUE PIDIÓ Y LO QUE LE DIERON SON DOS COSAS <<<
   * El aprobador puede bajar el monto o mover la cuota. La solicitud guarda lo
   * que el socio pidió y no cambia nunca; lo que de verdad se le otorgó vive
   * en el préstamo, con su propio monto, plazo, tasa y fecha.
   *
   * Cada fila del detalle trae repetido el encabezado del préstamo, así que
   * con la primera alcanza para las condiciones y con la primera y la última
   * para saber cuándo empieza y cuándo termina de pagar.
   */
  const [prestamo, setPrestamo] = useState<ICuotaPrestamo[]>([])
  const [cargandoPrestamo, setCargandoPrestamo] = useState(false)

  /**
   * Por qué no se pudo traer el préstamo.
   *
   * >>> NO SE PUEDE CALLAR <<<
   * Antes el catch de abajo estaba vacío y dejaba la lista en cero. Eso hacía
   * que un fallo de red, un endpoint caído o un préstamo que nunca se creó se
   * vieran todos exactamente igual: la tarjeta no aparecía y no había nada que
   * mirar. Un detalle que falta sin decir por qué es peor que un error.
   */
  const [errorPrestamo, setErrorPrestamo] = useState('')

  const otorgado = solicitud.Estado === 1

  useEffect(() => {
    if (!otorgado) {
      setPrestamo([])
      setErrorPrestamo('')
      return
    }

    let cancelado = false
    ;(async () => {
      setCargandoPrestamo(true)
      try {
        const response = await cooperativaService.getPrestamoDetalle(solicitud.SolicitudId)
        if (cancelado) return

        if (response?.Success) {
          setPrestamo(response.Data ?? [])
          setErrorPrestamo('')
        } else {
          setPrestamo([])
          setErrorPrestamo(response?.ErrorMessage || 'No se pudo leer el préstamo.')
        }
      } catch (err) {
        if (cancelado) return
        setPrestamo([])
        setErrorPrestamo(handleError(err).message)
      } finally {
        if (!cancelado) setCargandoPrestamo(false)
      }
    })()

    return () => { cancelado = true }
  }, [otorgado, solicitud.SolicitudId])

  const condiciones = prestamo.length > 0 ? prestamo[0] : null
  const ultimaCuota = prestamo.length > 0 ? prestamo[prestamo.length - 1] : null

  /* Cuántas lleva pagadas. Sale de SaldoCuota en cero, que es como el resto
     del sistema distingue una cuota viva de una pagada — Estado no sirve
     para eso. */
  const pagadas = prestamo.filter(c => c.Pagada).length

  useEffect(() => {
    if (!abierto) return

    let cancelado = false
    ;(async () => {
      setCargandoPlan(true)
      try {
        const response = await cooperativaService.getPlanCuotasSolicitud(solicitud.SolicitudId)
        if (cancelado) return

        if (response?.Success) {
          setPlan(response.Data ?? [])
          setErrorPlan('')
        } else {
          setPlan([])
          setErrorPlan(response?.ErrorMessage || 'No se pudo calcular el plan de pagos.')
        }
      } catch (err) {
        if (cancelado) return
        setPlan([])
        setErrorPlan(handleError(err).message)
      } finally {
        if (!cancelado) setCargandoPlan(false)
      }
    })()

    return () => { cancelado = true }
  }, [abierto, solicitud.SolicitudId])

  /**
   * La cuota que el socio ELIGIÓ al pedir el préstamo.
   *
   * CuotaCotizada, no CuotaSolicitada: la solicitada es el número que escribió
   * como referencia para que el sistema calculara, y la cotizada es la de la
   * tarjeta que terminó tocando — o sea lo que de verdad pidió pagar. Mostrar
   * la otra le atribuiría una decisión que no tomó.
   *
   * Sin respaldo a la de referencia a propósito: si no hay cotizada, la línea
   * no sale. Caer en la solicitada seria mostrar el numero equivocado con la
   * etiqueta correcta, que es peor que no mostrar nada.
   */
  const cuotaElegida = solicitud.CuotaCotizada

  const quien = solicitud.UsuarioAprobo || solicitud.UsuarioRechazo || solicitud.UsuarioAnulo

  /* El color del estado, el mismo de Mis solicitudes: una Pendiente se ve
     igual la mire donde la mire. Solo tiñe el ícono de la cabecera. */
  const aspecto = COLOR_ESTADO[solicitud.Estado ?? -1] ?? { color: '#94A3B8' }

  return (
    <YStack gap="$3">

      {/* Refinanciamiento: cambia lo que significa el monto de arriba. */}
      {solicitud.EsRefinanciamiento === true && (
        <XStack
          gap="$2"
          alignItems="center"
          padding="$3"
          borderRadius="$3"
          backgroundColor="rgba(59, 130, 246, 0.10)"
        >
          <Repeat2 size={14} color="#3B82F6" />
          <Text fontSize={12} color="$text" flex={1} lineHeight={17}>
            Incluye lo que faltaba de tu préstamo anterior.
          </Text>
        </XStack>
      )}

      {/* El motivo del rechazo o de la anulación: es lo único que le dice qué
          pasó con su solicitud, así que va arriba del detalle. */}
      {!!solicitud.Motivo && (
        <XStack
          gap="$2"
          alignItems="flex-start"
          padding="$3"
          borderRadius="$3"
          backgroundColor="rgba(239, 68, 68, 0.10)"
        >
          <View marginTop={1}>
            <MessageSquare size={14} color="#EF4444" />
          </View>
          <Text fontSize={12} color="$text" flex={1} lineHeight={17}>
            {solicitud.Motivo}
          </Text>
        </XStack>
      )}

      {/* Lo que pidió. Mismo bloque con cabecera que usa el aprobador, para
          que las dos pantallas del mismo préstamo se lean igual. */}
      <Tarjeta titulo="Lo que solicitó" icono={FileText} color={aspecto.color}>
        {/* El monto y el estado vivían en la tarjeta grande de arriba, que se
            quitó. Bajan acá como una línea más: son datos de la solicitud
            igual que la fecha, y no necesitaban un bloque propio. */}
        <Linea etiqueta="Monto" valor={formatMonto(solicitud.Monto)} />

        {!!solicitud.TipoSolicitud && (
          <Linea etiqueta="Tipo" valor={solicitud.TipoSolicitud} />
        )}

        <Linea etiqueta="Fecha" valor={formatFecha(solicitud.FechaSolicitud)} />

        {!!solicitud.Descripcion && (
          <Linea etiqueta="Descripción" valor={solicitud.Descripcion} />
        )}

        {/* Solo la que ELIGIÓ. Antes salían las tres —de referencia,
            seleccionada y autorizada— y para el socio eran tres números
            parecidos sin saber cuál es el suyo. La de referencia fue un paso
            del cálculo y la autorizada ya vive abajo, en lo que se le otorgó. */}
        {cuotaElegida != null && (
          <Linea etiqueta="Cuota" valor={`${formatMonto(cuotaElegida)} ${cadaCuanto}`.trim()} />
        )}

        {solicitud.PlazoMeses != null && (
          <Linea etiqueta="Cuotas" valor={String(solicitud.PlazoMeses)} />
        )}

        {!!solicitud.Deduccion13vo && (
          <Linea etiqueta="Deducción 13.º" valor={formatMonto(solicitud.Deduccion13vo)} />
        )}
        {!!solicitud.Deduccion14vo && (
          <Linea etiqueta="Deducción 14.º" valor={formatMonto(solicitud.Deduccion14vo)} />
        )}

        {/* La primera cuota se quitó de acá: es un dato del préstamo, no de lo
            que el socio pidió, y abajo sale junto con la última. */}

        {solicitud.Estado === 3 && solicitud.AprobacionesMinimas != null && (
          <Linea etiqueta="Firmas" valor={String(solicitud.AprobacionesMinimas)} />
        )}

        {/* La simulación va DENTRO de lo que pidió, que es de lo que habla, y
            como plegable de una línea en vez de otra tarjeta.

            Y solo mientras no haya préstamo: después el plan de verdad está
            abajo. Dos planes del mismo préstamo lo dejarían adivinando cuál
            vale. */}
        {!condiciones && solicitud.PlazoMeses != null && solicitud.PlazoMeses > 0 && (
          <Plegable
            titulo={`Simular las ${solicitud.PlazoMeses} cuotas`}
            onOpenChange={setAbierto}
          >
            {cargandoPlan ? (
              <XStack alignItems="center" gap="$2" paddingVertical="$3">
                <Spinner size="small" color="$primary" />
                <Text fontSize={11} color="$textMuted">
                  Calculando el plan...
                </Text>
              </XStack>
            ) : errorPlan ? (
              <Text fontSize={11} color="$textMuted" paddingVertical="$2" lineHeight={16}>
                {errorPlan}
              </Text>
            ) : (
              <YStack paddingBottom="$2">
                <XStack paddingBottom="$1.5">
                  <Text fontSize={9} color="$textMuted" width={24}>#</Text>
                  <Text fontSize={9} color="$textMuted" flex={1}>Fecha</Text>
                  <Text fontSize={9} color="$textMuted" width={72} textAlign="right">Cuota</Text>
                  <Text fontSize={9} color="$textMuted" width={78} textAlign="right">Saldo</Text>
                </XStack>

                <RNScrollView
                  style={{ maxHeight: 240 }}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                >
                  {plan.map(c => (
                    <XStack
                      key={c.NumeroCuota}
                      paddingVertical="$1"
                      borderTopWidth={1}
                      borderTopColor="$border"
                    >
                      <Text fontSize={10} color="$textMuted" width={24}>{c.NumeroCuota}</Text>
                      <Text fontSize={10} color="$text" flex={1}>{formatFecha(c.FechaPago)}</Text>
                      <Text fontSize={10} fontWeight="600" color="$text" width={72} textAlign="right">
                        {formatMonto(c.Cuota)}
                      </Text>
                      <Text fontSize={10} color="$textMuted" width={78} textAlign="right">
                        {formatMonto(c.SaldoAnterior)}
                      </Text>
                    </XStack>
                  ))}
                </RNScrollView>

                <Text fontSize={9} color="$textMuted" paddingTop="$2" lineHeight={13}>
                  Estimado: se recalcula con la tasa de hoy y las fechas se
                  proyectan. Al aprobarse quedan las definitivas.
                </Text>
              </YStack>
            )}
          </Plegable>
        )}
      </Tarjeta>

      {/* ── Cómo se lo otorgaron ────────────────────────────────────────
          Todo lo de arriba es lo que PIDIÓ. Esto es lo que le dieron, que
          puede no ser lo mismo: el aprobador puede bajar el monto o mover la
          cuota, y el socio tiene derecho a ver las dos cosas y la diferencia
          entre ellas.

          Sale del préstamo, no de la solicitud: la solicitud guarda lo suyo y
          no se pisa nunca. */}
      {/* La tarjeta sale SIEMPRE que la solicitud esté aprobada, tenga o no
          préstamo cargado. Si solo apareciera con datos, un fallo se vería
          igual que si no hubiera pasado nada — que es justo lo que costó
          diagnosticar. */}
      {otorgado && (
        <Tarjeta titulo="Cómo se le otorgó" icono={Wallet} color="#22C55E" destacada>
          {/* Tres estados posibles y cada uno se dice con todas las letras. */}
          {cargandoPrestamo ? (
            <XStack alignItems="center" gap="$2" paddingVertical="$3">
              <Spinner size="small" color="$primary" />
              <Text fontSize={12} color="$textMuted">
                Cargando el préstamo...
              </Text>
            </XStack>
          ) : errorPrestamo ? (
            <Text fontSize={12} color="$textMuted" paddingVertical="$3" lineHeight={17}>
              {errorPrestamo}
            </Text>
          ) : !condiciones ? (
            <Text fontSize={12} color="$textMuted" paddingVertical="$3" lineHeight={17}>
              La solicitud está aprobada, pero el préstamo todavía no aparece
              cargado en la cooperativa.
            </Text>
          ) : (
          <YStack>
            {/* El monto y la cuota, grandes y juntos arriba: son las dos
                cifras que el socio viene a buscar. Como una línea más se
                perdían entre las fechas.

                >>> LA CUOTA NO ES condiciones.Cuota <<<
                dbo.Prestamo.Cuota es un INT y vale lo mismo que Plazo: la
                CANTIDAD de cuotas, no el monto de cada una. El monto vive en
                dbo.PrestamoDetalle.TotalCuota, que trae cada fila del plan.
                Se toma la primera porque son niveladas; la última puede
                variar unos centavos por el redondeo, y esa se ve abajo. */}
            <XStack gap="$3" paddingVertical="$2.5">
              <YStack flex={1} gap="$0.5">
                <Text fontSize={10} color="$textMuted">
                  Monto otorgado
                </Text>
                <Text fontSize={20} fontWeight="800" color="$text">
                  {formatMonto(condiciones.Monto)}
                </Text>
              </YStack>

              <YStack flex={1} gap="$0.5">
                <Text fontSize={10} color="$textMuted">
                  Cuota {cadaCuanto}
                </Text>
                <Text fontSize={20} fontWeight="800" color="$text">
                  {formatMonto(condiciones.TotalCuota)}
                </Text>
              </YStack>
            </XStack>

            <Linea etiqueta="Cuotas" valor={String(condiciones.Plazo)} />

            <Linea etiqueta="Fecha del préstamo" valor={formatFecha(condiciones.FechaPrestamo)} />
            <Linea etiqueta="Primera cuota" valor={formatFecha(condiciones.FechaCuota)} />

            {!!ultimaCuota && (
              <Linea etiqueta="Última cuota" valor={formatFecha(ultimaCuota.FechaCuota)} />
            )}

            {/* Solo cuando NO coincide con lo que pidió. Si le dieron lo que
                pedía, decirlo sería ruido. */}
            {solicitud.Monto != null && condiciones.Monto !== solicitud.Monto && (
              <Text fontSize={11} color="$textMuted" paddingVertical="$2" lineHeight={16}>
                Solicitó {formatMonto(solicitud.Monto)} y se le aprobaron{' '}
                {formatMonto(condiciones.Monto)}.
              </Text>
            )}

            {/* ── Las cuotas DE VERDAD ───────────────────────────────
                Estas salen de dbo.PrestamoDetalle: son las que la
                cooperativa le va a cobrar, no una proyección. Por eso
                además dicen cuáles ya pagó, cosa que una simulación no
                puede saber.

                Es también la razón por la que arriba se esconde "Simular"
                cuando el préstamo existe: dos planes para el mismo
                préstamo, uno real y otro recalculado, no pueden estar los
                dos en la misma pantalla. */}
            <Plegable
              titulo={`Ver las ${prestamo.length} cuotas · ${pagadas} pagada${pagadas === 1 ? '' : 's'}`}
            >
              <YStack paddingBottom="$2">
                <XStack paddingBottom="$1.5">
                  <Text fontSize={9} color="$textMuted" width={24}>#</Text>
                  <Text fontSize={9} color="$textMuted" flex={1}>Fecha</Text>
                  <Text fontSize={9} color="$textMuted" width={72} textAlign="right">Cuota</Text>
                  <Text fontSize={9} color="$textMuted" width={78} textAlign="right">Saldo</Text>
                </XStack>

                <RNScrollView
                  style={{ maxHeight: 240 }}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                >
                  {prestamo.map(c => (
                    <XStack
                      key={c.NumeroCuota}
                      paddingVertical="$1.5"
                      borderBottomWidth={1}
                      borderBottomColor="$border"
                      alignItems="center"
                      // Las pagadas se apagan: lo que importa es lo que
                      // falta, y verlas iguales obliga a ir contando.
                      opacity={c.Pagada ? 0.45 : 1}
                    >
                      <Text fontSize={11} color="$textMuted" width={24}>
                        {c.NumeroCuota}
                      </Text>
                      <XStack flex={1} alignItems="center" gap="$1.5">
                        <Text fontSize={11} color="$text">
                          {formatFecha(c.FechaCuota)}
                        </Text>
                        {c.Pagada && <Check size={11} color="#22C55E" />}
                      </XStack>
                      <Text fontSize={11} fontWeight="600" color="$text" width={72} textAlign="right">
                        {formatMonto(c.TotalCuota)}
                      </Text>
                      <Text fontSize={11} color="$textMuted" width={78} textAlign="right">
                        {formatMonto(c.SaldoActual)}
                      </Text>
                    </XStack>
                  ))}
                </RNScrollView>
              </YStack>
            </Plegable>
          </YStack>
          )}

          {/* TODAVÍA NO NAVEGA. Está para fijar el lugar; a dónde lleva es el
              paso siguiente. */}
          <YStack paddingVertical="$2.5">
            <Button
              height={40}
              borderRadius={10}
              backgroundColor="transparent"
              borderWidth={1.5}
              borderColor="$primary"
              pressStyle={{ opacity: 0.6 }}
            >
              <Text color="$primary" fontWeight="700" fontSize={13}>
                Ver préstamo
              </Text>
            </Button>
          </YStack>
        </Tarjeta>
      )}
    </YStack>
  )
}

export default function NuevaSolicitudScreen() {
  const navigation = useNavigation()
  const route = useRoute<RouteProp<RutaParams, 'nuevaSolicitudCoo'>>()

  // Con id se viene a MIRAR una solicitud que ya existe; sin id, a crear una.
  const verId = route.params?.id ?? null
  const { showToast } = useShowToast()

  const [tipos, setTipos] = useState<ITipoSolicitud[]>([])
  const [limites, setLimites] = useState<ILimitesPrestamo | null>(null)
  const [solicitud, setSolicitud] = useState<ISolicitudCliente | null>(null)
  const [cargando, setCargando] = useState(true)
  const [enviando, setEnviando] = useState(false)

  const [tipoId, setTipoId] = useState<number | null>(null)
  const [monto, setMonto] = useState('')
  const [cuota, setCuota] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [ded13, setDed13] = useState('')
  const [ded14, setDed14] = useState('')
  const [errores, setErrores] = useState<Record<string, string>>({})

  const [opciones, setOpciones] = useState<IOpcionCuota[]>([])
  const [calculando, setCalculando] = useState(false)
  const [errorOpciones, setErrorOpciones] = useState('')
  const [claveElegida, setClaveElegida] = useState<string | null>(null)

  // El simulador: el plan de pagos de la opción elegida. Se carga al abrir el
  // acordeón y no antes — es una consulta más y la mayoría no la va a abrir.
  const [simularAbierto, setSimularAbierto] = useState(false)
  const [plan, setPlan] = useState<ICuotaPlan[]>([])
  const [cargandoPlan, setCargandoPlan] = useState(false)
  const [errorPlan, setErrorPlan] = useState('')

  usePageHeader({
    left: (
      <View onPress={() => navigation.goBack()} pressStyle={{ opacity: 0.6 }} hitSlop={8}>
        <ArrowLeftStyled size={22} />
      </View>
    ),
    center: (
      <Text fontSize={16} fontWeight="700" color="$text">
        {verId != null ? 'Mi solicitud' : 'Nueva solicitud'}
        {/* El título no distingue entre ver y editar: hasta que no cargue no
            se sabe cuál de las dos es, y cambiarlo después parpadearía. */}
      </Text>
    ),
  })

  const cargarTipos = useCallback(async () => {
    setCargando(true)
    try {
      // Se abrió una que ya existe. Sale de la MISMA consulta que alimenta el
      // listado — no hay un SP de "una sola" y no vale la pena pedirlo: son
      // pocas filas y así lo que se ve acá no puede contradecir a lo de allá.
      let abierta: ISolicitudCliente | null = null

      if (verId != null) {
        const lista = await cooperativaService.getSolicitudesCliente()
        abierta = (lista?.Data ?? []).find(s => s.SolicitudId === verId) ?? null

        setSolicitud(abierta)

        if (!abierta) {
          showToast('error', 'Error', 'No se encontró esa solicitud.', 5000, 'top')
        }

        // Una solicitud que ya existe SOLO SE MIRA. No hacen falta tipos ni
        // límites, que son para armar una nueva.
        return

        /* ── EDICIÓN, APAGADA ──────────────────────────────────────────────
           Una vez creada, la solicitud queda como está.

           El servidor SÍ la soporta: CooInter.SP_CrearSolicitud edita cuando
           le llega un @SolicitudId positivo, con sus propias validaciones
           (que esté Pendiente, que sea del socio, que nadie haya firmado). Lo
           único apagado es esta pantalla.

           Para volver a habilitarla: quitar el `return` de arriba, descomentar
           esto, y en el `if (verId != null)` del render dejar pasar de largo a
           las que están en Estado 0 para que caigan en el formulario.

        if (abierta.Estado !== 0) return

        // La cuota de referencia es la SOLICITADA y no la cotizada: es lo que
        // el socio escribió, y con ella las opciones se vuelven a armar igual
        // que la primera vez.
        setTipoId(abierta.TipoSolicitudId ?? null)
        setMonto(abierta.Monto != null ? String(abierta.Monto) : '')
        setCuota(abierta.CuotaSolicitada != null ? String(abierta.CuotaSolicitada) : '')
        setDescripcion(abierta.Descripcion ?? '')
        setDed13(abierta.Deduccion13vo ? String(abierta.Deduccion13vo) : '')
        setDed14(abierta.Deduccion14vo ? String(abierta.Deduccion14vo) : '')
        ────────────────────────────────────────────────────────────────── */
      }

      // Solo los tipos. getCatalogosSolicitud trae además los plazos, que esta
      // pantalla ya no usa: el plazo sale del monto y de la cuota. Mientras
      // venían juntos, que faltara el SP de plazos tumbaba también los tipos y
      // el formulario no cargaba por un dato que ni siquiera iba a mostrar.
      //
      // Los límites van en paralelo y en su propio catch: son una ayuda para
      // avisar temprano, no un requisito. Si fallan, el formulario sirve igual
      // y es el servidor el que dirá que el monto no tiene tramo.
      const [response, lim] = await Promise.all([
        cooperativaService.getTiposSolicitud(),
        cooperativaService.getLimitesPrestamo().catch(() => null),
      ])

      setLimites(lim?.Success ? lim.Data ?? null : null)

      if (response?.Success) {
        setTipos(response.Data ?? [])
      } else {
        setTipos([])
        showToast(
          'error',
          'Error',
          response?.ErrorMessage || 'No se pudieron cargar los tipos de solicitud',
          5000,
          'top',
        )
      }
    } catch (err) {
      setTipos([])
      showToast('error', 'Error', handleError(err).message, 5000, 'top')
    } finally {
      setCargando(false)
    }
    // showToast cambia de identidad en cada render: incluirlo recargaría el
    // catálogo en bucle.
  }, [verId])

  useFocusEffect(
    useCallback(() => {
      cargarTipos()
    }, [cargarTipos]),
  )

  const montoNum = aNumero(monto)
  const cuotaNum = aNumero(cuota)

  /**
   * El monto se pasó de lo que la cooperativa tiene configurado.
   *
   * Se avisa ACÁ, mientras escribe, y diciendo el número: el servidor contesta
   * "no hay un tramo de credito configurado para un monto de 250,000.00", que
   * es cierto pero deja al socio adivinando a la baja cuánto sí puede pedir.
   *
   * Es una ayuda temprana, no la última palabra. Los tramos pueden tener
   * huecos, así que un monto dentro del mínimo y el máximo igual puede no
   * tener tramo — y además el techo se compara contra el monto TOTAL, que en
   * un refinanciamiento incluye lo que arrastra el préstamo vigente. Esos dos
   * casos los sigue resolviendo el servidor con su propio mensaje.
   */
  const errorMonto = (() => {
    if (montoNum == null || montoNum <= 0) return ''
    if (!limites || limites.Tramos === 0) return ''

    if (limites.MontoMaximo != null && montoNum > limites.MontoMaximo) {
      return `No podés solicitar más de ${formatMonto(limites.MontoMaximo)}.`
    }
    if (limites.MontoMinimo != null && montoNum < limites.MontoMinimo) {
      return `El préstamo mínimo es de ${formatMonto(limites.MontoMinimo)}.`
    }
    return ''
  })()

  /**
   * Las opciones se vuelven a pedir cuando cambia el monto o la cuota.
   *
   * El temporizador se reinicia con cada tecla, así que solo sale la consulta
   * cuando el socio deja de escribir. El `cancelado` evita que una respuesta
   * vieja — pedida con un monto anterior y que llegó tarde — pise a la buena.
   */
  const ultimaConsulta = useRef(0)

  useEffect(() => {
    // Hacen falta LAS DOS cosas.
    //
    // Sin cuota de referencia el servidor devuelve igual la mínima y la
    // máxima, pero son los dos extremos del tramo: no responden a nada que el
    // socio haya dicho, y aparecer apenas escribe el monto hace que elija
    // entre dos números que todavía no le preguntaron cuánto puede pagar.
    //
    // Con el monto fuera de los tramos tampoco: ya se sabe que va a contestar
    // que no hay tramo, y el mensaje del campo de arriba — que dice el límite
    // — explica mejor que el suyo.
    if (montoNum == null || montoNum <= 0 || cuotaNum == null || cuotaNum <= 0 || errorMonto) {
      setOpciones([])
      setErrorOpciones('')
      setClaveElegida(null)
      return
    }

    let cancelado = false
    const id = setTimeout(async () => {
      const miTurno = ++ultimaConsulta.current
      setCalculando(true)

      try {
        // Editando, va el Id: así la solicitud que se está cambiando no se
        // cuenta a sí misma como "ya tiene una pendiente".
        const response = await cooperativaService.getOpcionesCuota(
          montoNum, cuotaNum, solicitud?.SolicitudId,
        )

        if (cancelado || miTurno !== ultimaConsulta.current) return

        if (response?.Success) {
          const lista = response.Data ?? []
          setOpciones(lista)
          setErrorOpciones('')

          // La sugerida manda SIEMPRE que exista: es la que se armó con la
          // cuota que el socio escribió, o sea la respuesta a lo que preguntó.
          //
          // No se respeta lo que hubiera elegido antes. Al entrar todavía no
          // hay cuota escrita, así que no viene sugerida y queda marcada la
          // mínima; si después se conservara esa elección, escribir la cuota
          // no cambiaría nada y la sugerida aparecería sin marcar.
          //
          // Solo cuando no hay sugerida — porque dejó la cuota vacía — se
          // mantiene lo que ya tenía elegido, y si no, la primera que sirva.
          setClaveElegida(prev => {
            const sugerida = lista.find(o => o.Clave === 'personalizada' && o.Ok !== false)
            if (sugerida) return sugerida.Clave ?? null

            // La sugerida vino pero NO se pudo resolver: la cuota que escribió
            // queda fuera de lo que se puede pagar. Acá no se elige nada por
            // él — si se marcara la mínima sola, el aviso le estaría pidiendo
            // que decida algo que ya quedó decidido a sus espaldas, y podría
            // mandar la solicitud sin enterarse de que no es la cuota que
            // pidió.
            if (lista.some(o => o.Clave === 'personalizada')) return null

            if (prev && lista.some(o => o.Clave === prev && o.Ok !== false)) return prev
            return lista.find(o => o.Ok !== false)?.Clave ?? null
          })
        } else {
          setOpciones([])
          setClaveElegida(null)
          setErrorOpciones(response?.ErrorMessage || 'No se pudieron calcular las cuotas.')
        }
      } catch (err) {
        if (cancelado || miTurno !== ultimaConsulta.current) return
        setOpciones([])
        setClaveElegida(null)
        setErrorOpciones(handleError(err).message)
      } finally {
        if (!cancelado) setCalculando(false)
      }
    }, ESPERA_MS)

    return () => {
      cancelado = true
      clearTimeout(id)
    }
  }, [montoNum, cuotaNum, errorMonto, solicitud?.SolicitudId])

  const elegidaActual = opciones.find(o => o.Clave === claveElegida) ?? null

  /**
   * El plan de pagos de la opción elegida.
   *
   * Los argumentos salen de la OPCIÓN, no de lo que el socio escribió: el
   * monto total ya lleva lo que arrastra un refinanciamiento, y el plazo y la
   * tasa son los que el servidor resolvió. Con esos mismos números el plan lo
   * calcula la misma función que sacó el total de la tarjeta, así que las dos
   * cifras cuadran. Mandando el monto escrito, no cuadrarían y no habría forma
   * de explicar la diferencia.
   */
  const planMonto = elegidaActual?.MontoTotal ?? null
  const planTasa = elegidaActual?.Tasa ?? null
  const planPlazo = elegidaActual?.Plazo ?? null
  const planTipoPlazo = elegidaActual?.TipoPlazo ?? null

  useEffect(() => {
    if (!simularAbierto || planMonto == null || planTasa == null
        || planPlazo == null || planTipoPlazo == null) {
      setPlan([])
      return
    }

    let cancelado = false
    ;(async () => {
      setCargandoPlan(true)
      try {
        const response = await cooperativaService.getPlanCuotas(
          planMonto, planTasa, planPlazo, planTipoPlazo,
        )
        if (cancelado) return

        if (response?.Success) {
          setPlan(response.Data ?? [])
          setErrorPlan('')
        } else {
          setPlan([])
          setErrorPlan(response?.ErrorMessage || 'No se pudo calcular el plan de pagos.')
        }
      } catch (err) {
        if (cancelado) return
        setPlan([])
        setErrorPlan(handleError(err).message)
      } finally {
        if (!cancelado) setCargandoPlan(false)
      }
    })()

    return () => { cancelado = true }
  }, [simularAbierto, planMonto, planTasa, planPlazo, planTipoPlazo])

  const tipo = tipos.find(t => t.TipoSolicitudId === tipoId) ?? null

  // Qué deducciones pide el tipo elegido. NO se decide acá: viene del servidor,
  // resuelto con la misma condición con la que rechaza la creación. La tabla
  // que había antes en esta pantalla iba por TipoSolicitudId, que es por
  // empresa, y acertaba solo en la empresa 1.
  const aplicaTrece = tipo?.RequiereDeduccion13vo === true
  const aplicaCatorce = tipo?.RequiereDeduccion14vo === true

  // La misma de arriba, con el nombre que usa el resto de la pantalla.
  const elegida = elegidaActual

  // Lo que el servidor devuelve igual, aunque el socio no lo haya pedido: ya
  // tiene un préstamo de planilla vivo y este lo absorbe.
  const refi = opciones.find(o => o.EsRefinanciamiento === true) ?? null

  // Por qué NO va a poder crear la solicitud. Viene con las opciones, para que
  // se entere antes de llenar todo y no al mandar.
  const bloqueo = opciones.find(o => !!o.Bloqueo)?.Bloqueo ?? null

  /**
   * La cuota que escribió no sirve para ese monto: muy baja o muy alta.
   *
   * El servidor manda la opción igual, con Ok = 0 y el motivo. Se destaca en
   * vez de dejarla como una tarjeta apagada: ahí es donde el socio tiene que
   * hacer algo — corregir el número o conformarse con un extremo — y una
   * tarjeta gris con "No disponible" no se lo pide.
   */
  const sugeridaFallida = opciones.find(o => o.Clave === 'personalizada' && o.Ok === false) ?? null

  /** Los extremos sí se pudieron calcular, así que hay entre qué elegir. */
  const hayExtremos = opciones.some(o => o.Clave !== 'personalizada' && o.Ok !== false)

  const opcionesTipo = tipos.map(t => ({
    label: t.Descripcion ?? `Tipo ${t.TipoSolicitudId}`,
    value: String(t.TipoSolicitudId),
  }))

  const validar = (): boolean => {
    const e: Record<string, string> = {}

    if (!tipoId) e.tipo = 'Elegí el tipo de solicitud'

    // El monto no bloquea el botón, pero sí es obligatorio para el servidor:
    // sin él no hay nada que calcular ni que prestar. Se avisa acá y no después
    // del viaje de ida y vuelta.
    if (montoNum == null || montoNum <= 0) {
      e.monto = 'Escribí cuánto necesitás'
    } else if (errorMonto) {
      e.monto = errorMonto
    }

    if (cuotaNum != null && cuotaNum <= 0) {
      e.cuota = 'La cuota tiene que ser mayor que cero'
    }

    // Es lo único de la solicitud que dice PARA QUÉ, y quien aprueba decide
    // con eso: un monto y una cuota solos no distinguen una emergencia médica
    // de un antojo. El servidor la acepta vacía, así que la exigencia vive
    // únicamente acá.
    if (!descripcion.trim()) {
      e.descripcion = 'Contá para qué necesitás el préstamo'
    }

    // Las deducciones que el tipo exige: el servidor rechaza la solicitud si
    // llegan en cero.
    if (aplicaTrece && (aNumero(ded13) ?? 0) <= 0) {
      e.ded13 = 'Este tipo necesita la deducción del 13.º'
    }
    if (aplicaCatorce && (aNumero(ded14) ?? 0) <= 0) {
      e.ded14 = 'Este tipo necesita la deducción del 14.º'
    }

    if (!elegida) {
      e.opcion = 'Elegí con qué cuota querés pagarlo'
    }

    setErrores(e)
    return Object.keys(e).length === 0
  }

  const enviar = async () => {
    Keyboard.dismiss()
    if (!validar()) return

    setEnviando(true)
    try {
      const response = await cooperativaService.crearSolicitud({
        // Con Id edita, sin Id crea. Lo decide el mismo SP, así que acá no hay
        // dos caminos que mantener parejos.
        SolicitudId: solicitud?.SolicitudId,
        TipoSolicitudId: tipoId!,
        Monto: montoNum!,
        CuotaSolicitada: cuotaNum ?? elegida?.Cuota ?? 0,
        // La cuota de la tarjeta que tocó. El servidor la vuelve a resolver con
        // la misma función, así que esto es lo que elige entre mínima, sugerida
        // y máxima — no un número que se le imponga.
        CuotaElegida: elegida?.Cuota ?? undefined,
        Descripcion: descripcion.trim() || undefined,
        Deduccion13vo: aplicaTrece ? aNumero(ded13) ?? 0 : undefined,
        Deduccion14vo: aplicaCatorce ? aNumero(ded14) ?? 0 : undefined,
      })

      if (!response?.Success) {
        showToast(
          'error',
          'Error',
          response?.ErrorMessage || 'No se pudo crear la solicitud',
          5000,
          'top',
        )
        return
      }

      // El aviso manda sobre el mensaje de éxito: se creó igual, pero dice algo
      // que el socio necesita saber — por ejemplo que su cuota quedó fuera del
      // rango del tramo. Si se mostrara solo "Solicitud creada", eso se pierde.
      const aviso = response.Data?.Aviso
      showToast(
        'success',
        solicitud ? 'Solicitud actualizada' : 'Solicitud enviada',
        aviso || response.SuccessMessage || '',
        aviso ? 7000 : 4000,
        'top',
      )
      // Vuelve al listado, que recarga solo al tomar el foco (useFocusEffect).
      navigation.goBack()
    } catch (err) {
      showToast('error', 'Error', handleError(err).message, 5000, 'top')
    } finally {
      setEnviando(false)
    }
  }

  if (cargando) {
    return (
      <YStack flex={1} backgroundColor="$backgroundPage" padding="$4">
        <SkeletonForm />
      </YStack>
    )
  }

  // Una solicitud que ya existe: solo se mira, esté como esté.
  //
  // Con la edición habilitada, acá iría `&& solicitud?.Estado !== 0` para que
  // las Pendientes sigan de largo al formulario.
  if (verId != null) {
    return (
      <YStack flex={1} backgroundColor="$backgroundPage">
        <RNScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
          {solicitud ? (
            <DetalleSolicitud solicitud={solicitud} />
          ) : (
            <Text fontSize={13} color="$textMuted" textAlign="center" paddingVertical="$6">
              No se encontró esa solicitud.
            </Text>
          )}
        </RNScrollView>
      </YStack>
    )
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <YStack style={{ flex: 1 }} backgroundColor="$backgroundPage">
        <RNScrollView
          style={{ flex: 1 }}
          /* Sin reservar espacio para los botones: ya no están acá dentro. */
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <YStack gap="$2.5">

            {/* El socio no pidió refinanciar: el servidor vio que tiene un
                préstamo vivo y lo metió en el cálculo. Va arriba porque cambia
                lo que significan los números de abajo — el total que va a
                deber no es lo que escribió en "Monto". */}
            {!!refi && (
              <YStack
                gap="$2.5"
                padding="$3.5"
                borderRadius="$4"
                backgroundColor="$backgroundElevated"
                borderWidth={1}
                borderColor="$primary"
                {...shadows.sm}
              >
                <XStack alignItems="center" gap="$2">
                  <RefreshCcw size={15} color="#FF551A" />
                  <Text fontSize={13} fontWeight="800" color="$primary" flex={1}>
                    REFINANCIAMIENTO
                  </Text>
                </XStack>

                <Text fontSize={12} color="$textMuted" lineHeight={18}>
                  Tenés un préstamo vigente. Se cancela y se abre uno nuevo con
                  lo que todavía debés más lo que pidas.
                </Text>

                <YStack gap="$1.5" paddingTop="$2" borderTopWidth={1} borderTopColor="$border">
                  <Dato etiqueta="Se traslada" valor={formatMonto(refi.SaldoAnterior)} />
                  <Dato etiqueta="Lo que pedís" valor={formatMonto(refi.MontoSolicitado)} />
                  <XStack alignItems="center" gap="$2">
                    <Text fontSize={13} fontWeight="700" color="$text" flex={1}>
                      Préstamo nuevo
                    </Text>
                    <Text fontSize={16} fontWeight="800" color="$primary">
                      {formatMonto(refi.MontoTotal)}
                    </Text>
                  </XStack>
                </YStack>
              </YStack>
            )}

            {/* No puede crear la solicitud y el servidor dice por qué. Se
                muestra igual todo lo de abajo: ver las cuotas no hace daño y
                sirve para cuando se destrabe. */}
            {!!bloqueo && (
              <XStack
                gap="$2"
                alignItems="flex-start"
                padding="$3"
                borderRadius="$3"
                backgroundColor="rgba(245, 158, 11, 0.10)"
              >
                <View marginTop={1}>
                  <TriangleAlert size={14} color="#F59E0B" />
                </View>
                <Text fontSize={12} color="$text" flex={1} lineHeight={17}>
                  {bloqueo}
                </Text>
              </XStack>
            )}

            <AppSelect
              label="Tipo de solicitud"
              value={tipoId ?? undefined}
              onValueChange={v => {
                const nuevo = Number(v)
                setTipoId(nuevo)
                setErrores(p => ({ ...p, tipo: '' }))

                // El campo se oculta, pero el valor escrito seguiría en el
                // estado y se mandaría igual. Se limpia lo que deja de aplicar.
                const t = tipos.find(x => x.TipoSolicitudId === nuevo)
                if (!t?.RequiereDeduccion13vo) setDed13('')
                if (!t?.RequiereDeduccion14vo) setDed14('')
              }}
              options={opcionesTipo}
              error={errores.tipo}
            />

            {/* El error del límite se muestra mientras escribe, sin esperar a
                que toque Enviar: es lo que le dice cuánto bajar. */}
            <AppInput
              label="Monto"
              value={monto}
              onChangeText={(v: string) => {
                setMonto(soloDecimal(v))
                setErrores(p => ({ ...p, monto: '' }))
              }}
              keyboardType="decimal-pad"
              placeholder="0.00"
              error={errorMonto || errores.monto}
            />

            {/* "De referencia" y no "solicitada": este número NO es el que se
                va a cobrar. Es el punto de partida con el que el servidor
                arma las tres opciones, y la que se cobra es la de la tarjeta
                que el socio elija abajo — que casi nunca es idéntica, porque
                tiene que caer en un plazo entero.

                Tampoco lleva "(opcional)" aunque el servidor lo acepte vacío:
                así se lee como un paso que se saltea, y es justamente el que
                le acerca la cuota a lo que puede pagar. */}
            <AppInput
              label="Cuota de referencia"
              value={cuota}
              onChangeText={(v: string) => {
                setCuota(soloDecimal(v))
                setErrores(p => ({ ...p, cuota: '' }))
              }}
              keyboardType="decimal-pad"
              placeholder="Cuánto podés pagar por período"
              error={errores.cuota}
            />

            {/* ── Las opciones ────────────────────────────────────────────── */}

            {calculando && (
              <XStack alignItems="center" gap="$2" paddingVertical="$2">
                <Spinner size="small" color="$primary" />
                <Text fontSize={12} color="$textMuted">
                  Calculando tus cuotas...
                </Text>
              </XStack>
            )}

            {!calculando && !!errorOpciones && (
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
                  {errorOpciones}
                </Text>
              </XStack>
            )}

            {!calculando && opciones.length > 0 && (
              <YStack gap="$2">
                <XStack alignItems="center" gap="$2">
                  <Coins size={14} color="#94A3B8" />
                  <Text fontSize={13} fontWeight="700" color="$text" flex={1}>
                    Selecciona la cuota
                  </Text>
                  {/* Cada cuánto se paga, una sola vez: es igual en las tres y
                      repetirlo en cada tarjeta se come el ancho que necesita
                      el número. */}
                  <Text fontSize={11} color="$textMuted">
                    L · {CADA_CUANTO[opciones[0]?.TipoPlazo ?? -1] ?? ''}
                  </Text>
                </XStack>

                {/* La cuota que escribió no da para ese monto. Va ARRIBA de
                    las tarjetas y destacado: es acá donde tiene que hacer
                    algo, y una tarjeta gris con "No disponible" no se lo pide.

                    El qué pasó lo dice el servidor — distingue entre quedar
                    fuera del rango y no alcanzar a cubrir el interés, que son
                    dos problemas distintos. El qué hacer lo agrega la pantalla,
                    y solo si de verdad hay entre qué elegir. */}
                {!!sugeridaFallida && (
                  <XStack
                    gap="$2"
                    alignItems="flex-start"
                    padding="$3"
                    borderRadius="$3"
                    backgroundColor="rgba(245, 158, 11, 0.10)"
                  >
                    <View marginTop={1}>
                      <TriangleAlert size={14} color="#F59E0B" />
                    </View>
                    <YStack flex={1} gap="$1">
                      <Text fontSize={12} color="$text" lineHeight={17}>
                        {sugeridaFallida.MensajeOpcion
                          || 'Esa cuota no sirve para el monto que pediste.'}
                      </Text>
                      {hayExtremos && (
                        <Text fontSize={12} color="$textMuted" lineHeight={17}>
                          Escribí otra cuota dentro de ese rango, o elegí acá
                          abajo la mínima o la máxima.
                        </Text>
                      )}
                    </YStack>
                  </XStack>
                )}

                <XStack gap="$2" alignItems="stretch">
                  {opciones.map(o => (
                    <TarjetaOpcion
                      key={o.Clave ?? ''}
                      opcion={o}
                      elegida={o.Clave === claveElegida}
                      onElegir={() => {
                        setClaveElegida(o.Clave ?? null)
                        setErrores(p => ({ ...p, opcion: '' }))
                      }}
                    />
                  ))}
                </XStack>

                {/* El tramo informativo deja pasar una cuota fuera de rango.
                    Esto NO es detalle de la opción: es el servidor avisando
                    que la cuota que escribió se salió del rango, y es lo único
                    que se lo dice antes de mandar la solicitud. */}
                {!!elegida?.Aviso && (
                  <Text fontSize={11} color="$textMuted" lineHeight={16}>
                    {elegida.Aviso}
                  </Text>
                )}

                {/* Por qué alguna quedó apagada. En la tarjeta solo cabe "No
                    disponible", y sin el motivo el socio no sabe qué cambiar.

                    La sugerida queda fuera: su motivo ya está arriba, con el
                    aviso. Repetirlo haría pensar que son dos problemas. */}
                {opciones
                  .filter(o => o.Clave !== 'personalizada' && o.Ok === false && !!o.MensajeOpcion)
                  .map(o => (
                    <Text key={`msg-${o.Clave}`} fontSize={11} color="$textMuted" lineHeight={16}>
                      {NOMBRE_CORTO[o.Clave ?? ''] ?? o.Etiqueta}: {o.MensajeOpcion}
                    </Text>
                  ))}

                {!!errores.opcion && (
                  <Text fontSize={12} color="$error">
                    {errores.opcion}
                  </Text>
                )}
              </YStack>
            )}

            {/* Obligatoria. Es lo único de la solicitud que dice PARA QUÉ, y
                quien aprueba decide con eso: un monto y una cuota solos no
                distinguen una emergencia médica de un antojo.

                La exigencia vive solo acá: el servidor la sigue aceptando
                vacía, así que las solicitudes viejas sin descripción se
                muestran igual. */}
            <AppInput
              label="Descripción"
              value={descripcion}
              onChangeText={(v: string) => {
                setDescripcion(v)
                setErrores(p => ({ ...p, descripcion: '' }))
              }}
              multiline
              minLines={3}
              placeholder="Para qué necesitás el préstamo"
              style={{ height: 100 }}
              error={errores.descripcion}
            />

            {/* Las deducciones dependen del tipo: un adelanto del 13.º no tiene
                nada que descontar del 14.º. Con "Prestamo" a secas no sale
                ninguna y el bloque entero desaparece. */}
            {(aplicaTrece || aplicaCatorce) && (
              <XStack gap="$3">
                {aplicaTrece && (
                  <View flex={1}>
                    <AppInput
                      label="Deducción 13.º"
                      value={ded13}
                      onChangeText={(v: string) => {
                        setDed13(soloDecimal(v))
                        setErrores(p => ({ ...p, ded13: '' }))
                      }}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      error={errores.ded13}
                    />
                  </View>
                )}
                {aplicaCatorce && (
                  <View flex={1}>
                    <AppInput
                      label="Deducción 14.º"
                      value={ded14}
                      onChangeText={(v: string) => {
                        setDed14(soloDecimal(v))
                        setErrores(p => ({ ...p, ded14: '' }))
                      }}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      error={errores.ded14}
                    />
                  </View>
                )}
              </XStack>
            )}

            {/* El plan de pagos de la opción elegida, al final: es para mirar,
                no para llenar, y arriba cortaba el formulario en dos.

                Va como acordeón cerrado y se consulta recién al abrirlo. */}
            {!!elegida && (
              <AccordionSection
                title="Simular"
                subtitle={
                  elegida.Plazo != null
                    ? `${elegida.Plazo} cuotas de ${formatMonto(elegida.Cuota)}`
                    : undefined
                }
                onOpenChange={setSimularAbierto}
                /* Sin margen propio: el gap del formulario ya separa, y los
                   dos juntos dejaban un hueco contra la descripción. */
                marginTop="$0"
              >
                {cargandoPlan ? (
                  <XStack alignItems="center" gap="$2" padding="$3">
                    <Spinner size="small" color="$primary" />
                    <Text fontSize={12} color="$textMuted">
                      Calculando el plan...
                    </Text>
                  </XStack>
                ) : errorPlan ? (
                  <Text fontSize={12} color="$textMuted" padding="$3" lineHeight={17}>
                    {errorPlan}
                  </Text>
                ) : (
                  <YStack paddingHorizontal="$3" paddingBottom="$3">
                    <XStack
                      paddingVertical="$2"
                      borderBottomWidth={1}
                      borderBottomColor="$border"
                    >
                      <Text fontSize={10} color="$textMuted" width={24}>#</Text>
                      <Text fontSize={10} color="$textMuted" flex={1}>Fecha</Text>
                      <Text fontSize={10} color="$textMuted" width={72} textAlign="right">
                        Cuota
                      </Text>
                      <Text fontSize={10} color="$textMuted" width={78} textAlign="right">
                        Saldo
                      </Text>
                    </XStack>

                    {/* Scroll propio: un plan semanal puede pasar de 50
                        cuotas y, sin esto, el acordeón abierto deja el
                        resto del formulario a varias pantallas de
                        distancia.

                        nestedScrollEnabled es lo que hace que en Android
                        funcione dentro del scroll de la pantalla; sin eso
                        el de afuera se queda con el gesto y este no se
                        mueve. */}
                    <RNScrollView
                      style={{ maxHeight: 260 }}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator
                    >
                      {plan.map(c => (
                        <XStack
                          key={c.NumeroCuota}
                          paddingVertical="$1.5"
                          borderBottomWidth={1}
                          borderBottomColor="$border"
                        >
                          <Text fontSize={11} color="$textMuted" width={24}>
                            {c.NumeroCuota}
                          </Text>
                          <Text fontSize={11} color="$text" flex={1}>
                            {formatFecha(c.FechaPago)}
                          </Text>
                          <Text
                            fontSize={11}
                            fontWeight="600"
                            color="$text"
                            width={72}
                            textAlign="right"
                          >
                            {formatMonto(c.Cuota)}
                          </Text>
                          <Text fontSize={11} color="$textMuted" width={78} textAlign="right">
                            {formatMonto(c.MontoPrestamo)}
                          </Text>
                        </XStack>
                      ))}
                    </RNScrollView>

                    {/* La última cuota absorbe el residuo de todos los
                        redondeos, así que casi nunca es igual a las demás.
                        Sin esto parece un error de cuentas. */}
                    {plan.length > 1 && (
                      <Text fontSize={10} color="$textMuted" paddingTop="$2" lineHeight={15}>
                        La última cuota ajusta los centavos de todo el plan,
                        por eso no es igual a las otras.
                      </Text>
                    )}

                    {/* Cuando el calendario de planilla no cubre el plazo,
                        la función estima las fechas. Decirlo evita que el
                        socio tome como firme un día que puede moverse. */}
                    {plan.some(c => c.OrigenFecha === 'Aritmetica') && (
                      <Text fontSize={10} color="$textMuted" paddingTop="$1" lineHeight={15}>
                        Las fechas son estimadas: todavía no hay calendario
                        de planilla para todo el plazo.
                      </Text>
                    )}
                  </YStack>
                )}
              </AccordionSection>
            )}
          </YStack>
        </RNScrollView>

        {/* Los botones, fijos al pie y FUERA del scroll.
            El formulario creció — opciones, deducciones, el plan — y con los
            botones al final había que recorrer todo para mandar algo que ya
            estaba completo.

            Suben con el teclado solos: el KeyboardAvoidingView de arriba
            encoge esta columna, y como el pie es hermano del scroll y no está
            dentro, queda pegado al borde de lo que quedó visible. */}
        <XStack
          gap="$2"
          paddingHorizontal="$4"
          paddingTop="$3"
          paddingBottom="$4"
          backgroundColor="$backgroundPage"
          borderTopWidth={1}
          borderTopColor="$border"
        >
          <Button
            flex={1}
            height={48}
            borderRadius={12}
            backgroundColor="$buttonSecondary"
            pressStyle={{ opacity: 0.7 }}
            disabled={enviando}
            onPress={() => navigation.goBack()}
          >
            <Text color="$textSecondary" fontWeight="600">Cancelar</Text>
          </Button>

          {/* Sin tipo y sin una cuota elegida no hay nada que mandar: son
              las dos cosas que el servidor necesita para resolver el
              préstamo, y la cuota además define el plazo.

              La descripción sí apaga el botón solo al tocarlo, con el
              error en su propio campo: es texto libre y un botón apagado
              mientras se escribe no dice qué falta. */}
          <Button
            flex={1}
            height={48}
            borderRadius={12}
            backgroundColor="$primary"
            opacity={!tipoId || !elegida || enviando ? 0.5 : 1}
            pressStyle={{ opacity: 0.8 }}
            disabled={!tipoId || !elegida || enviando}
            icon={enviando ? <Spinner color="#FFFFFF" /> : undefined}
            onPress={enviar}
          >
            <Text color="white" fontWeight="700">
              {enviando
                ? 'Guardando...'
                : solicitud
                  ? 'Guardar cambios'
                  : 'Enviar solicitud'}
            </Text>
          </Button>
        </XStack>
      </YStack>
    </KeyboardAvoidingView>
  )
}
