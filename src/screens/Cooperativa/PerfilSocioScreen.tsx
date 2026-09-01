import React, { useCallback, useState } from 'react'
import { RefreshControl, KeyboardAvoidingView, Platform } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { YStack, XStack, Text, Button, ScrollView, View, Spinner } from 'tamagui'
import {
  Handshake, UserCog, CalendarDays, IdCard, Mail, Phone, MapPin,
  Building2, AlertCircle, Clock, XCircle, MessageSquare, RotateCcw, BadgeCheck,
  FilePlus2, PiggyBank, Info,
} from 'lucide-react-native'
import { cooperativaService } from '../../api/modules/cooperativa/cooperativa.service'
import {
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
import { handleError } from '../../utils/errorHandler'
import { useShowToast } from '../../utils/useShowToast'
import SkeletonForm from '../../components/Skeletons/SkeletonForm'
import EstadoCuentaCard from '../../components/commons/EstadoCuentaCard'
import { requestMenuRefresh } from '../../services/menuRefresh'
import { shadows } from '../../theme/shadows'

/**
 * Perfil de afiliación a la cooperativa (ruta 'self').
 *
 * Cuatro estados, resueltos por api/CooInter/EstadoAfiliacion:
 *  1. Aprobada      -> la ficha del socio manda. Sin encabezado ni bloque de
 *                      estado: el estado queda como un chip junto al nombre
 *  2. Pendiente     -> se muestra el estado, sin acción
 *  3. Rechazada     -> el motivo y el botón "Volver a solicitar"
 *  4. Sin solicitud -> si aplica, sus datos y "Quiero ser socio"; si no, el
 *                      motivo que devolvió el procedimiento de planilla
 *
 * No manda códigos ni datos del empleado: los resuelve el servidor desde el
 * token. Ver cooperativa.service.ts.
 */

const TIPO_PLANILLA: Record<string, string> = {
  S: 'Semanal',
  Q: 'Quincenal',
  M: 'Mensual',
  X: 'Sin clasificar',
}

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
const nombreCompleto = (e: IEmpleadoSinAfiliacion | ISolicitudSocio): string =>
  [e.PrimerNombre, e.SegundoNombre, e.PrimerApellido, e.SegundoApellido]
    .map(p => p?.trim())
    .filter(Boolean)
    .join(' ')

function Dato({
  icono: Icono,
  etiqueta,
  valor,
}: {
  icono: React.ComponentType<any>
  etiqueta: string
  valor: string | null
}) {
  return (
    <XStack gap="$3" alignItems="flex-start">
      <View marginTop={2}>
        <Icono size={16} color="#94A3B8" />
      </View>
      <YStack flex={1} gap="$1">
        <Text fontSize={12} color="$textMuted" fontWeight="600">
          {etiqueta}
        </Text>
        <Text fontSize={15} color="$text">
          {valor && valor.trim() ? valor : '-'}
        </Text>
      </YStack>
    </XStack>
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
  datos: IEmpleadoSinAfiliacion | ISolicitudSocio
  chip?: React.ReactNode
}) {
  return (
    <YStack
      gap="$4"
      padding="$4"
      borderRadius="$4"
      backgroundColor="$backgroundElevated"
      borderWidth={1}
      borderColor="$border"
      {...shadows.sm}
    >
      <YStack gap="$2">
        <XStack gap="$2" alignItems="center">
          <UserCog size={18} color="#94A3B8" />
          <Text fontSize={17} fontWeight="700" color="$text" flex={1}>
            {nombreCompleto(datos) || 'Empleado'}
          </Text>
        </XStack>
        {chip}
      </YStack>

      <Dato icono={IdCard} etiqueta="Identidad" valor={datos.NIT} />
      <Dato icono={IdCard} etiqueta="Código de personal" valor={datos.Codigo} />
      <Dato icono={CalendarDays} etiqueta="Fecha de nacimiento" valor={formatFecha(datos.FechaNacimiento)} />
      <Dato icono={CalendarDays} etiqueta="Fecha de ingreso" valor={formatFecha(datos.FechaIngreso)} />
      <Dato
        icono={Building2}
        etiqueta="Tipo de planilla"
        valor={TIPO_PLANILLA[datos.TipoPlanilla ?? ''] ?? datos.TipoPlanilla}
      />
      <Dato icono={Phone} etiqueta="Teléfono" valor={datos.Telefono1} />
      <Dato icono={Mail} etiqueta="Correo" valor={datos.Correo} />
      <Dato icono={MapPin} etiqueta="Dirección" valor={datos.Direccion} />
    </YStack>
  )
}

export default function PerfilSocioScreen() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [estado, setEstado] = useState<IEstadoAfiliacion | null>(null)
  const [estadoCuenta, setEstadoCuenta] = useState<IEstadoCuenta | null>(null)

  // Aporte que va a ahorrar en cada pago. Se pide antes de solicitar porque al
  // aprobarse pasa a su cuenta y se le empieza a descontar de planilla.
  const [aporte, setAporte] = useState('')
  const [errorAporte, setErrorAporte] = useState('')

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
        Cooperativa
      </Text>
    ),
  })

  const consultar = useCallback(async () => {
    try {
      const response: ExecutionResponse<IEstadoAfiliacion> =
        await cooperativaService.getEstadoAfiliacion()

      if (response?.Success && response.Data) {
        setEstado(response.Data)

        // El servidor le acaba de dar el menu del socio. Sin este aviso el
        // drawer sigue con la lista vieja y la persona tendria que cerrar
        // sesion para ver su pantalla de solicitudes.
        if (response.Data.MenuAsignado) requestMenuRefresh()

        // Solo si ya es socio: quien no lo es no tiene cuenta que consultar.
        // Es informacion complementaria, asi que un fallo no se muestra ni
        // corta la pantalla; a lo sumo no se pinta la tarjeta.
        if (response.Data.Solicitud?.Status_Code === ESTADO_SOLICITUD.APROBADO) {
          try {
            const cuenta = await cooperativaService.getEstadoCuenta()
            setEstadoCuenta(cuenta?.Success && cuenta.Data ? cuenta.Data : null)
          } catch {
            setEstadoCuenta(null)
          }
        } else {
          setEstadoCuenta(null)
        }
      } else {
        setEstado({
          Empleado: null,
          Solicitud: null,
          Motivo: response?.ErrorMessage || 'No se pudo consultar tu afiliación.',
          PuedeSolicitar: false,
          LimitesAporte: null,
        })
      }
    } catch (err) {
      const error = handleError(err)
      setEstado({
        Empleado: null,
        Solicitud: null,
        Motivo: error.message,
        PuedeSolicitar: false,
        LimitesAporte: null,
      })
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

  const solicitar = async () => {
    const monto = Number(aporte)
    if (!aporte.trim() || isNaN(monto) || monto <= 0) {
      setErrorAporte('Escribí cuánto querés aportar')
      return
    }

    if (limites && (monto < limites.Minimo || monto > limites.Maximo)) {
      setErrorAporte(`Debe estar entre ${fmtMoneda(limites.Minimo)} y ${fmtMoneda(limites.Maximo)}`)
      return
    }

    setErrorAporte('')
    setEnviando(true)
    try {
      const response = await cooperativaService.crearSolicitudSocio(monto)

      if (!response?.Success) {
        showToast('error', 'Error', response?.ErrorMessage || 'No se pudo enviar tu solicitud', 5000, 'top')
        // Puede haber fallado porque el estado cambió (ya se afilió, o ya tenía
        // una solicitud). Se relee para mostrar lo que corresponde.
        await consultar()
        return
      }

      showToast('success', 'Solicitud enviada', response.SuccessMessage || '', 4000, 'top')
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

  const solicitud = estado?.Solicitud ?? null
  const empleado = estado?.Empleado ?? null
  const aprobada = solicitud?.Status_Code === ESTADO_SOLICITUD.APROBADO
  const rechazada = solicitud?.Status_Code === ESTADO_SOLICITUD.RECHAZADO
  const pendiente = !!solicitud && !aprobada && !rechazada
  // Tras un rechazo puede corregir y volver a mandarla: la API devuelve el
  // empleado justamente para eso.
  const puedeSolicitar = !!empleado && (!solicitud || rechazada)
  const limites: ILimitesAporte | null = estado?.LimitesAporte ?? null

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
      gap="$3"
      padding="$4"
      borderRadius="$4"
      backgroundColor="$backgroundSurface"
      borderWidth={1}
      borderColor="$border"
    >
      <XStack gap="$2.5" alignItems="center">
        <PiggyBank size={18} color="#22C55E" />
        <Text fontSize={14} fontWeight="700" color="$text">
          Tu aporte
        </Text>
      </XStack>

      <AppInput
        label="Monto a aportar"
        value={aporte}
        onChangeText={(v: string) => {
          setAporte(soloDecimal(v))
          setErrorAporte('')
        }}
        keyboardType="decimal-pad"
        placeholder="0.00"
        error={errorAporte}
      />

      {!!limites && (
        <Text fontSize={12} color="$textMuted">
          Entre {fmtMoneda(limites.Minimo)} y {fmtMoneda(limites.Maximo)}
        </Text>
      )}

      {/* Lo que de verdad tiene que entender antes de aceptar: que este monto
          le sale del sueldo, y cada cuanto. */}
      <XStack gap="$2.5" alignItems="flex-start">
        <View marginTop={2}>
          <Info size={15} color="#F59E0B" />
        </View>
        <Text fontSize={13} color="$textMuted" flex={1} lineHeight={19}>
          Este monto se te va a deducir {cadaPago}, y se ahorra en tu cuenta de
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
  if (aprobada && solicitud) {
    return (
      <ScrollView
        flex={1}
        backgroundColor="$backgroundPage"
        contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <FichaDatos
          datos={solicitud}
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
              backgroundColor="rgba(34, 197, 94, 0.12)"
            >
              <BadgeCheck size={13} color="#22C55E" />
              <Text fontSize={12} fontWeight="600" color="$success">
                {/* Sin fecha = socio de antes de este modulo: se afilio fuera
                    del sistema y nadie registro cuando. Decir "Socio desde -"
                    seria peor que no decir la fecha. */}
                {solicitud.Resolution_Date
                  ? `Socio desde ${formatFecha(solicitud.Resolution_Date)}`
                  : 'Socio activo'}
              </Text>
            </XStack>
          }
        />
        
        {!!estadoCuenta && <EstadoCuentaCard datos={estadoCuenta} />}

        <Button
          backgroundColor="$primary"
          color="#FFFFFF"
          height={50}
          borderRadius="$4"
          fontWeight="600"
          fontSize={16}
          icon={<FilePlus2 size={20} color="#FFFFFF" />}
          pressStyle={{ opacity: 0.85 }}
          onPress={() => navigation.navigate('RequestCoo' as never)}
        >
          Ver mis solicitudes
        </Button>
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
      contentContainerStyle={{ padding: 16, paddingBottom: 32 + bottomPad, gap: 16 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Encabezado */}
      <YStack gap="$2" alignItems="center" paddingVertical="$3">
        <View
          width={64}
          height={64}
          borderRadius={32}
          backgroundColor={rechazada ? '$error' : '$primary'}
          alignItems="center"
          justifyContent="center"
        >
          {rechazada
            ? <XCircle size={30} color="#FFFFFF" />
            : pendiente
              ? <Clock size={30} color="#FFFFFF" />
              : <Handshake size={30} color="#FFFFFF" />}
        </View>

        <Text fontSize={20} fontWeight="700" color="$text" textAlign="center">
          {rechazada
            ? 'Solicitud rechazada'
            : pendiente
              ? 'Solicitud en revisión'
              : empleado
                ? 'Podés afiliarte'
                : 'Afiliación'}
        </Text>

        <Text fontSize={14} color="$textMuted" textAlign="center" lineHeight={20}>
          {rechazada
            ? 'Podés corregir lo que te indicaron y volver a enviarla.'
            : pendiente
              ? 'Estamos revisando tu solicitud. Te avisamos en cuanto se apruebe.'
              : empleado
                ? 'Revisá que tus datos estén correctos antes de continuar.'
                : 'Estado de tu afiliación a la cooperativa.'}
        </Text>
      </YStack>

      {solicitud ? (
        <>
          {/* Estado de la solicitud */}
          <YStack
            gap="$3"
            padding="$4"
            borderRadius="$4"
            backgroundColor="$backgroundSurface"
            borderWidth={1}
            borderColor="$border"
          >
            <XStack gap="$3" alignItems="center">
              {rechazada
                ? <XCircle size={20} color="#EF4444" />
                : <Clock size={20} color="#f59e0b" />}
              <YStack flex={1} gap="$1">
                <Text fontSize={15} fontWeight="700" color="$text">
                  {solicitud.Status_Name || solicitud.Status_Code}
                </Text>
                {!!solicitud.Status_Description && (
                  <Text fontSize={13} color="$textMuted" lineHeight={18}>
                    {solicitud.Status_Description}
                  </Text>
                )}
              </YStack>
            </XStack>

            <XStack gap="$2" alignItems="center">
              <CalendarDays size={14} color="#94A3B8" />
              <Text fontSize={13} color="$textMuted">
                Solicitada el {formatFecha(solicitud.Creation_Date)}
              </Text>
            </XStack>

            {/* Motivo del rechazo: es lo que tiene que corregir. */}
            {!!solicitud.Rejection_Reason && (
              <YStack
                gap="$2"
                padding="$3"
                borderRadius="$3"
                backgroundColor="$backgroundElevated"
                borderWidth={1}
                borderColor="$border"
              >
                <XStack gap="$2" alignItems="center">
                  <MessageSquare size={14} color="#94A3B8" />
                  <Text fontSize={12} fontWeight="600" color="$textMuted">
                    Motivo
                  </Text>
                </XStack>
                <Text fontSize={14} color="$text" lineHeight={20}>
                  {solicitud.Rejection_Reason}
                </Text>
              </YStack>
            )}
          </YStack>

          {/* Datos con los que quedó guardada */}
          <FichaDatos datos={solicitud} />

          {/* Rechazada: puede corregir y volver a mandarla. */}
          {puedeSolicitar && renderCampoAporte()}

          {puedeSolicitar && (
            <Button
              backgroundColor="$primary"
              color="#FFFFFF"
              height={50}
              borderRadius="$4"
              fontWeight="600"
              fontSize={16}
              disabled={enviando}
              icon={enviando ? <Spinner color="#FFFFFF" /> : <RotateCcw size={20} color="#FFFFFF" />}
              pressStyle={{ opacity: 0.85 }}
              onPress={solicitar}
            >
              {enviando ? 'Enviando...' : 'Volver a solicitar'}
            </Button>
          )}
        </>
      ) : empleado ? (
        <>
          <FichaDatos datos={empleado} />

          {renderCampoAporte()}

          <Button
            backgroundColor="$primary"
            color="#FFFFFF"
            height={50}
            borderRadius="$4"
            fontWeight="600"
            fontSize={16}
            disabled={enviando}
            icon={enviando ? <Spinner color="#FFFFFF" /> : <Handshake size={20} color="#FFFFFF" />}
            pressStyle={{ opacity: 0.85 }}
            onPress={solicitar}
          >
            {enviando ? 'Enviando...' : 'Quiero ser socio'}
          </Button>
        </>
      ) : (
        /* No aplica: se muestra el motivo que dio el procedimiento */
        <YStack
          gap="$3"
          padding="$4"
          borderRadius="$4"
          backgroundColor="$backgroundSurface"
          borderWidth={1}
          borderColor="$border"
          alignItems="center"
        >
          <AlertCircle size={28} color="#94A3B8" />
          <Text fontSize={15} color="$text" textAlign="center" lineHeight={21}>
            {estado?.Motivo || 'No se encontró información de afiliación.'}
          </Text>
          <Text fontSize={13} color="$textMuted" textAlign="center">
            Deslizá hacia abajo para volver a consultar.
          </Text>
        </YStack>
      )}
    </ScrollView>
    </KeyboardAvoidingView>
  )
}
