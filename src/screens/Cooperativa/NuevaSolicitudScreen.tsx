import React, { useCallback, useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView as RNScrollView, Keyboard } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { YStack, XStack, Text, Button, View, Spinner } from 'tamagui'
import { Info } from 'lucide-react-native'
import AppInput from '../../components/commons/AppInput'
import AppSelect from '../../components/commons/AppSelect'
import { cooperativaService } from '../../api/modules/cooperativa/cooperativa.service'
import { ICatalogosSolicitud } from '../../api/modules/cooperativa/cooperativa.types'
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

/** Solo dígitos y un punto decimal, para que el monto no llegue con basura. */
const soloDecimal = (v: string): string => {
  const limpio = v.replace(/[^0-9.]/g, '')
  const partes = limpio.split('.')
  return partes.length <= 2 ? limpio : `${partes[0]}.${partes.slice(1).join('')}`
}

export default function NuevaSolicitudScreen() {
  const navigation = useNavigation()
  const { showToast } = useShowToast()

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

  // En Android con edge-to-edge, adjustResize no achica la ventana, así que el
  // KeyboardAvoidingView por sí solo no alcanza: se reserva el alto del teclado
  // como padding para poder scrollear el contenido por encima de él.
  const kbHeight = useKeyboardHeight()
  const bottomPad = Platform.OS === 'android' ? kbHeight : 0

  usePageHeader({
    center: (
      <Text fontSize={16} fontWeight="700" color="$text">
        Nueva solicitud
      </Text>
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
    } catch (err) {
      showToast('error', 'Error', handleError(err).message, 5000, 'top')
    } finally {
      setCargando(false)
    }
    // showToast se deja fuera de las dependencias: cambia de identidad en cada
    // render y recargaria los catalogos en bucle.
  }, [])

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
      const response = await cooperativaService.crearSolicitud({
        TipoSolicitudId: tipoId!,
        PlazoId: plazoId!,
        Monto: Number(monto),
        Descripcion: descripcion.trim() || undefined,
        Deduccion13vo: ded13.trim() ? Number(ded13) : undefined,
        Deduccion14vo: ded14.trim() ? Number(ded14) : undefined,
      })

      if (!response?.Success) {
        showToast('error', 'Error', response?.ErrorMessage || 'No se pudo crear la solicitud', 5000, 'top')
        return
      }

      showToast('success', 'Solicitud enviada', response.SuccessMessage || '', 4000, 'top')
      // Vuelve al listado, que recarga solo al tomar el foco (useFocusEffect).
      navigation.goBack()
    } catch (err) {
      showToast('error', 'Error', handleError(err).message, 5000, 'top')
    } finally {
      setEnviando(false)
    }
  }

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
            <AppSelect
              label="Tipo de solicitud"
              value={tipoId ?? undefined}
              onValueChange={v => { setTipoId(Number(v)); setErrores(p => ({ ...p, tipo: '' })) }}
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

            <XStack gap="$3">
              <View flex={1}>
                <AppInput
                  label="Deducción 13.º"
                  value={ded13}
                  onChangeText={(v: string) => setDed13(soloDecimal(v))}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                />
              </View>
              <View flex={1}>
                <AppInput
                  label="Deducción 14.º"
                  value={ded14}
                  onChangeText={(v: string) => setDed14(soloDecimal(v))}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                />
              </View>
            </XStack>

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
                  {enviando ? 'Enviando...' : 'Enviar solicitud'}
                </Text>
              </Button>
            </XStack>
          </YStack>
        </RNScrollView>
      </YStack>
    </KeyboardAvoidingView>
  )
}
