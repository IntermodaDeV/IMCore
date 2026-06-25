import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal, RefreshControl } from 'react-native'
import { ScrollView, Text, XStack, YStack, View, Spinner, useTheme } from 'tamagui'
import { useFocusEffect } from '@react-navigation/native'
import { Plus, Pencil, Layers } from 'lucide-react-native'

import { usePageHeader } from '../../../hooks/usePageHeader'
import { useShowToast } from '../../../utils/useShowToast'
import AppInput from '../../../components/commons/AppInput'
import AppSelect from '../../../components/commons/AppSelect'
import ConfirmDialog from '../../../components/commons/ConfirmDialog'
import { shadows } from '../../../theme/shadows'
import { ACCENT } from '../mantenimiento.helpers'
import { catalogosService } from '../../../api/modules/mantenimiento/catalogos.service'
import { IArea } from '../../../api/modules/mantenimiento/tickets.types'

export type CatalogoTipo = 'area' | 'operacion' | 'tipoParo'

type Item = { Id: number; Name: string; Status_Id?: number; Categoria?: string | null; Area_Id?: number }

const TITULOS: Record<CatalogoTipo, string> = {
  area: 'Áreas', operacion: 'Operaciones', tipoParo: 'Tipos de paro',
}
const CATEGORIAS = [
  { label: 'Producción', value: 'Produccion' },
  { label: 'Administrativa', value: 'Administrativa' },
]

export default function CatalogoCrud({ tipo }: { tipo: CatalogoTipo }) {
  const theme = useTheme()
  const { showToast } = useShowToast()

  const [items, setItems] = useState<Item[]>([])
  const [areas, setAreas] = useState<IArea[]>([])          // para operaciones (filtro + form)
  const [areaFiltro, setAreaFiltro] = useState<number | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [refrescando, setRefrescando] = useState(false)

  // Modal crear/editar
  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<number | undefined>(undefined)
  const [fName, setFName] = useState('')
  const [fCategoria, setFCategoria] = useState('Produccion')
  const [fAreaId, setFAreaId] = useState<number | undefined>(undefined)
  const [guardando, setGuardando] = useState(false)

  // Confirmación de toggle
  const [confirm, setConfirm] = useState<Item | null>(null)

  const cargarAreas = useCallback(async () => {
    const r = await catalogosService.getAreas(true)
    setAreas(r.Data ?? [])
    return r.Data ?? []
  }, [])

  const cargar = useCallback(async () => {
    try {
      if (tipo === 'area') {
        const r = await catalogosService.getAreas(false)
        setItems(r.Data ?? [])
      } else if (tipo === 'tipoParo') {
        const r = await catalogosService.getTiposParo(false)
        setItems(r.Data ?? [])
      } else {
        // operaciones: requiere un área seleccionada
        let activas = areas
        if (activas.length === 0) activas = await cargarAreas()
        const aId = areaFiltro ?? activas[0]?.Id
        if (aId && areaFiltro === undefined) setAreaFiltro(aId)
        if (aId) {
          const r = await catalogosService.getOperaciones(aId, false)
          setItems(r.Data ?? [])
        } else {
          setItems([])
        }
      }
    } catch {
      setItems([])
    }
  }, [tipo, areaFiltro, areas, cargarAreas])

  useEffect(() => { (async () => { setLoading(true); await cargar(); setLoading(false) })() }, [cargar])
  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  const onRefresh = useCallback(async () => { setRefrescando(true); await cargar(); setRefrescando(false) }, [cargar])

  const abrirCrear = () => {
    setEditId(undefined); setFName(''); setFCategoria('Produccion')
    setFAreaId(tipo === 'operacion' ? (areaFiltro ?? areas[0]?.Id) : undefined)
    setModalOpen(true)
  }
  const abrirEditar = (it: Item) => {
    setEditId(it.Id); setFName(it.Name)
    setFCategoria(it.Categoria || 'Produccion')
    setFAreaId(it.Area_Id)
    setModalOpen(true)
  }

  const guardar = async () => {
    if (!fName.trim()) { showToast('warning', 'Falta el nombre', 'Escribe un nombre'); return }
    if (tipo === 'operacion' && !fAreaId) { showToast('warning', 'Falta el área', 'Selecciona un área'); return }
    setGuardando(true)
    try {
      let res
      if (tipo === 'area') {
        const dto = { Id: editId, Name: fName.trim(), Categoria: fCategoria }
        res = editId ? await catalogosService.editarArea(dto) : await catalogosService.crearArea(dto)
      } else if (tipo === 'tipoParo') {
        const dto = { Id: editId, Name: fName.trim() }
        res = editId ? await catalogosService.editarTipoParo(dto) : await catalogosService.crearTipoParo(dto)
      } else {
        const dto = { Id: editId, Area_Id: fAreaId!, Name: fName.trim() }
        res = editId ? await catalogosService.editarOperacion(dto) : await catalogosService.crearOperacion(dto)
      }
      if (res.Success) {
        showToast('success', 'Guardado', res.SuccessMessage || 'Registro guardado')
        setModalOpen(false); await cargar()
      } else {
        showToast('error', 'No se pudo guardar', res.ErrorMessage || 'Intenta de nuevo')
      }
    } catch (e: any) {
      showToast('error', 'Error', e?.message || 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  const doToggle = async () => {
    if (!confirm) return
    const it = confirm; setConfirm(null)
    try {
      const res = tipo === 'area' ? await catalogosService.toggleArea(it.Id)
        : tipo === 'tipoParo' ? await catalogosService.toggleTipoParo(it.Id)
        : await catalogosService.toggleOperacion(it.Id)
      if (res.Success) { showToast('success', 'Listo', res.SuccessMessage || 'Estado actualizado'); await cargar() }
      else showToast('error', 'No se pudo', res.ErrorMessage || 'Intenta de nuevo')
    } catch (e: any) {
      showToast('error', 'Error', e?.message || 'No se pudo actualizar')
    }
  }

  usePageHeader({
    center: <Text fontSize="$4" fontWeight="700" color="$text">{TITULOS[tipo]}</Text>,
    right: (
      <View onPress={abrirCrear} pressStyle={{ opacity: 0.6 }} hitSlop={8}>
        <Plus size={22} color={theme.text?.val} />
      </View>
    ),
  })

  const areaOpts = useMemo(() => areas.map(a => ({ label: a.Name, value: String(a.Id) })), [areas])

  return (
    <View flex={1} backgroundColor="$background">
      {/* Filtro de área (solo operaciones) */}
      {tipo === 'operacion' && (
        <YStack paddingHorizontal="$3" paddingTop="$3">
          <AppSelect
            label="Área"
            value={areaFiltro !== undefined ? String(areaFiltro) : undefined}
            options={areaOpts}
            onValueChange={v => setAreaFiltro(v ? Number(v) : undefined)}
            placeholder="Selecciona un área"
          />
        </YStack>
      )}

      {loading ? (
        <YStack flex={1} alignItems="center" justifyContent="center" gap="$3">
          <Spinner size="large" color={ACCENT} /><Text color="$textMuted">Cargando…</Text>
        </YStack>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} tintColor={ACCENT} />}
        >
          {items.length === 0 ? (
            <YStack alignItems="center" justifyContent="center" paddingVertical="$10" gap="$2">
              <Layers size={28} color={theme.textMuted?.val} />
              <Text fontSize="$4" fontWeight="700" color="$text">Sin registros</Text>
              <Text fontSize="$2" color="$textMuted">Toca el + para agregar.</Text>
            </YStack>
          ) : (
            <YStack gap="$2.5">
              {items.map(it => {
                const activo = it.Status_Id === 1
                const sub = tipo === 'area'
                  ? (it.Categoria === 'Administrativa' ? 'Administrativa' : 'Producción')
                  : tipo === 'operacion'
                    ? (areas.find(a => a.Id === it.Area_Id)?.Name ?? '')
                    : ''
                return (
                  <XStack
                    key={it.Id}
                    backgroundColor="$backgroundElevated"
                    borderRadius="$4"
                    borderLeftWidth={4}
                    borderLeftColor={activo ? '$primary' : '$border'}
                    borderWidth={1}
                    borderColor="$border"
                    paddingVertical="$3"
                    paddingHorizontal="$4"
                    alignItems="center"
                    gap="$3"
                    {...shadows.sm}
                    onPress={() => abrirEditar(it)}
                    pressStyle={{ opacity: 0.8, scale: 0.99 }}
                  >
                    <YStack flex={1} gap="$0.5">
                      <Text fontSize={14} fontWeight="800" color="$text">{it.Name}</Text>
                      {!!sub && <Text fontSize={12} color="$textMuted">{sub}</Text>}
                    </YStack>
                    <XStack alignItems="center" gap="$2">
                      <View
                        onPress={(e: any) => { e?.stopPropagation?.(); setConfirm(it) }}
                        pressStyle={{ opacity: 0.7 }}
                        backgroundColor={activo ? 'rgba(255, 85, 26, 0.12)' : 'rgba(148, 163, 184, 0.15)'}
                        paddingHorizontal="$2" paddingVertical={3} borderRadius="$10"
                      >
                        <Text fontSize={10} color={activo ? '$primary' : '$textMuted'} fontWeight="700">
                          {activo ? 'Activo' : 'Inactivo'}
                        </Text>
                      </View>
                      <View onPress={(e: any) => { e?.stopPropagation?.(); abrirEditar(it) }} pressStyle={{ opacity: 0.6 }} padding="$2" hitSlop={6}>
                        <Pencil size={16} color={theme.primary?.val} />
                      </View>
                    </XStack>
                  </XStack>
                )
              })}
            </YStack>
          )}
        </ScrollView>
      )}

      {/* Modal crear/editar */}
      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={() => setModalOpen(false)}>
        <View flex={1} backgroundColor="rgba(0,0,0,0.45)" alignItems="center" justifyContent="center" padding="$4">
          <YStack width="100%" maxWidth={460} backgroundColor="$background" borderRadius="$6" padding="$4" gap="$3">
            <Text fontSize="$5" fontWeight="900" color="$text">
              {editId ? 'Editar' : 'Nuevo'} · {TITULOS[tipo]}
            </Text>

            <AppInput label="Nombre" value={fName} onChangeText={setFName} />

            {tipo === 'area' && (
              <AppSelect label="Categoría" value={fCategoria} options={CATEGORIAS}
                onValueChange={v => setFCategoria(String(v))} />
            )}
            {tipo === 'operacion' && (
              <AppSelect label="Área" value={fAreaId !== undefined ? String(fAreaId) : undefined} options={areaOpts}
                onValueChange={v => setFAreaId(v ? Number(v) : undefined)} placeholder="Selecciona un área" />
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
        message={confirm?.Status_Id === 1
          ? `¿Desactivar "${confirm?.Name}"? Dejará de aparecer al crear tickets.`
          : `¿Activar "${confirm?.Name}"?`}
        confirmLabel={confirm?.Status_Id === 1 ? 'Desactivar' : 'Activar'}
        confirmColor={confirm?.Status_Id === 1 ? '#ef4444' : '#22c55e'}
        onConfirm={doToggle}
      />
    </View>
  )
}
