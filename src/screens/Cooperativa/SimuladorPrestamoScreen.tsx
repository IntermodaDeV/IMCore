import React, { useCallback, useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView as RNScrollView, Keyboard } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { YStack, XStack, Text, Button, View, Spinner, styled } from 'tamagui'
import {
  ArrowLeft, CalendarDays, Calculator, Coins, Info, Clock,
} from 'lucide-react-native'

import AppInput from '../../components/commons/AppInput'
import AppSelect from '../../components/commons/AppSelect'
import { cooperativaService } from '../../api/modules/cooperativa/cooperativa.service'
import {
  ICatalogosSolicitud,
  ICuotaSimulada,
} from '../../api/modules/cooperativa/cooperativa.types'
import SkeletonForm from '../../components/Skeletons/SkeletonForm'
import { usePageHeader } from '../../hooks/usePageHeader'
import { useKeyboardHeight } from '../../hooks/useKeyboardInset'
import { handleError } from '../../utils/errorHandler'
import { useShowToast } from '../../utils/useShowToast'
import { shadows } from '../../theme/shadows'

/**
 * Simulador de préstamo.
 *
 * Responde lo que el empleado se pregunta ANTES de pedir: si pido tanto a
 * tantas cuotas, cuánto me descuentan y hasta cuándo. Escribe un monto, elige
 * un plazo y ve el plan completo.
 *
 * NO CREA NADA. No es una solicitud, no queda registrada y nadie se entera de
 * que alguien simuló. Es una consulta.
 *
 * El cálculo lo hace el servidor con CooInter.CalculoPrestamo, la MISMA función
 * que genera el plan real cuando le aprueban el préstamo. Calcularlo acá con
 * una fórmula propia haría que lo simulado y lo aprobado se fueran separando
 * en cuanto alguien tocara el redondeo o el calendario de pagos — y un
 * simulador que miente es peor que no tenerlo.
 */

const ArrowLeftStyled = styled(ArrowLeft, { color: '$text' })

/** Solo dígitos y un punto decimal, para que el monto no llegue con basura. */
const soloDecimal = (v: string): string => {
  const limpio = v.replace(/[^0-9.]/g, '')
  const partes = limpio.split('.')
  return partes.length <= 2 ? limpio : `${partes[0]}.${partes.slice(1).join('')}`
}

const formatFecha = (valor: string | null): string => {
  if (!valor) return '-'
  const fecha = new Date(valor)
  if (isNaN(fecha.getTime())) return '-'
  return fecha.toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Monto en lempiras. Cooperativa maneja HNL. */
const formatMonto = (valor: number | null | undefined): string => {
  if (valor == null) return '-'
  return `L ${Number(valor).toLocaleString('es-HN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export default function SimuladorPrestamoScreen() {
  const navigation = useNavigation()
  const { showToast } = useShowToast()

  const [catalogos, setCatalogos] = useState<ICatalogosSolicitud | null>(null)
  const [cargando, setCargando] = useState(true)
  const [calculando, setCalculando] = useState(false)

  const [monto, setMonto] = useState('')
  const [plazoId, setPlazoId] = useState<number | null>(null)
  const [errores, setErrores] = useState<Record<string, string>>({})

  const [cuotas, setCuotas] = useState<ICuotaSimulada[]>([])

  // En Android con edge-to-edge, adjustResize no achica la ventana: se reserva
  // el alto del teclado como padding. Mismo caso que el formulario.
  const kbHeight = useKeyboardHeight()
  const bottomPad = Platform.OS === 'android' ? kbHeight : 0

  usePageHeader({
    center: (
      <Text fontSize={16} fontWeight="700" color="$text">
        Simular un préstamo
      </Text>
    ),
    left: (
      <View onPress={() => navigation.goBack()} pressStyle={{ opacity: 0.6 }} hitSlop={10}>
        <ArrowLeftStyled />
      </View>
    ),
  })

  // Los plazos salen del MISMO catálogo que el formulario de solicitud, que ya
  // viene filtrado por el tipo de planilla del socio: así no puede simular con
  // un plazo que después no va a poder pedir.
  const cargarCatalogos = useCallback(async () => {
    setCargando(true)
    try {
      const response = await cooperativaService.getCatalogosSolicitud()

      if (response?.Success && response.Data) {
        setCatalogos(response.Data)
      } else {
        showToast(
          'error',
          'Error',
          response?.ErrorMessage || 'No se pudieron cargar los plazos',
          5000,
          'top',
        )
      }
    } catch (err) {
      showToast('error', 'Error', handleError(err).message, 5000, 'top')
    } finally {
      setCargando(false)
    }
    // showToast queda fuera: cambia de identidad en cada render y recargaría en
    // bucle.
  }, [])

  useFocusEffect(
    useCallback(() => {
      cargarCatalogos()
    }, [cargarCatalogos]),
  )

  const calcular = async () => {
    Keyboard.dismiss()

    const e: Record<string, string> = {}
    const montoNum = Number(monto)

    if (!monto.trim() || isNaN(montoNum) || montoNum <= 0) {
      e.monto = 'Escribí un monto mayor que cero'
    }
    if (!plazoId) e.plazo = 'Elegí el plazo'

    setErrores(e)
    if (Object.keys(e).length > 0) return

    setCalculando(true)
    try {
      const response = await cooperativaService.simularPrestamo(montoNum, plazoId!)

      if (!response?.Success) {
        setCuotas([])
        showToast(
          'error',
          'Error',
          response?.ErrorMessage || 'No se pudo calcular la simulación',
          5000,
          'top',
        )
        return
      }

      const filas = response.Data ?? []
      setCuotas(filas)

      // Una lista vacía no llega como error del servidor: significa que ese
      // monto y ese plazo no dan un plan. Se dice, en vez de dejar la pantalla
      // igual que antes de tocar el botón.
      if (filas.length === 0) {
        showToast(
          'info',
          'Sin resultado',
          'No se pudo calcular con ese monto y ese plazo.',
          4000,
          'top',
        )
      }
    } catch (err) {
      setCuotas([])
      showToast('error', 'Error', handleError(err).message, 5000, 'top')
    } finally {
      setCalculando(false)
    }
  }

  const opcionesPlazo = (catalogos?.Plazos ?? []).map(p => ({
    label: p.Descripcion ?? `${p.PlazoMes ?? '?'} cuotas`,
    value: String(p.PlazoId),
  }))

  if (cargando) {
    return (
      <YStack flex={1} backgroundColor="$backgroundPage" padding="$4">
        <SkeletonForm />
      </YStack>
    )
  }

  // El encabezado del resultado sale de la primera fila: el servidor lo repite
  // en todas.
  const resumen = cuotas[0]
  const ultima = cuotas[cuotas.length - 1]

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
            {/* Qué es esto, arriba del todo: alguien que entra por curiosidad
                tiene que saber de una que no está pidiendo nada. */}
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
                Acá puede ver cuánto le descontarían y hasta cuándo, sin pedir
                nada. Esto no es una solicitud: no queda guardado.
              </Text>
            </XStack>

            <AppInput
              label="Monto"
              value={monto}
              onChangeText={(v: string) => {
                setMonto(soloDecimal(v))
                setErrores(p => ({ ...p, monto: '' }))
                // El plan de abajo era de OTRO monto: dejarlo puesto mientras
                // se escribe uno nuevo se lee como si ya estuviera calculado.
                setCuotas([])
              }}
              keyboardType="decimal-pad"
              placeholder="0.00"
              error={errores.monto}
            />

            <AppSelect
              label="Plazo"
              value={plazoId ?? undefined}
              onValueChange={v => {
                setPlazoId(Number(v))
                setErrores(p => ({ ...p, plazo: '' }))
                setCuotas([])
              }}
              options={opcionesPlazo}
              error={errores.plazo}
            />

            <Button
              height={48}
              borderRadius={12}
              backgroundColor="$primary"
              pressStyle={{ opacity: 0.8 }}
              disabled={calculando}
              icon={calculando ? <Spinner color="#FFFFFF" /> : undefined}
              onPress={calcular}
            >
              <XStack alignItems="center" gap="$2">
                {!calculando && <Calculator size={17} color="#FFFFFF" />}
                <Text color="white" fontWeight="700">
                  {calculando ? 'Calculando...' : 'Calcular'}
                </Text>
              </XStack>
            </Button>

            {/* ── El resultado ──────────────────────────────────────────── */}
            {!!resumen && (
              <>
                <YStack
                  gap="$3"
                  padding="$4"
                  borderRadius="$4"
                  backgroundColor="$backgroundElevated"
                  borderWidth={1}
                  borderColor="$border"
                  {...shadows.sm}
                >
                  {/* La cuota, no el monto: el monto ya lo escribió él. Lo que
                      vino a averiguar es cuánto le van a quitar. */}
                  <YStack gap="$1">
                    <Text fontSize={13} color="$textMuted">Le descontarían</Text>
                    <Text fontSize={26} fontWeight="700" color="$text">
                      {formatMonto(resumen.TotalCuota)}
                    </Text>
                    <Text fontSize={12} color="$textMuted">
                      en cada pago
                    </Text>
                  </YStack>

                  <XStack
                    gap="$2.5"
                    paddingTop="$2.5"
                    borderTopWidth={1}
                    borderTopColor="$border"
                  >
                    <YStack flex={1}>
                      <XStack gap="$1.5" alignItems="center">
                        <Coins size={11} color="#94A3B8" />
                        <Text fontSize={10} color="$textMuted">Monto</Text>
                      </XStack>
                      <Text fontSize={13} color="$text" fontWeight="600" lineHeight={18}>
                        {formatMonto(resumen.Monto)}
                      </Text>
                    </YStack>

                    <YStack flex={1}>
                      <XStack gap="$1.5" alignItems="center">
                        <CalendarDays size={11} color="#94A3B8" />
                        <Text fontSize={10} color="$textMuted">Cuotas</Text>
                      </XStack>
                      <Text fontSize={13} color="$text" fontWeight="600" lineHeight={18}>
                        {cuotas.length}
                      </Text>
                    </YStack>

                    {/* Hasta cuándo. Es la otra mitad de la pregunta y no se
                        deduce del número de cuotas sin saber cada cuánto le
                        pagan. */}
                    <YStack flex={1}>
                      <XStack gap="$1.5" alignItems="center">
                        <Clock size={11} color="#94A3B8" />
                        <Text fontSize={10} color="$textMuted">Último pago</Text>
                      </XStack>
                      <Text fontSize={13} color="$text" fontWeight="600" lineHeight={18}>
                        {formatFecha(ultima?.FechaCuota ?? null)}
                      </Text>
                    </YStack>
                  </XStack>
                </YStack>

                {/* ── El plan, cuota por cuota ────────────────────────────
                    Sin capital ni interés, igual que en el detalle del
                    préstamo real: la cuota es lo que se le descuenta y el
                    saldo lo que le quedaría debiendo. */}
                <YStack
                  gap="$2"
                  padding="$4"
                  borderRadius="$4"
                  backgroundColor="$backgroundElevated"
                  borderWidth={1}
                  borderColor="$border"
                  {...shadows.sm}
                >
                  <XStack alignItems="center" gap="$1.5">
                    <CalendarDays size={12} color="#94A3B8" />
                    <Text fontSize={10} fontWeight="700" color="$textMuted" letterSpacing={0.4}>
                      PLAN DE PAGOS
                    </Text>
                  </XStack>

                  <XStack alignItems="center" gap="$2" paddingTop="$1">
                    <Text fontSize={10} color="$textMuted" width={28}>N.º</Text>
                    <Text fontSize={10} color="$textMuted" flex={1}>FECHA</Text>
                    <Text fontSize={10} color="$textMuted" width={82} textAlign="right">CUOTA</Text>
                    <Text fontSize={10} color="$textMuted" width={92} textAlign="right">SALDO</Text>
                  </XStack>

                  {cuotas.map(c => (
                    <XStack
                      key={c.NumeroCuota}
                      alignItems="center"
                      gap="$2"
                      paddingVertical="$2"
                      borderTopWidth={1}
                      borderTopColor="$border"
                    >
                      <Text fontSize={12} color="$textMuted" width={28}>
                        {c.NumeroCuota}
                      </Text>

                      <Text fontSize={13} color="$text" flex={1}>
                        {formatFecha(c.FechaCuota)}
                      </Text>

                      <Text
                        fontSize={13}
                        fontWeight="600"
                        color="$text"
                        width={82}
                        textAlign="right"
                      >
                        {formatMonto(c.TotalCuota)}
                      </Text>

                      <Text fontSize={13} color="$textMuted" width={92} textAlign="right">
                        {formatMonto(c.SaldoActual)}
                      </Text>
                    </XStack>
                  ))}
                </YStack>

                {/* La advertencia va DESPUÉS del resultado, no antes: puesta
                    arriba se lee como letra chica y nadie la mira; acá cae
                    justo cuando ya se hizo una idea de la cuota. */}
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
                    Es una estimación. Las fechas se cuentan desde hoy, así que
                    si pide el préstamo más adelante se corren. Las condiciones
                    finales las define la cooperativa al aprobarlo.
                  </Text>
                </XStack>
              </>
            )}
          </YStack>
        </RNScrollView>
      </YStack>
    </KeyboardAvoidingView>
  )
}
