import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal, RefreshControl } from 'react-native'
import { ScrollView, Text, XStack, YStack, View, Spinner, useTheme } from 'tamagui'
import { useFocusEffect } from '@react-navigation/native'
import { ChevronDown, ChevronRight, ChevronUp, Plus, Pencil, Wrench } from 'lucide-react-native'

import { usePageHeader } from '../../../hooks/usePageHeader'
import { useShowToast } from '../../../utils/useShowToast'
import AppInput from '../../../components/commons/AppInput'
import AppSelect from '../../../components/commons/AppSelect'
import ConfirmDialog from '../../../components/commons/ConfirmDialog'
import { shadows } from '../../../theme/shadows'
import { ACCENT } from '../mantenimiento.helpers'
import { catalogosService, IAreaPrincipal } from '../../../api/modules/mantenimiento/catalogos.service'
import { IArea, IOperacion } from '../../../api/modules/mantenimiento/tickets.types'

type Nivel = 'principal' | 'area' | 'operacion'
type Toggle = { nivel: Nivel; Id: number; Name: string; Status_Id?: number } | null

export default function EstructuraScreen() {
  const theme = useTheme()
  const { showToast } = useShowToast()

  const [principales, setPrincipales] = useState<IAreaPrincipal[]>([])
  const [areas, setAreas] = useState<IArea[]>([])
  const [opsByArea, setOpsByArea] = useState<Record<number, IOperacion[]>>({})
  const [loading, setLoading] = useState(true)
  const [refrescando, setRefrescando] = useState(false)

  const [expP, setExpP] = useState<Record<number, boolean>>({})
  const [expA, setExpA] = useState<Record<number, boolean>>({})

  // Modal único para los 3 niveles
  const [modal, setModal] = useState<{ nivel: Nivel; editId?: number; areaPrincipalId?: number; areaId?: number } | null>(null)
  const [fName, setFName] = useState('')
  const [fPermite, setFPermite] = useState(false)
  const [fPrincipalId, setFPrincipalId] = useState<number | undefined>(undefined)
  const [fActivo, setFActivo] = useState(true)
  const [fOrden, setFOrden] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [moviendo, setMoviendo] = useState(false)
  const [confirm, setConfirm] = useState<Toggle>(null)

  const cargar = useCallback(async () => {
    try {
      const [p, a] = await Promise.all([
        catalogosService.getAreasPrincipales(false),
        catalogosService.getAreas(false),
      ])
      setPrincipales(p.Data ?? [])
      setAreas(a.Data ?? [])
    } catch {
      setPrincipales([]); setAreas([])
    }
  }, [])

  useEffect(() => { (async () => { setLoading(true); await cargar(); setLoading(false) })() }, [cargar])
  useFocusEffect(useCallback(() => { cargar() }, [cargar]))
  const onRefresh = useCallback(async () => { setRefrescando(true); await cargar(); setRefrescando(false) }, [cargar])

  const cargarOps = useCallback(async (areaId: number) => {
    const r = await catalogosService.getOperaciones(areaId, false)
    setOpsByArea(prev => ({ ...prev, [areaId]: r.Data ?? [] }))
  }, [])

  // Subir/bajar una operación dentro de su área. Reordena las ACTIVAS y persiste
  // el nuevo orden (backend fija Orden 1..N). Optimista: actualiza la UI al toque.
  const moverOp = useCallback(async (areaId: number, opId: number, dir: -1 | 1) => {
    if (moviendo) return
    const lista = opsByArea[areaId] ?? []
    const activos = lista.filter(o => o.Status_Id === 1)
    const inactivos = lista.filter(o => o.Status_Id !== 1)
    const i = activos.findIndex(o => o.Id === opId)
    const j = i + dir
    if (i < 0 || j < 0 || j >= activos.length) return
    const nuevos = [...activos]
    ;[nuevos[i], nuevos[j]] = [nuevos[j], nuevos[i]]
    const reordenados = nuevos.map((o, idx) => ({ ...o, Orden: idx + 1 }))
    setOpsByArea(prev => ({ ...prev, [areaId]: [...reordenados, ...inactivos] }))  // optimista
    setMoviendo(true)
    try {
      const res = await catalogosService.reordenarOperaciones(areaId, nuevos.map(o => o.Id))
      if (!res.Success) { showToast('error', 'No se pudo reordenar', res.ErrorMessage || 'Intenta de nuevo'); await cargarOps(areaId) }
    } catch (e: any) {
      showToast('error', 'Error', e?.message || 'No se pudo reordenar'); await cargarOps(areaId)
    } finally { setMoviendo(false) }
  }, [opsByArea, moviendo, cargarOps])

  const toggleArea = (areaId: number) => {
    const willOpen = !expA[areaId]
    setExpA(prev => ({ ...prev, [areaId]: willOpen }))
    if (willOpen) cargarOps(areaId)   // recarga siempre al abrir (operaciones frescas)
  }

  const areasDe = (principalId: number) => areas.filter(a => a.AreaPrincipal_Id === principalId)

  // ── Modales ────────────────────────────────────────────────────────────────
  const abrir = (nivel: Nivel, opts?: { editId?: number; areaPrincipalId?: number; areaId?: number; name?: string; permite?: boolean; principalId?: number; status?: number; orden?: number | null }) => {
    setModal({ nivel, editId: opts?.editId, areaPrincipalId: opts?.areaPrincipalId, areaId: opts?.areaId })
    setFName(opts?.name ?? '')
    setFPermite(opts?.permite ?? false)
    setFPrincipalId(opts?.principalId ?? opts?.areaPrincipalId)
    setFActivo(opts?.status != null ? opts.status === 1 : true)
    setFOrden(opts?.orden != null ? String(opts.orden) : '')
  }

  const guardar = async () => {
    if (!modal) return
    if (!fName.trim()) { showToast('warning', 'Falta el nombre', 'Escribe un nombre'); return }
    if (modal.nivel === 'area' && !fPrincipalId) { showToast('warning', 'Falta el área principal', 'Selecciona el área principal'); return }
    setGuardando(true)
    try {
      const estado = modal.editId ? { Status_Id: fActivo ? 1 : 2 } : {}
      let res
      if (modal.nivel === 'principal') {
        const dto = { Id: modal.editId, Name: fName.trim(), PermiteMaquinas: fPermite, ...estado }
        res = modal.editId ? await catalogosService.editarAreaPrincipal(dto) : await catalogosService.crearAreaPrincipal(dto)
      } else if (modal.nivel === 'area') {
        const dto = { Id: modal.editId, Name: fName.trim(), AreaPrincipal_Id: fPrincipalId!, ...estado }
        res = modal.editId ? await catalogosService.editarArea(dto) : await catalogosService.crearArea(dto)
      } else {
        const dto = { Id: modal.editId, Area_Id: modal.areaId!, Name: fName.trim(), Orden: fOrden.trim() ? Number(fOrden) : undefined, ...estado }
        res = modal.editId ? await catalogosService.editarOperacion(dto) : await catalogosService.crearOperacion(dto)
      }
      if (res.Success) {
        showToast('success', 'Guardado', res.SuccessMessage || 'Registro guardado')
        const areaId = modal.areaId
        setModal(null)
        await cargar()
        if (modal.nivel === 'operacion' && areaId) await cargarOps(areaId)
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
      const res = c.nivel === 'principal' ? await catalogosService.toggleAreaPrincipal(c.Id)
        : c.nivel === 'area' ? await catalogosService.toggleArea(c.Id)
        : await catalogosService.toggleOperacion(c.Id)
      if (res.Success) {
        showToast('success', 'Listo', res.SuccessMessage || 'Estado actualizado')
        await cargar()
        if (c.nivel === 'operacion') { const aId = Object.keys(opsByArea).map(Number).find(k => (opsByArea[k] ?? []).some(o => o.Id === c.Id)); if (aId) await cargarOps(aId) }
      } else showToast('error', 'No se pudo', res.ErrorMessage || 'Intenta de nuevo')
    } catch (e: any) { showToast('error', 'Error', e?.message || 'No se pudo actualizar') }
  }

  usePageHeader({
    center: <Text fontSize="$4" fontWeight="700" color="$text">Áreas y operaciones</Text>,
    right: (
      <View onPress={() => abrir('principal')} pressStyle={{ opacity: 0.6 }} hitSlop={8}>
        <Plus size={22} color={theme.text?.val} />
      </View>
    ),
  })

  const principalOpts = useMemo(
    () => principales.filter(p => p.Status_Id === 1).map(p => ({ label: p.Name, value: String(p.Id) })),
    [principales],
  )

  if (loading) {
    return (
      <YStack flex={1} backgroundColor="$background" alignItems="center" justifyContent="center" gap="$3">
        <Spinner size="large" color={ACCENT} /><Text color="$textMuted">Cargando…</Text>
      </YStack>
    )
  }

  return (
    <View flex={1} backgroundColor="$background">
      <ScrollView
        contentContainerStyle={{ padding: 12, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} tintColor={ACCENT} />}
      >
        <Text fontSize="$2" color="$textMuted" marginBottom="$2">
          Estructura: Área principal › Área › Operación. Toca el + (arriba) para agregar un área principal.
        </Text>

        {principales.map(p => {
          const open = !!expP[p.Id]
          const hijos = areasDe(p.Id)
          const activoP = p.Status_Id === 1
          return (
            <YStack key={p.Id} marginBottom="$2.5" borderRadius="$4" borderWidth={1} borderColor="$border" overflow="hidden" {...shadows.sm}>
              {/* Principal */}
              <XStack alignItems="center" gap="$2" padding="$3" backgroundColor="$backgroundElevated"
                onPress={() => setExpP(prev => ({ ...prev, [p.Id]: !open }))} pressStyle={{ opacity: 0.85 }}>
                {open ? <ChevronDown size={18} color="#94A3B8" /> : <ChevronRight size={18} color="#94A3B8" />}
                <YStack flex={1}>
                  <Text fontSize={15} fontWeight="900" color="$text">{p.Name}</Text>
                  <Text fontSize={11} color="$textMuted">{hijos.length} área(s){p.PermiteMaquinas ? ' · permite máquinas' : ''}</Text>
                </YStack>
                {p.PermiteMaquinas && <Wrench size={14} color={theme.textMuted?.val} />}
                <Badge activo={activoP} onPress={(e) => { e?.stopPropagation?.(); setConfirm({ nivel: 'principal', Id: p.Id, Name: p.Name, Status_Id: p.Status_Id }) }} />
                <IconBtn onPress={(e) => { e?.stopPropagation?.(); abrir('principal', { editId: p.Id, name: p.Name, permite: p.PermiteMaquinas, status: p.Status_Id }) }} color={theme.primary?.val} />
              </XStack>

              {open && (
                <YStack padding="$2" gap="$2" backgroundColor="$background">
                  {hijos.map(a => {
                    const openA = !!expA[a.Id]
                    const ops = opsByArea[a.Id] ?? []
                    const idsActivos = ops.filter(o => o.Status_Id === 1).map(o => o.Id)
                    const primerActivo = idsActivos[0]
                    const ultimoActivo = idsActivos[idsActivos.length - 1]
                    const activoA = a.Status_Id === 1
                    return (
                      <YStack key={a.Id} marginLeft="$2" borderLeftWidth={2} borderLeftColor="$border" paddingLeft="$2">
                        {/* Área específica */}
                        <XStack alignItems="center" gap="$2" paddingVertical="$2.5" paddingHorizontal="$2"
                          backgroundColor="$backgroundElevated" borderRadius="$3"
                          onPress={() => toggleArea(a.Id)} pressStyle={{ opacity: 0.85 }}>
                          {openA ? <ChevronDown size={16} color="#94A3B8" /> : <ChevronRight size={16} color="#94A3B8" />}
                          <Text flex={1} fontSize={14} fontWeight="700" color="$text">{a.Name}</Text>
                          <Badge activo={activoA} onPress={(e) => { e?.stopPropagation?.(); setConfirm({ nivel: 'area', Id: a.Id, Name: a.Name, Status_Id: a.Status_Id }) }} />
                          <IconBtn onPress={(e) => { e?.stopPropagation?.(); abrir('area', { editId: a.Id, name: a.Name, principalId: a.AreaPrincipal_Id ?? p.Id, status: a.Status_Id }) }} color={theme.primary?.val} />
                        </XStack>

                        {openA && (
                          <YStack paddingLeft="$5" paddingVertical="$1" gap="$1.5">
                            {ops.length === 0 ? (
                              <Text fontSize={12} color="$textMuted" paddingVertical="$1">Sin operaciones</Text>
                            ) : ops.map(o => (
                              <XStack key={o.Id} alignItems="center" gap="$1.5" paddingVertical="$1.5">
                                <Text fontSize={11} color="$textMuted" minWidth={20} textAlign="right">{o.Orden ?? '·'}</Text>
                                <Text flex={1} fontSize={13} color={o.Status_Id === 1 ? '$text' : '$textMuted'}>{o.Name}</Text>
                                {o.Status_Id === 1 && (
                                  <XStack gap="$1">
                                    <MoveBtn dir="up" disabled={moviendo || o.Id === primerActivo} onPress={() => moverOp(a.Id, o.Id, -1)} />
                                    <MoveBtn dir="down" disabled={moviendo || o.Id === ultimoActivo} onPress={() => moverOp(a.Id, o.Id, 1)} />
                                  </XStack>
                                )}
                                <Badge activo={o.Status_Id === 1} small onPress={(e) => { e?.stopPropagation?.(); setConfirm({ nivel: 'operacion', Id: o.Id, Name: o.Name, Status_Id: o.Status_Id }) }} />
                                <IconBtn small onPress={(e) => { e?.stopPropagation?.(); abrir('operacion', { editId: o.Id, areaId: a.Id, name: o.Name, status: o.Status_Id, orden: o.Orden }) }} color={theme.primary?.val} />
                              </XStack>
                            ))}
                            <AddRow label="Agregar operación" onPress={() => abrir('operacion', { areaId: a.Id })} />
                          </YStack>
                        )}
                      </YStack>
                    )
                  })}
                  <AddRow label="Agregar área" onPress={() => abrir('area', { areaPrincipalId: p.Id, principalId: p.Id })} />
                </YStack>
              )}
            </YStack>
          )
        })}
      </ScrollView>

      {/* Modal crear/editar */}
      <Modal visible={!!modal} transparent animationType="fade" onRequestClose={() => setModal(null)}>
        <View flex={1} backgroundColor="rgba(0,0,0,0.45)" alignItems="center" justifyContent="center" padding="$4">
          <YStack width="100%" maxWidth={460} backgroundColor="$background" borderRadius="$6" padding="$4" gap="$3">
            <Text fontSize="$5" fontWeight="900" color="$text">
              {modal?.editId ? 'Editar' : 'Nuevo'} · {modal?.nivel === 'principal' ? 'Área principal' : modal?.nivel === 'area' ? 'Área' : 'Operación'}
            </Text>
            <AppInput label="Nombre" value={fName} onChangeText={setFName} />

            {modal?.nivel === 'operacion' && (
              <AppInput label="Orden" value={fOrden} onChangeText={setFOrden} keyboardType="number-pad"
                statusMessage="Menor número aparece primero en el ticket. Vacío = al final." />
            )}

            {modal?.nivel === 'principal' && (
              <XStack alignItems="center" justifyContent="space-between" paddingVertical="$2">
                <YStack flex={1}>
                  <Text fontSize="$3" color="$text" fontWeight="700">¿Permite máquinas?</Text>
                  <Text fontSize="$1" color="$textMuted">Habilita el flujo de ticket de máquina para sus áreas</Text>
                </YStack>
                <View onPress={() => setFPermite(v => !v)} pressStyle={{ opacity: 0.8 }}
                  width={52} height={30} borderRadius={15} padding={3} justifyContent="center"
                  backgroundColor={fPermite ? ACCENT : '$border'}>
                  <View width={24} height={24} borderRadius={12} backgroundColor="#fff" alignSelf={fPermite ? 'flex-end' : 'flex-start'} />
                </View>
              </XStack>
            )}

            {modal?.nivel === 'area' && (
              <AppSelect label="Área principal" value={fPrincipalId != null ? String(fPrincipalId) : undefined}
                options={principalOpts} onValueChange={v => setFPrincipalId(v ? Number(v) : undefined)}
                placeholder="Selecciona el área principal" />
            )}

            {/* Estado (solo al editar): inactivo no aparece al crear tickets */}
            {!!modal?.editId && (
              <XStack alignItems="center" justifyContent="space-between" paddingVertical="$2">
                <YStack flex={1}>
                  <Text fontSize="$3" color="$text" fontWeight="700">{fActivo ? 'Activo' : 'Inactivo'}</Text>
                  <Text fontSize="$1" color="$textMuted">Si está inactivo, no aparece al crear tickets</Text>
                </YStack>
                <View onPress={() => setFActivo(v => !v)} pressStyle={{ opacity: 0.8 }}
                  width={52} height={30} borderRadius={15} padding={3} justifyContent="center"
                  backgroundColor={fActivo ? ACCENT : '$border'}>
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
        message={confirm?.Status_Id === 1 ? `¿Desactivar "${confirm?.Name}"?` : `¿Activar "${confirm?.Name}"?`}
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

function MoveBtn({ dir, disabled, onPress }: { dir: 'up' | 'down'; disabled?: boolean; onPress: (e?: any) => void }) {
  const Icon = dir === 'up' ? ChevronUp : ChevronDown
  return (
    <View onPress={disabled ? undefined : (e: any) => { e?.stopPropagation?.(); onPress(e) }}
      pressStyle={{ opacity: 0.5 }} opacity={disabled ? 0.25 : 1}
      borderWidth={1} borderColor="$border" borderRadius="$3" padding={4} hitSlop={4}>
      <Icon size={16} color={ACCENT} />
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
