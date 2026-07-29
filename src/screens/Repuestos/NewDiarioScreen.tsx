import React, { useState, useCallback } from 'react'
import { ScrollView } from 'react-native'
import { Text, XStack, YStack, View, Spinner, Input, TextArea, useTheme } from 'tamagui'
import { Check, ArrowLeft, FileText } from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'

import { usePageHeader } from '../../hooks/usePageHeader'
import { useShowToast } from '../../utils/useShowToast'
import { repuestosService } from '../../api/modules/repuestos/repuestos.service'
import { ACCENT, Field } from './components'

// Nombre de diario fijo para repuestos (el proxy aún no expone catálogos de AX).
const JOURNAL_NAME = 'Sal_Repues'
const ERR = '#ef4444'

export default function NewDiarioScreen() {
  const theme = useTheme()
  const navigation = useNavigation<any>()
  const { showToast } = useShowToast()

  usePageHeader({
    left: <ArrowLeft color={theme.text?.val} onPress={() => navigation.goBack()} />,
    center: <Text fontSize="$4" fontWeight="700" color="$text">Nuevo diario</Text>,
  })

  const [descripcion, setDescripcion] = useState('')
  const [almacen, setAlmacen] = useState('4')
  const [enviando, setEnviando] = useState(false)
  const [intentado, setIntentado] = useState(false)

  const descripcionOk = descripcion.trim().length > 0
  const almacenOk = almacen.trim().length > 0
  const puedeGuardar = descripcionOk && almacenOk

  const guardar = useCallback(async () => {
    setIntentado(true)
    if (!puedeGuardar) {
      showToast('warning', 'Datos incompletos', 'Ingresa la descripción y el almacén')
      return
    }
    setEnviando(true)
    try {
      const res = await repuestosService.crearDiario({
        JournalName: JOURNAL_NAME,
        Descripcion: descripcion.trim(),
        Almacen: almacen.trim(),
      })
      const ax = res.Data
      if (res.Success && ax?.Ok && ax.JournalId) {
        showToast('success', 'Diario creado', ax.JournalId)
        // Reemplaza esta pantalla por el detalle del diario recién creado.
        navigation.replace('repuestosDetalle', {
          journalId: ax.JournalId,
          descripcion: descripcion.trim(),
          almacen: almacen.trim(),
        })
      } else {
        showToast('error', 'No se pudo crear', ax?.Error || res.ErrorMessage || 'AX no confirmó el diario')
      }
    } catch (e: any) {
      showToast('error', 'Error', e?.message || 'No se pudo crear el diario')
    } finally {
      setEnviando(false)
    }
  }, [puedeGuardar, descripcion, almacen, navigation, showToast])

  return (
    <View flex={1} backgroundColor="$background">
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <YStack width="100%" maxWidth={680} alignSelf="center">

          {/* Tipo de diario (fijo para repuestos) */}
          <View borderWidth={1} borderColor="$border" borderRadius="$4" padding="$3" marginBottom="$5"
            backgroundColor="$backgroundElevated">
            <XStack alignItems="center" gap="$2.5">
              <FileText size={18} color={ACCENT} />
              <YStack>
                <Text fontSize="$2" color="$textMuted">Tipo de diario</Text>
                <Text fontSize="$4" fontWeight="800" color="$text">{JOURNAL_NAME}</Text>
              </YStack>
            </XStack>
          </View>

          <Field label="Almacén *" hint="bodega de repuestos" error={intentado && !almacenOk}>
            <Input height={50} borderWidth={1} borderColor={intentado && !almacenOk ? ERR : '$border'}
              borderRadius={8} backgroundColor="$backgroundElevated" paddingHorizontal="$3" fontSize="$5" color="$text"
              keyboardType="number-pad" placeholder="Ej. 4" placeholderTextColor={theme.textMuted?.val}
              value={almacen} onChangeText={t => setAlmacen(t.replace(/\D/g, ''))} />
          </Field>

          <Field label="Descripción *" error={intentado && !descripcionOk}>
            <TextArea minHeight={110} backgroundColor="$backgroundElevated" color="$text"
              borderColor={intentado && !descripcionOk ? ERR : '$border'}
              borderRadius={8} padding="$3" placeholder="Motivo o referencia del diario"
              placeholderTextColor={theme.textMuted?.val} value={descripcion} onChangeText={setDescripcion} />
          </Field>

          <View marginTop="$3" onPress={enviando ? undefined : guardar} pressStyle={{ opacity: 0.85 }}
            opacity={enviando ? 0.7 : 1} backgroundColor={ACCENT} borderRadius="$4" height={52}
            alignItems="center" justifyContent="center" flexDirection="row" gap="$2">
            {enviando ? <Spinner color="#fff" /> : <Check size={20} color="#fff" />}
            <Text color="#fff" fontWeight="800" fontSize="$4">{enviando ? 'Creando…' : 'Crear diario'}</Text>
          </View>
        </YStack>
      </ScrollView>
    </View>
  )
}
