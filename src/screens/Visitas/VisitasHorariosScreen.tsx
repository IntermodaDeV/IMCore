import React, { useEffect, useState } from 'react'
import { Modal, RefreshControl, Platform } from 'react-native'
import { YStack, XStack, Text, Button, View, ScrollView, Spinner } from 'tamagui'
import { Plus, Pencil, Clock, X, Moon, CalendarClock, TriangleAlert, Lock } from 'lucide-react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import Page from '../../components/commons/Page'
import AppInput from '../../components/commons/AppInput'
import { usePageHeader } from '../../hooks/usePageHeader'
import { useAuth } from '../../context/AuthContext'
import { useShowToast } from '../../utils/useShowToast'
import { visitasService } from '../../api/modules/visitas/visitas.service'
import { IHorario, IHorarioDetalle } from '../../api/modules/visitas/visitas.types'
import { handleError } from '../../utils/errorHandler'
import {
  DIAS_SEMANA,
  cruzaMedianoche,
  duracionVentana,
  etiquetaDias,
  fmtDuracion,
  fmtHora,
  horaADate,
  validarDetalle,
} from './horarios'

// Una ventana en edición: se elige para VARIOS días a la vez, que es como la
// gente piensa un horario ("L-V de 8 a 17"), y al guardar se expande a una fila
// de detalle por día.
type VentanaEdit = {
  key: string
  dias: number[]
  horaDesde: string
  horaHasta: string
}

let seq = 0
const nuevaKey = () => `v${++seq}`

// Agrupa el detalle que viene del backend (una fila por día) en ventanas de
// edición, juntando los días que comparten el mismo par de horas.
const agrupar = (detalle: IHorarioDetalle[]): VentanaEdit[] => {
  const porRango = new Map<string, number[]>()
  for (const d of detalle) {
    const k = `${d.HoraDesde}-${d.HoraHasta}`
    porRango.set(k, [...(porRango.get(k) ?? []), d.DiaSemana])
  }
  return [...porRango.entries()].map(([rango, dias]) => {
    const [horaDesde, horaHasta] = rango.split('-')
    return { key: nuevaKey(), dias: [...new Set(dias)].sort((a, b) => a - b), horaDesde, horaHasta }
  })
}

// Expande las ventanas de edición al detalle plano que espera el backend.
const expandir = (ventanas: VentanaEdit[]): IHorarioDetalle[] =>
  ventanas.flatMap((v) =>
    v.dias.map((d) => ({ DiaSemana: d, HoraDesde: v.horaDesde, HoraHasta: v.horaHasta }))
  )

export default function VisitasHorariosScreen() {
  const { user, theme } = useAuth()
  const { showToast } = useShowToast()

  const [horarios, setHorarios] = useState<IHorario[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<IHorario | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  // Horario RESERVADO: solo lo ve en el formulario de Generar, y solo lo puede
  // usar, quien tiene el acceso 'VisitasLargaDuracion'.
  const [soloAcceso, setSoloAcceso] = useState(false)
  const [ventanas, setVentanas] = useState<VentanaEdit[]>([])
  const [saving, setSaving] = useState(false)
  const [loadingDetalle, setLoadingDetalle] = useState(false)
  const [togglingId, setTogglingId] = useState<number | null>(null)
  // Time picker abierto: { key de la ventana, 'desde' | 'hasta' }
  const [picker, setPicker] = useState<{ key: string; campo: 'desde' | 'hasta' } | null>(null)

  usePageHeader({
    center: (
      <Text fontSize="$4" fontWeight="700" color="$text">
        Horarios de visita
      </Text>
    ),
  })

  const load = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const resp = await visitasService.getHorarios(false)
      if (resp.Success) setHorarios(resp.Data ?? [])
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
    setDescription('')
    setSoloAcceso(false)
    setVentanas([{ key: nuevaKey(), dias: [1, 2, 3, 4, 5], horaDesde: '08:00', horaHasta: '17:00' }])
    setPicker(null)
    setModalOpen(true)
  }

  const openEdit = async (h: IHorario) => {
    setEditing(h)
    setName(h.Name)
    setDescription(h.Description ?? '')
    setSoloAcceso(h.SoloConAcceso ?? false)
    setVentanas([])
    setPicker(null)
    setModalOpen(true)
    setLoadingDetalle(true)
    try {
      const resp = await visitasService.getHorarioDetalle(h.Id)
      if (resp.Success) setVentanas(agrupar(resp.Data ?? []))
    } catch (err) {
      showToast('error', 'Error', handleError(err).message, 4000, 'bottom')
    }
    setLoadingDetalle(false)
  }

  // ── Edición de ventanas ──
  const addVentana = () =>
    setVentanas((prev) => [
      ...prev,
      { key: nuevaKey(), dias: [1, 2, 3, 4, 5], horaDesde: '13:00', horaHasta: '17:00' },
    ])

  const removeVentana = (key: string) =>
    setVentanas((prev) => prev.filter((v) => v.key !== key))

  const toggleDia = (key: string, dia: number) =>
    setVentanas((prev) =>
      prev.map((v) =>
        v.key === key
          ? {
              ...v,
              dias: v.dias.includes(dia)
                ? v.dias.filter((d) => d !== dia)
                : [...v.dias, dia].sort((a, b) => a - b),
            }
          : v
      )
    )

  const setHora = (key: string, campo: 'desde' | 'hasta', valor: string) =>
    setVentanas((prev) =>
      prev.map((v) =>
        v.key === key ? { ...v, [campo === 'desde' ? 'horaDesde' : 'horaHasta']: valor } : v
      )
    )

  const save = async () => {
    if (!name.trim())
      return showToast('error', 'Validación', 'El nombre es requerido', 4000, 'bottom')
    if (ventanas.some((v) => v.dias.length === 0))
      return showToast('error', 'Validación', 'Hay una ventana sin días seleccionados', 4000, 'bottom')

    const detalle = expandir(ventanas)
    const error = validarDetalle(detalle)
    if (error) return showToast('error', 'Validación', error, 4000, 'bottom')

    setSaving(true)
    try {
      const payload: IHorario = {
        Id: editing?.Id ?? 0,
        Name: name.trim(),
        Description: description.trim() || null,
        Status_Id: editing?.Status_Id ?? 1,
        SoloConAcceso: soloAcceso,
        Create_By: user?.Code,
        Modified_By: user?.Code,
        Detalle: detalle,
      }
      const resp = await visitasService.saveHorario(payload)
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

  const toggle = async (h: IHorario) => {
    setTogglingId(h.Id)
    try {
      const resp = await visitasService.changeStatusHorario({
        ...h,
        Status_Id: h.Status_Id === 1 ? 2 : 1,
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
            <Text color="white" fontWeight="700">
              Nuevo horario
            </Text>
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
                onRefresh={() => {
                  setRefreshing(true)
                  load(true)
                }}
                tintColor="#FF551A"
              />
            }
          >
            <YStack paddingHorizontal="$4" paddingBottom="$4" gap="$3">
              {horarios.length === 0 ? (
                <YStack alignItems="center" paddingVertical="$10" gap="$3">
                  <CalendarClock size={48} color="#94A3B8" />
                  <Text color="$textMuted" fontSize={14}>
                    Aún no hay horarios configurados
                  </Text>
                </YStack>
              ) : (
                horarios.map((h) => {
                  const active = h.Status_Id === 1
                  return (
                    <YStack
                      key={h.Id}
                      backgroundColor="$backgroundElevated"
                      borderRadius="$4"
                      paddingVertical="$3"
                      paddingHorizontal="$4"
                      gap="$2"
                      overflow="hidden"
                      shadowColor="#000"
                      shadowOffset={{ width: 0, height: 2 }}
                      shadowOpacity={0.07}
                      shadowRadius={6}
                      elevation={2}
                    >
                      <View
                        position="absolute"
                        left={0}
                        top={0}
                        bottom={0}
                        width={4}
                        backgroundColor={active ? '$primary' : 'transparent'}
                      />
                      <XStack alignItems="center" gap="$3">
                        <View
                          width={38}
                          height={38}
                          borderRadius={19}
                          backgroundColor={active ? 'rgba(255, 85, 26, 0.12)' : '$backgroundSurface'}
                          justifyContent="center"
                          alignItems="center"
                        >
                          <Clock size={18} color={active ? '#FF551A' : '#94A3B8'} />
                        </View>

                        <YStack flex={1} gap="$0.5">
                          <XStack alignItems="center" gap="$2" flexWrap="wrap">
                            <Text fontWeight="700" fontSize={14} color="$text" flexShrink={1}>
                              {h.Name}
                            </Text>
                            {h.TieneNocturna && (
                              <XStack
                                backgroundColor="rgba(37,99,235,0.14)"
                                paddingHorizontal="$2"
                                paddingVertical="$1"
                                borderRadius="$10"
                                alignItems="center"
                                gap="$1"
                              >
                                <Moon size={10} color="#2563EB" />
                                <Text fontSize={10} fontWeight="700" color="#2563EB">
                                  Nocturno
                                </Text>
                              </XStack>
                            )}
                            {h.SoloConAcceso && (
                              <XStack
                                backgroundColor="rgba(147,51,234,0.14)"
                                paddingHorizontal="$2"
                                paddingVertical="$1"
                                borderRadius="$10"
                                alignItems="center"
                                gap="$1"
                              >
                                <Lock size={10} color="#9333EA" />
                                <Text fontSize={10} fontWeight="700" color="#9333EA">
                                  Reservado
                                </Text>
                              </XStack>
                            )}
                          </XStack>
                          {!!h.Description && (
                            <Text fontSize={12} color="$textMuted">
                              {h.Description}
                            </Text>
                          )}
                        </YStack>

                        <View onPress={() => openEdit(h)} pressStyle={{ opacity: 0.6 }} padding="$2">
                          <Pencil size={18} color="#FF551A" />
                        </View>

                        <View
                          onPress={() => togglingId === null && toggle(h)}
                          pressStyle={{ opacity: 0.7 }}
                          backgroundColor={
                            active ? 'rgba(255, 85, 26, 0.12)' : 'rgba(148,163,184,0.15)'
                          }
                          paddingHorizontal="$2.5"
                          paddingVertical="$1.5"
                          borderRadius="$10"
                          minWidth={74}
                          alignItems="center"
                        >
                          {togglingId === h.Id ? (
                            <Spinner size="small" color="$primary" />
                          ) : (
                            <Text
                              fontSize={11}
                              fontWeight="700"
                              color={active ? '$primary' : '$textMuted'}
                            >
                              {active ? 'Activo' : 'Inactivo'}
                            </Text>
                          )}
                        </View>
                      </XStack>

                      {/* Ventanas del horario, como las resume el backend */}
                      {!!h.Resumen && (
                        <XStack
                          backgroundColor="$backgroundSurface"
                          borderRadius="$3"
                          paddingHorizontal="$3"
                          paddingVertical="$2"
                          marginLeft={50}
                        >
                          <Text fontSize={11} color="$textMuted" flexShrink={1}>
                            {h.Resumen}
                          </Text>
                        </XStack>
                      )}
                    </YStack>
                  )
                })
              )}
            </YStack>
          </ScrollView>
        )}
      </YStack>

      {/* ═══════════════ Modal crear/editar ═══════════════ */}
      <Modal
        visible={modalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setModalOpen(false)}
      >
        <View flex={1} backgroundColor="rgba(0,0,0,0.5)" justifyContent="flex-end">
          <YStack
            backgroundColor="$backgroundPage"
            borderTopLeftRadius="$6"
            borderTopRightRadius="$6"
            padding="$4"
            gap="$3"
            maxHeight="92%"
          >
            <XStack justifyContent="space-between" alignItems="center">
              <Text fontSize={16} fontWeight="800" color="$text">
                {editing ? 'Editar horario' : 'Nuevo horario'}
              </Text>
              <View onPress={() => setModalOpen(false)} pressStyle={{ opacity: 0.6 }} padding="$1">
                <X size={22} color="#94A3B8" />
              </View>
            </XStack>

            <ScrollView showsVerticalScrollIndicator={false}>
              <YStack gap="$3" paddingBottom="$4">
                <AppInput label="Nombre" value={name} onChangeText={setName} />
                <AppInput
                  label="Descripción (opcional)"
                  value={description}
                  onChangeText={setDescription}
                />

                {/* Reservado: la lista de Generar ni siquiera se lo pide al
                    servidor para quien no tiene el acceso, y el servidor lo
                    rechaza aunque el Horario_Id llegue a mano. */}
                <View
                  onPress={() => setSoloAcceso((v) => !v)}
                  pressStyle={{ opacity: 0.7 }}
                  borderWidth={1}
                  borderColor="$border"
                  borderRadius="$3"
                  padding="$3"
                >
                  <XStack alignItems="center" justifyContent="space-between" gap="$3">
                    <YStack flex={1} gap="$1">
                      <Text fontSize={14} fontWeight="700" color="$text">
                        Horario reservado
                      </Text>
                      <Text fontSize={11} color="$textMuted">
                        Solo para quien tiene el acceso de pases de larga duración, como el de
                        recoger familiares.
                      </Text>
                    </YStack>
                    <XStack
                      width={44}
                      height={24}
                      borderRadius={12}
                      padding={2}
                      backgroundColor={soloAcceso ? '$primary' : '$border'}
                      alignItems="center"
                    >
                      <View
                        width={20}
                        height={20}
                        borderRadius={10}
                        backgroundColor="white"
                        alignSelf={soloAcceso ? 'flex-end' : 'flex-start'}
                      />
                    </XStack>
                  </XStack>
                </View>

                <XStack alignItems="center" justifyContent="space-between" marginTop="$1">
                  <Text fontSize={13} fontWeight="700" color="$textMuted">
                    VENTANAS HORARIAS
                  </Text>
                  <Button
                    height={32}
                    backgroundColor="transparent"
                    borderWidth={1}
                    borderColor="$primary"
                    borderRadius="$3"
                    pressStyle={{ opacity: 0.7 }}
                    onPress={addVentana}
                    icon={<Plus size={14} color="#FF551A" />}
                  >
                    <Text color="$primary" fontWeight="700" fontSize={12}>
                      Agregar
                    </Text>
                  </Button>
                </XStack>

                {loadingDetalle ? (
                  <Spinner color="$primary" />
                ) : (
                  ventanas.map((v) => {
                    const nocturna = cruzaMedianoche(v.horaDesde, v.horaHasta)
                    return (
                      <YStack
                        key={v.key}
                        backgroundColor="$backgroundElevated"
                        borderRadius="$4"
                        padding="$3"
                        gap="$2.5"
                      >
                        <XStack justifyContent="space-between" alignItems="center">
                          <Text fontSize={12} fontWeight="700" color="$text">
                            {v.dias.length > 0 ? etiquetaDias(v.dias) : 'Sin días'} ·{' '}
                            {v.horaDesde}–{v.horaHasta}
                          </Text>
                          {ventanas.length > 1 && (
                            <View
                              onPress={() => removeVentana(v.key)}
                              pressStyle={{ opacity: 0.6 }}
                              padding="$1"
                            >
                              <X size={16} color="#E53935" />
                            </View>
                          )}
                        </XStack>

                        {/* Días de la semana */}
                        <XStack gap="$1.5">
                          {DIAS_SEMANA.map((d) => {
                            const on = v.dias.includes(d.id)
                            return (
                              <View
                                key={d.id}
                                onPress={() => toggleDia(v.key, d.id)}
                                pressStyle={{ opacity: 0.7 }}
                                flex={1}
                                height={34}
                                borderRadius="$3"
                                borderWidth={1}
                                borderColor={on ? '$primary' : '$border'}
                                backgroundColor={on ? '$primary' : 'transparent'}
                                justifyContent="center"
                                alignItems="center"
                              >
                                <Text
                                  fontSize={12}
                                  fontWeight="700"
                                  color={on ? 'white' : '$textMuted'}
                                >
                                  {d.corto}
                                </Text>
                              </View>
                            )
                          })}
                        </XStack>

                        {/* Horas */}
                        <XStack gap="$2">
                          {(['desde', 'hasta'] as const).map((campo) => (
                            <View
                              key={campo}
                              flex={1}
                              onPress={() =>
                                setPicker((p) =>
                                  p?.key === v.key && p.campo === campo ? null : { key: v.key, campo }
                                )
                              }
                              pressStyle={{ opacity: 0.7 }}
                              backgroundColor="$background"
                              borderWidth={1}
                              borderColor="$border"
                              borderRadius={6}
                              height={44}
                              paddingHorizontal="$3"
                              flexDirection="row"
                              alignItems="center"
                              justifyContent="space-between"
                            >
                              <YStack>
                                <Text fontSize={10} color="$textMuted">
                                  {campo === 'desde' ? 'Desde' : 'Hasta'}
                                </Text>
                                <Text fontSize={15} color="$text" fontWeight="600">
                                  {campo === 'desde' ? v.horaDesde : v.horaHasta}
                                </Text>
                              </YStack>
                              <Clock size={16} color="#94A3B8" />
                            </View>
                          ))}
                        </XStack>

                        {/* Picker de hora */}
                        {picker?.key === v.key && (
                          <View backgroundColor="$backgroundSurface" borderRadius="$3" padding="$2">
                            <DateTimePicker
                              value={horaADate(
                                picker.campo === 'desde' ? v.horaDesde : v.horaHasta
                              )}
                              mode="time"
                              is24Hour
                              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                              themeVariant={theme === 'dark' ? 'dark' : 'light'}
                              onChange={(_, d) => {
                                const isIOS = Platform.OS === 'ios'
                                if (!isIOS) setPicker(null)
                                if (!d) return
                                setHora(v.key, picker.campo, fmtHora(d))
                              }}
                            />
                            {Platform.OS === 'ios' && (
                              <Button
                                alignSelf="flex-end"
                                height={32}
                                backgroundColor="$primary"
                                borderRadius="$3"
                                pressStyle={{ opacity: 0.7 }}
                                onPress={() => setPicker(null)}
                              >
                                <Text color="white" fontWeight="700" fontSize={12}>
                                  Listo
                                </Text>
                              </Button>
                            )}
                          </View>
                        )}

                        {/* Aviso de cruce de medianoche: no es un error, pero hay que
                            que quede claro que la ventana cierra al día siguiente. */}
                        {nocturna ? (
                          <XStack alignItems="center" gap="$2">
                            <Moon size={13} color="#2563EB" />
                            <Text fontSize={11} color="#2563EB" flexShrink={1}>
                              Cruza medianoche: cierra el día siguiente ·{' '}
                              {fmtDuracion(duracionVentana(v.horaDesde, v.horaHasta))}
                            </Text>
                          </XStack>
                        ) : (
                          <Text fontSize={11} color="$textMuted">
                            Duración: {fmtDuracion(duracionVentana(v.horaDesde, v.horaHasta))}
                          </Text>
                        )}

                        {v.dias.length === 0 && (
                          <XStack alignItems="center" gap="$2">
                            <TriangleAlert size={13} color="#E58E26" />
                            <Text fontSize={11} color="#E58E26">
                              Selecciona al menos un día
                            </Text>
                          </XStack>
                        )}
                      </YStack>
                    )
                  })
                )}

                <XStack gap="$3" marginTop="$2">
                  <Button
                    flex={1}
                    height={46}
                    backgroundColor="$buttonSecondary"
                    borderRadius="$3"
                    pressStyle={{ opacity: 0.7 }}
                    onPress={() => setModalOpen(false)}
                    disabled={saving}
                  >
                    <Text color="$text" fontWeight="700">
                      Cancelar
                    </Text>
                  </Button>
                  <Button
                    flex={1}
                    height={46}
                    backgroundColor="$primary"
                    borderRadius="$3"
                    pressStyle={{ opacity: 0.7 }}
                    onPress={save}
                    disabled={saving}
                    opacity={saving ? 0.6 : 1}
                    icon={saving ? <Spinner color="white" /> : undefined}
                  >
                    <Text color="white" fontWeight="700">
                      Guardar
                    </Text>
                  </Button>
                </XStack>
              </YStack>
            </ScrollView>
          </YStack>
        </View>
      </Modal>
    </Page>
  )
}
