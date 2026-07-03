import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal, RefreshControl } from 'react-native'
import { ScrollView, Text, XStack, YStack, View, Spinner, useTheme } from 'tamagui'
import { useFocusEffect } from '@react-navigation/native'
import { ChevronDown, ChevronRight, Plus, Pencil, AlertTriangle } from 'lucide-react-native'

import { usePageHeader } from '../../../hooks/usePageHeader'
import { useShowToast } from '../../../utils/useShowToast'
import AppInput from '../../../components/commons/AppInput'
import AppSelect from '../../../components/commons/AppSelect'
import ConfirmDialog from '../../../components/commons/ConfirmDialog'
import { shadows } from '../../../theme/shadows'
import { ACCENT } from '../mantenimiento.helpers'
import { catalogosService, ITipoFallaAdmin, ICausaFallaAdmin } from '../../../api/modules/mantenimiento/catalogos.service'
import { IArea, IOperacion } from '../../../api/modules/mantenimiento/tickets.types'

type Toggle = { nivel: 'falla' | 'causa'; Id: number; Name: string; Status_Id: number } | null

export default function FallasCausasScreen() {
  const theme = useTheme()
  const { showToast } = useShowToast()

  const [areas, setAreas] = useState<IArea[]>([])
  const [operaciones, setOperaciones] = useState<IOperacion[]>([])
  const [modelos, setModelos] = useState<string[]>([])
  const [areaId, setAreaId] = useState<number | undefined>()
  const [operacionId, setOperacionId] = useState<number | undefined>()
  const [modelo, setModelo] = useState<string | undefined>()

  const [fallas, setFallas] = useState<ITipoFallaAdmin[]>([])
  const [causasByFalla, setCausasByFalla] = useState<Record<number, ICausaFallaAdmin[]>>({})
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const [loading, setLoading] = useState(false)
  const [refrescando, setRefrescando] = useState(false)

  const [modal, setModal] = useState<{ nivel: 'falla' | 'causa'; editId?: number; tipoFallaId?: number } | null>(null)
  const [fName, setFName] = useState('')
  const [fActivo, setFActivo] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [confirm, setConfirm] = useState<Toggle>(null)

  // Áreas de producción (las fallas son de máquina)
  useEffect(() => {
    catalogosService.getAreas(true).then(r => setAreas((r.Data ?? []).filter(a => a.PermiteMaquinas))).catch(() => {})
  }, [])
  useEffect(() => {
    setOperacionId(undefined); setOperaciones([]); setModelo(undefined); setModelos([]); setFallas([])
    if (areaId == null) return
    catalogosService.getOperaciones(areaId, true).then(r => setOperaciones(r.Data ?? [])).catch(() => {})
  }, [areaId])
  useEffect(() => {
    setModelo(undefined); setModelos([]); setFallas([])
    if (operacionId == null) return
    catalogosService.getModelos(operacionId).then(r => setModelos((r.Data ?? []).map(m => m.Modelo))).catch(() => {})
  }, [operacionId])

  const cargarFallas = useCallback(async () => {
    if (operacionId == null || !modelo) { setFallas([]); return }
    const r = await catalogosService.getTiposFalla(operacionId, modelo, false)
    setFallas(r.Data ?? [])
    setCausasByFalla({}); setExpanded({})
  }, [operacionId, modelo])

  useEffect(() => { (async () => { setLoading(true); await cargarFallas(); setLoading(false) })() }, [cargarFallas])
  useFocusEffect(useCallback(() => { cargarFallas() }, [cargarFallas]))
  const onRefresh = useCallback(async () => { setRefrescando(true); await cargarFallas(); setRefrescando(false) }, [cargarFallas])

  const cargarCausas = useCallback(async (fallaId: number) => {
    const r = await catalogosService.getCausas(fallaId, false)
    setCausasByFalla(prev => ({ ...prev, [fallaId]: r.Data ?? [] }))
  }, [])
  const toggleFalla = (fallaId: number) => {
    const willOpen = !expanded[fallaId]
    setExpanded(prev => ({ ...prev, [fallaId]: willOpen }))
    if (willOpen) cargarCausas(fallaId)
  }

  const abrir = (nivel: 'falla' | 'causa', opts?: { editId?: number; tipoFallaId?: number; name?: string; status?: number }) => {
    setModal({ nivel, editId: opts?.editId, tipoFallaId: opts?.tipoFallaId })
    setFName(opts?.name ?? '')
    setFActivo(opts?.status != null ? opts.status === 1 : true)
  }

  const guardar = async () => {
    if (!modal) return
    if (!fName.trim()) { showToast('warning', 'Falta el nombre', 'Escribe un nombre'); return }
    setGuardando(true)
    try {
      const estado = modal.editId ? { Status_Id: fActivo ? 1 : 2 } : {}
      let res
      if (modal.nivel === 'falla') {
        const dto = { Id: modal.editId, Operacion_Id: operacionId, Modelo: modelo, Name: fName.trim(), ...estado }
        res = modal.editId ? await catalogosService.editarTipoFalla(dto) : await catalogosService.crearTipoFalla(dto)
      } else {
        const dto = { Id: modal.editId, TipoFalla_Id: modal.tipoFallaId, Name: fName.trim(), ...estado }
        res = modal.editId ? await catalogosService.editarCausa(dto) : await catalogosService.crearCausa(dto)
      }
      if (res.Success) {
        showToast('success', 'Guardado', res.SuccessMessage || 'Registro guardado')
        const tf = modal.tipoFallaId
        setModal(null)
        await cargarFallas()
        if (modal.nivel === 'causa' && tf) await cargarCausas(tf)
      } else {
        showToast('error', 'No se pudo guardar', res.ErrorMessage || 'Intenta de nuevo')
      }
    } catch (e: any) {
      showToast('error', 'Error', e?.message || 'No se pudo guardar')
    } finally { setGuardando(false) }
  }

  const doToggle = async () => {
    if (!confirm) return
    const c = confirm; setConfirm(null)
    try {
      const res = c.nivel === 'falla' ? await catalogosService.toggleTipoFalla(c.Id) : await catalogosService.toggleCausa(c.Id)
      if (res.Success) {
        showToast('success', 'Listo', res.SuccessMessage || 'Estado actualizado')
        await cargarFallas()
      } else showToast('error', 'No se pudo', res.ErrorMessage || 'Intenta de nuevo')
    } catch (e: any) { showToast('error', 'Error', e?.message || 'No se pudo actualizar') }
  }

  usePageHeader({ center: <Text fontSize="$4" fontWeight="700" color="$text">Fallas y causas</Text> })

  const optArea = useMemo(() => areas.map(a => ({ label: a.Name, value: String(a.Id) })), [areas])
  const optOp = useMemo(() => operaciones.map(o => ({ label: o.Name, value: String(o.Id) })), [operaciones])
  const optModelo = useMemo(() => modelos.map(m => ({ label: m, value: m })), [modelos])
  const listo = operacionId != null && !!modelo

  return (
    <View flex={1} backgroundColor="$background">
      {/* Filtros: Área → Operación → Modelo */}
      <YStack paddingHorizontal="$3" paddingTop="$3" gap="$1">
        <AppSelect label="Área" value={areaId != null ? String(areaId) : undefined} options={optArea}
          onValueChange={v => setAreaId(v ? Number(v) : undefined)} placeholder="Selecciona el área" />
        <AppSelect label="Operación" value={operacionId != null ? String(operacionId) : undefined} options={optOp}
          onValueChange={v => setOperacionId(v ? Number(v) : undefined)} placeholder={areaId == null ? 'Primero el área' : 'Selecciona la operación'} />
        <AppSelect label="Modelo" value={modelo} options={optModelo}
          onValueChange={v => setModelo(v ? String(v) : undefined)} placeholder={operacionId == null ? 'Primero la operación' : 'Selecciona el modelo'} />
      </YStack>

      {!listo ? (
        <YStack flex={1} alignItems="center" justifyContent="center" gap="$2" padding="$6">
          <AlertTriangle size={28} color={theme.textMuted?.val} />
          <Text fontSize="$3" fontWeight="700" color="$text">Selecciona área, operación y modelo</Text>
          <Text fontSize="$2" color="$textMuted" textAlign="center">Para ver y administrar sus tipos de falla y causas.</Text>
        </YStack>
      ) : loading ? (
        <YStack flex={1} alignItems="center" justifyContent="center" gap="$3"><Spinner size="large" color={ACCENT} /><Text color="$textMuted">Cargando…</Text></YStack>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} tintColor={ACCENT} />}>
          <YStack gap="$2.5">
            {fallas.map(f => {
              const open = !!expanded[f.Id]
              const causas = causasByFalla[f.Id] ?? []
              const activaF = f.Status_Id === 1
              return (
                <YStack key={f.Id} borderRadius="$4" borderWidth={1} borderColor="$border" overflow="hidden" {...shadows.sm}>
                  <XStack alignItems="center" gap="$2" padding="$3" backgroundColor="$backgroundElevated"
                    onPress={() => toggleFalla(f.Id)} pressStyle={{ opacity: 0.85 }}>
                    {open ? <ChevronDown size={18} color="#94A3B8" /> : <ChevronRight size={18} color="#94A3B8" />}
                    <Text flex={1} fontSize={14} fontWeight="800" color="$text">{f.Name}</Text>
                    <Badge activo={activaF} onPress={(e) => { e?.stopPropagation?.(); setConfirm({ nivel: 'falla', Id: f.Id, Name: f.Name, Status_Id: f.Status_Id }) }} />
                    <IconBtn onPress={(e) => { e?.stopPropagation?.(); abrir('falla', { editId: f.Id, name: f.Name, status: f.Status_Id }) }} color={theme.primary?.val} />
                  </XStack>
                  {open && (
                    <YStack paddingLeft="$5" paddingRight="$3" paddingBottom="$2" gap="$1.5" backgroundColor="$background">
                      {causas.length === 0 ? (
                        <Text fontSize={12} color="$textMuted" paddingVertical="$2">Sin causas</Text>
                      ) : causas.map(c => (
                        <XStack key={c.Id} alignItems="center" gap="$2" paddingVertical="$1.5">
                          <View width={6} height={6} borderRadius={3} backgroundColor={c.Status_Id === 1 ? '$primary' : '$border'} />
                          <Text flex={1} fontSize={13} color={c.Status_Id === 1 ? '$text' : '$textMuted'}>{c.Name}</Text>
                          <Badge activo={c.Status_Id === 1} small onPress={(e) => { e?.stopPropagation?.(); setConfirm({ nivel: 'causa', Id: c.Id, Name: c.Name, Status_Id: c.Status_Id }) }} />
                          <IconBtn small onPress={(e) => { e?.stopPropagation?.(); abrir('causa', { editId: c.Id, tipoFallaId: f.Id, name: c.Name, status: c.Status_Id }) }} color={theme.primary?.val} />
                        </XStack>
                      ))}
                      <AddRow label="Agregar causa" onPress={() => abrir('causa', { tipoFallaId: f.Id })} />
                    </YStack>
                  )}
                </YStack>
              )
            })}
            <AddRow label="Agregar tipo de falla" onPress={() => abrir('falla')} />
          </YStack>
        </ScrollView>
      )}

      {/* Modal crear/editar */}
      <Modal visible={!!modal} transparent animationType="fade" onRequestClose={() => setModal(null)}>
        <View flex={1} backgroundColor="rgba(0,0,0,0.45)" alignItems="center" justifyContent="center" padding="$4">
          <YStack width="100%" maxWidth={460} backgroundColor="$background" borderRadius="$6" padding="$4" gap="$3">
            <Text fontSize="$5" fontWeight="900" color="$text">
              {modal?.editId ? 'Editar' : 'Nuevo'} · {modal?.nivel === 'falla' ? 'Tipo de falla' : 'Causa'}
            </Text>
            <AppInput label="Nombre" value={fName} onChangeText={setFName} />
            {!!modal?.editId && (
              <XStack alignItems="center" justifyContent="space-between" paddingVertical="$2">
                <Text fontSize="$3" color="$text" fontWeight="700">{fActivo ? 'Activo' : 'Inactivo'}</Text>
                <View onPress={() => setFActivo(v => !v)} pressStyle={{ opacity: 0.8 }}
                  width={52} height={30} borderRadius={15} padding={3} justifyContent="center" backgroundColor={fActivo ? ACCENT : '$border'}>
                  <View width={24} height={24} borderRadius={12} backgroundColor="#fff" alignSelf={fActivo ? 'flex-end' : 'flex-start'} />
                </View>
              </XStack>
            )}
            <XStack gap="$2.5" marginTop="$1">
              <View flex={1} onPress={guardando ? undefined : () => setModal(null)} pressStyle={{ opacity: 0.85 }}
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
          ? `¿Desactivar "${confirm?.Name}"? Dejará de aparecer al diagnosticar.`
          : `¿Activar "${confirm?.Name}"?`}
        confirmLabel={confirm?.Status_Id === 1 ? 'Desactivar' : 'Activar'}
        confirmColor={confirm?.Status_Id === 1 ? '#ef4444' : '#22c55e'}
        onConfirm={doToggle}
      />
    </View>
  )
}

function Badge({ activo, small, onPress }: { activo: boolean; small?: boolean; onPress: (e?: any) => void }) {
  return (
    <View onPress={onPress} pressStyle={{ opacity: 0.7 }}
      backgroundColor={activo ? 'rgba(255, 85, 26, 0.12)' : 'rgba(148, 163, 184, 0.15)'}
      paddingHorizontal="$2" paddingVertical={2} borderRadius="$10">
      <Text fontSize={small ? 9 : 10} color={activo ? '$primary' : '$textMuted'} fontWeight="700">{activo ? 'Activo' : 'Inactivo'}</Text>
    </View>
  )
}
function IconBtn({ onPress, color, small }: { onPress: (e?: any) => void; color?: string; small?: boolean }) {
  return (
    <View onPress={onPress} pressStyle={{ opacity: 0.6 }} padding="$1.5" hitSlop={6}>
      <Pencil size={small ? 14 : 16} color={color} />
    </View>
  )
}
function AddRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <XStack alignItems="center" gap="$2" paddingVertical="$2" paddingHorizontal="$2" onPress={onPress} pressStyle={{ opacity: 0.7 }}>
      <Plus size={16} color={ACCENT} />
      <Text fontSize={13} color={ACCENT} fontWeight="700">{label}</Text>
    </XStack>
  )
}
