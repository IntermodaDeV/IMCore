import React, { useCallback, useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView as RNScrollView, Keyboard } from 'react-native'
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native'
import { YStack, XStack, Text, Button, View, Spinner, styled } from 'tamagui'
import { Info, ArrowLeft } from 'lucide-react-native'
import AppInput from '../../components/commons/AppInput'
import EstadoCuentaCard from '../../components/commons/EstadoCuentaCard'
import AppSelect from '../../components/commons/AppSelect'
import { cooperativaService } from '../../api/modules/cooperativa/cooperativa.service'
import { ICatalogosSolicitud, IEstadoCuenta } from '../../api/modules/cooperativa/cooperativa.types'
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
type RutaParams = { nuevaSolicitudCoo?: { id?: number } }

export default function NuevaSolicitudScreen() {
  const navigation = useNavigation()
  const route = useRoute<RouteProp<RutaParams, 'nuevaSolicitudCoo'>>()
  const { showToast } = useShowToast()

  // Id de la solicitud que se esta editando, si se llego a editar.
  const editandoId = route.params?.id ?? null
  const editando = !!editandoId

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

  // En Android con edge-to-edge, adjustResize no achica la ventana, así que el
  // KeyboardAvoidingView por sí solo no alcanza: se reserva el alto del teclado
  // como padding para poder scrollear el contenido por encima de él.
  const kbHeight = useKeyboardHeight()
  const bottomPad = Platform.OS === 'android' ? kbHeight : 0

  usePageHeader({
    center: (
      <Text fontSize={16} fontWeight="700" color="$text">
        {editando ? 'Editar solicitud' : 'Nueva solicitud'}
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
            setMonto(d.Monto != null ? String(d.Monto) : '')
            setDescripcion(d.Descripcion ?? '')
            setDed13(d.Deduccion13vo ? String(d.Deduccion13vo) : '')
            setDed14(d.Deduccion14vo ? String(d.Deduccion14vo) : '')
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
  }, [editandoId])

  useFocusEffect(
    useCallback(() => {
      cargarCatalogos()
    }, [cargarCatalogos]),
  )

  const validar = (): boolean => {
    const e: Record<string, string> = {}

    if (!tipoId) e.tipo = 'Elegí el tipo de solicitud'
    if (!plazoId) e.plazo = 'Elegí el plazo'

    const montoNum = Number(monto)
    if (!monto.trim() || isNaN(montoNum) || montoNum <= 0) e.monto = 'Escribí un monto mayor que cero'

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
        Monto: Number(monto),
        Descripcion: descripcion.trim() || undefined,
        Deduccion13vo: aplicaTrece && ded13.trim() ? Number(ded13) : undefined,
        Deduccion14vo: aplicaCatorce && ded14.trim() ? Number(ded14) : undefined,
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
              label="Monto"
              value={monto}
              onChangeText={(v: string) => { setMonto(soloDecimal(v)); setErrores(p => ({ ...p, monto: '' })) }}
              keyboardType="decimal-pad"
              placeholder="0.00"
              error={errores.monto}
            />

            <AppInput
              label="Descripción"
              value={descripcion}
              onChangeText={setDescripcion}
              multiline
              minLines={3}
              placeholder="Para qué necesitás el préstamo"
              style={{ height: 100 }}
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
                Tu solicitud queda pendiente hasta que la cooperativa la revise.
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
