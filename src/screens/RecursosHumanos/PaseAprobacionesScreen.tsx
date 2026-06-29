import React, { useEffect, useState } from 'react'
import { Modal, RefreshControl } from 'react-native'
import { YStack, XStack, Text, Button, View, ScrollView, Spinner } from 'tamagui'
import { Check, X, DoorOpen, DoorClosed, CheckCheck } from 'lucide-react-native'
import Page from '../../components/commons/Page'
import AppInput from '../../components/commons/AppInput'
import { usePageHeader } from '../../hooks/usePageHeader'
import { useAuth } from '../../context/AuthContext'
import { useShowToast } from '../../utils/useShowToast'
import { handleError } from '../../utils/errorHandler'
import { pasesService } from '../../api/modules/pases/pases.service'
import { IPase } from '../../api/modules/pases/pases.types'
import { subscribeOpenPaseAprobacion } from '../../services/paseNavigation'

export default function PaseAprobacionesScreen() {
  const { user } = useAuth()
  const { showToast } = useShowToast()

  const [pases, setPases] = useState<IPase[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [actingId, setActingId] = useState<number | null>(null)
  const [highlightId, setHighlightId] = useState<number | null>(null)

  // Modal de rechazo
  const [rejectPase, setRejectPase] = useState<IPase | null>(null)
  const [motivo, setMotivo] = useState('')

  usePageHeader({
    center: (
      <Text fontSize="$4" fontWeight="700" color="$text">
        Aprobaciones
      </Text>
    ),
  })

  const load = async (silent = false) => {
    if (!user?.Code) return
    if (!silent) setLoading(true)
    try {
      const resp = await pasesService.getPorAprobar(user.Code)
      if (resp.Success) setPases(resp.Data ?? [])
      else showToast('error', 'Error', resp.ErrorMessage || 'No se pudo cargar', 4000, 'bottom')
    } catch (err) {
      showToast('error', 'Error', handleError(err).message, 4000, 'bottom')
    }
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => {
    load()
  }, [])

  // Deep-link desde notificación: resalta el pase indicado y refresca la lista.
  useEffect(() => {
    const unsub = subscribeOpenPaseAprobacion((paseId) => {
      setHighlightId(paseId)
      load(true)
      setTimeout(() => setHighlightId(null), 4000)
    })
    return unsub
  }, [])

  const aprobar = async (p: IPase) => {
    setActingId(p.Id)
    try {
      const resp = await pasesService.aprobar({ Id: p.Id, Create_By: user!.Code })
      if (resp.Success) {
        showToast('success', 'Éxito', resp.SuccessMessage || 'Pase aprobado', 4000, 'bottom')
        await load(true)
      } else {
        showToast('error', 'Error', resp.ErrorMessage || 'No se pudo aprobar', 5000, 'bottom')
      }
    } catch (err) {
      showToast('error', 'Error', handleError(err).message, 5000, 'bottom')
    }
    setActingId(null)
  }

  const confirmarRechazo = async () => {
    if (!rejectPase) return
    setActingId(rejectPase.Id)
    try {
      const resp = await pasesService.rechazar({
        Id: rejectPase.Id,
        Create_By: user!.Code,
        MotivoRechazo: motivo.trim() || null,
      })
      if (resp.Success) {
        showToast('success', 'Listo', resp.SuccessMessage || 'Pase rechazado', 4000, 'bottom')
        setRejectPase(null)
        setMotivo('')
        await load(true)
      } else {
        showToast('error', 'Error', resp.ErrorMessage || 'No se pudo rechazar', 5000, 'bottom')
      }
    } catch (err) {
      showToast('error', 'Error', handleError(err).message, 5000, 'bottom')
    }
    setActingId(null)
  }

  return (
    <Page>
      <YStack flex={1} backgroundColor="$backgroundPage">
        {loading ? (
          <YStack flex={1} justifyContent="center" alignItems="center">
            <Spinner size="large" color="$primary" />
          </YStack>
        ) : (
          <ScrollView
            flex={1}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true)
                  load(true)
                }}
                tintColor="#FF551A"
              />
            }
          >
            <YStack padding="$4" gap="$3">
              {pases.length === 0 && (
                <YStack alignItems="center" justifyContent="center" paddingVertical="$8" gap="$2">
                  <CheckCheck size={40} color="#94A3B8" />
                  <Text color="$textMuted">No tienes pases pendientes de aprobar</Text>
                </YStack>
              )}

              {pases.map((p) => {
                const esEntrada = p.Tipo === 'E'
                const resaltado = highlightId === p.Id
                return (
                  <YStack
                    key={p.Id}
                    backgroundColor="$backgroundElevated"
                    borderRadius="$4"
                    padding="$3"
                    gap="$3"
                    borderWidth={resaltado ? 2 : 1}
                    borderColor={resaltado ? '$primary' : '$border'}
                    shadowColor="#000"
                    shadowOffset={{ width: 0, height: 2 }}
                    shadowOpacity={0.07}
                    shadowRadius={6}
                    elevation={2}
                  >
                    <XStack alignItems="center" gap="$3">
                      <View
                        width={38}
                        height={38}
                        borderRadius={19}
                        backgroundColor={esEntrada ? 'rgba(34,197,94,0.12)' : 'rgba(255,85,26,0.12)'}
                        justifyContent="center"
                        alignItems="center"
                      >
                        {esEntrada
                          ? <DoorOpen size={18} color="#15803D" />
                          : <DoorClosed size={18} color="#FF551A" />}
                      </View>
                      <YStack flex={1}>
                        <Text fontWeight="700" fontSize={14} color="$text">{p.EmpleadoNombre}</Text>
                        <Text fontSize={12} color="$textMuted">
                          {p.Categoria}{p.FechaPase ? ` · ${p.FechaPase}` : ''}
                        </Text>
                        {!!p.Departamento && (
                          <Text fontSize={11} color="$textMuted">{p.Departamento}</Text>
                        )}
                        {!!p.Observacion && (
                          <Text fontSize={11} color="$textMuted">Obs: {p.Observacion}</Text>
                        )}
                      </YStack>
                    </XStack>

                    <XStack gap="$3">
                      <Button
                        flex={1}
                        height={42}
                        backgroundColor="$buttonSecondary"
                        borderRadius="$3"
                        pressStyle={{ opacity: 0.7 }}
                        disabled={actingId !== null}
                        onPress={() => { setRejectPase(p); setMotivo('') }}
                        icon={<X size={16} color="#B91C1C" />}
                      >
                        <Text color="#B91C1C" fontWeight="700">Rechazar</Text>
                      </Button>
                      <Button
                        flex={1}
                        height={42}
                        backgroundColor="$primary"
                        borderRadius="$3"
                        pressStyle={{ opacity: 0.7 }}
                        disabled={actingId !== null}
                        opacity={actingId === p.Id ? 0.6 : 1}
                        onPress={() => aprobar(p)}
                        icon={actingId === p.Id ? <Spinner color="white" /> : <Check size={16} color="white" />}
                      >
                        <Text color="white" fontWeight="700">Aprobar</Text>
                      </Button>
                    </XStack>
                  </YStack>
                )
              })}
            </YStack>
          </ScrollView>
        )}
      </YStack>

      {/* Modal de rechazo */}
      <Modal visible={!!rejectPase} transparent animationType="fade" onRequestClose={() => setRejectPase(null)}>
        <View flex={1} backgroundColor="rgba(0,0,0,0.45)" justifyContent="center" padding="$4">
          <YStack backgroundColor="$backgroundElevated" borderRadius="$6" padding="$4" gap="$3">
            <Text fontSize={16} fontWeight="700" color="$text">Rechazar pase</Text>
            <Text fontSize={12} color="$textMuted">
              {rejectPase?.EmpleadoNombre} · {rejectPase?.Categoria}
            </Text>
            <AppInput label="Motivo del rechazo (opcional)" value={motivo} onChangeText={setMotivo} />
            <XStack gap="$3" marginTop="$2">
              <Button
                flex={1}
                height={44}
                backgroundColor="$buttonSecondary"
                borderRadius="$3"
                pressStyle={{ opacity: 0.7 }}
                onPress={() => setRejectPase(null)}
                disabled={actingId !== null}
              >
                <Text color="$text" fontWeight="700">Cancelar</Text>
              </Button>
              <Button
                flex={1}
                height={44}
                backgroundColor="#B91C1C"
                borderRadius="$3"
                pressStyle={{ opacity: 0.7 }}
                onPress={confirmarRechazo}
                disabled={actingId !== null}
                opacity={actingId !== null ? 0.6 : 1}
                icon={actingId !== null ? <Spinner color="white" /> : undefined}
              >
                <Text color="white" fontWeight="700">Rechazar</Text>
              </Button>
            </XStack>
          </YStack>
        </View>
      </Modal>
    </Page>
  )
}
