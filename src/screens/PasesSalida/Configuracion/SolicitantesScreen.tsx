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
import { ACCENT, PRESS_CARD } from '../pasesSalida.helpers'
import { pasesSalidaConfigService } from '../../../api/modules/pasesSalida/configuracion.service'
import {
  ISolicitante, IMaterialSolicitante, ITipoSalidaSolicitante,
} from '../../../api/modules/pasesSalida/configuracion.types'

/**
 * El ALCANCE de cada solicitante, que son dos preguntas distintas:
 *   · qué MATERIALES puede pedir
 *   · con qué TIPOS DE SALIDA puede sacarlos
 *
 * La lista de personas no se administra acá: sale de quien tenga el acceso
 * PSSolicitante, concedido por usuario o por rol desde la pantalla de accesos.
 *
 * El alcance de materiales va por material y no por grupo: el grupo existe para
 * configurar firmas, y que dos materiales compartan firmas no implica que la
 * misma persona deba poder pedir los dos.
 *
 * LAS DOS MITADES SE GUARDAN JUNTAS, en una sola llamada y una sola transacción.
 * Separadas, la segunda podría fallar y dejar a alguien con materiales y sin
 * tipos —o sea, sin poder crear nada— sin que la pantalla se enterara.
 *
 * Cualquiera de las dos vacía bloquea a la persona, y la tarjeta lo avisa para
 * que no parezca que quedó bien configurada.
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

  // Modal del alcance
  const [sel, setSel] = useState<ISolicitante | null>(null)
  const [materiales, setMateriales] = useState<IMaterialSolicitante[]>([])
  const [matFiltrados, setMatFiltrados] = useState<IMaterialSolicitante[]>([])
  const [marcados, setMarcados] = useState<number[]>([])
  const [tipos, setTipos] = useState<ITipoSalidaSolicitante[]>([])
  const [marcadosTipo, setMarcadosTipo] = useState<number[]>([])
  /** Qué mitad del alcance se está viendo. */
  const [tab, setTab] = useState<'mat' | 'tipo'>('mat')
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

  /* Las dos listas se piden juntas. Si alguna fallara y se guardara igual, esa
     mitad viajaría vacía y le borraría el alcance a la persona sin que nadie lo
     tocara — por eso `fallo` bloquea el botón de guardar. */
  const [fallo, setFallo] = useState(false)

  const abrir = async (s: ISolicitante) => {
    setSel(s); setTab('mat'); setFallo(false)
    setMateriales([]); setMatFiltrados([]); setMarcados([])
    setTipos([]); setMarcadosTipo([])
    setCargandoMat(true)
    try {
      const [rMat, rTipo] = await Promise.all([
        pasesSalidaConfigService.getMaterialesDeSolicitante(s.User_Code),
        pasesSalidaConfigService.getTiposDeSolicitante(s.User_Code),
      ])
      const mats = rMat.Data ?? []
      setMateriales(mats); setMatFiltrados(mats)
      setMarcados(mats.filter(m => m.Asignado).map(m => m.Id))

      const tps = rTipo.Data ?? []
      setTipos(tps)
      setMarcadosTipo(tps.filter(t => t.Asignado).map(t => t.Id))
    } catch {
      setMateriales([]); setMatFiltrados([]); setTipos([]); setFallo(true)
    }
    finally { setCargandoMat(false) }
  }

  const guardar = async () => {
    if (!sel) return
    setGuardando(true)
    try {
      const res = await pasesSalidaConfigService.guardarAlcanceSolicitante({
        User_Code: sel.User_Code, Materiales: marcados, Tipos: marcadosTipo,
      })
      if (res.Success) { showToast('success', 'Guardado', res.SuccessMessage || 'Alcance actualizado'); setSel(null); await cargar() }
      else showToast('error', 'No se pudo guardar', res.ErrorMessage || 'Intente de nuevo')
    } catch (e: any) { showToast('error', 'Error', e?.message || 'No se pudo guardar') }
    finally { setGuardando(false) }
  }

  const todosMarcados = materiales.length > 0 && marcados.length === materiales.length
  const todosTipos = tipos.length > 0 && marcadosTipo.length === tipos.length

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
              /* Las dos mitades hacen falta: con materiales pero sin tipos
                 tampoco puede crear nada, y decir solo "5 materiales" haría
                 parecer que está configurado. */
              const falta = [
                s.Materiales === 0 ? 'materiales' : null,
                s.Tipos === 0 ? 'tipos de salida' : null,
              ].filter(Boolean)
              return (
                <XStack backgroundColor="$backgroundElevated" borderRadius="$4"
                  borderLeftWidth={4} borderLeftColor={falta.length ? '#f59e0b' : '$primary'}
                  borderWidth={1} borderColor="$border"
                  paddingVertical="$3" paddingHorizontal="$4" alignItems="center" gap="$3" {...shadows.sm}
                  onPress={() => abrir(s)} pressStyle={PRESS_CARD}>
                  <YStack flex={1} gap={3}>
                    <Text fontSize={14} fontWeight="800" color="$text">{s.Nombre || s.User_Code}</Text>
                    <Text fontSize={11} color="$textMuted">{s.User_Code}{s.Email ? ` · ${s.Email}` : ''}</Text>
                    {falta.length ? (
                      <XStack alignItems="center" gap="$1.5" marginTop={2}>
                        <TriangleAlert size={12} color="#f59e0b" />
                        <Text flex={1} fontSize={11} color="#f59e0b" fontWeight="700">
                          Sin {falta.join(' ni ')}: no puede crear pases
                        </Text>
                      </XStack>
                    ) : (
                      <Text fontSize={11} color="$textMuted">
                        {s.Materiales} {s.Materiales === 1 ? 'material' : 'materiales'} ·{' '}
                        {s.Tipos} {s.Tipos === 1 ? 'tipo de salida' : 'tipos de salida'}
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
              <Text fontSize={11} color="$textMuted">Qué puede pedir y con qué motivos</Text>
            </YStack>

            {/* Un solo botón de guardar para las dos listas: son el mismo
                alcance y viajan juntas. El número en cada pestaña deja ver que
                falta la otra mitad sin tener que entrar a mirarla. */}
            <XStack backgroundColor="$backgroundPage" borderRadius="$4" padding={3} gap={3}>
              {([
                { k: 'mat' as const,  label: 'Materiales',      n: marcados.length },
                { k: 'tipo' as const, label: 'Tipos de salida', n: marcadosTipo.length },
              ]).map(t => {
                const on = tab === t.k
                return (
                  <View key={t.k} flex={1} onPress={() => setTab(t.k)} pressStyle={{ opacity: 0.8 }}
                    backgroundColor={on ? '$backgroundElevated' : 'transparent'}
                    borderRadius="$3" paddingVertical="$2.5" alignItems="center"
                    flexDirection="row" justifyContent="center" gap="$2"
                    {...(on ? shadows.sm : {})}>
                    <Text fontSize={12} fontWeight="800" color={on ? '$text' : '$textMuted'}>
                      {t.label}
                    </Text>
                    <View minWidth={20} height={20} borderRadius={10} paddingHorizontal={6}
                      alignItems="center" justifyContent="center"
                      backgroundColor={t.n === 0 ? 'rgba(245, 158, 11, 0.18)' : 'rgba(255, 85, 26, 0.14)'}>
                      <Text fontSize={10} fontWeight="900" color={t.n === 0 ? '#f59e0b' : ACCENT}>
                        {t.n}
                      </Text>
                    </View>
                  </View>
                )
              })}
            </XStack>

            {cargandoMat ? (
              <YStack paddingVertical="$6" alignItems="center"><Spinner color={ACCENT} /></YStack>
            ) : tab === 'mat' ? (
              <>
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

                <FlatList
                  data={matFiltrados}
                  keyExtractor={(m) => String(m.Id)}
                  style={{ maxHeight: 300 }}
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
              </>
            ) : (
              <>
                {/* Sin buscador: los tipos de salida son cuatro o cinco, no un
                    catálogo. Un campo de búsqueda acá sería ruido. */}
                <XStack alignItems="center" gap="$2">
                  <Text flex={1} fontSize={11} color="$textMuted">
                    {marcadosTipo.length} de {tipos.length} seleccionados
                  </Text>
                  <View onPress={() => setMarcadosTipo(todosTipos ? [] : tipos.map(t => t.Id))} pressStyle={{ opacity: 0.7 }} hitSlop={8}>
                    <Text fontSize={11} fontWeight="800" color="$primary">
                      {todosTipos ? 'Quitar todos' : 'Marcar todos'}
                    </Text>
                  </View>
                </XStack>

                <FlatList
                  data={tipos}
                  keyExtractor={(t) => String(t.Id)}
                  style={{ maxHeight: 300 }}
                  ItemSeparatorComponent={() => <View height={6} />}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item: t }) => {
                    const on = marcadosTipo.includes(t.Id)
                    return (
                      <XStack alignItems="center" gap="$3" paddingVertical="$2" paddingHorizontal="$2"
                        borderRadius="$3" backgroundColor={on ? 'rgba(255, 85, 26, 0.08)' : 'transparent'}
                        onPress={() => setMarcadosTipo(prev => on ? prev.filter(x => x !== t.Id) : [...prev, t.Id])}
                        pressStyle={{ opacity: 0.7 }}>
                        <View width={20} height={20} borderRadius="$2" borderWidth={1.5}
                          borderColor={on ? ACCENT : '$border'} backgroundColor={on ? ACCENT : 'transparent'}
                          alignItems="center" justifyContent="center">
                          {on ? <Check size={13} color="#fff" /> : null}
                        </View>
                        <Text flex={1} fontSize={13} fontWeight="700" color="$text">{t.Name}</Text>
                        {/* Que el tipo exija retorno cambia lo que pasa después
                            en seguridad, así que conviene verlo al decidir quién
                            puede usarlo. */}
                        {t.Retorna ? (
                          <View backgroundColor="rgba(255, 85, 26, 0.14)" borderRadius="$10"
                            paddingHorizontal="$2" paddingVertical={2}>
                            <Text fontSize={9} fontWeight="900" color={ACCENT}>DEBE REGRESAR</Text>
                          </View>
                        ) : null}
                      </XStack>
                    )
                  }}
                  ListEmptyComponent={<Text fontSize={12} color="$textMuted" paddingVertical="$4">Sin tipos de salida activos.</Text>}
                />
              </>
            )}

            {/* Guardar con una lista vacía es válido —así se le quita el alcance
                a alguien— pero es una decisión, no un descuido: se avisa antes,
                y se dice CUÁL falta porque la otra pestaña puede estar sin
                mirar. */}
            {!cargandoMat && (marcados.length === 0 || marcadosTipo.length === 0) ? (
              <XStack alignItems="center" gap="$2" backgroundColor="rgba(245, 158, 11, 0.12)" borderRadius="$4" paddingHorizontal="$3" paddingVertical="$2.5">
                <TriangleAlert size={14} color="#f59e0b" />
                <Text flex={1} fontSize={11} color="#f59e0b" fontWeight="700">
                  {marcados.length === 0 && marcadosTipo.length === 0
                    ? 'No hay materiales ni tipos de salida marcados.'
                    : marcados.length === 0
                      ? 'No hay materiales marcados.'
                      : 'No hay tipos de salida marcados.'}
                  {' '}Si se guarda así, este usuario no podrá crear ningún pase.
                </Text>
              </XStack>
            ) : null}

            <XStack gap="$2.5">
              <View flex={1} onPress={guardando ? undefined : () => setSel(null)} pressStyle={{ opacity: 0.85 }}
                borderWidth={1.5} borderColor="$border" borderRadius="$4" height={46} alignItems="center" justifyContent="center">
                <Text color="$text" fontWeight="800" fontSize="$3">Cancelar</Text>
              </View>
              {/* Bloqueado mientras cargan las listas o si alguna falló: guardar
                  ahí mandaría esa mitad vacía y borraría el alcance sin que
                  nadie lo tocara. */}
              <View flex={1} onPress={guardando || cargandoMat || fallo ? undefined : guardar} pressStyle={{ opacity: 0.85 }}
                opacity={guardando || cargandoMat || fallo ? 0.6 : 1} backgroundColor={ACCENT} borderRadius="$4" height={46}
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
