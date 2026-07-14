import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal, RefreshControl, FlatList } from 'react-native'
import { Text, XStack, YStack, View, Spinner, Input, useTheme } from 'tamagui'
import { useFocusEffect } from '@react-navigation/native'
import { Plus, Pencil, Search, Cog } from 'lucide-react-native'

import { usePageHeader } from '../../../hooks/usePageHeader'
import { useShowToast } from '../../../utils/useShowToast'
import AppInput from '../../../components/commons/AppInput'
import AppSelect from '../../../components/commons/AppSelect'
import ConfirmDialog from '../../../components/commons/ConfirmDialog'
import { shadows } from '../../../theme/shadows'
import { ACCENT } from '../mantenimiento.helpers'
import { catalogosService, IMaquina } from '../../../api/modules/mantenimiento/catalogos.service'
import { IArea } from '../../../api/modules/mantenimiento/tickets.types'

export default function MaquinasScreen() {
  const theme = useTheme()
  const { showToast } = useShowToast()

  const [areas, setAreas] = useState<IArea[]>([])
  const [items, setItems] = useState<IMaquina[]>([])
  const [search, setSearch] = useState('')
  const [areaId, setAreaId] = useState<number | undefined>()
  const [loading, setLoading] = useState(true)
  const [refrescando, setRefrescando] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<number | undefined>()
  const [fTipo, setFTipo] = useState('')
  const [fModelo, setFModelo] = useState('')
  const [fAreaId, setFAreaId] = useState<number | undefined>()
  const [fActivo, setFActivo] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [confirm, setConfirm] = useState<IMaquina | null>(null)

  useEffect(() => { catalogosService.getAreas(true).then(r => setAreas(r.Data ?? [])).catch(() => {}) }, [])

  const cargar = useCallback(async () => {
    try {
      const r = await catalogosService.getMaquinas(search.trim() || undefined, areaId, false)
      setItems(r.Data ?? [])
    } catch { setItems([]) }
  }, [search, areaId])

  useEffect(() => { (async () => { setLoading(true); await cargar(); setLoading(false) })() }, [])
  useEffect(() => { const t = setTimeout(() => cargar(), 350); return () => clearTimeout(t) }, [search, areaId, cargar])
  useFocusEffect(useCallback(() => { cargar() }, [cargar]))
  const onRefresh = useCallback(async () => { setRefrescando(true); await cargar(); setRefrescando(false) }, [cargar])

  const abrirCrear = () => { setEditId(undefined); setFTipo(''); setFModelo(''); setFAreaId(areaId); setFActivo(true); setModalOpen(true) }
  const abrirEditar = (m: IMaquina) => {
    setEditId(m.Id); setFTipo(m.TipoMaquina ?? ''); setFModelo(m.Modelo ?? '')
    setFAreaId(m.Area_Id ?? undefined); setFActivo(m.Status_Id === 1); setModalOpen(true)
  }

  const guardar = async () => {
    if (!fTipo.trim() && !fModelo.trim()) { showToast('warning', 'Faltan datos', 'Indica tipo de máquina o modelo'); return }
    setGuardando(true)
    try {
      const dto = { Id: editId, TipoMaquina: fTipo.trim() || null, Modelo: fModelo.trim() || null, Area_Id: fAreaId ?? null,
        ...(editId ? { Status_Id: fActivo ? 1 : 2 } : {}) }
      const res = editId ? await catalogosService.editarMaquina(dto) : await catalogosService.crearMaquina(dto)
      if (res.Success) { showToast('success', 'Guardado', res.SuccessMessage || 'Máquina guardada'); setModalOpen(false); await cargar() }
      else showToast('error', 'No se pudo guardar', res.ErrorMessage || 'Intenta de nuevo')
    } catch (e: any) { showToast('error', 'Error', e?.message || 'No se pudo guardar') }
    finally { setGuardando(false) }
  }

  const doToggle = async () => {
    if (!confirm) return
    const m = confirm; setConfirm(null)
    try {
      const res = await catalogosService.toggleMaquina(m.Id)
      if (res.Success) { showToast('success', 'Listo', res.SuccessMessage || 'Estado actualizado'); await cargar() }
      else showToast('error', 'No se pudo', res.ErrorMessage || 'Intenta de nuevo')
    } catch (e: any) { showToast('error', 'Error', e?.message || 'No se pudo actualizar') }
  }

  usePageHeader({
    center: <Text fontSize="$4" fontWeight="700" color="$text">Máquinas</Text>,
    right: <View onPress={abrirCrear} pressStyle={{ opacity: 0.6 }} hitSlop={8}><Plus size={22} color={theme.text?.val} /></View>,
  })

  const areaOpts = useMemo(
    () => [{ label: 'Todas las áreas', value: 'all' }, ...areas.map(a => ({ label: a.Name, value: String(a.Id) }))],
    [areas],
  )
  const areaModalOpts = useMemo(() => areas.map(a => ({ label: a.Name, value: String(a.Id) })), [areas])

  return (
    <View flex={1} backgroundColor="$background">
      {/* Búsqueda + filtro por área */}
      <YStack paddingHorizontal="$3" paddingTop="$3" gap="$2">
        <XStack alignItems="center" gap="$2" backgroundColor="$backgroundHover" borderRadius="$4" paddingHorizontal="$3" height={44}>
          <Search size={18} color={theme.textMuted?.val} />
          <Input flex={1} unstyled placeholder="Buscar por tipo, modelo o ubicación" placeholderTextColor={theme.textMuted?.val}
            color="$text" fontSize="$3" value={search} onChangeText={setSearch} />
        </XStack>
        <AppSelect label="Área" value={areaId != null ? String(areaId) : 'all'} options={areaOpts}
          onValueChange={v => setAreaId(v === 'all' || v == null ? undefined : Number(v))} />
      </YStack>

      {loading ? (
        <YStack flex={1} alignItems="center" justifyContent="center" gap="$3"><Spinner size="large" color={ACCENT} /><Text color="$textMuted">Cargando…</Text></YStack>
      ) : (
        // FlatList (virtualizado) en vez de ScrollView + map: con ~1,200 máquinas,
        // renderizarlas todas de golpe saturaba el hilo de JS y hacía que el drawer
        // se quedara pegado / glitcheara (sobre todo en el simulador, más lento).
        // Así solo se renderizan las filas visibles.
        <FlatList
          data={items}
          keyExtractor={(m) => String(m.Id)}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View height={10} />}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={9}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} tintColor={ACCENT} />}
          ListEmptyComponent={
            <YStack alignItems="center" justifyContent="center" paddingVertical="$10" gap="$2">
              <Cog size={28} color={theme.textMuted?.val} />
              <Text fontSize="$4" fontWeight="700" color="$text">Sin máquinas</Text>
              <Text fontSize="$2" color="$textMuted">Ajusta la búsqueda o toca el + para agregar.</Text>
            </YStack>
          }
          renderItem={({ item: m }) => {
            const activo = m.Status_Id === 1
            return (
              <XStack backgroundColor="$backgroundElevated" borderRadius="$4"
                borderLeftWidth={4} borderLeftColor={activo ? '$primary' : '$border'} borderWidth={1} borderColor="$border"
                paddingVertical="$3" paddingHorizontal="$4" alignItems="center" gap="$3" {...shadows.sm}
                onPress={() => abrirEditar(m)} pressStyle={{ opacity: 0.8, scale: 0.99 }}>
                <YStack flex={1} gap="$0.5">
                  <Text fontSize={14} fontWeight="800" color="$text">{m.Modelo || m.TipoMaquina || '—'}</Text>
                  <Text fontSize={12} color="$textMuted">
                    {[m.TipoMaquina, m.Area || m.Ubicacion].filter(Boolean).join(' · ') || 'Sin detalle'}
                  </Text>
                </YStack>
                <View onPress={(e: any) => { e?.stopPropagation?.(); setConfirm(m) }} pressStyle={{ opacity: 0.7 }}
                  backgroundColor={activo ? 'rgba(255, 85, 26, 0.12)' : 'rgba(148, 163, 184, 0.15)'} paddingHorizontal="$2" paddingVertical={3} borderRadius="$10">
                  <Text fontSize={10} color={activo ? '$primary' : '$textMuted'} fontWeight="700">{activo ? 'Activo' : 'Inactivo'}</Text>
                </View>
                <View onPress={(e: any) => { e?.stopPropagation?.(); abrirEditar(m) }} pressStyle={{ opacity: 0.6 }} padding="$2" hitSlop={6}>
                  <Pencil size={16} color={theme.primary?.val} />
                </View>
              </XStack>
            )
          }}
        />
      )}

      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={() => setModalOpen(false)}>
        <View flex={1} backgroundColor="rgba(0,0,0,0.45)" alignItems="center" justifyContent="center" padding="$4">
          <YStack width="100%" maxWidth={460} backgroundColor="$background" borderRadius="$6" padding="$4" gap="$3">
            <Text fontSize="$5" fontWeight="900" color="$text">{editId ? 'Editar' : 'Nueva'} · Máquina</Text>
            <AppInput label="Tipo de máquina" value={fTipo} onChangeText={setFTipo} />
            <AppInput label="Modelo" value={fModelo} onChangeText={setFModelo} />
            <AppSelect label="Área / ubicación" value={fAreaId != null ? String(fAreaId) : undefined} options={areaModalOpts}
              onValueChange={v => setFAreaId(v ? Number(v) : undefined)} placeholder="Selecciona el área" />
            {!!editId && (
              <XStack alignItems="center" justifyContent="space-between" paddingVertical="$2">
                <Text fontSize="$3" color="$text" fontWeight="700">{fActivo ? 'Activo' : 'Inactivo'}</Text>
                <View onPress={() => setFActivo(v => !v)} pressStyle={{ opacity: 0.8 }}
                  width={52} height={30} borderRadius={15} padding={3} justifyContent="center" backgroundColor={fActivo ? ACCENT : '$border'}>
                  <View width={24} height={24} borderRadius={12} backgroundColor="#fff" alignSelf={fActivo ? 'flex-end' : 'flex-start'} />
                </View>
              </XStack>
            )}
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
        message={confirm?.Status_Id === 1 ? `¿Desactivar esta máquina?` : `¿Activar esta máquina?`}
        confirmLabel={confirm?.Status_Id === 1 ? 'Desactivar' : 'Activar'}
        confirmColor={confirm?.Status_Id === 1 ? '#ef4444' : '#22c55e'}
        onConfirm={doToggle}
      />
    </View>
  )
}
