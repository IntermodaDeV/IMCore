import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshControl } from 'react-native'
import { ScrollView, Text, XStack, YStack, View, Spinner, Input, Button, useTheme } from 'tamagui'
import { Settings, Check, ChevronDown, ChevronRight } from 'lucide-react-native'

import { usePageHeader } from '../../../hooks/usePageHeader'
import { useShowToast } from '../../../utils/useShowToast'
import { configuracionService, IConfiguracion } from '../../../api/modules/configuracion/configuracion.service'

const ACCENT = '#FF551A'

// ── Categorías: el módulo sale del PREFIJO de la clave (lo de antes del punto) ──
// Se DERIVA del dato, no de una lista fija: si mañana aparece 'Repuestos.Algo' se
// muestra en su propio grupo en vez de quedar invisible. Mismos nombres y mismo
// orden que el web (IMCoreWeb/src/components/ConfigGlobal.tsx).
const CATEGORIA_LABEL: Record<string, string> = {
  Mtto: 'Mantenimiento',
  Visitas: 'Visitas',
  RH: 'Recursos Humanos',
  Gira: 'Gira · gastos de viaje',
}
const CATEGORIA_ORDEN = ['Mtto', 'Visitas', 'RH', 'Gira']

const prefijoDe = (clave: string) => {
  const i = clave.indexOf('.')
  return i > 0 ? clave.slice(0, i) : 'General'
}

function agruparPorCategoria(items: IConfiguracion[]) {
  const mapa = new Map<string, IConfiguracion[]>()
  for (const c of items) {
    const pre = prefijoDe(c.Clave)
    const arr = mapa.get(pre)
    if (arr) arr.push(c)
    else mapa.set(pre, [c])
  }
  const pos = (p: string) => {
    const i = CATEGORIA_ORDEN.indexOf(p)
    return i === -1 ? CATEGORIA_ORDEN.length : i
  }
  return [...mapa.entries()]
    .map(([prefijo, lista]) => ({ prefijo, label: CATEGORIA_LABEL[prefijo] ?? prefijo, items: lista }))
    .sort((a, b) => pos(a.prefijo) - pos(b.prefijo) || a.label.localeCompare(b.label))
}

// Metadatos por clave conocida: etiqueta amigable y tipo de control.
//  - 'bool': switch on/off (Valor '1'/'0').
//  - 'options': selector de chips (Valor = uno de options, como texto).
//  - 'number': campo numérico con botón guardar (Valor = entero como texto). unidad opcional.
//  - 'multi': checklist con botón guardar (Valor = códigos separados por coma).
// Si la clave no está aquí, se asume 'bool' y se muestra la clave tal cual.
type ConfigKind = 'bool' | 'options' | 'number' | 'multi'
const CONFIG_META: Record<
  string,
  {
    label: string
    kind: ConfigKind
    options?: number[]
    unidad?: string
    // Solo para 'options': unidad de los chips ('min' si no se indica), etiqueta del
    // chip 0, y si se ofrece un chip de apagado (guarda el texto 'Off', que el SQL lee
    // como apagado porque TRY_CAST lo deja en NULL).
    unidadOpcion?: string
    etiquetaCero?: string
    permiteOff?: boolean
    // Solo para 'multi': las casillas, en el orden en que se muestran y se guardan.
    opciones?: { value: string; label: string }[]
  }
> = {
  'Mtto.UnTicketPorMaquina': { label: 'Un ticket por máquina', kind: 'bool' },
  // Trabaja con SITUACIONES y no con el catálogo de estados: 'VALIDADO' no es un
  // estado, es la bandera ValidadoPor sobre un COMPLETADO. Mismo orden y mismos
  // códigos que el web y que el SP, para que las tres no puedan discrepar.
  'Mtto.EstadosDespachoRepuestos': {
    label: 'Situaciones que admiten despacho de repuestos',
    kind: 'multi',
    opciones: [
      { value: 'PENDIENTE', label: 'Pendiente' },
      { value: 'EN_PROCESO', label: 'En Proceso' },
      { value: 'PAUSADO', label: 'Pausado' },
      { value: 'RECHAZADO', label: 'Rechazado' },
      { value: 'COMPLETADO', label: 'Completado' },
      { value: 'VALIDADO', label: 'Validado' },
      { value: 'CANCELADO', label: 'Cancelado' },
    ],
  },
  'Mtto.ValidacionBloqueaCreacion': {
    label: 'Exigir validación antes de otro ticket de la máquina',
    kind: 'bool',
  },
  'Mtto.AutovalidarCompletadoHoras': {
    label: 'Plazo del supervisor para validar (luego valida el sistema)',
    kind: 'options',
    options: [0, 1, 2, 3, 4],
    unidadOpcion: 'h',
    etiquetaCero: 'Al completarse',
    permiteOff: true,
  },
  'Mtto.RecordatorioTicketMinDefault': {
    label: 'Recordatorio por defecto',
    kind: 'options',
    options: [0, 15, 30, 60],
  },
  'Mtto.MetaMinutosSemanalMecanico': {
    label: 'Meta de minutos por mecánico (semanal)',
    kind: 'number',
    unidad: 'min/sem',
  },
  // Líneas de referencia de los gráficos de paro del dashboard web. Van acá también
  // para que no caigan en el fallback 'bool', que las dejaría en 1 o 0 minutos.
  // Son DOS porque un área suma el paro de todas sus máquinas: la cifra de una
  // máquina no le sirve (con 240 min, 12 de 15 áreas la pasaban).
  'Mtto.MetaMinutosParoActivoSemanal': {
    label: 'Meta de minutos de paro por MÁQUINA (semanal)',
    kind: 'number',
    unidad: 'min/sem',
  },
  'Mtto.MetaMinutosParoAreaSemanal': {
    label: 'Meta de minutos de paro por ÁREA (semanal)',
    kind: 'number',
    unidad: 'min/sem',
  },
  // Tarifa de mano de obra del dashboard web. Sin esta entrada caería en el
  // fallback 'bool' y el interruptor la dejaría en 1 o 0 lempiras por hora.
  'Mtto.CostoHoraMecanico': {
    label: 'Costo por hora de mano de obra',
    kind: 'number',
    unidad: 'L/hora',
  },
}

export default function ConfiguracionesGlobalesScreen() {
  usePageHeader({
    center: <Text fontSize="$4" fontWeight="700" color="$text">Configuraciones globales</Text>,
  })
  const theme = useTheme()
  const { showToast } = useShowToast()

  const [items, setItems] = useState<IConfiguracion[]>([])
  // Se agrupa una sola vez por render (el JSX lo usaba dos veces).
  const grupos = useMemo(() => agruparPorCategoria(items), [items])
  // Categorías abiertas. Arranca VACÍO: todas colapsadas. No se persiste a
  // propósito — se abre lo que se va a tocar y al volver se lee de un vistazo.
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({})
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [guardando, setGuardando] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      const res = await configuracionService.getAll()
      setItems(res.Data ?? [])
    } catch {
      // sin datos, la pantalla queda vacía
    }
  }, [])

  useEffect(() => {
    ;(async () => { setCargando(true); await cargar(); setCargando(false) })()
  }, [cargar])

  const onRefresh = useCallback(async () => {
    setRefrescando(true); await cargar(); setRefrescando(false)
  }, [cargar])

  // Guarda un valor (optimista) con reversión y toast. okMsg = detalle del éxito.
  const guardarValor = useCallback(async (c: IConfiguracion, nuevo: string, okMsg: string) => {
    if (nuevo === (c.Valor ?? '')) return
    setGuardando(c.Clave)
    setItems(prev => prev.map(x => (x.Clave === c.Clave ? { ...x, Valor: nuevo } : x)))  // optimista
    try {
      const res = await configuracionService.set(c.Clave, nuevo)
      if (!res.Success) {
        setItems(prev => prev.map(x => (x.Clave === c.Clave ? { ...x, Valor: c.Valor } : x)))  // revertir
        showToast('error', 'No se pudo cambiar', res.ErrorMessage || 'Sin permiso o error')
      } else {
        showToast('success', 'Guardado', okMsg)
      }
    } catch (e: any) {
      setItems(prev => prev.map(x => (x.Clave === c.Clave ? { ...x, Valor: c.Valor } : x)))
      showToast('error', 'Error', e?.message || 'No se pudo cambiar')
    } finally {
      setGuardando(null)
    }
  }, [showToast])

  const toggle = useCallback((c: IConfiguracion) => {
    const nuevo = c.Valor === '1' ? '0' : '1'
    guardarValor(c, nuevo, nuevo === '1' ? 'Activada' : 'Desactivada')
  }, [guardarValor])

  // Chip de un 'options'. La unidad y la etiqueta del 0 salen de la meta de la clave:
  // hay claves en minutos (recordatorio) y en horas (plazo de validación).
  const elegirOpcion = useCallback((c: IConfiguracion, v: number) => {
    const meta = CONFIG_META[c.Clave]
    const unidad = meta?.unidadOpcion ?? 'min'
    guardarValor(c, String(v), v === 0 ? (meta?.etiquetaCero ?? 'Sin aviso') : `${v} ${unidad}`)
  }, [guardarValor])

  const elegirOff = useCallback((c: IConfiguracion) => {
    guardarValor(c, 'Off', 'Desactivado')
  }, [guardarValor])

  if (cargando) {
    return (
      <YStack flex={1} backgroundColor="$background" alignItems="center" justifyContent="center" gap="$3">
        <Spinner size="large" color={ACCENT} />
        <Text color="$textMuted">Cargando configuraciones…</Text>
      </YStack>
    )
  }

  return (
    <View flex={1} backgroundColor="$background">
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} tintColor={ACCENT} />}
      >
        <YStack gap="$3" maxWidth={720} width="100%" alignSelf="center">
          <Text fontSize="$2" color="$textMuted">
            Banderas globales del sistema. Solo usuarios con permiso pueden cambiarlas.
          </Text>

          {items.length === 0 ? (
            <YStack alignItems="center" paddingVertical="$8" gap="$2">
              <Settings size={28} color={theme.textMuted?.val} />
              <Text color="$textMuted">No hay configuraciones.</Text>
            </YStack>
          ) : (
            grupos.map((g, iGrupo) => (
            <YStack key={g.prefijo} gap="$3">
              {/* Con un solo grupo NO hay barra y el contenido va suelto: si no,
                  la pantalla abriría sin nada visible y sin qué tocar. */}
              {grupos.length > 1 && (
                <View onPress={() => setAbiertos(pv => ({ ...pv, [g.prefijo]: !pv[g.prefijo] }))}
                  pressStyle={{ opacity: 0.75 }}
                  marginTop={iGrupo === 0 ? 0 : '$2'}
                  backgroundColor={abiertos[g.prefijo] ? '$backgroundHover' : '$backgroundElevated'}
                  borderRadius="$4" borderWidth={1}
                  borderColor={abiertos[g.prefijo] ? ACCENT : '$border'}
                  paddingHorizontal="$3.5" paddingVertical="$3">
                  <XStack alignItems="center" gap="$2.5">
                    {abiertos[g.prefijo]
                      ? <ChevronDown size={18} color={ACCENT} />
                      : <ChevronRight size={18} color={theme.textMuted?.val} />}
                    <Text fontSize="$4" fontWeight="800" color="$text" flex={1}>{g.label}</Text>
                    <View backgroundColor={abiertos[g.prefijo] ? ACCENT : '$backgroundHover'}
                      borderRadius="$10" paddingHorizontal="$2.5" paddingVertical="$1">
                      <Text fontSize="$1" fontWeight="800" color={abiertos[g.prefijo] ? '#fff' : '$textMuted'}>
                        {g.items.length}
                      </Text>
                    </View>
                  </XStack>
                </View>
              )}
            {(grupos.length === 1 || abiertos[g.prefijo]) && g.items.map(c => {
              const meta = CONFIG_META[c.Clave] ?? { label: c.Clave, kind: 'bool' as ConfigKind }
              const saving = guardando === c.Clave
              return (
                <View key={c.Clave} backgroundColor="$backgroundElevated" borderRadius="$5"
                  borderWidth={1} borderColor="$border" padding="$4">
                  {meta.kind === 'number' ? (
                    <NumberConfigRow
                      label={meta.label}
                      descripcion={c.Descripcion}
                      unidad={meta.unidad}
                      valor={c.Valor ?? ''}
                      saving={saving}
                      onSave={(v) => guardarValor(c, v, `${v} ${meta.unidad ?? ''}`.trim())}
                    />
                  ) : meta.kind === 'multi' ? (
                    <MultiConfigRow
                      label={meta.label}
                      descripcion={c.Descripcion}
                      opciones={meta.opciones ?? []}
                      valor={c.Valor ?? ''}
                      saving={saving}
                      onSave={(v) => guardarValor(c, v, 'Situaciones actualizadas')}
                    />
                  ) : meta.kind === 'options' ? (
                    <YStack gap="$3">
                      <YStack gap="$1">
                        <Text fontSize="$4" fontWeight="800" color="$text">{meta.label}</Text>
                        {!!c.Descripcion && <Text fontSize="$2" color="$textMuted">{c.Descripcion}</Text>}
                      </YStack>
                      <XStack gap="$2" flexWrap="wrap">
                        {meta.permiteOff ? (() => {
                          // 'Off' = valor no numérico, que es como el SQL lee "apagado".
                          const off = !Number.isFinite(Number(c.Valor))
                          return (
                            <View onPress={saving ? undefined : () => elegirOff(c)} pressStyle={{ opacity: 0.8 }}
                              backgroundColor={off ? ACCENT : '$backgroundHover'} borderRadius="$10"
                              paddingHorizontal="$3.5" paddingVertical="$2" borderWidth={1} borderColor={off ? ACCENT : '$border'}>
                              <Text fontSize="$2" fontWeight="700" color={off ? '#fff' : '$text'}>Desactivado</Text>
                            </View>
                          )
                        })() : null}
                        {(meta.options ?? []).map(m => {
                          const on = Number(c.Valor ?? 0) === m
                          return (
                            <View key={m} onPress={saving ? undefined : () => elegirOpcion(c, m)} pressStyle={{ opacity: 0.8 }}
                              backgroundColor={on ? ACCENT : '$backgroundHover'} borderRadius="$10"
                              paddingHorizontal="$3.5" paddingVertical="$2" borderWidth={1} borderColor={on ? ACCENT : '$border'}>
                              <Text fontSize="$2" fontWeight="700" color={on ? '#fff' : '$text'}>
                                {m === 0 ? (meta.etiquetaCero ?? 'Sin aviso') : `${m} ${meta.unidadOpcion ?? 'min'}`}
                              </Text>
                            </View>
                          )
                        })}
                        {saving ? <Spinner size="small" color={ACCENT} alignSelf="center" /> : null}
                      </XStack>
                    </YStack>
                  ) : (
                    <XStack alignItems="center" justifyContent="space-between" gap="$3">
                      <YStack flex={1} gap="$1">
                        <Text fontSize="$4" fontWeight="800" color="$text">{meta.label}</Text>
                        {!!c.Descripcion && <Text fontSize="$2" color="$textMuted">{c.Descripcion}</Text>}
                      </YStack>
                      <ToggleSwitch on={c.Valor === '1'} loading={saving} onPress={() => toggle(c)} />
                    </XStack>
                  )}
                </View>
              )
            })}
            </YStack>
            ))
          )}
        </YStack>
      </ScrollView>
    </View>
  )
}

// Checklist con botón de guardar. NO guarda en cada toque: pasar de "solo
// validado" a "solo completado" mandaría un estado intermedio VACÍO, y tanto el
// SP como esta app leen la lista vacía como "usar el default" — o sea lo
// contrario de lo que el usuario está haciendo. Por eso también se exige al menos
// una casilla marcada.
function MultiConfigRow({
  label, descripcion, opciones, valor, saving, onSave,
}: {
  label: string
  descripcion?: string | null
  opciones: { value: string; label: string }[]
  valor: string
  saving: boolean
  onSave: (v: string) => void
}) {
  const parse = (v: string) =>
    (v ?? '').split(',').map(x => x.trim().toUpperCase()).filter(Boolean)

  const [sel, setSel] = useState<string[]>(() => parse(valor))
  useEffect(() => { setSel(parse(valor)) }, [valor])

  // Se guarda en el orden del catálogo y no en el que se fue tocando: así el valor
  // no cambia solo por el orden de los toques.
  const normal = opciones.filter(o => sel.includes(o.value)).map(o => o.value).join(',')
  const cambiado = normal !== parse(valor).join(',')
  const vacio = sel.length === 0

  return (
    <YStack gap="$3">
      <YStack gap="$1">
        <Text fontSize="$4" fontWeight="800" color="$text">{label}</Text>
        {!!descripcion && <Text fontSize="$2" color="$textMuted">{descripcion}</Text>}
      </YStack>
      <XStack gap="$2" flexWrap="wrap">
        {opciones.map(o => {
          const on = sel.includes(o.value)
          return (
            <View key={o.value} onPress={saving ? undefined : () => setSel(prev =>
                on ? prev.filter(x => x !== o.value) : [...prev, o.value])}
              pressStyle={{ opacity: 0.8 }}
              backgroundColor={on ? ACCENT : '$backgroundHover'} borderRadius="$10"
              paddingHorizontal="$3.5" paddingVertical="$2"
              borderWidth={1} borderColor={on ? ACCENT : '$border'}>
              <XStack gap="$1.5" alignItems="center">
                {on ? <Check size={13} color="#fff" /> : null}
                <Text fontSize="$2" fontWeight="700" color={on ? '#fff' : '$text'}>{o.label}</Text>
              </XStack>
            </View>
          )
        })}
      </XStack>
      <XStack gap="$3" alignItems="center">
        <Button size="$2.5" backgroundColor={ACCENT} color="#fff" fontWeight="700"
          disabled={saving || !cambiado || vacio}
          opacity={saving || !cambiado || vacio ? 0.5 : 1}
          onPress={() => onSave(normal)}>
          Guardar
        </Button>
        {saving ? <Spinner size="small" color={ACCENT} /> : null}
        {vacio ? (
          <Text fontSize="$2" color="$textMuted" flex={1}>
            Marcá al menos una: con la lista vacía el servidor vuelve al default.
          </Text>
        ) : null}
      </XStack>
    </YStack>
  )
}

function NumberConfigRow({
  label, descripcion, unidad, valor, saving, onSave,
}: {
  label: string; descripcion?: string | null; unidad?: string; valor: string; saving: boolean; onSave: (v: string) => void
}) {
  const [txt, setTxt] = useState(valor)
  // Sincroniza si el valor externo cambia (recarga / guardado optimista).
  useEffect(() => { setTxt(valor) }, [valor])

  const limpio = txt.replace(/[^0-9]/g, '')
  const valido = limpio !== '' && Number(limpio) >= 0
  const cambiado = limpio !== (valor ?? '').trim()

  return (
    <YStack gap="$3">
      <YStack gap="$1">
        <Text fontSize="$4" fontWeight="800" color="$text">{label}</Text>
        {!!descripcion && <Text fontSize="$2" color="$textMuted">{descripcion}</Text>}
      </YStack>
      <XStack gap="$2" alignItems="center">
        <Input
          flex={1}
          keyboardType="number-pad"
          value={txt}
          onChangeText={setTxt}
          placeholder="0"
          maxLength={7}
        />
        {!!unidad && <Text fontSize="$3" color="$textMuted">{unidad}</Text>}
        <Button
          height={44}
          paddingHorizontal="$3"
          backgroundColor={valido && cambiado ? ACCENT : '$backgroundHover'}
          disabled={!valido || !cambiado || saving}
          onPress={() => onSave(limpio)}
        >
          {saving ? <Spinner size="small" color="white" /> : <Check size={18} color={valido && cambiado ? 'white' : ACCENT} />}
        </Button>
      </XStack>
    </YStack>
  )
}

function ToggleSwitch({ on, loading, onPress }: { on: boolean; loading?: boolean; onPress: () => void }) {
  return (
    <View
      onPress={loading ? undefined : onPress}
      pressStyle={{ opacity: 0.8 }}
      width={54}
      height={31}
      borderRadius={16}
      justifyContent="center"
      paddingHorizontal={3}
      backgroundColor={on ? ACCENT : '$backgroundHover'}
      borderWidth={1}
      borderColor={on ? ACCENT : '$border'}
    >
      <View
        width={25}
        height={25}
        borderRadius={13}
        backgroundColor="white"
        alignSelf={on ? 'flex-end' : 'flex-start'}
        alignItems="center"
        justifyContent="center"
      >
        {loading ? <Spinner size="small" color={ACCENT} /> : null}
      </View>
    </View>
  )
}
