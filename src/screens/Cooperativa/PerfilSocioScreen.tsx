import React, { useCallback, useState } from 'react'
import { RefreshControl, KeyboardAvoidingView, Platform } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { YStack, XStack, Text, Button, ScrollView, View, Spinner } from 'tamagui'
import {
  Handshake, AlertCircle, BadgeCheck, UserX,
  FilePlus2, PiggyBank, Info, Landmark,
} from 'lucide-react-native'
import { cooperativaService } from '../../api/modules/cooperativa/cooperativa.service'
import {
  IClienteCooperativa,
  IEstadoAfiliacion,
  ILimitesAporte,
  IEmpleadoSinAfiliacion,
  ISolicitudSocio,
  IEstadoCuenta,
  ESTADO_SOLICITUD,
} from '../../api/modules/cooperativa/cooperativa.types'
import { ExecutionResponse } from '../../api/modules/response.type'
import { usePageHeader } from '../../hooks/usePageHeader'
import { useKeyboardHeight } from '../../hooks/useKeyboardInset'
import AppInput from '../../components/commons/AppInput'
import ConfirmDialog from '../../components/commons/ConfirmDialog'
import { handleError } from '../../utils/errorHandler'
import { useShowToast } from '../../utils/useShowToast'
import SkeletonForm from '../../components/Skeletons/SkeletonForm'
import EstadoCuentaCard from '../../components/commons/EstadoCuentaCard'
import { requestMenuRefresh } from '../../services/menuRefresh'
import { shadows } from '../../theme/shadows'

/**
 * Perfil de afiliación a la cooperativa (ruta 'self').
 *
 * Dos estados, resueltos por api/CooInter/EstadoAfiliacion:
 *  1. Ya es socio  -> la ficha del socio manda. Sin encabezado ni bloque de
 *                     estado: el estado queda como un chip junto al nombre
 *  2. Todavía no   -> si aplica, sus datos, el aporte y "Quiero ser socio"; si
 *                     no, el motivo que devolvió el procedimiento de planilla
 *
 * Antes habia dos estados mas, "pendiente" y "rechazada", de cuando la
 * afiliacion pasaba por aprobacion. Ya no: se afilia en el acto.
 *
 * No manda códigos ni datos del empleado: los resuelve el servidor desde el
 * token. Ver cooperativa.service.ts.
 */

/**
 * Cada cuanto se le descuenta el aporte, segun su planilla.
 *
 * Se le dice en las palabras de su pago, no en las del catalogo: alguien que
 * cobra cada quincena entiende "de cada quincena", no "TipoPlanilla = Q".
 */
const CADA_PAGO: Record<string, string> = {
  S: 'de cada pago semanal',
  Q: 'de cada quincena',
  M: 'de cada pago mensual',
}

/** Monto en lempiras. Cooperativa maneja HNL. */
const fmtMoneda = (valor: number | null | undefined): string => {
  if (valor === null || valor === undefined) return '-'
  return `L ${Number(valor).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Solo digitos y un punto decimal, para que el monto no llegue con basura. */
const soloDecimal = (v: string): string => {
  const limpio = v.replace(/[^0-9.]/g, '')
  const partes = limpio.split('.')
  return partes.length <= 2 ? limpio : `${partes[0]}.${partes.slice(1).join('')}`
}

/** Fecha ISO -> dd/mm/aaaa. Devuelve '-' si no hay dato o no parsea. */
const formatFecha = (valor: string | null): string => {
  if (!valor) return '-'
  const fecha = new Date(valor)
  if (isNaN(fecha.getTime())) return '-'
  return fecha.toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Junta los cuatro campos del nombre saltando los vacíos. */
const nombreCompleto = (
  e: IEmpleadoSinAfiliacion | ISolicitudSocio | IClienteCooperativa,
): string =>
  [e.PrimerNombre, e.SegundoNombre, e.PrimerApellido, e.SegundoApellido]
    .map(p => p?.trim())
    .filter(Boolean)
    .join(' ')

/**
 * Las iniciales del nombre, para el avatar.
 *
 * Dos a lo sumo: con tres o cuatro el circulo se vuelve ilegible en 44px.
 */
const iniciales = (nombre: string): string =>
  nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase() ?? '')
    .join('')

/**
 * Una linea de la ficha: etiqueta a la izquierda, valor a la derecha.
 *
 * El valor lleva flex y se alinea a la derecha, asi que los largos — correo,
 * direccion — bajan de renglon solos sin romper la columna ni empujar la
 * etiqueta. Por eso no hace falta un modo aparte para los campos anchos.
 */
function Fila({
  etiqueta,
  valor,
  ultima = false,
}: {
  etiqueta: string
  valor: string | null
  ultima?: boolean
}) {
  return (
    <XStack
      gap="$2.5"
      paddingVertical="$1.5"
      alignItems="flex-start"
      borderBottomWidth={ultima ? 0 : 1}
      borderBottomColor="$border"
    >
      <Text fontSize={11} color="$textMuted" minWidth={64}>
        {etiqueta}
      </Text>
      <Text
        fontSize={12}
        fontWeight="600"
        color="$text"
        flex={1}
        textAlign="right"
        lineHeight={16}
      >
        {valor && valor.trim() ? valor : '—'}
      </Text>
    </XStack>
  )
}

/**
 * Una pantalla de estado: icono, titulo y explicacion.
 *
 * La usan los dos caminos que NO llevan a un formulario — el que no califica y
 * el que no se pudo consultar. Antes cada uno era un recuadro con una linea de
 * texto, y eso se lee como un error de la app; con el icono grande y el titulo
 * se lee como lo que es: una respuesta.
 *
 * `tono` pinta el circulo y el bloque del detalle. Se pasa el color crudo y no
 * un token porque los temas no definen opacidades para ambar ni para gris.
 */
function PantallaEstado({
  icono: Icono,
  tono,
  titulo,
  descripcion,
  detalle,
  pie,
}: {
  icono: React.ComponentType<any>
  tono: string
  titulo: string
  descripcion: string
  detalle?: React.ReactNode
  pie?: string
}) {
  return (
    <YStack
      gap="$3"
      paddingHorizontal="$4"
      paddingVertical="$5"
      borderRadius="$6"
      backgroundColor="$backgroundElevated"
      borderWidth={1}
      borderColor="$border"
      alignItems="center"
      {...shadows.sm}
    >
      {/* Dos circulos concentricos: el de afuera apenas teñido, el de adentro
          mas saturado. Da profundidad sin necesitar una ilustracion. */}
      <View
        width={84}
        height={84}
        borderRadius={999}
        backgroundColor={`${tono}14`}
        alignItems="center"
        justifyContent="center"
      >
        <View
          width={60}
          height={60}
          borderRadius={999}
          backgroundColor={`${tono}24`}
          alignItems="center"
          justifyContent="center"
        >
          <Icono size={28} color={tono} />
        </View>
      </View>

      <Text fontSize={17} fontWeight="800" color="$text" textAlign="center">
        {titulo}
      </Text>

      <Text
        fontSize={13}
        color="$textMuted"
        textAlign="center"
        lineHeight={20}
        maxWidth={300}
      >
        {descripcion}
      </Text>

      {detalle}

      {!!pie && (
        <Text fontSize={11} color="$textMuted" textAlign="center">
          {pie}
        </Text>
      )}
    </YStack>
  )
}

/**
 * Ficha de datos, compartida por el empleado y por la solicitud guardada.
 *
 * `chip` es el indicador de estado que va junto al nombre. Se usa en el caso
 * aprobado, donde el estado no merece un bloque propio: lo que importa ahí es
 * la información del socio.
 */
function FichaDatos({
  datos,
  chip,
}: {
  // Las tres formas tienen los mismos campos de ficha — identidad, nombres,
  // fechas, planilla, contacto — aunque vengan de tablas distintas.
  datos: IEmpleadoSinAfiliacion | ISolicitudSocio | IClienteCooperativa
  chip?: React.ReactNode
}) {
  const nombre = nombreCompleto(datos) || 'Empleado'

  return (
    <YStack
      borderRadius="$6"
      backgroundColor="$backgroundElevated"
      borderWidth={1}
      borderColor="$border"
      overflow="hidden"
      {...shadows.sm}
    >
      {/* Encabezado. Va sobre un fondo distinto para que se lea como la
          identidad de la persona y no como un dato mas de la lista. */}
      <XStack
        gap="$2.5"
        paddingHorizontal="$3"
        paddingVertical="$2.5"
        alignItems="center"
        backgroundColor="$backgroundSurface"
      >
        <View
          width={38}
          height={38}
          borderRadius={999}
          backgroundColor="$primaryOpacity"
          alignItems="center"
          justifyContent="center"
        >
          <Text fontSize={14} fontWeight="800" color="$primary">
            {iniciales(nombre)}
          </Text>
        </View>

        <YStack flex={1} gap="$1">
          <Text fontSize={14} fontWeight="800" color="$text" lineHeight={18} numberOfLines={2}>
            {nombre}
          </Text>
          {chip}
        </YStack>
      </XStack>

      {/* Los datos, uno por renglon y separados por una linea fina.
          Antes iban de dos en dos con un icono cada uno: entraban mas en menos
          alto, pero con seis iconos grises la tarjeta se leia como un formulario
          y costaba encontrar un dato concreto. En una columna el ojo baja
          derecho por las etiquetas. */}
      <YStack paddingHorizontal="$3" paddingBottom="$1">
        <Fila etiqueta="Identidad" valor={datos.NIT} />
        <Fila etiqueta="Código" valor={datos.Codigo} />
        <Fila etiqueta="Ingreso" valor={formatFecha(datos.FechaIngreso)} />
        <Fila etiqueta="Teléfono" valor={datos.Telefono1} />
        <Fila etiqueta="Correo" valor={datos.Correo} />
        <Fila etiqueta="Dirección" valor={datos.Direccion} ultima />
      </YStack>
    </YStack>
  )
}

export default function PerfilSocioScreen() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [enviando, setEnviando] = useState(false)
  // La ficha del socio, o null si todavía no lo es. Lo que decide qué se pinta.
  const [cliente, setCliente] = useState<IClienteCooperativa | null>(null)
  // Por qué no se pudo consultar. Vacío cuando la consulta salió bien — sea
  // que encontró socio o que no.
  const [motivo, setMotivo] = useState('')
  // Sus datos de planilla. Solo se piden cuando NO es socio: son los que
  // precargan el "quiero ser socio".
  const [empleado, setEmpleado] = useState<IEstadoAfiliacion['Empleado']>(null)
  const [estadoCuenta, setEstadoCuenta] = useState<IEstadoCuenta | null>(null)

  // Aporte que va a ahorrar en cada pago. Se pide antes de solicitar porque al
  // aprobarse pasa a su cuenta y se le empieza a descontar de planilla.
  const [aporte, setAporte] = useState('')
  const [errorAporte, setErrorAporte] = useState('')

  // El confirm se abre solo si el monto ya paso la validacion: no tiene sentido
  // hacerle confirmar algo que el servidor va a rechazar.
  const [confirmando, setConfirmando] = useState(false)

  // En Android con edge-to-edge, adjustResize no achica la ventana, asi que el
  // KeyboardAvoidingView por si solo no alcanza: se reserva el alto del teclado
  // como padding para poder scrollear el campo por encima de el.
  const kbHeight = useKeyboardHeight()
  const bottomPad = Platform.OS === 'android' ? kbHeight : 0
  const { showToast } = useShowToast()
  const navigation = useNavigation()

  usePageHeader({
    center: (
      <Text fontSize={16} fontWeight="700" color="$text">
        Perfil de socio
      </Text>
    ),
  })

  /**
   * ¿Es socio? Una sola consulta, derecho a la base de Cooperativa.
   *
   * Antes esto preguntaba por el "estado de afiliación", que se armaba en
   * IMCore cruzando su solicitud, los límites de aporte y la antigüedad
   * mínima. Ese esquema ya no existe: ahora la pregunta es más simple y la
   * contesta una sola fila de dbo.Cliente.
   *
   * Los tres desenlaces se tratan distinto a propósito:
   *
   *   Success && Data   ya es socio       -> su información
   *   Success && !Data  todavía no        -> "quiero ser socio"
   *   !Success          no se pudo saber  -> el motivo, y NINGUNA de las dos
   *
   * El tercero no es el segundo. Si una caída se leyera como "no es socio",
   * a alguien afiliado se le ofrecería afiliarse otra vez.
   */
  const consultar = useCallback(async () => {
    try {
      const response: ExecutionResponse<IClienteCooperativa | null> =
        await cooperativaService.getClienteCooperativa()

      if (!response?.Success) {
        setCliente(null)
        setEstadoCuenta(null)
        setMotivo(response?.ErrorMessage || 'No se pudo consultar su afiliación.')
        return
      }

      const socio = response.Data ?? null

      setCliente(socio)
      setMotivo('')

      if (socio) {
        setEmpleado(null)

        // La cuenta solo si ya es socio: quien no lo es no tiene qué consultar.
        // Es información complementaria, así que un fallo no se muestra ni corta
        // la pantalla; a lo sumo no se pinta la tarjeta.
        try {
          const cuenta = await cooperativaService.getEstadoCuenta()
          setEstadoCuenta(cuenta?.Success && cuenta.Data ? cuenta.Data : null)
        } catch {
          setEstadoCuenta(null)
        }
        return
      }

      // No es socio: se le ofrece afiliarse, y para eso hacen falta sus datos
      // de planilla. Salen de payroll.ObtenerEmpleadosActivosSinAfiliacion, que
      // devuelve justo a los activos que todavía no son clientes.
      //
      // Si no viene, se dice por qué: puede no estar activo o no tener ficha en
      // planilla, y en ninguno de esos casos se le puede ofrecer el alta.
      setEstadoCuenta(null)

      try {
        const emp = await cooperativaService.getEmpleadoSinAfiliacion()

        if (emp?.Success && emp.Data) {
          setEmpleado(emp.Data)
        } else {
          setEmpleado(null)
          setMotivo(emp?.ErrorMessage || 'No se encontró su información de empleado.')
        }
      } catch (err) {
        setEmpleado(null)
        setMotivo(handleError(err).message)
      }
    } catch (err) {
      const error = handleError(err)
      setCliente(null)
      setEstadoCuenta(null)
      setMotivo(error.message)
    }
  }, [])

  // useFocusEffect y no useEffect: el navegador mantiene las pantallas
  // montadas, asi que un efecto de montaje solo corre la primera vez y al
  // volver a entrar se veria informacion vieja.
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
   * Valida el monto y abre el confirm. NO manda nada.
   *
   * La afiliacion ya no pasa por aprobacion: al confirmar queda hecha y le
   * empiezan a descontar de planilla. Un toque accidental no deberia alcanzar
   * para eso.
   */
  /**
   * El aviso de que el monto se sale del rango, o cadena vacía si está bien.
   *
   * Vive en una sola función porque la usan dos momentos: mientras escribe y al
   * confirmar. Con el texto duplicado, los dos mensajes se desalinean en cuanto
   * alguien toca uno.
   *
   * Un rango `Informativo` NO bloquea: la cooperativa lo guarda como sugerencia,
   * así que se avisa pero se deja seguir. Bloquear ahí sería impedir un monto
   * que de verdad se acepta.
   */
  const mensajeFueraDeRango = (valor: string): string => {
    const monto = Number(valor)

    if (!valor.trim() || isNaN(monto) || monto <= 0) return ''
    if (!limites) return ''
    if (monto >= limites.Minimo && monto <= limites.Maximo) return ''

    const rango = `${fmtMoneda(limites.Minimo)} y ${fmtMoneda(limites.Maximo)}`

    return limites.Informativo
      ? `Lo habitual es entre ${rango}`
      : `Debe estar entre ${rango}`
  }

  const pedirConfirmacion = () => {
    const monto = Number(aporte)

    if (!aporte.trim() || isNaN(monto) || monto <= 0) {
      setErrorAporte('Escribí cuánto querés aportar')
      return
    }

    // Fuera de rango no se confirma — salvo que el rango sea informativo, donde
    // el aviso ya se mostró mientras escribía y la decisión es suya.
    const aviso = mensajeFueraDeRango(aporte)

    if (aviso && !limites?.Informativo) {
      setErrorAporte(aviso)
      return
    }

    setErrorAporte('')
    setConfirmando(true)
  }

  const solicitar = async () => {
    // El monto ya se validó en pedirConfirmacion; acá solo se reusa.
    const monto = Number(aporte)

    setConfirmando(false)
    setEnviando(true)
    try {
      const response = await cooperativaService.crearSolicitudSocio(monto)

      if (!response?.Success) {
        showToast('error', 'Error', response?.ErrorMessage || 'No se pudo completar su afiliación', 6000, 'top')
        // Puede haber fallado porque el estado cambió (ya se afilió entre que
        // abrió la pantalla y presionó). Se relee para mostrar lo que
        // corresponde.
        await consultar()
        return
      }

      showToast(
        'success',
        // SocioCreado distingue el alta de verdad de un reintento sobre algo
        // que ya existia. Felicitar dos veces por lo mismo confunde: la persona
        // no sabe si se afilio otra vez.
        response.Data?.SocioCreado === false ? 'Ya estabas afiliado' : 'Ya sos socio',
        response.Data?.Mensaje || response.SuccessMessage || '',
        4000,
        'top',
      )

      // Se guardo, pero con algo que decir. Hoy solo pasa si el rango era
      // informativo y el monto quedo afuera — la pantalla no deberia dejar
      // llegar hasta aca, asi que si aparece es que la regla cambio de un lado
      // y no del otro. Se muestra en vez de tragarselo.
      if (response.Data?.Aviso) {
        showToast('info', 'Sobre tu aporte', response.Data.Aviso, 7000, 'top')
      }

      // Solo si de verdad se le asigno algo. Refrescar siempre seria volver a
      // pedir los menus en cada afiliacion repetida, sin que nada haya
      // cambiado.
      if (response.Data?.MenuAsignado) requestMenuRefresh()

      // Volver al flujo de entrada: ahora que es socio, la misma consulta de
      // siempre lo lleva a su ficha y su estado de cuenta.
      await consultar()
    } catch (err) {
      const error = handleError(err)
      showToast('error', 'Error', error.message, 5000, 'top')
    } finally {
      setEnviando(false)
    }
  }

  if (loading) {
    return (
      <YStack flex={1} backgroundColor="$backgroundPage" padding="$4">
        <SkeletonForm />
      </YStack>
    )
  }

  // Cuanto puede aportar. Viene con sus datos de empleado: lo resuelve la
  // cooperativa cruzando empresa, tipo de planilla y tipo de empleado.
  //
  // Puede ser null — hay combinaciones sin parametrizar — y en ese caso la
  // pantalla lo dice en vez de inventar un rango.
  const limites: ILimitesAporte | null = empleado?.LimitesAporte ?? null

  // ---------------------------------------------------------------------
  // PENDIENTE — la antiguedad minima para poder afiliarse.
  //
  // Salia de AdmSys.Configuracion en IMCore, que ya no se consulta. Falta
  // decidir donde vive ahora.
  //
  // `null as T` y no `: T = null`: con la anotacion sola TypeScript estrecha la
  // constante a null y cualquier `bloqueo?.Campo` pasa a ser `never`.
  // ---------------------------------------------------------------------
  const bloqueo = null as IEstadoAfiliacion['BloqueoSolicitud']

  // Como se le va a descontar. Sin planilla reconocida se dice en general: es
  // preferible a afirmar una frecuencia que puede no ser la suya.
  const cadaPago = CADA_PAGO[(empleado?.TipoPlanilla ?? '').toUpperCase()] ?? 'de cada pago de planilla'

  /**
   * El campo del aporte con su explicacion.
   *
   * Se muestra en los dos caminos que llevan a solicitar: el alta nueva y el
   * "volver a solicitar" despues de un rechazo. Repetirlo seria dejar dos
   * textos que se pueden desalinear.
   *
   * Se INVOCA como funcion — {renderCampoAporte()} — y no se usa como
   * <CampoAporte />. Declarado dentro del render, cada pasada crearia un tipo
   * de componente distinto, React desmontaria y volveria a montar el arbol, y
   * el input perderia el foco con cada tecla.
   */
  const renderCampoAporte = () => (
    <YStack
      gap="$2.5"
      padding="$3"
      borderRadius="$4"
      backgroundColor="$backgroundSurface"
      borderWidth={1}
      borderColor="$border"
    >
      <XStack gap="$2" alignItems="center">
        <PiggyBank size={15} color="#22C55E" />
        <Text fontSize={13} fontWeight="700" color="$text">
          Su aporte
        </Text>
      </XStack>

      {/* El rango va ARRIBA del campo, no debajo.
          Debajo era una aclaracion que se leia despues de haber escrito; arriba
          es la instruccion que dice que escribir. */}
      {limites ? (
        <XStack
          gap="$2"
          alignItems="center"
          paddingHorizontal="$2.5"
          paddingVertical="$2"
          borderRadius="$3"
          backgroundColor="rgba(34, 197, 94, 0.10)"
        >
          <PiggyBank size={13} color="#22C55E" />
          <Text fontSize={12} color="$text" flex={1}>
            Podés aportar entre{' '}
            <Text fontWeight="800">{fmtMoneda(limites.Minimo)}</Text> y{' '}
            <Text fontWeight="800">{fmtMoneda(limites.Maximo)}</Text>
            {limites.NombrePlanilla ? ` de cada pago ${limites.NombrePlanilla}` : ''}
          </Text>
        </XStack>
      ) : (
        /* Sin rango no se puede validar nada. Se dice, en vez de dejarlo
           escribir un monto que la cooperativa va a rechazar despues. */
        <XStack
          gap="$2"
          alignItems="flex-start"
          paddingHorizontal="$2.5"
          paddingVertical="$2"
          borderRadius="$3"
          backgroundColor="rgba(245, 158, 11, 0.12)"
        >
          <View marginTop={1}>
            <Info size={13} color="#F59E0B" />
          </View>
          <Text fontSize={12} color="$text" flex={1} lineHeight={17}>
            La cooperativa todavía no tiene definido un rango de aporte para tu
            tipo de planilla. Consultá con ellos antes de afiliarte.
          </Text>
        </XStack>
      )}

      <AppInput
        label="Monto a aportar"
        value={aporte}
        onChangeText={(v: string) => {
          const limpio = soloDecimal(v)
          setAporte(limpio)

          // Se avisa MIENTRAS escribe, no al confirmar. Enterarse de que el
          // monto no sirve recien al presionar el boton obliga a volver, y la
          // validacion al confirmar sigue estando igual por si llega vacio.
          setErrorAporte(mensajeFueraDeRango(limpio))
        }}
        keyboardType="decimal-pad"
        placeholder="0.00"
        error={errorAporte}
      />

      {/* Lo que de verdad tiene que entender antes de aceptar: que este monto
          le sale del sueldo, y cada cuanto. */}
      <XStack gap="$2" alignItems="flex-start">
        <View marginTop={1}>
          <Info size={13} color="#F59E0B" />
        </View>
        <Text fontSize={12} color="$textMuted" flex={1} lineHeight={17}>
          Este monto se le va a deducir {cadaPago}, y se ahorra en su cuenta de
          la cooperativa.
        </Text>
      </XStack>
    </YStack>
  )

  /* ------------------------------------------------------------------------
     APROBADA — la información es lo que importa.
     Sale por su propio return: sin encabezado ni bloque de estado, solo la
     ficha del socio con un chip que dice desde cuándo lo es.
     ------------------------------------------------------------------------ */
  if (cliente) {
    // Al dia por los DOS lados. EstadoSocio = 0 es Activo en el catalogo de la
    // cooperativa; cuando no viene — bases viejas, o el catalogo sin cargar —
    // manda el estado de la ficha, que es lo unico que se sabe.
    const socioAlDia =
      cliente.Estado === 1 &&
      (cliente.EstadoSocio == null || cliente.EstadoSocio === 0)

    /* Sale del estado de cuenta, que ya cuenta TODOS sus préstamos —también
       los migrados o cargados en el escritorio, que son la mayoría— y no solo
       los que nacieron de una solicitud del app. */
    const tienePrestamos = (estadoCuenta?.TotalPrestamos ?? 0) > 0

    return (
      <ScrollView
        flex={1}
        backgroundColor="$backgroundPage"
        contentContainerStyle={{ padding: 12, paddingBottom: 24, gap: 10 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <FichaDatos
          datos={cliente}
          chip={
            <XStack
              alignSelf="flex-start"
              alignItems="center"
              gap="$1.5"
              paddingHorizontal="$2.5"
              paddingVertical="$1"
              borderRadius="$10"
              // rgba literal: los temas solo definen primaryOpacity, no hay un
              // token de opacidad para success.
              // Verde solo cuando esta activo por los DOS lados: la ficha y su
              // situacion como socio. Un liquidado con la ficha activa no
              // deberia verse igual que uno al dia.
              backgroundColor={
                socioAlDia
                  ? 'rgba(34, 197, 94, 0.12)'
                  : 'rgba(239, 68, 68, 0.12)'
              }
            >
              <BadgeCheck size={12} color={socioAlDia ? '#22C55E' : '#EF4444'} />
              <Text
                fontSize={11}
                fontWeight="600"
                color={socioAlDia ? '$success' : '$error'}
              >
                {/* El nombre sale del catalogo de la cooperativa — Activo,
                    Liquidado, lo que tengan cargado — y no de un mapa escrito
                    aca: un estado nuevo aparece solo.

                    Si no vino, se cae al estado de la ficha, que es lo unico
                    que se sabe con certeza.

                    Ya no se dice "Socio desde": dbo.Cliente no guarda cuando se
                    afilio. Esa fecha salia de IMCore, y esa tabla ya no existe
                    — inventarla seria peor que no mostrarla. */}
                {cliente.EstadoSocioNombre
                  ? `Socio ${cliente.EstadoSocioNombre.toLowerCase()}`
                  : cliente.Estado === 1 ? 'Socio activo' : 'Socio dado de baja'}
              </Text>
            </XStack>
          }
        />
        
        {!!estadoCuenta && <EstadoCuentaCard datos={estadoCuenta} />}

        {/* Dos salidas del perfil, lado a lado y del mismo tamaño: las dos
            llevan a una lista y ninguna es más importante que la otra.

            La de préstamos SOLO si tiene alguno. Un botón que lleva a una
            lista vacía promete algo que no hay — y el socio que nunca pidió
            nada no tiene por qué saber que esa pantalla existe. */}
        <XStack gap="$2.5">
          <Button
            flex={1}
            backgroundColor="$primary"
            color="#FFFFFF"
            height={44}
            borderRadius="$4"
            fontWeight="600"
            fontSize={13}
            icon={<FilePlus2 size={16} color="#FFFFFF" />}
            pressStyle={{ opacity: 0.85 }}
            onPress={() => navigation.navigate('RequestCoo' as never)}
          >
            Mis solicitudes
          </Button>

          {tienePrestamos && (
            <Button
              flex={1}
              backgroundColor="transparent"
              height={44}
              borderRadius="$4"
              borderWidth={1.5}
              borderColor="$primary"
              fontWeight="600"
              fontSize={13}
              color="$primary"
              icon={<Landmark size={16} color="#FF551A" />}
              pressStyle={{ opacity: 0.6 }}
              onPress={() => navigation.navigate('historicoPrestamos' as never)}
            >
              Mis préstamos
            </Button>
          )}
        </XStack>
      </ScrollView>
    )
  }

  /* ------------------------------------------------------------------------
     NO CALIFICA — hoy, por ser empleado temporal.
     Sale por su propio return: no hay nada que elegir ni que completar, asi
     que mostrarle el formulario con el boton apagado solo lo haria buscar que
     le falta.
     ------------------------------------------------------------------------ */
  /* ------------------------------------------------------------------------
     NO PUEDE AFILIARSE.
     Se llega por dos caminos y a proposito muestran lo mismo:

       empleado = null      planilla no lo devolvio. El procedimiento solo
                            trae permanentes, asi que lo mas probable es que
                            no lo sea.
       PuedeAfiliarse false vino con una relacion laboral que no califica.
                            Hoy no puede pasar — el filtro los deja afuera —
                            pero queda cubierto por si el filtro se relaja.

     >>> POR QUE EL TEXTO NO AFIRMA "SOS TEMPORAL" <<<
     Porque cero filas tambien significa que no esta activo, que su tipo de
     planilla no lo esta, que su centro de costos no figura en
     EstructuraContable, o que el codigo no existe. Son indistinguibles desde
     aca. Se dice la REGLA — solo permanentes — y se ofrece a quien crea que
     hay un error el camino para que lo revisen, en vez de acusar a su
     contrato de algo que puede ser un dato mal cargado.
     ------------------------------------------------------------------------ */
  if (!cliente && (!empleado || !empleado.PuedeAfiliarse)) {
    return (
      <ScrollView
        flex={1}
        backgroundColor="$backgroundPage"
        contentContainerStyle={{ padding: 12, paddingBottom: 24, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <PantallaEstado
          icono={UserX}
          tono="#F59E0B"
          titulo="Todavía no podés afiliarte"
          descripcion="La cooperativa acepta solo a empleados permanentes, y en planilla no figurás como tal."
          detalle={
            /* El dato crudo cuando lo tenemos. Si el empleado no vino, no hay
               relacion laboral que mostrar — y no se inventa una. */
            empleado?.RelacionLaboral ? (
              <XStack
                gap="$2"
                alignItems="center"
                paddingHorizontal="$3"
                paddingVertical="$2.5"
                borderRadius="$4"
                backgroundColor="rgba(245, 158, 11, 0.10)"
              >
                <Text fontSize={12} color="$textMuted">
                  En planilla figurás como
                </Text>
                <Text fontSize={13} fontWeight="800" color="$text">
                  {empleado.RelacionLaboral === 'TEMP'
                    ? 'Temporal'
                    : empleado.RelacionLaboral}
                </Text>
              </XStack>
            ) : undefined
          }
        />

        {/* Su ficha, solo si planilla la devolvio: ver sus datos es lo que le
            permite notar si hay algo mal cargado y pedir que lo corrijan. */}
        {!!empleado && <FichaDatos datos={empleado} />}
      </ScrollView>
    )
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
    <ScrollView
      flex={1}
      backgroundColor="$backgroundPage"
      // El alto del teclado se suma al padding para que el campo del aporte se
      // pueda subir por encima de el en vez de quedar tapado.
      contentContainerStyle={{ padding: 12, paddingBottom: 24 + bottomPad, gap: 10 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Encabezado */}
      <YStack gap="$1.5" alignItems="center" paddingVertical="$1.5">
        <View
          width={48}
          height={48}
          borderRadius={24}
          backgroundColor="$primary"
          alignItems="center"
          justifyContent="center"
        >
          <Handshake size={22} color="#FFFFFF" />
        </View>

        <Text fontSize={17} fontWeight="700" color="$text" textAlign="center">
          {empleado ? 'Afiliate aquí' : 'Afiliación'}
        </Text>

        <Text fontSize={12} color="$textMuted" textAlign="center" lineHeight={17}>
          {empleado
            ? 'Revise sus datos y elija su aporte. Quedará afiliado al confirmar.'
            : 'Estado de su afiliación a la cooperativa.'}
        </Text>
      </YStack>


      {empleado ? (
        <>
          <FichaDatos datos={empleado} />

          {/* Bloqueado: en vez del campo del aporte y el botón, el motivo. Se
              le dice por qué y qué le falta — un botón ausente sin explicación
              se lee como que la app está rota. */}
          {bloqueo ? (
            <YStack
              gap="$2"
              padding="$3"
              borderRadius="$4"
              backgroundColor="$backgroundSurface"
              borderWidth={1}
              borderColor="$border"
            >
              <XStack alignItems="center" gap="$2">
                <Info size={15} color="#F59E0B" />
                <Text fontSize={13} fontWeight="700" color="$text">
                  Todavía no podés afiliarte
                </Text>
              </XStack>
              <Text fontSize={12} color="$textMuted" lineHeight={17}>
                {bloqueo}
              </Text>
            </YStack>
          ) : (
            renderCampoAporte()
          )}

          {!bloqueo && (
            <Button
              backgroundColor="$primary"
              color="#FFFFFF"
              height={50}
              borderRadius="$4"
              fontWeight="600"
              fontSize={16}
              disabled={enviando}
              icon={enviando ? <Spinner color="#FFFFFF" /> : <Handshake size={17} color="#FFFFFF" />}
              pressStyle={{ opacity: 0.85 }}
              onPress={pedirConfirmacion}
            >
              {enviando ? 'Afiliando...' : 'Quiero ser socio'}
            </Button>
          )}
        </>
      ) : (
        /* No se pudo resolver.
           OJO: esto NO quiere decir que no califique. Puede que ya sea socio,
           que no este activo, que su tipo de planilla no lo este, que su centro
           de costos no figure en EstructuraContable, o que el codigo no exista.
           Son indistinguibles desde aca, asi que el texto no afirma ninguna: se
           muestra el motivo que dio el servidor y se ofrece reintentar. */
        <PantallaEstado
          icono={AlertCircle}
          tono="#94A3B8"
          titulo="No pudimos consultar tu afiliación"
          descripcion="No encontramos tu información de empleado para ofrecerte la afiliación."
          detalle={
            !!motivo && (
              <YStack
                paddingHorizontal="$3"
                paddingVertical="$2.5"
                borderRadius="$4"
                backgroundColor="$backgroundSurface"
                borderWidth={1}
                borderColor="$border"
                maxWidth={320}
              >
                <Text fontSize={12} color="$text" textAlign="center" lineHeight={17}>
                  {motivo}
                </Text>
              </YStack>
            )
          }
          pie="Deslizá hacia abajo para volver a consultar."
        />
      )}

      {/* Confirmacion antes de afiliar.
          Sin aprobacion de por medio, este dialogo es el ultimo punto donde
          puede echarse atras: al aceptar queda socio y empieza el descuento. */}
      <ConfirmDialog
        open={confirmando}
        onOpenChange={setConfirmando}
        title="¿Confirma su afiliación?"
        message="Va a quedar afiliado a la cooperativa de inmediato."
        confirmLabel="Sí, afiliarme"
        confirmColor="#22C55E"
        loading={enviando}
        onConfirm={solicitar}
        onCancel={() => setConfirmando(false)}
        extra={
          <YStack
            gap="$2"
            padding="$3"
            borderRadius="$3"
            backgroundColor="$backgroundSurface"
            borderWidth={1}
            borderColor="$border"
          >
            <XStack alignItems="center">
              <Text fontSize={13} color="$textMuted" flex={1}>
                Su aporte
              </Text>
              {/* El monto es el dato que tiene que revisar antes de aceptar, asi
                  que se muestra con el mismo peso que el titulo. */}
              <Text fontSize={17} fontWeight="700" color="$text">
                {fmtMoneda(Number(aporte))}
              </Text>
            </XStack>

            <Text fontSize={12} color="$textMuted" lineHeight={17}>
              Se le va a deducir {cadaPago} y se ahorra en su cuenta de la
              cooperativa.
            </Text>
          </YStack>
        }
      />
    </ScrollView>
    </KeyboardAvoidingView>
  )
}
