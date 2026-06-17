import React, { useEffect, useState } from 'react'
import { Modal, RefreshControl } from 'react-native'
import { YStack, XStack, Text, Button, View, ScrollView, Spinner } from 'tamagui'
import { Plus, Pencil, Tag } from 'lucide-react-native'
import Page from '../../components/commons/Page'
import AppInput from '../../components/commons/AppInput'
import { usePageHeader } from '../../hooks/usePageHeader'
import { useAuth } from '../../context/AuthContext'
import { useShowToast } from '../../utils/useShowToast'
import { visitasService } from '../../api/modules/visitas/visitas.service'
import { IMotivo } from '../../api/modules/visitas/visitas.types'
import { handleError } from '../../utils/errorHandler'

export default function VisitasMotivosScreen() {
  const { user } = useAuth()
  const { showToast } = useShowToast()

  const [motivos, setMotivos] = useState<IMotivo[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<IMotivo | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [togglingId, setTogglingId] = useState<number | null>(null)

  usePageHeader({
    center: (
      <Text fontSize="$4" fontWeight="700" color="$text">
        Motivos
      </Text>
    ),
  })

  const load = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const resp = await visitasService.getMotivos(false)
      if (resp.Success) setMotivos(resp.Data ?? [])
    } catch (err) {
      showToast('error', 'Error', handleError(err).message, 4000, 'bottom')
    }
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => {
    load()
  }, [])

  const openNew = () => {
    setEditing(null)
    setName('')
    setDescription('')
    setModalOpen(true)
  }

  const openEdit = (m: IMotivo) => {
    setEditing(m)
    setName(m.Name)
    setDescription(m.Description ?? '')
    setModalOpen(true)
  }

  const save = async () => {
    if (!name.trim()) return showToast('error', 'Validación', 'El nombre es requerido', 4000, 'bottom')
    setSaving(true)
    try {
      const payload: IMotivo = {
        Id: editing?.Id ?? 0,
        Name: name.trim(),
        Description: description.trim() || null,
        Status_Id: editing?.Status_Id ?? 1,
        Create_By: user?.Code,
        Modified_By: user?.Code,
      }
      const resp = await visitasService.saveMotivo(payload)
      if (resp.Success) {
        showToast('success', 'Éxito', resp.SuccessMessage || 'Guardado', 4000, 'bottom')
        setModalOpen(false)
        await load(true)
      } else {
        showToast('error', 'Error', resp.ErrorMessage || 'No se pudo guardar', 5000, 'bottom')
      }
    } catch (err) {
      showToast('error', 'Error', handleError(err).message, 5000, 'bottom')
    }
    setSaving(false)
  }

  const toggle = async (m: IMotivo) => {
    setTogglingId(m.Id)
    try {
      const resp = await visitasService.changeStatusMotivo({
        ...m,
        Status_Id: m.Status_Id === 1 ? 2 : 1,
        Modified_By: user?.Code,
      })
      if (resp.Success) {
        await load(true)
      } else {
        showToast('error', 'Error', resp.ErrorMessage || 'No se pudo actualizar', 5000, 'bottom')
      }
    } catch (err) {
      showToast('error', 'Error', handleError(err).message, 5000, 'bottom')
    }
    setTogglingId(null)
  }

  return (
    <Page>
      <YStack flex={1} backgroundColor="$backgroundPage">
        <View padding="$4" paddingBottom="$2">
          <Button
            height={44}
            backgroundColor="$primary"
            borderRadius="$4"
            pressStyle={{ opacity: 0.7 }}
            onPress={openNew}
            icon={<Plus size={18} color="white" />}
          >
            <Text color="white" fontWeight="700">
              Nuevo motivo
            </Text>
          </Button>
        </View>

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
            <YStack paddingHorizontal="$4" paddingBottom="$4" gap="$3">
              {motivos.map((m) => {
                const active = m.Status_Id === 1
                return (
                  <XStack
                    key={m.Id}
                    backgroundColor="$backgroundElevated"
                    borderRadius="$4"
                    paddingVertical="$3"
                    paddingHorizontal="$4"
                    alignItems="center"
                    gap="$3"
                    overflow="hidden"
                    shadowColor="#000"
                    shadowOffset={{ width: 0, height: 2 }}
                    shadowOpacity={0.07}
                    shadowRadius={6}
                    elevation={2}
                  >
                    <View
                      position="absolute"
                      left={0}
                      top={0}
                      bottom={0}
                      width={4}
                      backgroundColor={active ? '$primary' : 'transparent'}
                    />
                    <View
                      width={38}
                      height={38}
                      borderRadius={19}
                      backgroundColor={active ? 'rgba(255, 85, 26, 0.12)' : '$backgroundSurface'}
                      justifyContent="center"
                      alignItems="center"
                    >
                      <Tag size={18} color={active ? '#FF551A' : '#94A3B8'} />
                    </View>

                    <YStack flex={1} gap="$0.5">
                      <Text fontWeight="700" fontSize={14} color="$text">
                        {m.Name}
                      </Text>
                      {!!m.Description && (
                        <Text fontSize={12} color="$textMuted">
                          {m.Description}
                        </Text>
                      )}
                    </YStack>

                    {/* Editar */}
                    <View onPress={() => openEdit(m)} pressStyle={{ opacity: 0.6 }} padding="$2">
                      <Pencil size={18} color="#FF551A" />
                    </View>

                    {/* Estado (toggle) */}
                    <View
                      onPress={() => togglingId === null && toggle(m)}
                      pressStyle={{ opacity: 0.7 }}
                      backgroundColor={active ? 'rgba(255, 85, 26, 0.12)' : 'rgba(148,163,184,0.15)'}
                      paddingHorizontal="$2.5"
                      paddingVertical="$1.5"
                      borderRadius="$10"
                      minWidth={74}
                      alignItems="center"
                    >
                      {togglingId === m.Id ? (
                        <Spinner size="small" color="$primary" />
                      ) : (
                        <Text fontSize={11} fontWeight="700" color={active ? '$primary' : '$textMuted'}>
                          {active ? 'Activo' : 'Inactivo'}
                        </Text>
                      )}
                    </View>
                  </XStack>
                )
              })}
            </YStack>
          </ScrollView>
        )}
      </YStack>

      {/* Modal crear/editar */}
      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={() => setModalOpen(false)}>
        <View flex={1} backgroundColor="rgba(0,0,0,0.45)" justifyContent="center" padding="$4">
          <YStack backgroundColor="$backgroundElevated" borderRadius="$6" padding="$4" gap="$3">
            <Text fontSize={16} fontWeight="700" color="$text">
              {editing ? 'Editar motivo' : 'Nuevo motivo'}
            </Text>
            <AppInput label="Nombre" value={name} onChangeText={setName} />
            <AppInput label="Descripción (opcional)" value={description} onChangeText={setDescription} />
            <XStack gap="$3" marginTop="$2">
              <Button
                flex={1}
                height={44}
                backgroundColor="$buttonSecondary"
                borderRadius="$3"
                pressStyle={{ opacity: 0.7 }}
                onPress={() => setModalOpen(false)}
                disabled={saving}
              >
                <Text color="$text" fontWeight="700">
                  Cancelar
                </Text>
              </Button>
              <Button
                flex={1}
                height={44}
                backgroundColor="$primary"
                borderRadius="$3"
                pressStyle={{ opacity: 0.7 }}
                onPress={save}
                disabled={saving}
                opacity={saving ? 0.6 : 1}
                icon={saving ? <Spinner color="white" /> : undefined}
              >
                <Text color="white" fontWeight="700">
                  Guardar
                </Text>
              </Button>
            </XStack>
          </YStack>
        </View>
      </Modal>
    </Page>
  )
}
