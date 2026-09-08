import React, { useCallback, useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView as RNScrollView, Keyboard } from 'react-native'
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native'
import { YStack, XStack, Text, Button, View, Spinner, styled } from 'tamagui'
import { Info, ArrowLeft, RefreshCcw, CalendarDays, Wallet } from 'lucide-react-native'
import AppInput from '../../components/commons/AppInput'
import EstadoCuentaCard from '../../components/commons/EstadoCuentaCard'
import AppSelect from '../../components/commons/AppSelect'
import { cooperativaService } from '../../api/modules/cooperativa/cooperativa.service'
import { ICatalogosSolicitud, IEstadoCuenta } from '../../api/modules/cooperativa/cooperativa.types'
import { shadows } from '../../theme/shadows'
import { usePageHeader } from '../../hooks/usePageHeader'
import { useKeyboardHeight } from '../../hooks/useKeyboardInset'
import { handleError } from '../../utils/errorHandler'
import { useShowToast } from '../../utils/useShowToast'
import SkeletonForm from '../../components/Skeletons/SkeletonForm'

/**
 * Nueva solicitud a la cooperativa.
 *
 * Pantalla propia y no un modal: es el mismo patrón que Gastos de Viaje
 * (botón en el header -> pantalla de formulario), y con seis campos un
 * formulario a pantalla completa se lee mejor que una hoja.
 *
 * La solicitud nace en Estado 3 (Pendiente); el estado lo fija el servidor.
 */

// El header cae al boton del drawer cuando no se le pasa `left`. Acá es una
// pantalla hija a la que se llega desde el listado, así que corresponde volver.
const ArrowLeftStyled = styled(ArrowLeft, { color: '$text' })

/**
 * Tipos de solicitud, tal como están en Cooperativa.dbo.TipoSolicitud.
 *
 * Van por Id y no por descripción porque la descripción es texto que alguien
 * puede corregir ("prestamo" -> "Préstamo") sin saber que hay una pantalla
 * leyéndola. El Id es la llave y no cambia.
 */
const TIPO_ADELANTO_13 = 1
const TIPO_ANTICIPO_14 = 2
const TIPO_PRESTAMO_13_14 = 4

/**
 * Qué deducciones aplican según el tipo.
 *
 *   1 Adelanto 13vo          -> solo la del 13.º
 *   2 Anticipo 14vo          -> solo la del 14.º
 *   3 prestamo               -> ninguna
 *   4 prestamo + 13vo 14vo   -> las dos
 *
 * Un tipo que no esté en la lista no muestra ninguna deducción: si mañana
 * agregan uno nuevo al catálogo, el formulario sigue funcionando y a lo sumo
 * falta un campo, en vez de mandar un descuento que nadie definió.
 */
const deduccionesDelTipo = (tipoSolicitudId: number | null | undefined) => ({
  trece: tipoSolicitudId === TIPO_ADELANTO_13 || tipoSolicitudId === TIPO_PRESTAMO_13_14,
  catorce: tipoSolicitudId === TIPO_ANTICIPO_14 || tipoSolicitudId === TIPO_PRESTAMO_13_14,
})

/** Solo dígitos y un punto decimal, para que el monto no llegue con basura. */
const soloDecimal = (v: string): string => {
  const limpio = v.replace(/[^0-9.]/g, '')
  const partes = limpio.split('.')
  return partes.length <= 2 ? limpio : `${partes[0]}.${partes.slice(1).join('')}`
}

/**
 * Parametros de la ruta.
 *
 * Sin `id` la pantalla crea; con `id` edita esa solicitud. Es la misma pantalla
 * a proposito: los campos y las validaciones son identicos, y tener dos copias
 * garantizaria que se desalineen.
 */
type RutaParams = {
  nuevaSolicitudCoo?: { id?: number; refinanciaPrestamoId?: number }
}

/** Monto en lempiras. Cooperativa maneja HNL. */
const formatMonto = (valor: number | null | undefined): string => {
  if (valor == null) return '-'
  return `L ${Number(valor).toLocaleString('es-HN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

const formatFecha = (valor: string | null): string => {
  if (!valor) return '-'
  const fecha = new Date(valor)
  if (isNaN(fecha.getTime())) return '-'
  return fecha.toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** "1 año 3 meses" a partir de meses corridos. */
const formatAntiguedad = (meses: number | null | undefined): string => {
  if (meses == null || meses < 0) return '-'
  if (meses === 0) return 'menos de un mes'
  const años = Math.floor(meses / 12)
  const resto = meses % 12
  const partes: string[] = []
  if (años > 0) partes.push(`${años} ${años === 1 ? 'año' : 'años'}`)
  if (resto > 0) partes.push(`${resto} ${resto === 1 ? 'mes' : 'meses'}`)
  return partes.join(' ')
}

/**
 * El préstamo que se está refinanciando.
 *
 * Se arma de dos fuentes distintas según de dónde se venga — del histórico
 * (préstamo vivo) o de una solicitud de refinanciamiento que se está editando
 * (la foto que se guardó) — y por eso es un tipo propio: de ahí para abajo la
 * pantalla no necesita saber cuál de las dos fue.
 */
type Refinanciamiento = {
  prestamoId: number
  /** Lo que arrastra el préstamo nuevo. */
  saldo: number
  montoAnterior: number | null
  fecha: string | null
  cuotasPagadas: number | null
  cuotasTotal: number | null
  meses: number | null
}

export default function NuevaSolicitudScreen() {
  const navigation = useNavigation()
  const route = useRoute<RouteProp<RutaParams, 'nuevaSolicitudCoo'>>()
  const { showToast } = useShowToast()

  // Id de la solicitud que se esta editando, si se llego a editar.
  const editandoId = route.params?.id ?? null
  const editando = !!editandoId

  // El préstamo a refinanciar, cuando se llega desde el botón "Refinanciar".
  const refiPrestamoId = route.params?.refinanciaPrestamoId ?? null

  const [catalogos, setCatalogos] = useState<ICatalogosSolicitud | null>(null)
  const [cargando, setCargando] = useState(true)
  const [enviando, setEnviando] = useState(false)

  const [tipoId, setTipoId] = useState<number | null>(null)
  const [plazoId, setPlazoId] = useState<number | null>(null)
  const [monto, setMonto] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [ded13, setDed13] = useState('')
  const [ded14, setDed14] = useState('')
  const [errores, setErrores] = useState<Record<string, string>>({})

  const [estadoCuenta, setEstadoCuenta] = useState<IEstadoCuenta | null>(null)

  // El préstamo que se refinancia, venga de donde venga. null = solicitud
  // normal.
  const [refi, setRefi] = useState<Refinanciamiento | null>(null)

  // En Android con edge-to-edge, adjustResize no achica la ventana, así que el
  // KeyboardAvoidingView por sí solo no alcanza: se reserva el alto del teclado
  // como padding para poder scrollear el contenido por encima de él.
  const kbHeight = useKeyboardHeight()
  const bottomPad = Platform.OS === 'android' ? kbHeight : 0

  usePageHeader({
    center: (
      <Text fontSize={16} fontWeight="700" color="$text">
        {refiPrestamoId || refi
          ? 'Refinanciar préstamo'
          : editando ? 'Editar solicitud' : 'Nueva solicitud'}
      </Text>
    ),
    left: (
      <View onPress={() => navigation.goBack()} pressStyle={{ opacity: 0.6 }} hitSlop={10}>
        <ArrowLeftStyled />
      </View>
    ),
  })

  const cargarCatalogos = useCallback(async () => {
    setCargando(true)
    try {
      const response = await cooperativaService.getCatalogosSolicitud()

      if (response?.Success && response.Data) {
        setCatalogos(response.Data)
      } else {
        showToast('error', 'Error', response?.ErrorMessage || 'No se pudieron cargar los catálogos', 5000, 'top')
      }
      try {
        const cuenta = await cooperativaService.getEstadoCuenta()
        if (cuenta?.Success && cuenta.Data) setEstadoCuenta(cuenta.Data)
      } catch {
        setEstadoCuenta(null)
      }

      // El préstamo a refinanciar, cuando se llegó desde "Refinanciar". Sale
      // del histórico y no de un endpoint propio: esa lista ya viene filtrada
      // por el código de planilla del token, así que solo puede traer los
      // suyos.
      if (refiPrestamoId) {
        try {
          const todos = await cooperativaService.getPrestamosCliente()
          const p = (todos?.Data ?? []).find(x => x.PrestamoId === refiPrestamoId)

          if (p) {
            setRefi({
              prestamoId: p.PrestamoId,
              saldo: p.SaldoPendiente ?? 0,
              montoAnterior: p.Monto,
              fecha: p.FechaPrestamo,
              cuotasPagadas: p.CuotasPagadas,
              cuotasTotal: p.CuotasTotal,
              // Meses corridos desde que se lo dieron hasta hoy. Al guardarse
              // la solicitud, el servidor congela este mismo cálculo.
              meses: p.FechaPrestamo
                ? Math.max(
                  0,
                  Math.round(
                    (Date.now() - new Date(p.FechaPrestamo).getTime())
                    / (1000 * 60 * 60 * 24 * 30.44),
                  ),
                )
                : null,
            })
          } else {
            showToast(
              'error',
              'Error',
              'No se encontró el préstamo que querés refinanciar.',
              5000,
              'top',
            )
          }
        } catch (err) {
          showToast('error', 'Error', handleError(err).message, 5000, 'top')
        }
      }

      // Al editar, los campos se llenan con lo que ya se pidió. Va DESPUÉS de
      // los catálogos: los Select necesitan sus opciones cargadas para poder
      // mostrar el valor elegido.
      if (editandoId) {
        try {
          const previa = await cooperativaService.getSolicitudPrestamo(editandoId)

          if (previa?.Success && previa.Data) {
            const d = previa.Data
            setTipoId(d.TipoSolicitudId)
            setPlazoId(d.PlazoId)
            setDescripcion(d.Descripcion ?? '')
            setDed13(d.Deduccion13vo ? String(d.Deduccion13vo) : '')
            setDed14(d.Deduccion14vo ? String(d.Deduccion14vo) : '')

            if (d.EsRefinanciamiento) {
              // La FOTO guardada, no el saldo de hoy: es la que se pidió y la
              // que se está aprobando. Consultar el saldo vigente cambiaría el
              // monto de una solicitud que ya está en la cadena.
              setRefi({
                prestamoId: d.PrestamoAnteriorId ?? 0,
                saldo: d.SaldoAnterior ?? 0,
                montoAnterior: d.PrestamoAnteriorMonto,
                fecha: d.PrestamoAnteriorFecha,
                cuotasPagadas: d.PrestamoAnteriorCuotasPagadas,
                cuotasTotal: d.PrestamoAnteriorCuotasTotal,
                meses: d.PrestamoAnteriorMeses,
              })
              // El campo del monto es el ADICIONAL, no el total.
              setMonto(d.MontoAdicional != null ? String(d.MontoAdicional) : '')
            } else {
              setMonto(d.Monto != null ? String(d.Monto) : '')
            }
          } else {
            showToast(
              'error',
              'Error',
              previa?.ErrorMessage || 'No se pudo cargar la solicitud',
              5000,
              'top',
            )
          }
        } catch (err) {
          showToast('error', 'Error', handleError(err).message, 5000, 'top')
        }
      }
    } catch (err) {
      showToast('error', 'Error', handleError(err).message, 5000, 'top')
    } finally {
      setCargando(false)
    }
    // showToast se deja fuera de las dependencias: cambia de identidad en cada
    // render y recargaria los catalogos en bucle.
  }, [editandoId, refiPrestamoId])

  useFocusEffect(
    useCallback(() => {
      cargarCatalogos()
    }, [cargarCatalogos]),
  )

  // En un refinanciamiento el campo del monto es el ADICIONAL: lo que pide
  // encima del saldo que arrastra. El total es la suma, y es lo que se pide
  // realmente.
  const adicional = refi ? (monto.trim() === '' ? 0 : Number(monto)) : 0
  const totalRefi = refi ? refi.saldo + (isNaN(adicional) ? 0 : adicional) : 0

  const validar = (): boolean => {
    const e: Record<string, string> = {}

    if (!tipoId) e.tipo = 'Elegí el tipo de solicitud'
    if (!plazoId) e.plazo = 'Elegí el plazo'

    // Se pide el motivo. Es lo que lee quien aprueba para decidir.
    if (!descripcion.trim()) e.descripcion = 'Contá para qué necesitás el préstamo'

    if (refi) {
      // Vacío vale y es cero: refinanciar solo para estirar el plazo — bajar
      // la cuota alargando los pagos — es un caso real. Lo que no se acepta es
      // un número imposible.
      if (monto.trim() !== '' && (isNaN(adicional) || adicional < 0)) {
        e.monto = 'Escribí un monto válido, o dejalo vacío para no pedir de más'
      }
      if (refi.saldo <= 0) {
        e.monto = 'Ese préstamo no tiene saldo pendiente: no hay nada que refinanciar'
      }
    } else {
      const montoNum = Number(monto)
      if (!monto.trim() || isNaN(montoNum) || montoNum <= 0) {
        e.monto = 'Escribí un monto mayor que cero'
      }
    }

    setErrores(e)
    return Object.keys(e).length === 0
  }

  const enviar = async () => {
    Keyboard.dismiss()
    if (!validar()) return

    setEnviando(true)
    try {
      // Los mismos campos en los dos casos; lo unico que cambia es a donde
      // van y si llevan el Id.
      const campos = {
        TipoSolicitudId: tipoId!,
        PlazoId: plazoId!,
        // En un refinanciamiento el servidor RECALCULA el total con el saldo
        // que él mismo consulta, así que este valor es informativo. Se manda
        // igual para que un error de cuentas se note al compararlo.
        Monto: refi ? totalRefi : Number(monto),
        Descripcion: descripcion.trim() || undefined,
        Deduccion13vo: aplicaTrece && ded13.trim() ? Number(ded13) : undefined,
        Deduccion14vo: aplicaCatorce && ded14.trim() ? Number(ded14) : undefined,
        // Solo el Id y el adicional: el saldo lo resuelve el servidor.
        ...(refi ? { RefinanciaPrestamoId: refi.prestamoId, MontoAdicional: adicional } : {}),
      }

      const response = editandoId
        ? await cooperativaService.editarSolicitud({ Id: editandoId, ...campos })
        : await cooperativaService.crearSolicitud(campos)

      if (!response?.Success) {
        showToast(
          'error',
          'Error',
          response?.ErrorMessage
            || (editando ? 'No se pudo editar la solicitud' : 'No se pudo crear la solicitud'),
          5000,
          'top',
        )
        return
      }

      showToast(
        'success',
        editando ? 'Solicitud actualizada' : 'Solicitud enviada',
        response.SuccessMessage || '',
        4000,
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

  // Deducciones que aplican al tipo elegido. Se recalcula en cada render, así
  // no hay un estado más que mantener sincronizado.
  const { trece: aplicaTrece, catorce: aplicaCatorce } = deduccionesDelTipo(tipoId)

  const opcionesTipo = (catalogos?.Tipos ?? []).map(t => ({
    label: t.Descripcion ?? `Tipo ${t.TipoSolicitudId}`,
    value: String(t.TipoSolicitudId),
  }))

  const opcionesPlazo = (catalogos?.Plazos ?? []).map(p => ({
    label: p.Descripcion ?? `${p.PlazoMes ?? '?'} meses`,
    value: String(p.PlazoId),
  }))

  if (cargando) {
    return (
      <YStack flex={1} backgroundColor="$backgroundPage" padding="$4">
        <SkeletonForm />
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
          contentContainerStyle={{ padding: 16, paddingBottom: 40 + bottomPad }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <YStack gap="$4">

            {/* ── El préstamo que se refinancia ───────────────────────────
                Va antes que todo: cambia el significado de lo que se llena
                abajo — el campo del monto deja de ser "cuánto pido" y pasa a
                ser "cuánto pido DE MÁS". */}
            {!!refi && (
              <YStack
                gap="$3"
                padding="$4"
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

                <Text fontSize={13} color="$textMuted" lineHeight={19}>
                  Su préstamo actual se cancela y se abre uno nuevo con lo que
                  todavía debe, más lo que pida de más.
                </Text>

                <YStack
                  gap="$2"
                  padding="$3"
                  borderRadius="$3"
                  backgroundColor="$backgroundSurface"
                  borderWidth={1}
                  borderColor="$border"
                >
                  <XStack alignItems="center" gap="$2">
                    <Wallet size={13} color="#94A3B8" />
                    <Text fontSize={13} color="$textMuted" flex={1}>Debe actualmente</Text>
                    <Text fontSize={15} fontWeight="700" color="$text">
                      {formatMonto(refi.saldo)}
                    </Text>
                  </XStack>

                  {refi.montoAnterior != null && (
                    <XStack alignItems="center" gap="$2">
                      <CalendarDays size={13} color="#94A3B8" />
                      <Text fontSize={13} color="$textMuted" flex={1}>
                        Préstamo del {formatFecha(refi.fecha)}
                      </Text>
                      <Text fontSize={13} color="$text" fontWeight="600">
                        {formatMonto(refi.montoAnterior)}
                      </Text>
                    </XStack>
                  )}

                  {/* Cuánto lleva con él. Es lo que quien aprueba va a mirar,
                      y conviene que el socio vea lo mismo antes de pedir. */}
                  <Text fontSize={12} color="$textMuted">
                    Lleva {formatAntiguedad(refi.meses)}
                    {refi.cuotasTotal
                      ? ` · ${refi.cuotasPagadas ?? 0} de ${refi.cuotasTotal} cuotas pagadas`
                      : ''}
                  </Text>
                </YStack>
              </YStack>
            )}

            {/* Antes del formulario: es lo que se mira para decidir cuánto
                pedir. Arranca cerrado, acá es contexto y no el objetivo. */}
            {!!estadoCuenta && <EstadoCuentaCard datos={estadoCuenta} />}

            <AppSelect
              label="Tipo de solicitud"
              value={tipoId ?? undefined}
              onValueChange={v => {
                const nuevo = Number(v)
                setTipoId(nuevo)
                setErrores(p => ({ ...p, tipo: '' }))

                // El campo se oculta, pero el valor escrito seguiría en el
                // estado y se mandaría igual. Se limpia lo que deja de aplicar.
                const aplica = deduccionesDelTipo(nuevo)
                if (!aplica.trece) setDed13('')
                if (!aplica.catorce) setDed14('')
              }}
              options={opcionesTipo}
              error={errores.tipo}
            />

            <AppSelect
              label="Plazo"
              value={plazoId ?? undefined}
              onValueChange={v => { setPlazoId(Number(v)); setErrores(p => ({ ...p, plazo: '' })) }}
              options={opcionesPlazo}
              error={errores.plazo}
            />

            <AppInput
              label={refi ? 'Cuánto quiere de más' : 'Monto'}
              value={monto}
              onChangeText={(v: string) => { setMonto(soloDecimal(v)); setErrores(p => ({ ...p, monto: '' })) }}
              keyboardType="decimal-pad"
              placeholder="0.00"
              error={errores.monto}
            />

            {/* La suma, a la vista mientras escribe. Es LO QUE VA A DEBER: sin
                esto tendría que sumarlo de cabeza, y el número que importa —
                el del préstamo nuevo — no aparecería en ninguna parte hasta
                después de mandar la solicitud. */}
            {!!refi && (
              <YStack
                gap="$2"
                padding="$3"
                borderRadius="$3"
                backgroundColor="$backgroundSurface"
                borderWidth={1}
                borderColor="$border"
              >
                <XStack alignItems="center" gap="$2">
                  <Text fontSize={13} color="$textMuted" flex={1}>Lo que ya debe</Text>
                  <Text fontSize={13} color="$text">{formatMonto(refi.saldo)}</Text>
                </XStack>
                <XStack alignItems="center" gap="$2">
                  <Text fontSize={13} color="$textMuted" flex={1}>Lo que pide de más</Text>
                  <Text fontSize={13} color="$text">
                    {formatMonto(isNaN(adicional) ? 0 : adicional)}
                  </Text>
                </XStack>
                <XStack
                  alignItems="center"
                  gap="$2"
                  paddingTop="$2"
                  borderTopWidth={1}
                  borderTopColor="$border"
                >
                  <Text fontSize={14} fontWeight="700" color="$text" flex={1}>
                    Nuevo préstamo
                  </Text>
                  <Text fontSize={18} fontWeight="700" color="$primary">
                    {formatMonto(totalRefi)}
                  </Text>
                </XStack>
              </YStack>
            )}

            {/* Obligatoria. Es lo único de la solicitud que dice PARA QUÉ, y
                quien aprueba decide con eso: un monto y un plazo solos no
                distinguen un préstamo para una emergencia médica de uno para
                un antojo.

                La exigencia vive solo acá: el servidor la sigue aceptando
                vacía, así que las solicitudes viejas sin descripción se
                muestran y se editan igual. */}
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

            {/* Las deducciones dependen del tipo: un adelanto del 13.º no
                tiene nada que descontar del 14.º. Con "Prestamo" a secas no
                sale ninguna y el bloque entero desaparece. */}
            {(aplicaTrece || aplicaCatorce) && (
              <XStack gap="$3">
                {aplicaTrece && (
                  <View flex={1}>
                    <AppInput
                      label="Deducción 13.º"
                      value={ded13}
                      onChangeText={(v: string) => setDed13(soloDecimal(v))}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                    />
                  </View>
                )}
                {aplicaCatorce && (
                  <View flex={1}>
                    <AppInput
                      label="Deducción 14.º"
                      value={ded14}
                      onChangeText={(v: string) => setDed14(soloDecimal(v))}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                    />
                  </View>
                )}
              </XStack>
            )}

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
                {refi
                  ? 'El refinanciamiento pasa por la misma aprobación que un préstamo nuevo. Su préstamo actual sigue vigente hasta que se apruebe.'
                  : 'Tu solicitud queda pendiente hasta que la cooperativa la revise.'}
              </Text>
            </XStack>

            <XStack gap="$2" marginTop="$2">
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

              <Button
                flex={1}
                height={48}
                borderRadius={12}
                backgroundColor="$primary"
                pressStyle={{ opacity: 0.8 }}
                disabled={enviando}
                icon={enviando ? <Spinner color="#FFFFFF" /> : undefined}
                onPress={enviar}
              >
                <Text color="white" fontWeight="700">
                  {enviando
                    ? 'Guardando...'
                    : editando
                      ? 'Guardar cambios'
                      : refi
                        ? 'Enviar refinanciamiento'
                        : 'Enviar solicitud'}
                </Text>
              </Button>
            </XStack>
          </YStack>
        </RNScrollView>
      </YStack>
    </KeyboardAvoidingView>
  )
}
