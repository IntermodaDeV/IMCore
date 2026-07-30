import React, { useCallback, useEffect, useState } from 'react'
import { Modal, RefreshControl, FlatList } from 'react-native'
import { Text, XStack, YStack, View, Spinner, Input, useTheme } from 'tamagui'
import { useFocusEffect } from '@react-navigation/native'
import { Plus, Pencil, PauseCircle, Search } from 'lucide-react-native'

import { usePageHeader } from '../../../hooks/usePageHeader'
import { useShowToast } from '../../../utils/useShowToast'
import AppInput from '../../../components/commons/AppInput'
import ConfirmDialog from '../../../components/commons/ConfirmDialog'
import { shadows } from '../../../theme/shadows'
import { ACCENT } from '../mantenimiento.helpers'
import { catalogosService } from '../../../api/modules/mantenimiento/catalogos.service'
import { IMotivoPausa } from '../../../api/modules/mantenimiento/tickets.types'

export default function MotivosPausaScreen() {
  const theme = useTheme()
  const { showToast } = useShowToast()

  const [items, setItems] = useState<IMotivoPausa[]>([])
  const [loading, setLoading] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<number | undefined>(undefined)
  const [fName, setFName] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [confirm, setConfirm] = useState<IMotivoPausa | null>(null)
  const [search, setSearch] = useState('')

  // Filtro en cliente por nombre (la lista es chica; instantáneo, sin round-trip).
  const q = search.trim().toLowerCase()
  const filtrados = q ? items.filter(it => it.Name.toLowerCase().includes(q)) : items

  const cargar = useCallback(async () => {
    try { const r = await catalogosService.getMotivosPausa(false); setItems(r.Data ?? []) }
    catch { setItems([]) }
  }, [])

  useEffect(() => { (async () => { setLoading(true); await cargar(); setLoading(false) })() }, [cargar])
  useFocusEffect(useCallback(() => { cargar() }, [cargar]))
  const onRefresh = useCallback(async () => { setRefrescando(true); await cargar(); setRefrescando(false) }, [cargar])

  const abrirCrear = () => { setEditId(undefined); setFName(''); setModalOpen(true) }
  const abrirEditar = (it: IMotivoPausa) => { setEditId(it.Id); setFName(it.Name); setModalOpen(true) }

  const guardar = async () => {
    if (!fName.trim()) { showToast('warning', 'Falta el nombre', 'Escribe un nombre'); return }
    setGuardando(true)
    try {
      const dto = { Id: editId, Name: fName.trim() }
      const res = editId ? await catalogosService.editarMotivoPausa(dto) : await catalogosService.crearMotivoPausa(dto)
      if (res.Success) { showToast('success', 'Guardado', res.SuccessMessage || 'Registro guardado'); setModalOpen(false); await cargar() }
      else showToast('error', 'No se pudo guardar', res.ErrorMessage || 'Intenta de nuevo')
    } catch (e: any) { showToast('error', 'Error', e?.message || 'No se pudo guardar') }
    finally { setGuardando(false) }
  }

  const doToggle = async () => {
    if (!confirm) return
    const it = confirm; setConfirm(null)
    try {
      const res = await catalogosService.toggleMotivoPausa(it.Id)
      if (res.Success) { showToast('success', 'Listo', res.SuccessMessage || 'Estado actualizado'); await cargar() }
      else showToast('error', 'No se pudo', res.ErrorMessage || 'Intenta de nuevo')
    } catch (e: any) { showToast('error', 'Error', e?.message || 'No se pudo actualizar') }
  }

  usePageHeader({
    center: <Text fontSize="$4" fontWeight="700" color="$text">Motivos de pausa</Text>,
    right: <View onPress={abrirCrear} pressStyle={{ opacity: 0.6 }} hitSlop={8}><Plus size={22} color={theme.text?.val} /></View>,
  })

  return (
    <View flex={1} backgroundColor="$background">
      {loading ? (
        <YStack flex={1} alignItems="center" justifyContent="center" gap="$3"><Spinner size="large" color={ACCENT} /><Text color="$textMuted">Cargando…</Text></YStack>
      ) : (
        <>
          <YStack paddingHorizontal="$3" paddingTop="$3">
            <XStack alignItems="center" gap="$2" backgroundColor="$backgroundHover" borderRadius="$4" paddingHorizontal="$3" height={44}>
              <Search size={18} color={theme.textMuted?.val} />
              <Input flex={1} unstyled placeholder="Buscar motivo" placeholderTextColor={theme.textMuted?.val}
                color="$text" fontSize="$3" value={search} onChangeText={setSearch} autoCapitalize="none" />
              {search.length > 0 ? (
                <Text onPress={() => setSearch('')} pressStyle={{ opacity: 0.6 }} color="$textMuted" fontSize="$5" paddingHorizontal="$1">×</Text>
              ) : null}
            </XStack>
          </YStack>
          <FlatList
            data={filtrados}
            keyExtractor={(it) => String(it.Id)}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 12, paddingBottom: 40, flexGrow: 1 }}
            ItemSeparatorComponent={() => <View height={10} />}
            initialNumToRender={12}
            maxToRenderPerBatch={12}
            windowSize={9}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} tintColor={ACCENT} />}
            ListEmptyComponent={
              <YStack alignItems="center" justifyContent="center" paddingVertical="$10" gap="$2">
                <PauseCircle size={28} color={theme.textMuted?.val} />
                <Text fontSize="$4" fontWeight="700" color="$text">{q ? 'Sin resultados' : 'Sin registros'}</Text>
                <Text fontSize="$2" color="$textMuted">{q ? `No hay motivos que coincidan con "${search.trim()}".` : 'Toca el + para agregar.'}</Text>
              </YStack>
            }
          renderItem={({ item: it }) => {
            const activo = it.Status_Id === 1
            return (
              <XStack backgroundColor="$backgroundElevated" borderRadius="$4"
                borderLeftWidth={4} borderLeftColor={activo ? '$primary' : '$border'} borderWidth={1} borderColor="$border"
                paddingVertical="$3" paddingHorizontal="$4" alignItems="center" gap="$3" {...shadows.sm}
                onPress={() => abrirEditar(it)} pressStyle={{ opacity: 0.8, scale: 0.99 }}>
                <Text flex={1} fontSize={14} fontWeight="800" color="$text">{it.Name}</Text>
                <View onPress={(e: any) => { e?.stopPropagation?.(); setConfirm(it) }} pressStyle={{ opacity: 0.7 }}
                  backgroundColor={activo ? 'rgba(255, 85, 26, 0.12)' : 'rgba(148, 163, 184, 0.15)'} paddingHorizontal="$2" paddingVertical={3} borderRadius="$10">
                  <Text fontSize={10} color={activo ? '$primary' : '$textMuted'} fontWeight="700">{activo ? 'Activo' : 'Inactivo'}</Text>
                </View>
                <View onPress={(e: any) => { e?.stopPropagation?.(); abrirEditar(it) }} pressStyle={{ opacity: 0.6 }} padding="$2" hitSlop={6}>
                  <Pencil size={16} color={theme.primary?.val} />
                </View>
              </XStack>
            )
          }}
          />
        </>
      )}

      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={() => setModalOpen(false)}>
        <View flex={1} backgroundColor="rgba(0,0,0,0.45)" alignItems="center" justifyContent="center" padding="$4">
          <YStack width="100%" maxWidth={460} backgroundColor="$background" borderRadius="$6" padding="$4" gap="$3">
            <Text fontSize="$5" fontWeight="900" color="$text">{editId ? 'Editar' : 'Nuevo'} · Motivo de pausa</Text>
            <AppInput label="Nombre" value={fName} onChangeText={setFName} />
            <XStack gap="$2.5" marginTop="$1">
              <View flex={1} onPress={guardando ? undefined : () => setModalOpen(false)} pressStyle={{ opacity: 0.85 }}
                borderWidth={1.5} borderColor="$border" borderRadius="$4" height={46} alignItems="center" justifyContent="center">
                <Text color="$text" fontWeight="800" fontSize="$3">Cancelar</Text>
              </View>
              <View flex={1} onPress={guardando ? undefined : guardar} pressStyle={{ opacity: 0.85 }}
                opacity={guardando ? 0.6 : 1} backgroundColor={ACCENT} borderRadius="$4" height={46}
                alignItems="center" justifyContent="center" flexDirection="row" gap="$2">
                {guardando ? <Spinner color="#fff" /> : null}
                <Text color="#fff" fontWeight="800" fontSize="$3">Guardar</Text>
              </View>
            </XStack>
          </YStack>
        </View>
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o: boolean) => { if (!o) setConfirm(null) }}
        title={confirm?.Status_Id === 1 ? 'Desactivar' : 'Activar'}
        message={confirm?.Status_Id === 1 ? `¿Desactivar "${confirm?.Name}"?` : `¿Activar "${confirm?.Name}"?`}
        confirmLabel={confirm?.Status_Id === 1 ? 'Desactivar' : 'Activar'}
        confirmColor={confirm?.Status_Id === 1 ? '#ef4444' : '#22c55e'}
        onConfirm={doToggle}
      />
    </View>
  )
}