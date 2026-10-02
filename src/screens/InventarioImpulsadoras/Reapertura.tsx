import React, { useState } from 'react'
import { Alert, TextInput } from 'react-native'
import { Text, XStack, YStack, View, Spinner, useTheme } from 'tamagui'
import { RotateCcw } from 'lucide-react-native'

import { inventarioImpulsadorasService as api, mensajeDeError } from '../../api/modules/inventarioImpulsadoras/inventarioImpulsadoras.service'
import { IMiHistorico } from '../../api/modules/inventarioImpulsadoras/inventarioImpulsadoras.types'
import { ACCENT, ERR, WARN, fmtFechaHora } from './components'

/**
 * Pedir que me reabran mi parte. Arriba del detalle (no abajo) para que el teclado no tape
 * el motivo en la PDA. El servidor decide si se ofrece (PuedeSolicitar) según las reglas y
 * los parámetros del módulo; aquí solo se pinta lo que dijo.
 */
export default function Reapertura({ item, onCambio, margen = 16 }: {
  item: IMiHistorico; onCambio: (nuevo: IMiHistorico) => void
  /** Margen a los lados: 16 dentro del detalle del histórico; 0 donde la pantalla ya tiene el suyo. */
  margen?: number
}) {
  const theme = useTheme()
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  React.useEffect(() => { setAbierto(false); setMotivo(''); setError(null) }, [item.InventarioUsuario_Id])

  const enviar = async () => {
    const m = motivo.trim()
    if (m.length < 5) { setError('Escribe qué te faltó escanear (lo lee la oficina para decidir).'); return }
    setEnviando(true)
    setError(null)
    try {
      const r = (await api.solicitarReapertura(item.InventarioUsuario_Id, m)).Data
      setAbierto(false)
      setMotivo('')
      onCambio({ ...item, Solicitud_Id: r?.Solicitud_Id, SolicitudEstado: 'PENDIENTE',
                 SolicitudFecha: r?.FechaSolicitud ?? null, SolicitudComentario: null, PuedeSolicitar: false })
      Alert.alert('Solicitud enviada', 'Se avisó a la oficina. Cuando la aprueben, el inventario vuelve a «Por hacer».')
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setEnviando(false)
    }
  }

  const cancelar = () => {
    if (!item.Solicitud_Id) return
    Alert.alert('Cancelar solicitud', '¿Ya no necesitas que te reabran este inventario?', [
      { text: 'No', style: 'cancel' },
      { text: 'Sí, cancelar', style: 'destructive', onPress: async () => {
        try {
          await api.cancelarReapertura(item.Solicitud_Id!)
          onCambio({ ...item, SolicitudEstado: 'CANCELADA', PuedeSolicitar: true })
        } catch (e) { Alert.alert('No se pudo cancelar', mensajeDeError(e)) }
      } },
    ])
  }

  const caja = { marginHorizontal: margen, marginBottom: 8, padding: 10, borderRadius: 10, borderWidth: 1 } as const

  if (item.SolicitudEstado === 'PENDIENTE') {
    return (
      <YStack {...caja} borderColor={WARN} backgroundColor="rgba(245,158,11,0.10)" gap="$1">
        <Text fontSize="$2" fontWeight="800" color={WARN}>Pediste reabrirlo{item.SolicitudFecha ? ` el ${fmtFechaHora(item.SolicitudFecha)}` : ''}</Text>
        <Text fontSize="$2" color="$text">La oficina ya recibió el aviso. Cuando la aprueben vuelve a «Por hacer».</Text>
        <Text fontSize="$2" fontWeight="700" color="$textMuted" textDecorationLine="underline" onPress={cancelar} alignSelf="flex-start">
          Cancelar la solicitud
        </Text>
      </YStack>
    )
  }

  const rechazo = item.SolicitudEstado === 'RECHAZADA' && !!item.SolicitudComentario && (
    <Text fontSize="$2" color={ERR} paddingHorizontal={margen} paddingBottom="$2">
      La oficina rechazó reabrirlo: {item.SolicitudComentario}
    </Text>
  )
  if (!item.PuedeSolicitar) return rechazo || null

  if (!abierto) {
    return (
      <YStack>
        {rechazo}
        <XStack {...caja} borderColor="$border" alignItems="center" gap="$2" onPress={() => setAbierto(true)} pressStyle={{ opacity: 0.8 }}>
          <RotateCcw size={16} color={ACCENT} />
          <Text flex={1} fontSize="$3" fontWeight="800" color={ACCENT}>¿Te faltó escanear algo? Solicitar reabrir</Text>
        </XStack>
      </YStack>
    )
  }

  return (
    <YStack {...caja} borderColor={ACCENT} gap="$2">
      <Text fontSize="$2" fontWeight="800" color="$text">¿Qué te faltó escanear?</Text>
      <TextInput
        value={motivo}
        onChangeText={setMotivo}
        placeholder="Ej.: me faltó la bodega de atrás"
        placeholderTextColor={theme.textMuted?.val}
        multiline
        maxLength={500}
        autoFocus
        style={{ minHeight: 60, maxHeight: 110, fontSize: 15, color: theme.text?.val, borderWidth: 1,
                 borderColor: theme.border?.val, borderRadius: 8, padding: 8, textAlignVertical: 'top' }}
      />
      {!!error && <Text fontSize="$2" color={ERR}>{error}</Text>}
      <XStack gap="$2" justifyContent="flex-end">
        <View paddingHorizontal="$3" height={38} borderRadius="$3" alignItems="center" justifyContent="center"
          borderWidth={1} borderColor="$border" onPress={() => { setAbierto(false); setError(null) }}>
          <Text fontWeight="700" color="$textMuted">Cancelar</Text>
        </View>
        <View paddingHorizontal="$3" height={38} borderRadius="$3" alignItems="center" justifyContent="center"
          backgroundColor={ACCENT} opacity={enviando ? 0.6 : 1} onPress={enviando ? undefined : enviar}>
          {enviando ? <Spinner color="#fff" /> : <Text fontWeight="800" color="#fff">Enviar solicitud</Text>}
        </View>
      </XStack>
    </YStack>
  )
}
