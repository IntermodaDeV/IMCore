import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal, RefreshControl, ScrollView, FlatList } from 'react-native'
import { Text, XStack, YStack, View, Spinner, useTheme } from 'tamagui'
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native'
import { Boxes, Plus, Trash2, Check, RotateCcw, Ban, ArrowLeft } from 'lucide-react-native'

import { usePageHeader } from '../../../hooks/usePageHeader'
import { useShowToast } from '../../../utils/useShowToast'
import SearchInput from '../../../components/commons/SearchInput'
import SkeletonList from '../../../components/Skeletons/SkeletonList'
import { shadows } from '../../../theme/shadows'
import { ACCENT, ACCENT_BG } from '../pasesSalida.helpers'
import { pasesSalidaConfigService } from '../../../api/modules/pasesSalida/configuracion.service'
import {
  ICelda, IAccesoFirma, IMaterialConGrupo, armarCeldas,
} from '../../../api/modules/pasesSalida/configuracion.types'

/**
 * El detalle de un grupo: sus materiales y, por cada tipo de salida, las firmas
 * que pide.
 *
 * Una celda del cuadro son PASOS de firma, no una lista plana: "Firma 1" y
 * "Firma 2" tienen que venir de bolsas distintas. Por eso cada paso se edita
 * como su propio conjunto de accesos, y los accesos dentro de un paso son
 * alternativas ("cualquiera de estos").
 *
 * Un tipo de salida sin pasos es la "x" del cuadro: esa combinación no aplica.
 */
export default function GrupoDetalleScreen() {
  const theme = useTheme()
  const route = useRoute<any>()
  const navigation = useNavigation<any>()
  const { showToast } = useShowToast()

  const grupoId: number = route.params?.id
  const grupoName: string = route.params?.name ?? 'Grupo'

  const [celdas, setCeldas] = useState<ICelda[]>([])
  const [materiales, setMateriales] = useState<IMaterialConGrupo[]>([])
  const [firmas, setFirmas] = useState<IAccesoFirma[]>([])
  const [loading, setLoading] = useState(true)
  const [refrescando, setRefrescando] = useState(false)

  // Modal de materiales
  const [matOpen, setMatOpen] = useState(false)
  const [matSel, setMatSel] = useState<number[]>([])
  // SearchInput filtra contra `materiales` y devuelve el resultado acá.
  const [matFiltrados, setMatFiltrados] = useState<IMaterialConGrupo[]>([])
  const [matGuardando, setMatGuardando] = useState(false)

  // Modal de celda
  const [celda, setCelda] = useState<ICelda | null>(null)
  const [pasos, setPasos] = useState<number[][]>([])
  // La prohibición explícita. Mientras esté marcada, el editor de firmas no
  // tiene sentido y se oculta.
  const [noPermitido, setNoPermitido] = useState(false)
  const [celdaGuardando, setCeldaGuardando] = useState(false)

  const asignados = useMemo(() => materiales.filter(m => m.Grupo_Id === grupoId), [materiales, grupoId])

  const cargar = useCallback(async () => {
    try {
      const [rReglas, rMat, rFirmas] = await Promise.all([
        pasesSalidaConfigService.getReglas(grupoId),
        pasesSalidaConfigService.getMateriales(undefined, false),
        pasesSalidaConfigService.getFirmas(),
      ])
      setCeldas(armarCeldas(rReglas.Data ?? []))
      setMateriales(rMat.Data ?? [])
      setFirmas(rFirmas.Data ?? [])
    } catch {
      setCeldas([]); setMateriales([]); setFirmas([])
    }
  }, [grupoId])

  useEffect(() => { (async () => { setLoading(true); await cargar(); setLoading(false) })() }, [cargar])
  useFocusEffect(useCallback(() => { cargar() }, [cargar]))
  const onRefresh = useCallback(async () => { setRefrescando(true); await cargar(); setRefrescando(false) }, [cargar])

  // Es una pantalla interna, no una opción del drawer: se sale volviendo a la
  // lista de grupos, no abriendo el menú.
  usePageHeader({
    left: <ArrowLeft color={theme.text?.val} onPress={() => navigation.goBack()} />,
    center: <Text fontSize="$4" fontWeight="700" color="$text" numberOfLines={1}>{grupoName}</Text>,
  })

  // ── Materiales ─────────────────────────────────────────────────────────────

  const abrirMateriales = () => {
    setMatSel(asignados.map(m => m.Id))
    setMatFiltrados(materiales)
    setMatOpen(true)
  }

  const guardarMateriales = async () => {
    setMatGuardando(true)
    try {
      const res = await pasesSalidaConfigService.asignarMateriales({ Grupo_Id: grupoId, Materiales: matSel })
      if (res.Success) { showToast('success', 'Listo', res.SuccessMessage || 'Materiales actualizados'); setMatOpen(false); await cargar() }
      else showToast('error', 'No se pudo', res.ErrorMessage || 'Intente de nuevo')
    } catch (e: any) { showToast('error', 'Error', e?.message || 'No se pudo guardar') }
    finally { setMatGuardando(false) }
  }

  // ── Celda ──────────────────────────────────────────────────────────────────

  const abrirCelda = (c: ICelda) => {
    setCelda(c)
    setNoPermitido(c.NoPermitido)
    setPasos(c.Pasos.length ? c.Pasos.map(p => p.Accesos.map(a => a.Id)) : [[]])
  }

  /**
   * Lo que va a quedar exigido, escrito como se lee el cuadro: "y" separa
   * firmas distintas (todas obligatorias), "o" separa los cargos que pueden dar
   * una misma firma. Se muestra mientras se edita porque es la única forma de
   * ver de un vistazo si marcar dos cargos creó dos firmas o una con dos
   * alternativas, que es donde todo el mundo se equivoca.
   */
  const resumen = useMemo(() => {
    const llenos = pasos.filter(p => p.length > 0)
    if (!llenos.length) return null
    const partes = llenos.map(p => {
      const nombres = p.map(id => (firmas.find(f => f.Id === id)?.Name ?? '').replace(/^Firma /, ''))
      return nombres.length > 1 ? `(${nombres.join(' o ')})` : nombres[0]
    })
    return `Se pedirán ${llenos.length} ${llenos.length === 1 ? 'firma' : 'firmas'}: ${partes.join('  y  ')}`
  }, [pasos, firmas])

  const toggleAcceso = (iPaso: number, accessId: number) => {
    setPasos(prev => prev.map((p, i) => {
      if (i !== iPaso) return p
      return p.includes(accessId) ? p.filter(x => x !== accessId) : [...p, accessId]
    }))
  }

  const guardarCelda = async () => {
    if (!celda) return
    // Un paso sin accesos no se puede satisfacer nunca; el SP lo rechaza, así
    // que se avisa acá antes de ir al servidor. Con la prohibición marcada no
    // aplica: no se va a guardar ninguna firma.
    const limpios = pasos.filter(p => p.length > 0)
    if (!noPermitido && pasos.some(p => p.length === 0) && limpios.length !== pasos.length) {
      showToast('warning', 'Falta una firma', 'Cada firma necesita al menos un cargo que la pueda dar')
      return
    }
    setCeldaGuardando(true)
    try {
      const res = await pasesSalidaConfigService.guardarRegla({
        Grupo_Id: grupoId,
        TipoSalida_Id: celda.TipoSalida_Id,
        NoPermitido: noPermitido,
        Pasos: noPermitido ? [] : limpios.map(accesos => ({ Accesos: accesos })),
      })
      if (res.Success) { showToast('success', 'Guardado', res.SuccessMessage || 'Configuración guardada'); setCelda(null); await cargar() }
      else showToast('error', 'No se pudo guardar', res.ErrorMessage || 'Intente de nuevo')
    } catch (e: any) { showToast('error', 'Error', e?.message || 'No se pudo guardar') }
    finally { setCeldaGuardando(false) }
  }

  /**
   * Borra la decisión y deja la celda como estaba al principio.
   *
   * No es lo mismo que prohibirla: "sin configurar" significa que nadie la ha
   * revisado, y por eso el error que ve el solicitante también es distinto.
   */
  const sinConfigurar = async () => {
    if (!celda) return
    setCeldaGuardando(true)
    try {
      const res = await pasesSalidaConfigService.guardarRegla({
        Grupo_Id: grupoId, TipoSalida_Id: celda.TipoSalida_Id, NoPermitido: false, Pasos: [],
      })
      if (res.Success) { showToast('success', 'Listo', res.SuccessMessage || 'Combinación sin configurar'); setCelda(null); await cargar() }
      else showToast('error', 'No se pudo', res.ErrorMessage || 'Intente de nuevo')
    } catch (e: any) { showToast('error', 'Error', e?.message || 'No se pudo actualizar') }
    finally { setCeldaGuardando(false) }
  }

  if (loading) {
    return (
      <View flex={1} backgroundColor="$background">
        <SkeletonList />
      </View>
    )
  }

  return (
    <View flex={1} backgroundColor="$background">
      <ScrollView
        contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} tintColor={ACCENT} />}
      >
        {/* ── Materiales ── */}
        <YStack backgroundColor="$backgroundElevated" borderRadius="$4" borderWidth={1} borderColor="$border"
          padding="$4" gap="$3" {...shadows.sm}>
          <XStack alignItems="center" gap="$2">
            <Boxes size={16} color={theme.primary?.val} />
            <Text flex={1} fontSize="$3" fontWeight="900" color="$text">Materiales del grupo</Text>
            <View onPress={abrirMateriales} pressStyle={{ opacity: 0.7 }} hitSlop={8}>
              <Text fontSize="$2" fontWeight="800" color="$primary">Editar</Text>
            </View>
          </XStack>

          {asignados.length === 0 ? (
            <Text fontSize={12} color="$textMuted">
              Todavía no hay materiales en este grupo. Sin materiales, las firmas configuradas abajo no aplican a nada.
            </Text>
          ) : (
            <XStack flexWrap="wrap" gap="$2">
              {asignados.map(m => (
                <View key={m.Id} backgroundColor={ACCENT_BG} borderWidth={1} borderColor={ACCENT}
                  borderRadius="$10" paddingHorizontal="$3" paddingVertical={5}>
                  <Text fontSize={11} color="$text" fontWeight="600">{m.Name}</Text>
                </View>
              ))}
            </XStack>
          )}
        </YStack>

        <View height={14} />

        {/* ── Firmas por tipo de salida ── */}
        <Text fontSize="$3" fontWeight="900" color="$text" paddingHorizontal="$1" paddingBottom="$2">
          Firmas por tipo de salida
        </Text>

        <YStack gap="$2.5">
          {celdas.map(c => {
            const aplica = c.Pasos.length > 0
            /* Tres estados, y cada uno se ve distinto: prohibida en rojo porque
               es una decisión tomada, sin configurar en gris porque es una
               tarea pendiente. Mezclarlas fue justo el problema. */
            const color = c.NoPermitido ? '#ef4444' : aplica ? ACCENT : '#64748b'
            const bg = c.NoPermitido ? 'rgba(239, 68, 68, 0.18)'
              : aplica ? ACCENT_BG : 'rgba(100, 116, 139, 0.18)'
            return (
              <YStack key={c.TipoSalida_Id} backgroundColor="$backgroundElevated" borderRadius="$4"
                borderLeftWidth={4} borderLeftColor={c.NoPermitido ? '#ef4444' : aplica ? '$primary' : '$border'}
                borderWidth={1} borderColor="$border" padding="$4" gap="$2.5" {...shadows.sm}
                onPress={() => abrirCelda(c)} pressStyle={{ opacity: 0.85, scale: 0.995 }}>
                <XStack alignItems="center" gap="$2">
                  <Text flex={1} fontSize={14} fontWeight="800" color="$text">{c.TipoSalida}</Text>
                  {c.Retorna ? (
                    <XStack alignItems="center" gap="$1">
                      <RotateCcw size={11} color={theme.textMuted?.val} />
                      <Text fontSize={10} color="$textMuted">Regresa</Text>
                    </XStack>
                  ) : null}
                  <View backgroundColor={bg} borderWidth={1} borderColor={color}
                    paddingHorizontal="$2" paddingVertical={3} borderRadius="$10">
                    <Text fontSize={10} fontWeight="700" color={color}>
                      {c.NoPermitido ? 'No se permite'
                        : aplica ? `${c.Pasos.length} ${c.Pasos.length === 1 ? 'firma' : 'firmas'}`
                          : 'Sin configurar'}
                    </Text>
                  </View>
                </XStack>

                {c.NoPermitido ? (
                  <XStack alignItems="center" gap="$1.5">
                    <Ban size={12} color="#ef4444" />
                    <Text flex={1} fontSize={11} color="#ef4444" fontWeight="700">
                      Los materiales de este grupo no pueden salir bajo este tipo.
                    </Text>
                  </XStack>
                ) : aplica ? (
                  <YStack gap="$1.5">
                    {c.Pasos.map(p => (
                      <XStack key={p.Paso} alignItems="flex-start" gap="$2">
                        <Text fontSize={11} fontWeight="800" color="$textMuted" width={58}>Firma {p.Paso}</Text>
                        <Text flex={1} fontSize={11} color="$text">
                          {p.Accesos.map(a => a.Name.replace(/^Firma /, '')).join('  o  ')}
                        </Text>
                      </XStack>
                    ))}
                  </YStack>
                ) : (
                  <Text fontSize={11} color="$textMuted">
                    Nadie ha definido esta combinación todavía. Toque para configurarla o para prohibirla.
                  </Text>
                )}
              </YStack>
            )
          })}
        </YStack>
      </ScrollView>

      {/* ── Modal: materiales del grupo ── */}
      <Modal visible={matOpen} transparent animationType="fade" onRequestClose={() => setMatOpen(false)}>
        <View flex={1} backgroundColor="rgba(0,0,0,0.45)" alignItems="center" justifyContent="center" padding="$4">
          <YStack width="100%" maxWidth={480} maxHeight="85%" backgroundColor="$background" borderRadius="$6" padding="$4" gap="$3">
            <Text fontSize="$5" fontWeight="900" color="$text">Materiales del grupo</Text>
            <Text fontSize={11} color="$textMuted">
              Un material solo puede estar en un grupo. Si ya está en otro, al marcarlo se mueve a éste.
            </Text>

            <SearchInput
              data={materiales}
              searchKeys={['Name', 'Grupo']}
              onResults={setMatFiltrados}
              placeholder="Buscar..."
            />

            <FlatList
              data={matFiltrados}
              keyExtractor={(m) => String(m.Id)}
              style={{ maxHeight: 340 }}
              ItemSeparatorComponent={() => <View height={6} />}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: m }) => {
                const sel = matSel.includes(m.Id)
                const enOtro = m.Grupo_Id != null && m.Grupo_Id !== grupoId
                return (
                  <XStack alignItems="center" gap="$3" paddingVertical="$2" paddingHorizontal="$2"
                    borderRadius="$3" backgroundColor={sel ? 'rgba(255, 85, 26, 0.08)' : 'transparent'}
                    onPress={() => setMatSel(prev => sel ? prev.filter(x => x !== m.Id) : [...prev, m.Id])}
                    pressStyle={{ opacity: 0.7 }}>
                    <View width={20} height={20} borderRadius="$2" borderWidth={1.5}
                      borderColor={sel ? ACCENT : '$border'} backgroundColor={sel ? ACCENT : 'transparent'}
                      alignItems="center" justifyContent="center">
                      {sel ? <Check size={13} color="#fff" /> : null}
                    </View>
                    <YStack flex={1}>
                      <Text fontSize={13} fontWeight="700" color="$text">{m.Name}</Text>
                      {enOtro ? <Text fontSize={10} color="$textMuted">Hoy está en "{m.Grupo}"</Text> : null}
                    </YStack>
                  </XStack>
                )
              }}
              ListEmptyComponent={<Text fontSize={12} color="$textMuted" paddingVertical="$4">Sin materiales.</Text>}
            />

            <XStack gap="$2.5">
              <View flex={1} onPress={matGuardando ? undefined : () => setMatOpen(false)} pressStyle={{ opacity: 0.85 }}
                borderWidth={1.5} borderColor="$border" borderRadius="$4" height={46} alignItems="center" justifyContent="center">
                <Text color="$text" fontWeight="800" fontSize="$3">Cancelar</Text>
              </View>
              <View flex={1} onPress={matGuardando ? undefined : guardarMateriales} pressStyle={{ opacity: 0.85 }}
                opacity={matGuardando ? 0.6 : 1} backgroundColor={ACCENT} borderRadius="$4" height={46}
                alignItems="center" justifyContent="center" flexDirection="row" gap="$2">
                {matGuardando ? <Spinner color="#fff" /> : null}
                <Text color="#fff" fontWeight="800" fontSize="$3">Guardar</Text>
              </View>
            </XStack>
          </YStack>
        </View>
      </Modal>

      {/* ── Modal: firmas de una celda ── */}
      <Modal visible={!!celda} transparent animationType="fade" onRequestClose={() => setCelda(null)}>
        <View flex={1} backgroundColor="rgba(0,0,0,0.45)" alignItems="center" justifyContent="center" padding="$4">
          <YStack width="100%" maxWidth={480} maxHeight="88%" backgroundColor="$background" borderRadius="$6" padding="$4" gap="$3">
            <Text fontSize="$5" fontWeight="900" color="$text">{celda?.TipoSalida}</Text>

            {/* La prohibición va ARRIBA: es la primera decisión. Si esta
                combinación no existe en la realidad —una herramienta no se
                dona—, no tiene sentido ponerse a elegir quién la firma. */}
            <XStack alignItems="flex-start" gap="$3" padding="$3" borderRadius="$4" borderWidth={1.5}
              borderColor={noPermitido ? '#ef4444' : '$border'}
              backgroundColor={noPermitido ? 'rgba(239, 68, 68, 0.12)' : 'transparent'}
              onPress={() => setNoPermitido(v => !v)} pressStyle={{ opacity: 0.8 }}>
              <View width={20} height={20} borderRadius="$2" borderWidth={1.5}
                borderColor={noPermitido ? '#ef4444' : '$border'}
                backgroundColor={noPermitido ? '#ef4444' : 'transparent'}
                alignItems="center" justifyContent="center" marginTop={1}>
                {noPermitido ? <Check size={13} color="#fff" /> : null}
              </View>
              <YStack flex={1} gap={2}>
                <Text fontSize={13} fontWeight="800" color={noPermitido ? '#ef4444' : '$text'}>
                  No se permite
                </Text>
                <Text fontSize={10} color="$textMuted">
                  Los materiales de este grupo no se pueden sacar con "{celda?.TipoSalida}".
                  Al intentarlo, el solicitante no podrá agregarlos.
                </Text>
              </YStack>
            </XStack>

            {noPermitido ? null : (
              <Text fontSize={11} color="$textMuted">
                Los cargos marcados dentro de una misma firma son alternativas: basta con que uno la dé.
                Para exigir una segunda firma de otra autoridad, use "Agregar otra firma".
              </Text>
            )}

            {!noPermitido && resumen ? (
              <YStack backgroundColor={ACCENT_BG} borderWidth={1} borderColor={ACCENT}
                borderRadius="$4" paddingHorizontal="$3" paddingVertical="$2.5">
                <Text fontSize={11} fontWeight="700" color="$primary">{resumen}</Text>
              </YStack>
            ) : null}

            {/* Con la prohibición marcada el editor de firmas desaparece: no
                hay ninguna firma que pueda habilitar una salida prohibida, y
                dejarlo visible invitaría a configurar algo que se va a borrar. */}
            {noPermitido ? null : (
            <ScrollView style={{ maxHeight: 400 }} keyboardShouldPersistTaps="handled">
              <YStack gap="$3">
                {pasos.map((sel, i) => (
                  <YStack key={i} borderWidth={1} borderColor="$border" borderRadius="$4" padding="$3" gap="$2.5">
                    <XStack alignItems="center" gap="$2">
                      <YStack flex={1}>
                        <Text fontSize="$2" fontWeight="900" color="$text">Firma {i + 1}</Text>
                        <Text fontSize={10} color="$textMuted">
                          {sel.length > 1 ? `Cualquiera de los ${sel.length} marcados la puede dar` : 'Quién la puede dar'}
                        </Text>
                      </YStack>
                      {pasos.length > 1 ? (
                        <View onPress={() => setPasos(prev => prev.filter((_, j) => j !== i))} pressStyle={{ opacity: 0.6 }} hitSlop={8}>
                          <Trash2 size={15} color="#ef4444" />
                        </View>
                      ) : null}
                    </XStack>
                    <XStack flexWrap="wrap" gap="$2">
                      {firmas.map(f => {
                        const on = sel.includes(f.Id)
                        return (
                          <View key={f.Id} onPress={() => toggleAcceso(i, f.Id)} pressStyle={{ opacity: 0.8 }}
                            borderWidth={1.5} borderColor={on ? ACCENT : '$border'}
                            backgroundColor={on ? ACCENT_BG : 'transparent'}
                            borderRadius="$10" paddingHorizontal="$3" paddingVertical={7}>
                            <Text fontSize={11} fontWeight="700" color={on ? '$primary' : '$text'}>
                              {f.Name.replace(/^Firma /, '')}
                            </Text>
                          </View>
                        )
                      })}
                    </XStack>
                    {sel.length === 0 ? (
                      <Text fontSize={10} color="#ef4444">Seleccione al menos un cargo para esta firma.</Text>
                    ) : null}
                  </YStack>
                ))}

                <View onPress={() => setPasos(prev => [...prev, []])} pressStyle={{ opacity: 0.8 }}
                  borderWidth={1.5} borderColor="$border" borderStyle="dashed" borderRadius="$4" height={44}
                  alignItems="center" justifyContent="center" flexDirection="row" gap="$2">
                  <Plus size={15} color={theme.primary?.val} />
                  <Text fontSize="$2" fontWeight="800" color="$primary">Agregar otra firma requerida</Text>
                </View>
              </YStack>
            </ScrollView>
            )}

            <XStack gap="$2.5">
              {/* Borra la decisión: ni permitida ni prohibida, como al principio.
                  Por eso ya no dice "No aplica" — eso ahora es el checkbox. */}
              <View flex={1} onPress={celdaGuardando ? undefined : sinConfigurar} pressStyle={{ opacity: 0.85 }}
                borderWidth={1.5} borderColor="$border" borderRadius="$4" height={46}
                alignItems="center" justifyContent="center" flexDirection="row" gap="$2">
                <Ban size={14} color={theme.textMuted?.val} />
                <Text color="$textMuted" fontWeight="800" fontSize="$2">Limpiar</Text>
              </View>
              <View flex={1} onPress={celdaGuardando ? undefined : () => setCelda(null)} pressStyle={{ opacity: 0.85 }}
                borderWidth={1.5} borderColor="$border" borderRadius="$4" height={46} alignItems="center" justifyContent="center">
                <Text color="$text" fontWeight="800" fontSize="$2">Cancelar</Text>
              </View>
              <View flex={1} onPress={celdaGuardando ? undefined : guardarCelda} pressStyle={{ opacity: 0.85 }}
                opacity={celdaGuardando ? 0.6 : 1} backgroundColor={ACCENT} borderRadius="$4" height={46}
                alignItems="center" justifyContent="center" flexDirection="row" gap="$2">
                {celdaGuardando ? <Spinner color="#fff" /> : null}
                <Text color="#fff" fontWeight="800" fontSize="$2">Guardar</Text>
              </View>
            </XStack>
          </YStack>
        </View>
      </Modal>
    </View>
  )
}
