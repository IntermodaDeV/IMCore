import React, { useCallback, useEffect, useState } from 'react'
import { Modal, RefreshControl, FlatList } from 'react-native'
import { Text, XStack, YStack, View, Spinner, useTheme } from 'tamagui'
import { useFocusEffect } from '@react-navigation/native'
import { Plus, Pencil, Tags, RotateCcw } from 'lucide-react-native'

import { usePageHeader } from '../../../hooks/usePageHeader'
import { useShowToast } from '../../../utils/useShowToast'
import AppInput from '../../../components/commons/AppInput'
import SearchInput from '../../../components/commons/SearchInput'
import RecordCount from '../../../components/commons/RecordCount'
import SkeletonList from '../../../components/Skeletons/SkeletonList'
import ErrorState from '../../AdmSys/ErrorState'
import EmptyState from '../../AdmSys/EmptyState'
import { AppError, handleError } from '../../../utils/errorHandler'
import ConfirmDialog from '../../../components/commons/ConfirmDialog'
import { shadows } from '../../../theme/shadows'
import { ACCENT, ACCENT_BG, PRESS_CARD } from '../pasesSalida.helpers'
import { pasesSalidaService } from '../../../api/modules/pasesSalida/pasesSalida.service'
import { ITipoSalida } from '../../../api/modules/pasesSalida/pasesSalida.types'

/**
 * Catálogo "Tipo de salida": las columnas de la matriz de autorización
 * (Prestado, Venta, Reparación, Donación).
 *
 * `Retorna` no es un adorno: el tipo ya dice si lo que sale debe volver, así que
 * al crear un pase no hay que volver a preguntarlo. Por eso se edita aquí y se
 * muestra en la tarjeta.
 */
export default function TiposSalidaScreen() {
  const theme = useTheme()
  const { showToast } = useShowToast()

  const [items, setItems] = useState<ITipoSalida[]>([])
  // SearchInput filtra contra `items` y devuelve el resultado acá; la lista
  // siempre pinta `filtered`.
  const [filtered, setFiltered] = useState<ITipoSalida[]>([])
  const [loading, setLoading] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  // Un fallo de la API no es una lista vacía: se muestra como error con reintento.
  const [error, setError] = useState<AppError | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<number | undefined>(undefined)
  const [fName, setFName] = useState('')
  const [fRetorna, setFRetorna] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [confirm, setConfirm] = useState<ITipoSalida | null>(null)

  const cargar = useCallback(async () => {
    try {
      const r = await pasesSalidaService.getTiposSalida(false)
      const data = r.Data ?? []
      setItems(data); setFiltered(data)
      setError(null)
    } catch (e) { setItems([]); setFiltered([]); setError(handleError(e)) }
  }, [])

  useEffect(() => { (async () => { setLoading(true); await cargar(); setLoading(false) })() }, [cargar])
  useFocusEffect(useCallback(() => { cargar() }, [cargar]))
  const onRefresh = useCallback(async () => { setRefrescando(true); await cargar(); setRefrescando(false) }, [cargar])

  const abrirCrear = () => { setEditId(undefined); setFName(''); setFRetorna(false); setModalOpen(true) }
  const abrirEditar = (it: ITipoSalida) => { setEditId(it.Id); setFName(it.Name); setFRetorna(!!it.Retorna); setModalOpen(true) }

  const guardar = async () => {
    if (!fName.trim()) { showToast('warning', 'Falta el nombre', 'Ingrese un nombre'); return }
    setGuardando(true)
    try {
      const dto = { Id: editId, Name: fName.trim(), Retorna: fRetorna }
      const res = editId ? await pasesSalidaService.editarTipoSalida(dto) : await pasesSalidaService.crearTipoSalida(dto)
      if (res.Success) { showToast('success', 'Guardado', res.SuccessMessage || 'Registro guardado'); setModalOpen(false); await cargar() }
      else showToast('error', 'No se pudo guardar', res.ErrorMessage || 'Intente de nuevo')
    } catch (e: any) { showToast('error', 'Error', e?.message || 'No se pudo guardar') }
    finally { setGuardando(false) }
  }

  const doToggle = async () => {
    if (!confirm) return
    const it = confirm; setConfirm(null)
    try {
      const res = await pasesSalidaService.toggleTipoSalida(it.Id)
      if (res.Success) { showToast('success', 'Listo', res.SuccessMessage || 'Estado actualizado'); await cargar() }
      else showToast('error', 'No se pudo', res.ErrorMessage || 'Intente de nuevo')
    } catch (e: any) { showToast('error', 'Error', e?.message || 'No se pudo actualizar') }
  }

  usePageHeader({
    center: <Text fontSize="$4" fontWeight="700" color="$text">Tipos de salida</Text>,
    right: <View onPress={abrirCrear} pressStyle={{ opacity: 0.6 }} hitSlop={8}><Plus size={22} color={theme.text?.val} /></View>,
  })

  return (
    <View flex={1} backgroundColor="$background">
      {/* Buscador y contador quedan fuera del condicional: al recargar no
          desaparecen y la pantalla no salta. */}
      <YStack paddingHorizontal="$3" paddingTop="$3">
        <SearchInput
          data={items}
          searchKeys={['Name']}
          onResults={setFiltered}
          placeholder="Buscar..."
        />
        <RecordCount count={filtered.length} label="Tipos de salida" />
      </YStack>

      {loading ? (
        <SkeletonList />
      ) : error ? (
        <ErrorState
          type={error.type}
          title={error.title}
          message={error.message}
          errorCode={error.status}
          onRetry={async () => { setLoading(true); await cargar(); setLoading(false) }}
        />
      ) : (
        <>
          <FlatList
            data={filtered}
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
              <EmptyState
                title={items.length ? 'Sin resultados' : 'Sin registros'}
                message={items.length
                  ? 'Ningún tipo coincide con la búsqueda.'
                  : 'Use el botón + para agregar el primer tipo de salida.'}
              />
            }
            renderItem={({ item: it }) => {
              const activo = it.Status_Id === 1
              return (
                <XStack backgroundColor="$backgroundElevated" borderRadius="$4"
                  borderLeftWidth={4} borderLeftColor={activo ? '$primary' : '$border'} borderWidth={1} borderColor="$border"
                  paddingVertical="$3" paddingHorizontal="$4" alignItems="center" gap="$3" {...shadows.sm}
                  onPress={() => abrirEditar(it)} pressStyle={PRESS_CARD}>
                  <YStack flex={1} gap={3}>
                    <Text fontSize={14} fontWeight="800" color="$text">{it.Name}</Text>
                    {it.Retorna ? (
                      <XStack alignItems="center" gap="$1.5">
                        <RotateCcw size={12} color={theme.textMuted?.val} />
                        <Text fontSize={11} color="$textMuted">Lo que sale debe regresar</Text>
                      </XStack>
                    ) : (
                      <Text fontSize={11} color="$textMuted">Salida definitiva</Text>
                    )}
                  </YStack>
                  <View onPress={(e: any) => { e?.stopPropagation?.(); setConfirm(it) }} pressStyle={{ opacity: 0.7 }}
                    backgroundColor={activo ? ACCENT_BG : 'rgba(100, 116, 139, 0.18)'}
                    borderWidth={1} borderColor={activo ? ACCENT : '#64748b'}
                    paddingHorizontal="$2" paddingVertical={3} borderRadius="$10">
                    <Text fontSize={10} color={activo ? ACCENT : '#64748b'} fontWeight="700">{activo ? 'Activo' : 'Inactivo'}</Text>
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
            <Text fontSize="$5" fontWeight="900" color="$text">{editId ? 'Editar' : 'Nuevo'} · Tipo de salida</Text>
            <AppInput label="Nombre" value={fName} onChangeText={setFName} />

            <YStack gap="$2">
              <Text fontSize="$2" fontWeight="700" color="$textMuted">¿Lo que sale con este tipo debe regresar?</Text>
              <XStack gap="$2.5">
                {[{ v: true, label: 'Sí, regresa' }, { v: false, label: 'No, es definitiva' }].map(op => {
                  const sel = fRetorna === op.v
                  return (
                    <View key={String(op.v)} flex={1} onPress={() => setFRetorna(op.v)} pressStyle={{ opacity: 0.85 }}
                      borderWidth={1.5} borderColor={sel ? ACCENT : '$border'} backgroundColor={sel ? ACCENT_BG : 'transparent'}
                      borderRadius="$4" height={44} alignItems="center" justifyContent="center">
                      <Text color={sel ? '$primary' : '$text'} fontWeight="800" fontSize="$2">{op.label}</Text>
                    </View>
                  )
                })}
              </XStack>
            </YStack>

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
