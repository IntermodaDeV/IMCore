import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { FlatList, Modal, TextInput as RNTextInput } from 'react-native'
import { Button, Input, Spinner, Text, TextArea, View, XStack, YStack, useTheme } from 'tamagui'
import { ArrowLeft, Check, ChevronDown, Plus, Search, Trash2, Wrench, X } from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import KeyboardAwareForm, { useSubirCampo } from '../../components/commons/KeyboardAwareForm'
import { usePageHeader } from '../../hooks/usePageHeader'
import { useShowToast } from '../../utils/useShowToast'
import { solicitudesRepuestosService as svc } from '../../api/modules/solicitudesRepuestos/solicitudes.service'
import { IModeloMaquina, IMotivoSolicitud } from '../../api/modules/solicitudesRepuestos/solicitudes.types'
import { ticketsService } from '../../api/modules/mantenimiento/tickets.service'
import { ITicket } from '../../api/modules/mantenimiento/tickets.types'
import { shadows } from '../../theme/shadows'
import { ACCENT, ESTADOS_TICKET_ABIERTO } from './components'

type Pieza = { NumeroParte: string; Descripcion: string; Cantidad: string }

// El formato de papel, en la tablet. Un modelo por solicitud: si necesita piezas
// de otra máquina, es otra solicitud (así el correo a Datos Maestros y el
// seguimiento no mezclan máquinas).
//
// La firma del solicitante no se pide: es el usuario de la sesión, que en las
// tablets es único por mecánico.
export default function NuevaSolicitudScreen() {
  const theme = useTheme()
  const navigation = useNavigation<any>()
  const insets = useSafeAreaInsets()
  // Sube el campo sobre el teclado al saltar de uno a otro con el teclado ya
  // abierto: ahí keyboardDidShow no vuelve a dispararse.
  const subirCampo = useSubirCampo()
  const { showToast } = useShowToast()

  usePageHeader({
    left: <ArrowLeft color={theme.text?.val} onPress={() => navigation.goBack()} />,
    center: <Text fontSize="$4" fontWeight="700" color="$text">Nueva solicitud</Text>,
  })

  const [modelos, setModelos] = useState<IModeloMaquina[]>([])
  const [motivos, setMotivos] = useState<IMotivoSolicitud[]>([])
  const [modelo, setModelo] = useState('')
  const [motivoId, setMotivoId] = useState<number | null>(null)
  const [observacion, setObservacion] = useState('')
  const [piezas, setPiezas] = useState<Pieza[]>([{ NumeroParte: '', Descripcion: '', Cantidad: '1' }])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [buscador, setBuscador] = useState(false)
  const [filtro, setFiltro] = useState('')
  const [tickets, setTickets] = useState<ITicket[]>([])
  const [ticket, setTicket] = useState<ITicket | null>(null)
  const [buscadorTicket, setBuscadorTicket] = useState(false)
  const [ticketsDeTodos, setTicketsDeTodos] = useState(false)   // ignorar el filtro por modelo

  // Los catálogos se cargan UNA vez, al montar. Sin el array de dependencias
  // vacío esto corría en cada render y volvía a poner el motivo por defecto,
  // pisando el que el usuario acababa de escoger.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        // Los tickets del propio mecánico: es lo que va a poder amarrar. Si la
        // llamada falla no se traba el formulario — el ticket es opcional.
        const [m, mo, tk] = await Promise.all([
          svc.getModelos(),
          svc.getMotivos(true),
          ticketsService.getTickets({ scope: 'mias' }).catch(() => null),
        ])
        if (!vivo) return
        setModelos(m.Data ?? [])
        setMotivos(mo.Data ?? [])
        setTickets((tk?.Data ?? []).filter(t => ESTADOS_TICKET_ABIERTO.includes((t.EstadoCode ?? '').toUpperCase())))
        // El primero del catálogo es el caso que dispara casi todas las
        // solicitudes (la máquina está parada): se preselecciona. Solo si el
        // usuario todavía no escogió nada.
        setMotivoId(prev => (prev != null ? prev : (mo.Data?.[0]?.Id ?? null)))
      } catch (e: any) {
        if (vivo) showToast('error', 'Error', e?.message || 'No se pudieron cargar los catálogos')
      } finally { if (vivo) setCargando(false) }
    })()
    return () => { vivo = false }
  }, [])

  const filtrados = useMemo(() => {
    const q = filtro.trim().toLowerCase()
    if (!q) return modelos
    return modelos.filter(m =>
      m.Modelo.toLowerCase().includes(q) || (m.Marca ?? '').toLowerCase().includes(q))
  }, [modelos, filtro])

  // Por defecto solo los del modelo escogido: la lista queda corta y casi
  // siempre trae el correcto. "Ver todos los míos" existe para cuando la
  // máquina está mal clasificada en el parque.
  const ticketsVisibles = useMemo(() => {
    if (ticketsDeTodos || !modelo) return tickets
    return tickets.filter(t => (t.Modelo ?? '') === modelo)
  }, [tickets, modelo, ticketsDeTodos])

  const setPieza = (i: number, campo: keyof Pieza, v: string) =>
    setPiezas(ps => ps.map((p, j) => (j === i ? { ...p, [campo]: v } : p)))

  const guardar = useCallback(async () => {
    if (!modelo) { showToast('error', 'Falta el modelo', 'Escoja la máquina para la que es el repuesto'); return }
    if (!motivoId) { showToast('error', 'Falta el motivo', 'Indique por qué lo necesita'); return }

    const limpias = piezas
      .map(p => ({
        NumeroParte: p.NumeroParte.trim(),
        Descripcion: p.Descripcion.trim(),
        Cantidad: Math.max(1, parseInt(p.Cantidad, 10) || 1),
      }))
      .filter(p => p.NumeroParte || p.Descripcion)

    if (!limpias.length) { showToast('error', 'Sin repuestos', 'Agregue al menos un repuesto'); return }
    if (limpias.some(p => !p.NumeroParte || !p.Descripcion)) {
      showToast('error', 'Datos incompletos', 'A cada repuesto le falta el número de parte o el nombre del manual')
      return
    }

    setGuardando(true)
    try {
      const res = await svc.crear({
        Modelo: modelo,
        MotivoSolicitud_Id: motivoId,
        Ticket_Id: ticket?.Id ?? null,
        Observacion: observacion.trim() || null,
        Lineas: limpias,
      })
      if (!res.Success) { showToast('error', 'No se pudo crear', res.ErrorMessage || 'Intente de nuevo'); return }
      showToast('success', res.Data?.Numero ?? 'Solicitud creada', 'Bodega ya la puede ver')
      // Ya quedó guardada: de aquí en adelante nada puede mostrar un error, o
      // el mecánico creería que no se guardó y la volvería a meter.
      try {
        if (navigation.canGoBack()) navigation.goBack()
        else navigation.navigate('solicitudesRepuestos')
      } catch { /* la solicitud está creada; no hay nada que avisar */ }
    } catch (e: any) {
      showToast('error', 'Error', e?.message || 'No se pudo crear la solicitud')
    } finally { setGuardando(false) }
  }, [modelo, motivoId, observacion, piezas, navigation, showToast])

  if (cargando) {
    return <YStack flex={1} alignItems="center" justifyContent="center"><Spinner size="large" color={ACCENT} /></YStack>
  }

  return (
    <YStack flex={1} backgroundColor="$background">
      <KeyboardAwareForm>
        <YStack padding="$4" gap="$4">
          {/* Modelo: 66 opciones. Un dropdown nativo obliga a hilar la lista con
              el dedo; un buscador de pantalla completa la resuelve en dos toques. */}
          <YStack gap="$1.5">
            <Text fontSize="$2" fontWeight="700" color="$textMuted">MODELO DE LA MÁQUINA</Text>
            <View
              onPress={() => { setFiltro(''); setBuscador(true) }}
              pressStyle={{ opacity: 0.85 }}
              backgroundColor="$backgroundElevated" borderWidth={1} borderColor="$border"
              borderRadius="$4" paddingHorizontal="$3.5" paddingVertical="$3"
            >
              <XStack alignItems="center" justifyContent="space-between">
                <Text fontSize="$3" color={modelo ? '$text' : '$textMuted'}>
                  {modelo || 'Toque para escoger'}
                </Text>
                <ChevronDown size={18} color={theme.textMuted?.val} />
              </XStack>
            </View>
            <Text fontSize="$1" color="$textMuted">El modelo que dice el manual donde buscó la pieza</Text>
          </YStack>

          {/* Ticket: OPCIONAL. Amarrarlo es lo que después permite saber cuánto
              paro costó esperar el repuesto; no amarrarlo no traba nada. */}
          <YStack gap="$1.5">
            <Text fontSize="$2" fontWeight="700" color="$textMuted">TICKET (OPCIONAL)</Text>
            <View
              onPress={() => { setTicketsDeTodos(false); setBuscadorTicket(true) }}
              pressStyle={{ opacity: 0.85 }}
              backgroundColor="$backgroundElevated" borderWidth={1} borderColor="$border"
              borderRadius="$4" paddingHorizontal="$3.5" paddingVertical="$3"
            >
              <XStack alignItems="center" justifyContent="space-between">
                <YStack flex={1}>
                  <Text fontSize="$3" color={ticket ? '$text' : '$textMuted'}>
                    {ticket ? ticket.CodigoTicket : 'Sin ticket'}
                  </Text>
                  {!!ticket && (
                    <Text fontSize="$2" color="$textMuted">
                      {ticket.Modelo}{ticket.NumeroMaquina ? ` · ${ticket.NumeroMaquina}` : ''} · {ticket.Estado}
                    </Text>
                  )}
                </YStack>
                {!!ticket && (
                  <View onPress={() => setTicket(null)} pressStyle={{ opacity: 0.6 }} hitSlop={10} padding="$1">
                    <X size={16} color={theme.textMuted?.val} />
                  </View>
                )}
                <ChevronDown size={18} color={theme.textMuted?.val} />
              </XStack>
            </View>
            <Text fontSize="$1" color="$textMuted">
              Si la máquina está parada por un ticket suyo, amárrelo acá
            </Text>
          </YStack>

          <YStack gap="$1.5">
            <Text fontSize="$2" fontWeight="700" color="$textMuted">¿POR QUÉ LO NECESITA?</Text>
            {motivos.map(m => {
              const sel = m.Id === motivoId
              return (
                <View
                  key={m.Id}
                  onPress={() => setMotivoId(m.Id)}
                  pressStyle={{ opacity: 0.85 }}
                  backgroundColor={sel ? 'rgba(255,85,26,0.08)' : '$backgroundElevated'}
                  borderWidth={1} borderColor={sel ? ACCENT : '$border'}
                  borderRadius="$4" paddingHorizontal="$3.5" paddingVertical="$3"
                >
                  <XStack alignItems="center" gap="$2.5">
                    <View
                      width={18} height={18} borderRadius={9} borderWidth={2}
                      borderColor={sel ? ACCENT : theme.border?.val}
                      alignItems="center" justifyContent="center"
                    >
                      {sel && <View width={9} height={9} borderRadius={5} backgroundColor={ACCENT} />}
                    </View>
                    <Text flex={1} fontSize="$3" color="$text">{m.Name}</Text>
                  </XStack>
                </View>
              )
            })}
          </YStack>

          <YStack gap="$1.5">
            <Text fontSize="$2" fontWeight="700" color="$textMuted">OBSERVACIONES (OPCIONAL)</Text>
            <TextArea
              value={observacion}
              onChangeText={setObservacion}
              placeholder="Lo que el motivo de arriba no alcanza a decir"
              placeholderTextColor={theme.textMuted?.val}
              color="$text"
              onFocus={subirCampo}
              minHeight={80}
              maxLength={500}
              backgroundColor="$backgroundElevated"
            />
          </YStack>

          <YStack gap="$2">
            <XStack alignItems="center" justifyContent="space-between">
              <Text fontSize="$2" fontWeight="700" color="$textMuted">REPUESTOS QUE NECESITA</Text>
              <View
                onPress={() => setPiezas(ps => [...ps, { NumeroParte: '', Descripcion: '', Cantidad: '1' }])}
                pressStyle={{ opacity: 0.8 }}
                backgroundColor="rgba(255,85,26,0.10)" borderRadius="$10"
                paddingHorizontal="$2.5" paddingVertical="$1.5"
              >
                <XStack alignItems="center" gap="$1">
                  <Plus size={14} color={ACCENT} />
                  <Text fontSize={12} fontWeight="700" color={ACCENT}>Otro</Text>
                </XStack>
              </View>
            </XStack>

            {piezas.map((p, i) => (
              <YStack
                key={i}
                backgroundColor="$backgroundElevated" borderWidth={1} borderColor="$border"
                borderRadius="$4" padding="$3" gap="$2.5" {...shadows.xs}
              >
                <XStack alignItems="center" justifyContent="space-between">
                  <Text fontSize="$2" fontWeight="700" color="$textMuted">Repuesto {i + 1}</Text>
                  {piezas.length > 1 && (
                    <View onPress={() => setPiezas(ps => ps.filter((_, j) => j !== i))} pressStyle={{ opacity: 0.7 }}>
                      <Trash2 size={16} color="#dc2626" />
                    </View>
                  )}
                </XStack>
                <Input
                  value={p.NumeroParte}
                  onChangeText={v => setPieza(i, 'NumeroParte', v)}
                  placeholder="Número de parte (S51234-0-01)"
                  placeholderTextColor={theme.textMuted?.val}
                  color="$text"
                  onFocus={subirCampo}
                  autoCapitalize="characters"
                  backgroundColor="$background"
                />
                <Input
                  value={p.Descripcion}
                  onChangeText={v => setPieza(i, 'Descripcion', v)}
                  placeholder="Nombre según el manual (KNIFE SLIDE)"
                  placeholderTextColor={theme.textMuted?.val}
                  color="$text"
                  onFocus={subirCampo}
                  autoCapitalize="characters"
                  backgroundColor="$background"
                />
                <XStack alignItems="center" gap="$2">
                  <Text fontSize="$3" color="$textMuted">Cantidad</Text>
                  <Input
                    value={p.Cantidad}
                    onChangeText={v => setPieza(i, 'Cantidad', v.replace(/[^0-9]/g, ''))}
                    onFocus={subirCampo}
                    // number-pad = solo dígitos, sin la fila de símbolos ni el
                    // punto decimal: las piezas se piden por unidades enteras.
                    keyboardType="number-pad"
                    inputMode="numeric"
                    color="$text"
                    fontWeight="700"
                    width={80}
                    textAlign="center"
                    backgroundColor="$background"
                  />
                </XStack>
              </YStack>
            ))}
          </YStack>

          <Button
            backgroundColor={ACCENT}
            color="#fff"
            fontWeight="700"
            disabled={guardando}
            opacity={guardando ? 0.7 : 1}
            onPress={guardar}
            icon={guardando ? undefined : <Check size={18} color="#fff" />}
          >
            {guardando ? 'Guardando…' : 'Crear solicitud'}
          </Button>
        </YStack>
      </KeyboardAwareForm>

      {/* Escoger ticket. Arranca filtrado por el modelo elegido; si la máquina
          está mal clasificada en el parque, "Ver todos los míos" lo destraba. */}
      <Modal visible={buscadorTicket} animationType="slide" onRequestClose={() => setBuscadorTicket(false)}>
        <YStack flex={1} backgroundColor="$background" paddingTop={insets.top + 12}>
          <XStack alignItems="center" justifyContent="space-between" paddingHorizontal="$4" paddingBottom="$3">
            <Text fontSize="$4" fontWeight="800" color="$text">Mis tickets abiertos</Text>
            <View onPress={() => setBuscadorTicket(false)} pressStyle={{ opacity: 0.7 }} padding="$2">
              <X size={22} color={theme.text?.val} />
            </View>
          </XStack>

          {!!modelo && (
            <XStack paddingHorizontal="$4" paddingBottom="$2">
              <View
                onPress={() => setTicketsDeTodos(v => !v)}
                pressStyle={{ opacity: 0.8 }}
                backgroundColor={ticketsDeTodos ? 'rgba(255,85,26,0.10)' : '$backgroundElevated'}
                borderWidth={1} borderColor={ticketsDeTodos ? ACCENT : '$border'}
                borderRadius="$10" paddingHorizontal="$3" paddingVertical="$1.5"
              >
                <Text fontSize={12} fontWeight="700" color={ticketsDeTodos ? ACCENT : '$textMuted'}>
                  {ticketsDeTodos ? `Viendo todos los míos` : `Solo ${modelo}`}
                </Text>
              </View>
            </XStack>
          )}

          <FlatList
            data={ticketsVisibles}
            keyExtractor={t => String(t.Id)}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
            renderItem={({ item }) => (
              <View
                onPress={() => { setTicket(item); setBuscadorTicket(false) }}
                pressStyle={{ opacity: 0.8 }}
                paddingVertical="$3" borderBottomWidth={1} borderBottomColor="$border"
              >
                <XStack alignItems="center" gap="$2">
                  <Wrench size={15} color={ACCENT} />
                  <Text fontSize="$3" fontWeight="700" color="$text">{item.CodigoTicket}</Text>
                  <Text fontSize="$2" color="$textMuted">{item.Estado}</Text>
                </XStack>
                <Text fontSize="$2" color="$textMuted" marginTop="$1">
                  {item.Modelo || 'sin modelo'}{item.NumeroMaquina ? ` · ${item.NumeroMaquina}` : ''}
                </Text>
              </View>
            )}
            ListEmptyComponent={
              <Text color="$textMuted" paddingTop="$6" textAlign="center" paddingHorizontal="$6">
                {tickets.length === 0
                  ? 'No tiene tickets abiertos. Puede crear la solicitud sin ticket.'
                  : `No tiene tickets abiertos de ${modelo}. Toque «Solo ${modelo}» para ver todos los suyos.`}
              </Text>
            }
          />
        </YStack>
      </Modal>

      {/* Buscador de modelo a pantalla completa */}
      <Modal visible={buscador} animationType="slide" onRequestClose={() => setBuscador(false)}>
        <YStack flex={1} backgroundColor="$background" paddingTop={insets.top + 12}>
          <XStack alignItems="center" gap="$2" paddingHorizontal="$4" paddingBottom="$3">
            <XStack
              flex={1} alignItems="center" gap="$2"
              backgroundColor="$backgroundElevated" borderWidth={1} borderColor="$border"
              borderRadius="$4" paddingHorizontal="$3"
            >
              <Search size={16} color={theme.textMuted?.val} />
              <RNTextInput
                value={filtro}
                onChangeText={setFiltro}
                placeholder="Buscar modelo o marca"
                placeholderTextColor={theme.textMuted?.val}
                autoFocus
                style={{ flex: 1, paddingVertical: 12, color: theme.text?.val as string }}
              />
            </XStack>
            <View onPress={() => setBuscador(false)} pressStyle={{ opacity: 0.7 }} padding="$2">
              <X size={22} color={theme.text?.val} />
            </View>
          </XStack>

          <FlatList
            data={filtrados}
            keyExtractor={m => m.Modelo}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
            renderItem={({ item }) => (
              <View
                onPress={() => {
                  // Si el ticket amarrado era de otro modelo, se suelta: dejarlo
                  // pegado sería amarrar la pieza a la máquina equivocada.
                  if (ticket && (ticket.Modelo ?? '') !== item.Modelo) setTicket(null)
                  setModelo(item.Modelo)
                  setBuscador(false)
                }}
                pressStyle={{ opacity: 0.8 }}
                paddingVertical="$3" borderBottomWidth={1} borderBottomColor="$border"
              >
                <Text fontSize="$3" color="$text">{item.Modelo}</Text>
                <Text fontSize="$2" color="$textMuted">
                  {item.Maquinas} máquina{item.Maquinas === 1 ? '' : 's'} en planta
                </Text>
              </View>
            )}
            ListEmptyComponent={
              <Text color="$textMuted" paddingTop="$6" textAlign="center">
                Ese modelo no está en el parque de máquinas
              </Text>
            }
          />
        </YStack>
      </Modal>
    </YStack>
  )
}
