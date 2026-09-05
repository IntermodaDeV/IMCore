import React, { useCallback, useEffect, useState } from 'react'
import { KeyboardAvoidingView, Platform, RefreshControl } from 'react-native'
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native'
import { YStack, XStack, Text, ScrollView, View, Button, Spinner, styled } from 'tamagui'
import {
  ArrowLeft, Coins, CalendarDays, Clock, Tag, Wallet, Check, X,
  Percent, Users, Landmark,
} from 'lucide-react-native'

import { cooperativaService } from '../../api/modules/cooperativa/cooperativa.service'
import {
  ISolicitudPrestamo,
  IAprobadorSolicitud,
  ICadenaConfigurada,
  ITasaInteres,
  IPrestacionEmpleado,
  IEstadoCuenta,
  ESTADO_SOLICITUD,
} from '../../api/modules/cooperativa/cooperativa.types'
import AppInput from '../../components/commons/AppInput'
import ConfirmDialog from '../../components/commons/ConfirmDialog'
import SkeletonForm from '../../components/Skeletons/SkeletonForm'
import { usePageHeader } from '../../hooks/usePageHeader'
import { useKeyboardHeight } from '../../hooks/useKeyboardInset'
import { handleError } from '../../utils/errorHandler'
import { useShowToast } from '../../utils/useShowToast'
import { shadows } from '../../theme/shadows'
import {
  formatMonto,
  formatFechaHora,
  CADA_PAGO,
  Dato,
  FichaEmpleado,
  ResumenPrestaciones,
  CadenaFirmas,
} from './AprobacionPrestamosScreen'

/**
 * Detalle de una solicitud de préstamo, para resolverla.
 *
 * Reemplaza al diálogo de confirmación que hacía esto mismo apretado en un
 * modal. Con la tasa, las prestaciones, la cadena y los datos del empleado, ya
 * no cabía: quedaba un modal con scroll propio donde lo importante — el monto y
 * los botones — competía con todo lo demás.
 *
 * Acá cada cosa tiene su sección, en el orden de la decisión:
 *
 *   qué se pide  →  quién lo pide  →  con qué respaldo cuenta
 *                →  con qué tasa  →  quién lo revisa después
 *
 * Los botones van FIJOS abajo, fuera del scroll: se llega a ellos desde
 * cualquier punto de la pantalla sin tener que volver al final.
 *
 * Lo que se muestra depende del acceso de quien entra, y lo resuelve el
 * servidor: las tasas y las prestaciones vienen vacías para quien no puede
 * verlas, y esta pantalla simplemente no las pinta.
 */
const ArrowLeftStyled = styled(ArrowLeft, { color: '$text' })

type RutaParams = { detalleAprobacion: { solicitud: ISolicitudPrestamo } }

export default function DetalleAprobacionScreen() {
  const navigation = useNavigation<any>()
  const route = useRoute<RouteProp<RutaParams, 'detalleAprobacion'>>()

  // La solicitud llega entera desde el listado: ya la tiene cargada, con el
  // empleado incluido. Volver a pedirla sería un viaje para lo mismo.
  const s = route.params?.solicitud

  const { showToast } = useShowToast()
  const kbHeight = useKeyboardHeight()
  const bottomPad = Platform.OS === 'android' ? kbHeight : 0

  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [enviando, setEnviando] = useState(false)

  const [tasas, setTasas] = useState<ITasaInteres[]>([])
  const [tasaElegida, setTasaElegida] = useState<number | null>(null)
  const [prestaciones, setPrestaciones] = useState<IPrestacionEmpleado[]>([])
  const [cadena, setCadena] = useState<ICadenaConfigurada | null>(null)

  // Lo que ya tiene con la cooperativa. Va con el mismo acceso que las
  // prestaciones: las dos son la situación financiera de la persona, y quien
  // puede ver una puede ver la otra. Null = no tiene el acceso, o el socio no
  // tiene movimientos.
  const [estadoCuenta, setEstadoCuenta] = useState<IEstadoCuenta | null>(null)
  const [marcados, setMarcados] = useState<string[]>([])
  const [firmas, setFirmas] = useState<IAprobadorSolicitud[]>([])

  // Rechazar sí se queda en un diálogo: es una sola pregunta — el motivo — y
  // mandarla a otra pantalla sería un paso de más para algo que se decide acá.
  const [rechazando, setRechazando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [errorMotivo, setErrorMotivo] = useState('')

  const esPrimerNivel = !!s?.EsPrimerNivel

  usePageHeader({
    left: (
      <View onPress={() => navigation.goBack()} hitSlop={8} pressStyle={{ opacity: 0.6 }}>
        <ArrowLeftStyled size={22} />
      </View>
    ),
    center: (
      <Text fontSize={16} fontWeight="700" color="$text">
        Resolver solicitud
      </Text>
    ),
  })

  const consultar = useCallback(async () => {
    if (!s?.Id) return

    try {
      // Las cuatro en paralelo: son de fuentes distintas y ninguna depende de
      // la otra. En serie, abrir la pantalla costaría cuatro viajes seguidos.
      const [conf, tasasR, prestR, cuentaR, firmasR] = await Promise.all([
        esPrimerNivel
          ? cooperativaService.getCadenasConfiguradas([s.Id])
          : Promise.resolve(null),
        esPrimerNivel ? cooperativaService.getTasasInteres() : Promise.resolve(null),
        esPrimerNivel ? cooperativaService.getPrestaciones([s.Id]) : Promise.resolve(null),
        esPrimerNivel
          ? cooperativaService.getEstadoCuentaSolicitante(s.Id)
          : Promise.resolve(null),
        cooperativaService.getAprobacionesPrestamo(s.Id),
      ])

      const c = conf?.Success ? conf.Data?.find(x => x.Id === s.Id) ?? null : null
      setCadena(c)

      // Vienen marcados los configurados. Los inactivos NO: mandarle una
      // aprobación a una cuenta dada de baja trabaría la solicitud.
      setMarcados((c?.Aprobadores ?? []).filter(a => a.Activo).map(a => a.User_Code ?? ''))

      const listaTasas = tasasR?.Success ? tasasR.Data ?? [] : []
      setTasas(listaTasas)
      setTasaElegida(
        (listaTasas.find(t => t.TasaPrincipal) ?? listaTasas[0])?.TasaId ?? null,
      )

      setPrestaciones(prestR?.Success ? prestR.Data ?? [] : [])
      setEstadoCuenta(cuentaR?.Success ? cuentaR.Data ?? null : null)
      setFirmas(firmasR?.Success ? firmasR.Data ?? [] : [])
    } catch (err) {
      showToast('error', 'Error', handleError(err).message, 5000, 'top')
    }
    // showToast queda fuera: cambia de identidad en cada render y recargaría en
    // bucle.
  }, [s?.Id, esPrimerNivel])

  useEffect(() => {
    ;(async () => {
      setCargando(true)
      await consultar()
      setCargando(false)
    })()
  }, [consultar])

  /**
   * Al deslizar se vuelve a pedir todo.
   *
   * Hace falta acá y no solo en el listado: mientras se mira esta pantalla,
   * otro aprobador pudo firmar, o alguien pudo cambiar la configuración. Sin
   * esto habría que salir y volver a entrar para verlo.
   */
  const onRefresh = async () => {
    setRefrescando(true)
    await consultar()
    setRefrescando(false)
  }

  const marcar = (code: string) =>
    setMarcados(prev =>
      prev.includes(code) ? prev.filter(x => x !== code) : [...prev, code],
    )

  const resolver = async (accion: string) => {
    if (!s?.Id) return

    if (accion === ESTADO_SOLICITUD.RECHAZADO && !motivo.trim()) {
      setErrorMotivo('Escribí el motivo del rechazo')
      return
    }

    setEnviando(true)
    try {
      const response = await cooperativaService.resolverPrestamo({
        Ids: [s.Id],
        Accion: accion,
        Motivo: accion === ESTADO_SOLICITUD.RECHAZADO ? motivo.trim() : undefined,
        Cadenas:
          esPrimerNivel && accion === ESTADO_SOLICITUD.APROBADO
            ? [{ Id: s.Id, Aprobadores: marcados }]
            : undefined,
        TasaId:
          accion === ESTADO_SOLICITUD.APROBADO && tasas.length > 0 && tasaElegida
            ? tasaElegida
            : undefined,
      })

      if (!response?.Success) {
        showToast('error', 'Error', response?.ErrorMessage || 'No se pudo resolver', 6000, 'top')
        return
      }

      showToast('success', 'Listo', response.SuccessMessage || '', 5000, 'top')

      // De vuelta al listado, que se recarga solo al recuperar el foco.
      setRechazando(false)
      navigation.goBack()
    } catch (err) {
      showToast('error', 'Error', handleError(err).message, 5000, 'top')
    } finally {
      setEnviando(false)
    }
  }

  if (!s) {
    return (
      <YStack flex={1} backgroundColor="$backgroundPage" padding="$4" alignItems="center" gap="$3">
        <Text fontSize={15} color="$text" textAlign="center">
          No se recibió la solicitud.
        </Text>
        <Button height={42} borderRadius={10} onPress={() => navigation.goBack()}>
          <Text fontSize={14} fontWeight="700" color="$text">Volver</Text>
        </Button>
      </YStack>
    )
  }

  if (cargando) {
    return (
      <YStack flex={1} backgroundColor="$backgroundPage" padding="$4">
        <SkeletonForm />
      </YStack>
    )
  }

  const frecuencia = CADA_PAGO[(s.TipoPlanilla ?? '').toUpperCase()]

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <YStack flex={1} backgroundColor="$backgroundPage">
        <ScrollView
          flex={1}
          contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 12 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} />}
        >
          {/* ── Lo que se pide. Es la cabecera de todo: el monto grande y de
              quién es, que son las dos preguntas del primer vistazo. ────── */}
          <YStack
            gap="$3"
            padding="$4"
            borderRadius="$4"
            backgroundColor="$backgroundElevated"
            borderWidth={1}
            borderColor="$border"
            {...shadows.sm}
          >
            <XStack alignItems="flex-start" gap="$3">
              <YStack flex={1} gap="$1">
                <Text fontSize={13} color="$textMuted">
                  {s.Solicitante || s.User_Code || 'Socio'}
                </Text>
                <Text fontSize={26} fontWeight="700" color="$text">
                  {formatMonto(s.Monto)}
                </Text>
                <Text fontSize={11} color="$textMuted">
                  #{s.Id} · Código {s.COD_PERSONAL || '-'}
                  {frecuencia ? ` · planilla ${frecuencia}` : ''}
                </Text>
              </YStack>
            </XStack>

            <YStack gap="$2" paddingTop="$2.5" borderTopWidth={1} borderTopColor="$border">
              <XStack alignItems="center" gap="$1.5">
                <Coins size={12} color="#94A3B8" />
                <Text fontSize={10} fontWeight="700" color="$textMuted" letterSpacing={0.4}>
                  DATOS DEL PRÉSTAMO
                </Text>
              </XStack>

              <XStack gap="$2.5">
                <View flex={1}>
                  <Dato
                    icono={Tag}
                    etiqueta="Tipo"
                    valor={s.TipoSolicitudDesc || `Tipo ${s.TipoSolicitudId}`}
                  />
                </View>
                <View flex={1}>
                  <Dato
                    icono={CalendarDays}
                    etiqueta="Plazo"
                    valor={s.PlazoDesc || `Plazo ${s.PlazoId}`}
                  />
                </View>
                <View flex={1}>
                  <Dato
                    icono={Clock}
                    etiqueta="Solicitada"
                    valor={formatFechaHora(s.Creation_Date)}
                  />
                </View>
              </XStack>

              {/* Las deducciones solo si las lleva: un préstamo a secas no
                  descuenta de ningún salario extra, y dos ceros hacen pensar
                  que falta un dato. */}
              {(s.Deduccion13vo > 0 || s.Deduccion14vo > 0) && (
                <XStack gap="$2.5">
                  <View flex={1}>
                    {s.Deduccion13vo > 0 && (
                      <Dato icono={Coins} etiqueta="Del 13.º" valor={formatMonto(s.Deduccion13vo)} />
                    )}
                  </View>
                  <View flex={1}>
                    {s.Deduccion14vo > 0 && (
                      <Dato icono={Coins} etiqueta="Del 14.º" valor={formatMonto(s.Deduccion14vo)} />
                    )}
                  </View>
                  <View flex={1} />
                </XStack>
              )}

              {!!s.Descripcion && (
                <Dato icono={Wallet} etiqueta="Motivo" valor={s.Descripcion} />
              )}
            </YStack>

            {/* ── Quién lo pide ─────────────────────────────────────────── */}
            {!!s.Empleado && <FichaEmpleado info={s.Empleado} />}
          </YStack>

          {/* ── Con qué respaldo cuenta. Solo con el acceso 'VerPrestaciones';
              si no, la lista viene vacía y no se pinta nada. ───────────── */}
          {prestaciones.length > 0 && (
            <YStack
              padding="$4"
              borderRadius="$4"
              backgroundColor="$backgroundElevated"
              borderWidth={1}
              borderColor="$border"
              {...shadows.sm}
            >
              {/* Sin la línea de arriba: acá ya es la primera sección de su
                  propia tarjeta. */}
              <YStack marginTop={-12}>
                <ResumenPrestaciones filas={prestaciones} />
              </YStack>
            </YStack>
          )}

          {/* ── Lo que ya tiene con la cooperativa. Mismo acceso que las
              prestaciones: las dos son su situación financiera.

              Va junto a ellas y antes de la tasa porque las dos responden lo
              mismo — si el monto que pide tiene sentido — y se leen de corrido:
              con cuánto respaldo cuenta y cuánto ya debe. ───────────────── */}
          {!!estadoCuenta && (
            <YStack
              gap="$2.5"
              padding="$4"
              borderRadius="$4"
              backgroundColor="$backgroundElevated"
              borderWidth={1}
              borderColor="$border"
              {...shadows.sm}
            >
              <XStack alignItems="center" gap="$1.5">
                <Landmark size={12} color="#94A3B8" />
                <Text fontSize={10} fontWeight="700" color="$textMuted" letterSpacing={0.4}>
                  ESTADO DE CUENTA
                </Text>
              </XStack>

              {/* Tres columnas: concepto, lo que se le descuenta de cada pago,
                  y el saldo.

                  La CUOTA va en medio porque es la que decide si aguanta un
                  préstamo más: el saldo dice cuánto lleva y cuánto debe, la
                  cuota dice cuánto le sale de cada planilla. */}
              <XStack alignItems="center" gap="$2">
                <Text fontSize={10} fontWeight="700" color="$textMuted" flex={1} />
                <Text fontSize={10} color="$textMuted" width={95} textAlign="right">
                  CUOTA
                </Text>
                <Text fontSize={10} color="$textMuted" width={105} textAlign="right">
                  SALDO
                </Text>
              </XStack>

              <XStack alignItems="center" gap="$2">
                <XStack alignItems="center" gap="$2" flex={1}>
                  <Wallet size={13} color="#94A3B8" />
                  <Text fontSize={13} color="$text" numberOfLines={1}>
                    Ahorros ({estadoCuenta.TotalCuentas})
                  </Text>
                </XStack>
                <Text fontSize={13} color="$text" width={95} textAlign="right">
                  {formatMonto(estadoCuenta.CuotaAhorro)}
                </Text>
                <Text fontSize={13} fontWeight="600" color="$text" width={105} textAlign="right">
                  {formatMonto(estadoCuenta.SaldoCuentas)}
                </Text>
              </XStack>

              <XStack alignItems="center" gap="$2">
                <XStack alignItems="center" gap="$2" flex={1}>
                  <Coins size={13} color="#94A3B8" />
                  <Text fontSize={13} color="$text" numberOfLines={1}>
                    Préstamos ({estadoCuenta.TotalPrestamos})
                  </Text>
                </XStack>
                <Text fontSize={13} color="$text" width={95} textAlign="right">
                  {formatMonto(estadoCuenta.CuotaPrestamo)}
                </Text>
                <Text fontSize={13} fontWeight="600" color="$text" width={105} textAlign="right">
                  {formatMonto(estadoCuenta.SaldoPrestamos)}
                </Text>
              </XStack>

              {/* Lo que suman las dos cuotas: es lo que se le va de cada pago
                  ANTES del préstamo que está pidiendo. */}
              <XStack alignItems="center" gap="$2" paddingTop="$1">
                <Text fontSize={12} color="$textMuted" flex={1}>
                  Se le descuenta por período
                </Text>
                <Text fontSize={13} fontWeight="700" color="$text" width={95} textAlign="right">
                  {formatMonto(
                    (estadoCuenta.CuotaAhorro ?? 0) + (estadoCuenta.CuotaPrestamo ?? 0),
                  )}
                </Text>
                <View width={105} />
              </XStack>

              {/* El neto, destacado: es el número que resume los dos de arriba.
                  En rojo si debe más de lo que tiene — eso cambia la decisión. */}
              <XStack
                alignItems="center"
                gap="$2"
                padding="$2.5"
                borderRadius={10}
                backgroundColor="$backgroundSurface"
                borderWidth={1}
                borderColor="$border"
              >
                <Text fontSize={12} color="$textMuted" flex={1}>
                  Saldo neto
                </Text>
                <Text
                  fontSize={16}
                  fontWeight="700"
                  color={(estadoCuenta.SaldoNeto ?? 0) < 0 ? '$error' : '$text'}
                >
                  {formatMonto(estadoCuenta.SaldoNeto)}
                </Text>
              </XStack>
            </YStack>
          )}

          {/* ── Con qué tasa. Solo con el acceso 'ElegirTasaInteres'. ───── */}
          {esPrimerNivel && tasas.length > 0 && (
            <YStack
              gap="$2.5"
              padding="$4"
              borderRadius="$4"
              backgroundColor="$backgroundElevated"
              borderWidth={1}
              borderColor="$border"
              {...shadows.sm}
            >
              <XStack alignItems="center" gap="$1.5">
                <Percent size={12} color="#94A3B8" />
                <Text fontSize={10} fontWeight="700" color="$textMuted" letterSpacing={0.4}>
                  TASA DE INTERÉS
                </Text>
              </XStack>

              <XStack gap="$2" flexWrap="wrap">
                {tasas.map(t => {
                  const activa = tasaElegida === t.TasaId

                  return (
                    <XStack
                      key={t.TasaId}
                      alignItems="center"
                      gap="$2"
                      paddingVertical="$2.5"
                      paddingHorizontal="$3.5"
                      borderRadius={10}
                      borderWidth={1}
                      borderColor={activa ? '$primary' : '$border'}
                      backgroundColor={activa ? '$primaryOpacity2' : '$backgroundSurface'}
                      pressStyle={{ opacity: 0.7 }}
                      onPress={() => setTasaElegida(t.TasaId)}
                    >
                      <Text fontSize={16} fontWeight={activa ? '700' : '400'} color="$text">
                        {t.Porcentaje}%
                      </Text>
                      {/* Se dice cuál es la principal: es la que aplica si no
                          se toca nada. */}
                      {t.TasaPrincipal && (
                        <Text fontSize={10} color="$textMuted">principal</Text>
                      )}
                    </XStack>
                  )
                })}
              </XStack>
            </YStack>
          )}

          {/* ── Quién lo revisa después. Solo el primer aprobador arma la
              cadena; al asignado no le corresponde verla. ──────────────── */}
          {esPrimerNivel && s.Status_Code === ESTADO_SOLICITUD.PENDIENTE && (
            <YStack
              gap="$2.5"
              padding="$4"
              borderRadius="$4"
              backgroundColor="$backgroundElevated"
              borderWidth={1}
              borderColor="$border"
              {...shadows.sm}
            >
              <XStack alignItems="center" gap="$1.5">
                <Users size={12} color="#94A3B8" />
                <Text fontSize={10} fontWeight="700" color="$textMuted" letterSpacing={0.4} flex={1}>
                  QUIÉNES LA VAN A FIRMAR
                </Text>
                <Text fontSize={11} color="$textMuted">{marcados.length}</Text>
              </XStack>

              {(cadena?.Aprobadores ?? []).length === 0 ? (
                <Text
                  fontSize={12}
                  color={cadena?.Configurado ? '$textMuted' : '$warning'}
                  lineHeight={17}
                >
                  {cadena?.Aviso || 'Sin aprobadores: al aprobar queda lista.'}
                </Text>
              ) : (
                <>
                  <XStack alignItems="center" gap="$2" flexWrap="wrap">
                    {!!cadena?.Tipo && (
                      <XStack
                        paddingVertical="$1"
                        paddingHorizontal="$2"
                        borderRadius={6}
                        backgroundColor="$backgroundSurface"
                        borderWidth={1}
                        borderColor="$border"
                      >
                        <Text fontSize={11} color="$textMuted">
                          {cadena.NombrePlanilla} · {cadena.Tipo}
                        </Text>
                      </XStack>
                    )}
                    {!!cadena?.Configurado && cadena.AprobacionesMinimas > 0 && marcados.length > 0 && (
                      <Text fontSize={11} color="$textMuted">
                        cierra con {cadena.AprobacionesMinimas}{' '}
                        {cadena.AprobacionesMinimas === 1 ? 'firma' : 'firmas'}
                      </Text>
                    )}
                  </XStack>

                  <Text fontSize={12} color="$textMuted" lineHeight={17}>
                    Vienen marcados los configurados. Toque para desmarcar a quien no
                    deba firmar; si no queda nadie, la solicitud se aprueba de una vez.
                  </Text>

                  <YStack gap="$2">
                    {(cadena?.Aprobadores ?? []).map(a => {
                      const code = a.User_Code ?? ''
                      const marcado = marcados.includes(code)

                      return (
                        <XStack
                          key={code}
                          alignItems="center"
                          gap="$3"
                          height={50}
                          paddingHorizontal="$3"
                          borderRadius={10}
                          borderWidth={1}
                          borderColor={marcado ? '$primary' : '$border'}
                          backgroundColor={marcado ? '$primaryOpacity2' : '$backgroundSurface'}
                          pressStyle={{ opacity: 0.7 }}
                          onPress={() => marcar(code)}
                        >
                          <View
                            width={24}
                            height={24}
                            borderRadius={6}
                            borderWidth={2}
                            borderColor={marcado ? '$primary' : '$border'}
                            backgroundColor={marcado ? '$primary' : 'transparent'}
                            alignItems="center"
                            justifyContent="center"
                          >
                            {marcado && <Check size={15} color="white" strokeWidth={3} />}
                          </View>

                          <YStack flex={1} gap="$0.5">
                            <Text
                              fontSize={14}
                              fontWeight={marcado ? '600' : '400'}
                              color={a.Activo ? '$text' : '$warning'}
                              numberOfLines={1}
                            >
                              {a.Nombre || code}
                            </Text>
                            <Text fontSize={11} color="$textMuted" numberOfLines={1}>
                              {a.Activo ? code : `${code} · cuenta inactiva`}
                            </Text>
                          </YStack>
                        </XStack>
                      )
                    })}
                  </YStack>
                </>
              )}
            </YStack>
          )}

          {/* ── Lo que ya pasó con la cadena. Para una que sigue en curso: el
              primer aprobador ya firmó y acá ve quién falta. ───────────── */}
          {esPrimerNivel && s.Status_Code !== ESTADO_SOLICITUD.PENDIENTE && firmas.length > 0 && (
            <YStack
              padding="$4"
              borderRadius="$4"
              backgroundColor="$backgroundElevated"
              borderWidth={1}
              borderColor="$border"
              {...shadows.sm}
            >
              <YStack marginTop={-12}>
                <CadenaFirmas filas={firmas} puedeEditar={false} onEditar={() => {}} />
              </YStack>
            </YStack>
          )}
        </ScrollView>

        {/* ── Los botones, FIJOS abajo y fuera del scroll: se llega a ellos
            desde cualquier punto sin volver al final de la pantalla. ───── */}
        {s.PuedeResolver && (
          <XStack
            gap="$3"
            paddingHorizontal="$4"
            paddingTop="$3"
            paddingBottom={16 + bottomPad}
            borderTopWidth={1}
            borderTopColor="$border"
            backgroundColor="$backgroundElevated"
          >
            <Button
              flex={1}
              height={46}
              borderRadius={12}
              backgroundColor="$backgroundSurface"
              borderWidth={1}
              borderColor="$border"
              disabled={enviando}
              pressStyle={{ opacity: 0.7 }}
              onPress={() => {
                setMotivo('')
                setErrorMotivo('')
                setRechazando(true)
              }}
            >
              <XStack alignItems="center" gap="$1.5">
                <X size={17} color="#EF4444" />
                <Text fontSize={14} fontWeight="700" color="$error">Rechazar</Text>
              </XStack>
            </Button>

            <Button
              flex={1}
              height={46}
              borderRadius={12}
              backgroundColor="$success"
              disabled={enviando}
              pressStyle={{ opacity: 0.85 }}
              onPress={() => resolver(ESTADO_SOLICITUD.APROBADO)}
            >
              <XStack alignItems="center" gap="$1.5">
                {enviando
                  ? <Spinner size="small" color="white" />
                  : <Check size={17} color="white" />}
                <Text fontSize={14} fontWeight="700" color="white">
                  {/* El botón dice lo que va a pasar. */}
                  {esPrimerNivel && marcados.length > 0 ? 'Aprobar y enviar' : 'Aprobar'}
                </Text>
              </XStack>
            </Button>
          </XStack>
        )}
      </YStack>

      {/* Rechazar: una sola pregunta, y por eso se queda en diálogo. */}
      <ConfirmDialog
        open={rechazando}
        onOpenChange={abierto => { if (!abierto) setRechazando(false) }}
        title="Rechazar solicitud"
        message="La solicitud se cierra y no sigue a la cooperativa."
        confirmLabel="Rechazar"
        confirmColor="#EF4444"
        loading={enviando}
        onConfirm={() => resolver(ESTADO_SOLICITUD.RECHAZADO)}
        onCancel={() => setRechazando(false)}
        extra={
          <AppInput
            label="Motivo"
            value={motivo}
            onChangeText={(v: string) => {
              setMotivo(v)
              if (errorMotivo) setErrorMotivo('')
            }}
            placeholder="Por qué se rechaza"
            multiline
            error={errorMotivo || undefined}
            statusMessage={errorMotivo ? undefined : 'Se le muestra al solicitante.'}
          />
        }
      />
    </KeyboardAvoidingView>
  )
}
