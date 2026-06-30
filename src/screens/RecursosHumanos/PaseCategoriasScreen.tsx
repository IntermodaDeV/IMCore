import React, { useEffect, useState } from 'react'
import { Modal, RefreshControl } from 'react-native'
import { YStack, XStack, Text, Button, View, ScrollView, Spinner } from 'tamagui'
import { Plus, Pencil, DoorOpen, DoorClosed } from 'lucide-react-native'
import Page from '../../components/commons/Page'
import AppInput from '../../components/commons/AppInput'
import AppSelect from '../../components/commons/AppSelect'
import { usePasesHeader } from './usePasesHeader'
import { useAuth } from '../../context/AuthContext'
import { useShowToast } from '../../utils/useShowToast'
import { pasesService } from '../../api/modules/pases/pases.service'
import { IPaseCategoria } from '../../api/modules/pases/pases.types'
import { handleError } from '../../utils/errorHandler'

const TIPO_OPTIONS = [
  { label: 'Entrada', value: 'E' },
  { label: 'Salida', value: 'S' },
]

export default function PaseCategoriasScreen() {
  const { user } = useAuth()
  const { showToast } = useShowToast()

  const [categorias, setCategorias] = useState<IPaseCategoria[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<IPaseCategoria | null>(null)
  const [name, setName] = useState('')
  const [tipo, setTipo] = useState<string>('E')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [togglingId, setTogglingId] = useState<number | null>(null)

  usePasesHeader('Categorías de pase')

  const load = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const resp = await pasesService.getCategorias(false)
      if (resp.Success) setCategorias(resp.Data ?? [])
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
    setTipo('E')
    setDescription('')
    setModalOpen(true)
  }

  const openEdit = (c: IPaseCategoria) => {
    setEditing(c)
    setName(c.Name)
    setTipo(c.Tipo || 'E')
    setDescription(c.Description ?? '')
    setModalOpen(true)
  }

  const save = async () => {
    if (!name.trim()) return showToast('error', 'Validación', 'El nombre es requerido', 4000, 'bottom')
    if (tipo !== 'E' && tipo !== 'S') return showToast('error', 'Validación', 'Selecciona el tipo', 4000, 'bottom')
    setSaving(true)
    try {
      const payload: IPaseCategoria = {
        Id: editing?.Id ?? 0,
        Name: name.trim(),
        Tipo: tipo,
        Description: description.trim() || null,
        Status_Id: editing?.Status_Id ?? 1,
        Create_By: user?.Code,
        Modified_By: user?.Code,
      }
      const resp = await pasesService.saveCategoria(payload)
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

  const toggle = async (c: IPaseCategoria) => {
    setTogglingId(c.Id!)
    try {
      const resp = await pasesService.changeStatusCategoria({
        ...c,
        Status_Id: c.Status_Id === 1 ? 2 : 1,
        Modified_By: user?.Code,
      })
      if (resp.Success) await load(true)
      else showToast('error', 'Error', resp.ErrorMessage || 'No se pudo actualizar', 5000, 'bottom')
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
            <Text color="white" fontWeight="700">Nueva categoría</Text>
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
                onRefresh={() => { setRefreshing(true); load(true) }}
                tintColor="#FF551A"
              />
            }
          >
            <YStack paddingHorizontal="$4" paddingBottom="$4" gap="$3">
              {categorias.map((c) => {
                const active = c.Status_Id === 1
                const esEntrada = c.Tipo === 'E'
                return (
                  <XStack
                    key={c.Id}
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
                    <View position="absolute" left={0} top={0} bottom={0} width={4} backgroundColor={active ? '$primary' : 'transparent'} />
                    <View
                      width={38} height={38} borderRadius={19}
                      backgroundColor={esEntrada ? 'rgba(34,197,94,0.12)' : 'rgba(255,85,26,0.12)'}
                      justifyContent="center" alignItems="center"
                    >
                      {esEntrada ? <DoorOpen size={18} color="#15803D" /> : <DoorClosed size={18} color="#FF551A" />}
                    </View>

                    <YStack flex={1} gap="$0.5">
                      <Text fontWeight="700" fontSize={14} color="$text">{c.Name}</Text>
                      <Text fontSize={12} color="$textMuted">
                        {esEntrada ? 'Entrada' : 'Salida'}{c.Description ? ` · ${c.Description}` : ''}
                      </Text>
                    </YStack>

                    <View onPress={() => openEdit(c)} pressStyle={{ opacity: 0.6 }} padding="$2">
                      <Pencil size={18} color="#FF551A" />
                    </View>

                    <View
                      onPress={() => togglingId === null && toggle(c)}
                      pressStyle={{ opacity: 0.7 }}
                      backgroundColor={active ? 'rgba(255, 85, 26, 0.12)' : 'rgba(148,163,184,0.15)'}
                      paddingHorizontal="$2.5" paddingVertical="$1.5" borderRadius="$10" minWidth={74} alignItems="center"
                    >
                      {togglingId === c.Id ? (
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

      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={() => setModalOpen(false)}>
        <View flex={1} backgroundColor="rgba(0,0,0,0.45)" justifyContent="center" padding="$4">
          <YStack backgroundColor="$backgroundElevated" borderRadius="$6" padding="$4" gap="$3">
            <Text fontSize={16} fontWeight="700" color="$text">
              {editing ? 'Editar categoría' : 'Nueva categoría'}
            </Text>
            <AppInput label="Nombre" value={name} onChangeText={setName} />
            <AppSelect label="Tipo" value={tipo} onValueChange={(v) => setTipo(String(v))} options={TIPO_OPTIONS} />
            <AppInput label="Descripción (opcional)" value={description} onChangeText={setDescription} />
            <XStack gap="$3" marginTop="$2">
              <Button flex={1} height={44} backgroundColor="$buttonSecondary" borderRadius="$3" pressStyle={{ opacity: 0.7 }} onPress={() => setModalOpen(false)} disabled={saving}>
                <Text color="$text" fontWeight="700">Cancelar</Text>
              </Button>
              <Button
                flex={1} height={44} backgroundColor="$primary" borderRadius="$3" pressStyle={{ opacity: 0.7 }}
                onPress={save} disabled={saving} opacity={saving ? 0.6 : 1}
                icon={saving ? <Spinner color="white" /> : undefined}
              >
                <Text color="white" fontWeight="700">Guardar</Text>
              </Button>
            </XStack>
          </YStack>
        </View>
      </Modal>
    </Page>
  )
}
