import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useWindowDimensions } from 'react-native'
import { ScrollView, Text, XStack, YStack, View, Spinner, Input, TextArea, useTheme } from 'tamagui'
import { Check, Wrench, MapPin, ScanLine, ArrowLeft } from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'

import { usePageHeader } from '../../../hooks/usePageHeader'
import { useShowToast } from '../../../utils/useShowToast'
import AppSelect from '../../../components/commons/AppSelect'
import { ticketsService } from '../../../api/modules/mantenimiento/tickets.service'
import { IArea, IOperacion, IModelo, ITipoParo, IPrioridad, ITicketManage } from '../../../api/modules/mantenimiento/tickets.types'
import { ACCENT } from '../mantenimiento.helpers'

type Opt = { label: string; value: string }
const toOpts = <T,>(arr: T[], val: (t: T) => string | number, lab: (t: T) => string): Opt[] =>
  arr.map(t => ({ value: String(val(t)), label: lab(t) }))

const ERR = '#ef4444'
type Tipo = 'MAQUINA' | 'AREA'

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: boolean; children: React.ReactNode }) {
  return (
    <YStack marginBottom="$5" gap="$2">
      <XStack alignItems="center" gap="$2">
        <Text fontSize="$3" fontWeight="700" color="$text">{label}</Text>
        {!!hint && <Text fontSize="$1" color="$textMuted">· {hint}</Text>}
      </XStack>
      {children}
      {error && <Text fontSize="$1" color={ERR}>Este campo es obligatorio</Text>}
    </YStack>
  )
}

export default function NewTicketScreen() {
  const theme = useTheme()
  const navigation = useNavigation<any>()
  const { showToast } = useShowToast()

  // Pantalla "push": botón de regresar (vuelve al listado; si no se guardó, el
  // ticket queda cancelado). El ☰ del drawer no aplica aquí.
  usePageHeader({
    left: <ArrowLeft color={theme.text?.val} onPress={() => navigation.goBack()} />,
    center: <Text fontSize="$4" fontWeight="700" color="$text">Crear ticket</Text>,
  })
  const { width } = useWindowDimensions()
  const FORM_MAX = 680

  const [areas, setAreas] = useState<IArea[]>([])
  const [operaciones, setOperaciones] = useState<IOperacion[]>([])
  const [modelos, setModelos] = useState<IModelo[]>([])
  const [tiposParo, setTiposParo] = useState<ITipoParo[]>([])
  const [prioridades, setPrioridades] = useState<IPrioridad[]>([])
  const [cargandoCat, setCargandoCat] = useState(true)

  const [tipo, setTipo] = useState<Tipo>('MAQUINA')

  const [areaId, setAreaId] = useState<number | undefined>()
  const [operacionId, setOperacionId] = useState<number | undefined>()
  const [modelo, setModelo] = useState<string | undefined>()
  const [numero, setNumero] = useState('')
  const [objeto, setObjeto] = useState('')
  const [tipoParoId, setTipoParoId] = useState<number | undefined>()
  const [prioridadId, setPrioridadId] = useState<number | undefined>()
  const [idOperador, setIdOperador] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [intentado, setIntentado] = useState(false)

  const esMaquina = tipo === 'MAQUINA'

  useEffect(() => {
    ;(async () => {
      try {
        const [a, tp, pr] = await Promise.all([
          ticketsService.getAreas(),
          ticketsService.getTiposParo(),
          ticketsService.getPrioridades(),
        ])
        setAreas(a.Data ?? [])
        setTiposParo(tp.Data ?? [])
        setPrioridades(pr.Data ?? [])
      } finally {
        setCargandoCat(false)
      }
    })()
  }, [])

  useEffect(() => {
    setAreaId(undefined); setOperacionId(undefined); setOperaciones([])
    setModelo(undefined); setModelos([]); setNumero(''); setObjeto('')
    setIdOperador(''); setTipoParoId(undefined); setIntentado(false)
  }, [tipo])

  useEffect(() => {
    setOperacionId(undefined); setOperaciones([]); setModelo(undefined); setModelos([])
    if (!esMaquina || areaId == null) return
    ticketsService.getOperaciones(areaId).then(r => setOperaciones(r.Data ?? [])).catch(() => {})
  }, [areaId, esMaquina])

  useEffect(() => {
    setModelo(undefined); setModelos([])
    if (!esMaquina || operacionId == null) return
    ticketsService.getModelos(operacionId).then(r => setModelos(r.Data ?? [])).catch(() => {})
  }, [operacionId, esMaquina])

  const numeroOk = /^\d{4}$/.test(numero)
  const operadorOk = /^\d+$/.test(idOperador.trim())

  const puedeGuardar = esMaquina
    ? (areaId != null && operacionId != null && numeroOk && !!modelo && operadorOk && tipoParoId != null && prioridadId != null)
    : (areaId != null && !!objeto.trim() && prioridadId != null)

  const guardar = useCallback(async () => {
    setIntentado(true)
    if (!puedeGuardar) {
      showToast('warning', 'Datos incompletos', 'Revisa los campos obligatorios')
      return
    }
    setEnviando(true)
    try {
      const payload: ITicketManage = esMaquina
        ? {
            TipoDestino: 'MAQUINA', Area_Id: areaId, Operacion_Id: operacionId, Modelo: modelo,
            NumeroMaquina: numero, TipoParo_Id: tipoParoId, Prioridad_Id: prioridadId,
            IdOperador: Number(idOperador), Observaciones: observaciones.trim() || undefined,
          }
        : {
            TipoDestino: 'AREA', Area_Id: areaId, Objeto: objeto.trim(),
            Prioridad_Id: prioridadId, Observaciones: observaciones.trim() || undefined,
          }
      const res = await ticketsService.create(payload)
      if (res.Success && res.Data?.Success) {
        showToast('success', 'Ticket creado', res.Data.CodigoTicket ?? '')
        navigation.goBack()
      } else {
        showToast('error', 'No se pudo crear', res.Data?.ErrorMessage || res.ErrorMessage || 'Intenta de nuevo')
      }
    } catch (e: any) {
      showToast('error', 'Error', e?.message || 'No se pudo crear el ticket')
    } finally {
      setEnviando(false)
    }
  }, [puedeGuardar, esMaquina, areaId, operacionId, modelo, numero, objeto, tipoParoId, prioridadId, idOperador, observaciones])

  const areasFiltradas = useMemo(
    () => esMaquina ? areas.filter(a => (a.Categoria ?? 'Produccion') === 'Produccion') : areas,
    [areas, esMaquina],
  )
  const optsArea = useMemo(() => toOpts(areasFiltradas, a => a.Id, a => a.Name), [areasFiltradas])
  const optsOp = useMemo(() => toOpts(operaciones, o => o.Id, o => o.Name), [operaciones])
  const optsModelo = useMemo(() => modelos.map(m => ({ value: m.Modelo, label: m.Modelo })), [modelos])
  const optsParo = useMemo(() => toOpts(tiposParo, t => t.Id, t => t.Name), [tiposParo])
  const optsPrio = useMemo(() => toOpts(prioridades, p => p.Id, p => p.Name), [prioridades])

  if (cargandoCat) {
    return (
      <YStack flex={1} backgroundColor="$background" alignItems="center" justifyContent="center" gap="$3">
        <Spinner size="large" color={ACCENT} />
        <Text color="$textMuted">Cargando catálogos…</Text>
      </YStack>
    )
  }

  return (
    <View flex={1} backgroundColor="$background">
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <YStack width="100%" maxWidth={FORM_MAX} alignSelf="center">

          <Text fontSize="$3" fontWeight="700" color="$text" marginBottom="$2">¿Qué vas a reportar?</Text>
          <XStack borderWidth={1} borderColor="$border" borderRadius="$4" padding="$1" marginBottom="$5" backgroundColor="$backgroundElevated">
            <SegBtn active={esMaquina} onPress={() => setTipo('MAQUINA')} icon={<Wrench size={18} color={esMaquina ? '#fff' : theme.textMuted?.val} />} label="Máquina" />
            <SegBtn active={!esMaquina} onPress={() => setTipo('AREA')} icon={<MapPin size={18} color={!esMaquina ? '#fff' : theme.textMuted?.val} />} label="Área / General" />
          </XStack>

          <Field label="Área *" error={intentado && areaId == null}>
            <AppSelect label="" placeholder={esMaquina ? 'Selecciona el área de producción' : 'Selecciona el área'}
              value={areaId != null ? String(areaId) : undefined} options={optsArea}
              onValueChange={v => setAreaId(v ? Number(v) : undefined)} />
          </Field>

          {esMaquina ? (
            <>
              <Field label="Operación *" error={intentado && operacionId == null}>
                <AppSelect label="" placeholder={areaId == null ? 'Primero selecciona un área' : 'Selecciona la operación'}
                  value={operacionId != null ? String(operacionId) : undefined} options={optsOp}
                  onValueChange={v => setOperacionId(v ? Number(v) : undefined)} />
              </Field>

              {/* Número de máquina (escaneo/manual). Al existir, el modelo se autocompletará a futuro. */}
              <Field label="Número de máquina *" hint="escanea o escribe los 4 dígitos" error={intentado && !numeroOk}>
                <XStack alignItems="center" height={50} borderWidth={1}
                  borderColor={intentado && !numeroOk ? ERR : '$border'} borderRadius={8}
                  backgroundColor="$backgroundElevated" overflow="hidden">
                  <View height="100%" justifyContent="center" paddingHorizontal="$3"
                    backgroundColor="$backgroundHover" borderRightWidth={1} borderRightColor="$border">
                    <Text color="$text" fontWeight="800" fontSize="$5">AF-0000</Text>
                  </View>
                  <Input flex={1} unstyled height="100%" paddingHorizontal="$3" fontSize="$6" color="$text"
                    keyboardType="number-pad" maxLength={4} placeholder="0000" placeholderTextColor={theme.textMuted?.val}
                    value={numero} onChangeText={t => setNumero(t.replace(/\D/g, '').slice(0, 4))} />
                  <View height="100%" width={50} alignItems="center" justifyContent="center"
                    backgroundColor={ACCENT} pressStyle={{ opacity: 0.8 }}
                    onPress={() => showToast('info', 'Escaneo de máquina', 'Lectura de QR/código de barras — próximamente')}>
                    <ScanLine size={22} color="#fff" />
                  </View>
                </XStack>
              </Field>

              <Field label="Modelo de máquina *" hint="se autocompleta al existir la máquina" error={intentado && !modelo}>
                <AppSelect label="" placeholder={operacionId == null ? 'Primero selecciona una operación' : 'Selecciona el modelo'}
                  value={modelo ?? undefined} options={optsModelo}
                  onValueChange={v => setModelo(v ? String(v) : undefined)} />
              </Field>

              <Field label="ID del operador *" error={intentado && !operadorOk}>
                <Input height={50} borderWidth={1} borderColor={intentado && !operadorOk ? ERR : '$border'}
                  borderRadius={8} backgroundColor="$backgroundElevated" paddingHorizontal="$3" fontSize="$5" color="$text"
                  keyboardType="number-pad" placeholder="Ej. 90210" placeholderTextColor={theme.textMuted?.val}
                  value={idOperador} onChangeText={t => setIdOperador(t.replace(/\D/g, ''))} />
              </Field>

              <Field label="Tipo de paro *" error={intentado && tipoParoId == null}>
                <AppSelect label="" placeholder="Selecciona el tipo de paro"
                  value={tipoParoId != null ? String(tipoParoId) : undefined} options={optsParo}
                  onValueChange={v => setTipoParoId(v ? Number(v) : undefined)} />
              </Field>
            </>
          ) : (
            <Field label="¿Qué reparar? *" hint="objeto / trabajo" error={intentado && !objeto.trim()}>
              <Input height={50} borderWidth={1} borderColor={intentado && !objeto.trim() ? ERR : '$border'}
                borderRadius={8} backgroundColor="$backgroundElevated" paddingHorizontal="$3" fontSize="$5" color="$text"
                placeholder="Ej. Lámpara de pasillo, Aire acondicionado…" placeholderTextColor={theme.textMuted?.val}
                value={objeto} onChangeText={setObjeto} />
            </Field>
          )}

          <Field label="Prioridad *" error={intentado && prioridadId == null}>
            <AppSelect label="" placeholder="Selecciona la prioridad"
              value={prioridadId != null ? String(prioridadId) : undefined} options={optsPrio}
              onValueChange={v => setPrioridadId(v ? Number(v) : undefined)} />
          </Field>

          <Field label="Observaciones">
            <TextArea minHeight={110} backgroundColor="$backgroundElevated" color="$text" borderColor="$border"
              borderRadius={8} padding="$3" placeholder="Detalles o comentarios (opcional)"
              placeholderTextColor={theme.textMuted?.val} value={observaciones} onChangeText={setObservaciones} />
          </Field>

          <View marginTop="$3" onPress={enviando ? undefined : guardar} pressStyle={{ opacity: 0.85 }}
            opacity={enviando ? 0.7 : 1} backgroundColor={ACCENT} borderRadius="$4" height={52}
            alignItems="center" justifyContent="center" flexDirection="row" gap="$2">
            {enviando ? <Spinner color="#fff" /> : <Check size={20} color="#fff" />}
            <Text color="#fff" fontWeight="800" fontSize="$4">{enviando ? 'Creando…' : 'Crear ticket'}</Text>
          </View>
        </YStack>
      </ScrollView>
    </View>
  )
}

function SegBtn({ active, onPress, icon, label }: { active: boolean; onPress: () => void; icon: React.ReactNode; label: string }) {
  return (
    <View flex={1} onPress={onPress} pressStyle={{ opacity: 0.85 }}
      backgroundColor={active ? ACCENT : 'transparent'} borderRadius="$3" height={42}
      flexDirection="row" alignItems="center" justifyContent="center" gap="$2">
      {icon}
      <Text fontWeight="700" fontSize="$3" color={active ? '#fff' : '$textMuted'}>{label}</Text>
    </View>
  )
}
