import React, { useCallback, useEffect, useState } from 'react'
import { RefreshControl } from 'react-native'
import { ScrollView, Text, XStack, YStack, View, Spinner, useTheme } from 'tamagui'
import { Settings } from 'lucide-react-native'

import { usePageHeader } from '../../../hooks/usePageHeader'
import { useShowToast } from '../../../utils/useShowToast'
import { configuracionService, IConfiguracion } from '../../../api/modules/configuracion/configuracion.service'

const ACCENT = '#FF551A'

// Etiquetas amigables por clave conocida (si no, se muestra la clave).
const LABELS: Record<string, string> = {
  'Mtto.UnTicketPorMaquina': 'Un ticket por máquina',
}

export default function ConfiguracionesGlobalesScreen() {
  usePageHeader({
    center: <Text fontSize="$4" fontWeight="700" color="$text">Configuraciones globales</Text>,
  })
  const theme = useTheme()
  const { showToast } = useShowToast()

  const [items, setItems] = useState<IConfiguracion[]>([])
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [guardando, setGuardando] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      const res = await configuracionService.getAll()
      setItems(res.Data ?? [])
    } catch {
      // sin datos, la pantalla queda vacía
    }
  }, [])

  useEffect(() => {
    ;(async () => { setCargando(true); await cargar(); setCargando(false) })()
  }, [cargar])

  const onRefresh = useCallback(async () => {
    setRefrescando(true); await cargar(); setRefrescando(false)
  }, [cargar])

  const toggle = useCallback(async (c: IConfiguracion) => {
    const nuevo = c.Valor === '1' ? '0' : '1'
    setGuardando(c.Clave)
    setItems(prev => prev.map(x => (x.Clave === c.Clave ? { ...x, Valor: nuevo } : x)))  // optimista
    try {
      const res = await configuracionService.set(c.Clave, nuevo)
      if (!res.Success) {
        setItems(prev => prev.map(x => (x.Clave === c.Clave ? { ...x, Valor: c.Valor } : x)))  // revertir
        showToast('error', 'No se pudo cambiar', res.ErrorMessage || 'Sin permiso o error')
      } else {
        showToast('success', 'Guardado', nuevo === '1' ? 'Activada' : 'Desactivada')
      }
    } catch (e: any) {
      setItems(prev => prev.map(x => (x.Clave === c.Clave ? { ...x, Valor: c.Valor } : x)))
      showToast('error', 'Error', e?.message || 'No se pudo cambiar')
    } finally {
      setGuardando(null)
    }
  }, [showToast])

  if (cargando) {
    return (
      <YStack flex={1} backgroundColor="$background" alignItems="center" justifyContent="center" gap="$3">
        <Spinner size="large" color={ACCENT} />
        <Text color="$textMuted">Cargando configuraciones…</Text>
      </YStack>
    )
  }

  return (
    <View flex={1} backgroundColor="$background">
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} tintColor={ACCENT} />}
      >
        <YStack gap="$3" maxWidth={720} width="100%" alignSelf="center">
          <Text fontSize="$2" color="$textMuted">
            Banderas globales del sistema. Solo usuarios con permiso pueden cambiarlas.
          </Text>

          {items.length === 0 ? (
            <YStack alignItems="center" paddingVertical="$8" gap="$2">
              <Settings size={28} color={theme.textMuted?.val} />
              <Text color="$textMuted">No hay configuraciones.</Text>
            </YStack>
          ) : (
            items.map(c => {
              const on = c.Valor === '1'
              return (
                <View key={c.Clave} backgroundColor="$backgroundElevated" borderRadius="$5"
                  borderWidth={1} borderColor="$border" padding="$4">
                  <XStack alignItems="center" justifyContent="space-between" gap="$3">
                    <YStack flex={1} gap="$1">
                      <Text fontSize="$4" fontWeight="800" color="$text">{LABELS[c.Clave] ?? c.Clave}</Text>
                      {!!c.Descripcion && <Text fontSize="$2" color="$textMuted">{c.Descripcion}</Text>}
                    </YStack>
                    <ToggleSwitch on={on} loading={guardando === c.Clave} onPress={() => toggle(c)} />
                  </XStack>
                </View>
              )
            })
          )}
        </YStack>
      </ScrollView>
    </View>
  )
}

function ToggleSwitch({ on, loading, onPress }: { on: boolean; loading?: boolean; onPress: () => void }) {
  return (
    <View
      onPress={loading ? undefined : onPress}
      pressStyle={{ opacity: 0.8 }}
      width={54}
      height={31}
      borderRadius={16}
      justifyContent="center"
      paddingHorizontal={3}
      backgroundColor={on ? ACCENT : '$backgroundHover'}
      borderWidth={1}
      borderColor={on ? ACCENT : '$border'}
    >
      <View
        width={25}
        height={25}
        borderRadius={13}
        backgroundColor="white"
        alignSelf={on ? 'flex-end' : 'flex-start'}
        alignItems="center"
        justifyContent="center"
      >
        {loading ? <Spinner size="small" color={ACCENT} /> : null}
      </View>
    </View>
  )
}
