import React, { useCallback, useEffect, useState } from 'react'
import { Modal, RefreshControl, FlatList } from 'react-native'
import { Text, XStack, YStack, View, Spinner, useTheme } from 'tamagui'
import { useFocusEffect } from '@react-navigation/native'
import { UserCog, Check, TriangleAlert } from 'lucide-react-native'

import { usePageHeader } from '../../../hooks/usePageHeader'
import { useShowToast } from '../../../utils/useShowToast'
import SearchInput from '../../../components/commons/SearchInput'
import RecordCount from '../../../components/commons/RecordCount'
import SkeletonList from '../../../components/Skeletons/SkeletonList'
import ErrorState from '../../AdmSys/ErrorState'
import EmptyState from '../../AdmSys/EmptyState'
import { AppError, handleError } from '../../../utils/errorHandler'
import { shadows } from '../../../theme/shadows'
import { ACCENT } from '../pasesSalida.helpers'
import { pasesSalidaConfigService } from '../../../api/modules/pasesSalida/configuracion.service'
import { ISolicitante, IMaterialSolicitante } from '../../../api/modules/pasesSalida/configuracion.types'

/**
 * Qué materiales puede pedir cada solicitante.
 *
 * La lista no se administra acá: sale de quien tenga el acceso PSSolicitante,
 * concedido por usuario o por rol desde la pantalla de accesos. Acá solo se
 * define el ALCANCE de cada uno.
 *
 * El alcance va por material y no por grupo: el grupo existe para configurar
 * firmas, y que dos materiales compartan firmas no implica que la misma persona
 * deba poder pedir los dos.
 *
 * Sin materiales asignados el usuario no puede crear ningún pase, y la tarjeta
 * lo avisa para que no parezca que quedó bien configurado.
 */
export default function SolicitantesScreen() {
  const theme = useTheme()
  const { showToast } = useShowToast()

  const [items, setItems] = useState<ISolicitante[]>([])
  // SearchInput filtra contra `items` y devuelve el resultado acá; la lista
  // siempre pinta `filtered`.
  const [filtered, setFiltered] = useState<ISolicitante[]>([])
  const [loading, setLoading] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  // Un fallo de la API no es una lista vacía: se muestra como error con reintento.
  const [error, setError] = useState<AppError | null>(null)

  // Modal de materiales
  const [sel, setSel] = useState<ISolicitante | null>(null)
  const [materiales, setMateriales] = useState<IMaterialSolicitante[]>([])
  const [matFiltrados, setMatFiltrados] = useState<IMaterialSolicitante[]>([])
  const [marcados, setMarcados] = useState<number[]>([])
  const [cargandoMat, setCargandoMat] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const r = await pasesSalidaConfigService.getSolicitantes()
      const data = r.Data ?? []
      setItems(data); setFiltered(data)
      setError(null)
    } catch (e) { setItems([]); setFiltered([]); setError(handleError(e)) }
  }, [])

  useEffect(() => { (async () => { setLoading(true); await cargar(); setLoading(false) })() }, [cargar])
  useFocusEffect(useCallback(() => { cargar() }, [cargar]))
  const onRefresh = useCallback(async () => { setRefrescando(true); await cargar(); setRefrescando(false) }, [cargar])

  const abrir = async (s: ISolicitante) => {
    setSel(s); setMateriales([]); setMatFiltrados([]); setMarcados([]); setCargandoMat(true)
    try {
      const r = await pasesSalidaConfigService.getMaterialesDeSolicitante(s.User_Code)
      const data = r.Data ?? []
      setMateriales(data); setMatFiltrados(data)
      setMarcados(data.filter(m => m.Asignado).map(m => m.Id))
    } catch { setMateriales([]); setMatFiltrados([]) }
    finally { setCargandoMat(false) }
  }

  const guardar = async () => {
    if (!sel) return
    setGuardando(true)
    try {
      const res = await pasesSalidaConfigService.asignarMaterialesSolicitante({
        User_Code: sel.User_Code, Materiales: marcados,
      })
      if (res.Success) { showToast('success', 'Guardado', res.SuccessMessage || 'Materiales actualizados'); setSel(null); await cargar() }
      else showToast('error', 'No se pudo guardar', res.ErrorMessage || 'Intente de nuevo')
    } catch (e: any) { showToast('error', 'Error', e?.message || 'No se pudo guardar') }
    finally { setGuardando(false) }
  }

  const todosMarcados = materiales.length > 0 && marcados.length === materiales.length

  usePageHeader({ center: <Text fontSize="$4" fontWeight="700" color="$text">Solicitantes</Text> })

  return (
    <View flex={1} backgroundColor="$background">
      {/* Buscador y contador quedan fuera del condicional: al recargar no
          desaparecen y la pantalla no salta. */}
      <YStack paddingHorizontal="$3" paddingTop="$3">
        <SearchInput
          data={items}
          searchKeys={['Nombre', 'User_Code', 'Email']}
          onResults={setFiltered}
          placeholder="Buscar..."
        />
        <RecordCount count={filtered.length} label="Solicitantes" />
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
            keyExtractor={(it) => it.User_Code}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 12, paddingBottom: 40, flexGrow: 1 }}
            ItemSeparatorComponent={() => <View height={10} />}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} tintColor={ACCENT} />}
            ListEmptyComponent={
              <EmptyState
                title={items.length ? 'Sin resultados' : 'Sin solicitantes'}
                message={items.length
                  ? 'Nadie coincide con la búsqueda.'
                  : 'Aquí aparece quien tenga el acceso "Solicitante de pases de salida". Concédalo desde la pantalla de accesos.'}
              />
            }
            renderItem={({ item: s }) => {
              const sinAlcance = s.Materiales === 0
              return (
                <XStack backgroundColor="$backgroundElevated" borderRadius="$4"
                  borderLeftWidth={4} borderLeftColor={sinAlcance ? '#f59e0b' : '$primary'}
                  borderWidth={1} borderColor="$border"
                  paddingVertical="$3" paddingHorizontal="$4" alignItems="center" gap="$3" {...shadows.sm}
                  onPress={() => abrir(s)} pressStyle={{ opacity: 0.8, scale: 0.99 }}>
                  <YStack flex={1} gap={3}>
                    <Text fontSize={14} fontWeight="800" color="$text">{s.Nombre || s.User_Code}</Text>
                    <Text fontSize={11} color="$textMuted">{s.User_Code}{s.Email ? ` · ${s.Email}` : ''}</Text>
                    {sinAlcance ? (
                      <XStack alignItems="center" gap="$1.5" marginTop={2}>
                        <TriangleAlert size={12} color="#f59e0b" />
                        <Text fontSize={11} color="#f59e0b" fontWeight="700">Sin materiales: no puede crear pases</Text>
                      </XStack>
                    ) : (
                      <Text fontSize={11} color="$textMuted">
                        Puede pedir {s.Materiales} {s.Materiales === 1 ? 'material' : 'materiales'}
                      </Text>
                    )}
                  </YStack>
                  <Text fontSize="$2" fontWeight="800" color="$primary">Editar</Text>
                </XStack>
              )
            }}
          />
        </>
      )}

      <Modal visible={!!sel} transparent animationType="fade" onRequestClose={() => setSel(null)}>
        <View flex={1} backgroundColor="rgba(0,0,0,0.45)" alignItems="center" justifyContent="center" padding="$4">
          <YStack width="100%" maxWidth={480} maxHeight="88%" backgroundColor="$background" borderRadius="$6" padding="$4" gap="$3">
            <YStack>
              <Text fontSize="$5" fontWeight="900" color="$text">{sel?.Nombre || sel?.User_Code}</Text>
              <Text fontSize={11} color="$textMuted">Materiales que puede solicitar</Text>
            </YStack>

            <SearchInput
              data={materiales}
              searchKeys={['Name']}
              onResults={setMatFiltrados}
              placeholder="Buscar..."
            />

            <XStack alignItems="center" gap="$2">
              <Text flex={1} fontSize={11} color="$textMuted">
                {marcados.length} de {materiales.length} seleccionados
              </Text>
              <View onPress={() => setMarcados(todosMarcados ? [] : materiales.map(m => m.Id))} pressStyle={{ opacity: 0.7 }} hitSlop={8}>
                <Text fontSize={11} fontWeight="800" color="$primary">
                  {todosMarcados ? 'Quitar todos' : 'Marcar todos'}
                </Text>
              </View>
            </XStack>

            {cargandoMat ? (
              <YStack paddingVertical="$6" alignItems="center"><Spinner color={ACCENT} /></YStack>
            ) : (
              <FlatList
                data={matFiltrados}
                keyExtractor={(m) => String(m.Id)}
                style={{ maxHeight: 340 }}
                ItemSeparatorComponent={() => <View height={6} />}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item: m }) => {
                  const on = marcados.includes(m.Id)
                  return (
                    <XStack alignItems="center" gap="$3" paddingVertical="$2" paddingHorizontal="$2"
                      borderRadius="$3" backgroundColor={on ? 'rgba(255, 85, 26, 0.08)' : 'transparent'}
                      onPress={() => setMarcados(prev => on ? prev.filter(x => x !== m.Id) : [...prev, m.Id])}
                      pressStyle={{ opacity: 0.7 }}>
                      <View width={20} height={20} borderRadius="$2" borderWidth={1.5}
                        borderColor={on ? ACCENT : '$border'} backgroundColor={on ? ACCENT : 'transparent'}
                        alignItems="center" justifyContent="center">
                        {on ? <Check size={13} color="#fff" /> : null}
                      </View>
                      <Text flex={1} fontSize={13} fontWeight="700" color="$text">{m.Name}</Text>
                    </XStack>
                  )
                }}
                ListEmptyComponent={<Text fontSize={12} color="$textMuted" paddingVertical="$4">Sin materiales activos.</Text>}
              />
            )}

            {marcados.length === 0 && !cargandoMat ? (
              <XStack alignItems="center" gap="$2" backgroundColor="rgba(245, 158, 11, 0.12)" borderRadius="$4" paddingHorizontal="$3" paddingVertical="$2.5">
                <TriangleAlert size={14} color="#f59e0b" />
                <Text flex={1} fontSize={11} color="#f59e0b" fontWeight="700">
                  Si se guarda sin marcar nada, este usuario no podrá crear ningún pase.
                </Text>
              </XStack>
            ) : null}

            <XStack gap="$2.5">
              <View flex={1} onPress={guardando ? undefined : () => setSel(null)} pressStyle={{ opacity: 0.85 }}
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
    </View>
  )
}
