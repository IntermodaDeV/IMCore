import React, { useCallback, useEffect, useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, ScrollView } from 'react-native'
import { Button, Input, Spinner, Text, View, XStack, YStack, useTheme } from 'tamagui'
import { ArrowLeft, ArrowRight, Check, History, Pencil, Trash2, TriangleAlert, X } from 'lucide-react-native'
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import KeyboardAwareForm, { useSubirCampo } from '../../components/commons/KeyboardAwareForm'
import { usePageHeader } from '../../hooks/usePageHeader'
import { useShowToast } from '../../utils/useShowToast'
import { solicitudesRepuestosService as svc } from '../../api/modules/solicitudesRepuestos/solicitudes.service'
import {
  EstadoSolicitud, ISolicitud, ISolicitudHistorial, ISolicitudLinea,
} from '../../api/modules/solicitudesRepuestos/solicitudes.types'
import { shadows } from '../../theme/shadows'
import { ACCENT, AYUDA, BarraAvance, ETIQUETA, EstadoChip, PASOS, fmtFecha, fmtFechaHora, pasoDe } from './components'

const siguiente = (e: EstadoSolicitud): EstadoSolicitud | null => {
  const i = PASOS.indexOf(e)
  return i < 0 || i >= PASOS.length - 1 ? null : PASOS[i + 1]
}
const exigeRef = (e: EstadoSolicitud) => e === 'EN_SOLICITUD_COMPRA' || e === 'EN_ORDEN_COMPRA'

// El detalle de una solicitud. Para el mecánico es de consulta: en qué va cada
// pieza y por dónde pasó. Para quien gestiona (Óscar con la PDA) se abren los
// controles de codificar y avanzar — los mismos que el web, contra los mismos
// SPs, que son los que deciden si se puede.
export default function SolicitudDetailScreen() {
  const theme = useTheme()
  const route = useRoute<any>()
  const navigation = useNavigation<any>()
  const insets = useSafeAreaInsets()
  const subirCampo = useSubirCampo()
  const { showToast } = useShowToast()
  const id: number = route.params?.id

  // Sin este `left` el encabezado se queda con el botón del menú y no hay forma
  // de volver al listado: es una pantalla HIJA y la flecha la pone cada pantalla.
  usePageHeader({
    left: <ArrowLeft color={theme.text?.val} onPress={() => navigation.goBack()} />,
    center: <Text fontSize="$4" fontWeight="700" color="$text">{route.params?.numero ?? 'Solicitud'}</Text>,
  })

  const [sol, setSol] = useState<ISolicitud | null>(null)
  const [lineas, setLineas] = useState<ISolicitudLinea[]>([])
  const [gestiona, setGestiona] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [codigos, setCodigos] = useState<Record<number, string>>({})
  const [ocupado, setOcupado] = useState(false)
  const [historial, setHistorial] = useState<ISolicitudHistorial[] | null>(null)
  const [avanzar, setAvanzar] = useState<{ linea: ISolicitudLinea; estado: EstadoSolicitud } | null>(null)
  const [quitarUltimo, setQuitarUltimo] = useState<ISolicitudLinea | null>(null)
  // Edición de un repuesto. El servidor ya dijo en PuedeTocar si se permite;
  // acá solo se recogen los valores nuevos.
  const [editando, setEditando] = useState<ISolicitudLinea | null>(null)
  const [edParte, setEdParte] = useState('')
  const [edNombre, setEdNombre] = useState('')
  const [edCant, setEdCant] = useState('1')
  const [referencia, setReferencia] = useState('')

  const cargar = useCallback(async () => {
    try {
      const [c, l] = await Promise.all([svc.getSolicitud(id), svc.getLineas(id)])
      if (!c.Success) { showToast('error', 'No se pudo cargar', c.ErrorMessage || ''); return }
      setSol(c.Data ?? null)
      setLineas(l.Data ?? [])
      setGestiona(!!c.Data?.PuedeGestionar)
    } catch (e: any) {
      showToast('error', 'Error', e?.message || 'No se pudo cargar la solicitud')
    } finally { setCargando(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  // `recargar = false` para las operaciones que DEJAN DE EXISTIR la solicitud
  // (anularla, o quitarle el último repuesto cerrando el número). Recargar
  // después de eso trae "Solicitud no encontrada" y le muestra un error al
  // usuario por algo que sí funcionó.
  const correr = async (fn: () => Promise<any>, exito?: string, recargar = true) => {
    setOcupado(true)
    try {
      const res = await fn()
      if (!res.Success) { showToast('error', 'No se pudo', res.ErrorMessage || 'Intente de nuevo'); return false }
      // La advertencia de código repetido es AVISO, no error: dos mecánicos
      // pueden pedir la misma pieza nueva y darles el mismo código es legítimo.
      if (res.Data?.Advertencia) showToast('info', 'Ojo', res.Data.Advertencia)
      else showToast('success', exito ?? 'Listo', res.SuccessMessage || '')
      if (recargar) await cargar()
      return true
    } catch (e: any) {
      showToast('error', 'Error', e?.message || 'No se pudo completar')
      return false
    } finally { setOcupado(false) }
  }

  if (cargando) {
    return <YStack flex={1} alignItems="center" justifyContent="center"><Spinner size="large" color={ACCENT} /></YStack>
  }
  if (!sol) {
    return <YStack flex={1} alignItems="center" justifyContent="center" padding="$6">
      <Text color="$textMuted" textAlign="center">No se encontró la solicitud.</Text>
    </YStack>
  }

  return (
    <YStack flex={1} backgroundColor="$background">
      <KeyboardAwareForm contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <YStack
          backgroundColor="$backgroundElevated" borderRadius="$4" borderWidth={1} borderColor="$border"
          padding="$3.5" gap="$2" marginBottom="$3" {...shadows.sm}
        >
          <XStack alignItems="center" justifyContent="space-between" flexWrap="wrap" gap="$2">
            <Text fontSize="$4" fontWeight="800" color="$text">{sol.Modelo}</Text>
            <EstadoChip estado={sol.Estado} />
          </XStack>
          <BarraAvance estado={sol.Estado} />
          <Text fontSize="$2" color="$textMuted">
            {sol.SolicitanteNombre || sol.Solicitante} · {fmtFecha(sol.Fecha)}
            {sol.TicketCodigo ? ` · ${sol.TicketCodigo}` : ''}
          </Text>
          <Text fontSize="$3" color="$text" marginTop="$1">{sol.Motivo}</Text>
          {!!sol.Observacion && <Text fontSize="$2" color="$textMuted" fontStyle="italic">{sol.Observacion}</Text>}

          {sol.SinBarcode > 0 && (
            <XStack
              backgroundColor="rgba(234,88,12,0.10)" borderRadius="$3" padding="$2.5"
              gap="$2" alignItems="flex-start" marginTop="$1"
            >
              <TriangleAlert size={16} color="#ea580c" />
              <Text flex={1} fontSize="$2" color="#9a3412">
                {sol.SinBarcode} artículo(s) existen en AX pero sin código de barras.
                El despacho va a fallar diciendo que no hay inventario, aunque sí haya.
              </Text>
            </XStack>
          )}
        </YStack>

        {lineas.map(l => {
          const sig = siguiente(l.Estado)
          return (
            <YStack
              key={l.Id}
              backgroundColor="$backgroundElevated" borderRadius="$4" borderWidth={1}
              borderColor={l.Estado === 'INGRESADO' ? 'rgba(34,197,94,0.45)' : '$border'}
              padding="$3.5" gap="$2" marginBottom="$3" {...shadows.xs}
            >
              <XStack alignItems="flex-start" justifyContent="space-between" gap="$2">
                <YStack flex={1}>
                  <Text fontSize="$3" fontWeight="700" color="$text">{l.Descripcion}</Text>
                  <Text fontSize="$2" color="$textMuted">{l.NumeroParte}</Text>
                </YStack>
                <Text fontSize="$3" fontWeight="700" color="$textMuted">x{l.Cantidad}</Text>
              </XStack>

              {l.CodigoAX ? (
                <XStack alignItems="center" gap="$2">
                  <Text fontSize="$3" fontWeight="800" color="$text">{l.CodigoAX}</Text>
                  {l.BarcodeOk === false && <TriangleAlert size={14} color="#ea580c" />}
                </XStack>
              ) : gestiona && l.Estado === 'SOLICITADO' ? (
                <XStack gap="$2" alignItems="center">
                  <Input
                    flex={1}
                    value={codigos[l.Id] ?? ''}
                    onChangeText={v => setCodigos(c => ({ ...c, [l.Id]: v }))}
                    placeholder="3202-205"
                    placeholderTextColor={theme.textMuted?.val}
                    color="$text"
                    onFocus={subirCampo}
                    keyboardType="numbers-and-punctuation"
                    autoCapitalize="none"
                    backgroundColor="$background"
                    size="$3"
                  />
                  <Button
                    size="$3" backgroundColor={ACCENT} color="#fff" disabled={ocupado}
                    icon={<Check size={16} color="#fff" />}
                    onPress={() => correr(() => svc.codificar(l.Id, codigos[l.Id] ?? ''), 'Código asignado')}
                  >
                    Codificar
                  </Button>
                </XStack>
              ) : (
                <Text fontSize="$2" color="$textMuted">Sin código todavía</Text>
              )}

              <XStack alignItems="center" gap="$2" flexWrap="wrap">
                <EstadoChip estado={l.Estado} />
                <Text fontSize="$1" color="$textMuted" flex={1}>{AYUDA[l.Estado]}</Text>
              </XStack>
              <BarraAvance estado={l.Estado} />

              {(l.PurchReqId || l.PurchId || l.FechaIngreso) && (
                <YStack gap="$0.5" marginTop="$1">
                  {!!l.PurchReqId && <Text fontSize="$1" color="$textMuted">Solicitud de compra {l.PurchReqId}</Text>}
                  {!!l.PurchId && <Text fontSize="$1" color="$textMuted">Orden de compra {l.PurchId}</Text>}
                  {!!l.FechaIngreso && <Text fontSize="$1" color="#16a34a">Ingresó a bodega el {fmtFecha(l.FechaIngreso)}</Text>}
                </YStack>
              )}

              <XStack gap="$2" marginTop="$1.5">
                <View
                  onPress={async () => {
                    const h = await svc.getHistorial(l.Id)
                    setHistorial(h.Data ?? [])
                  }}
                  pressStyle={{ opacity: 0.7 }}
                  backgroundColor="$background" borderWidth={1} borderColor="$border"
                  borderRadius="$10" paddingHorizontal="$2.5" paddingVertical="$1.5"
                >
                  <XStack alignItems="center" gap="$1">
                    <History size={13} color={theme.textMuted?.val} />
                    <Text fontSize={12} color="$textMuted">Recorrido</Text>
                  </XStack>
                </View>

                {/* Quitar: lo habilita el SERVIDOR (PuedeTocar), con la misma
                    regla que valida la escritura. Si es el último, se pregunta
                    qué hacer con el número de solicitud. */}
                {!!l.PuedeTocar && (
                  <View
                    onPress={() => {
                      setEditando(l); setEdParte(l.NumeroParte)
                      setEdNombre(l.Descripcion); setEdCant(String(l.Cantidad ?? 1))
                    }}
                    pressStyle={{ opacity: 0.8 }}
                    backgroundColor="$background" borderWidth={1} borderColor="$border"
                    borderRadius="$10" paddingHorizontal="$2.5" paddingVertical="$1.5"
                  >
                    <XStack alignItems="center" gap="$1">
                      <Pencil size={13} color={theme.textMuted?.val} />
                      <Text fontSize={12} color="$textMuted">Editar</Text>
                    </XStack>
                  </View>
                )}

                {!!l.PuedeTocar && (
                  <View
                    onPress={() => {
                      if (lineas.length === 1) setQuitarUltimo(l)
                      else correr(() => svc.eliminarLinea(l.Id), 'Repuesto quitado')
                    }}
                    pressStyle={{ opacity: 0.8 }}
                    backgroundColor="rgba(220,38,38,0.10)" borderRadius="$10"
                    paddingHorizontal="$2.5" paddingVertical="$1.5"
                  >
                    <XStack alignItems="center" gap="$1">
                      <Trash2 size={13} color="#dc2626" />
                      <Text fontSize={12} fontWeight="700" color="#dc2626">Quitar</Text>
                    </XStack>
                  </View>
                )}

                {gestiona && sig && l.Estado !== 'SOLICITADO' && (
                  <View
                    onPress={() => {
                      setReferencia('')
                      if (exigeRef(sig)) setAvanzar({ linea: l, estado: sig })
                      else correr(() => svc.cambiarEstado(l.Id, { Estado: sig }))
                    }}
                    pressStyle={{ opacity: 0.8 }}
                    backgroundColor="rgba(29,78,216,0.10)" borderRadius="$10"
                    paddingHorizontal="$2.5" paddingVertical="$1.5"
                  >
                    <XStack alignItems="center" gap="$1">
                      <ArrowRight size={13} color="#1d4ed8" />
                      <Text fontSize={12} fontWeight="700" color="#1d4ed8">{ETIQUETA[sig]}</Text>
                    </XStack>
                  </View>
                )}
              </XStack>
            </YStack>
          )
        })}

        {!!sol.MotivoBloqueo && (
          <Text fontSize="$2" color="$textMuted" textAlign="center" marginTop="$2">{sol.MotivoBloqueo}</Text>
        )}
        {!!sol.PuedeAnular && (
          <Button
            marginTop="$2" backgroundColor="transparent" borderWidth={1} borderColor="#dc2626" color="#dc2626"
            disabled={ocupado}
            onPress={async () => {
              if (await correr(() => svc.anular(sol.Id), 'Solicitud anulada', false)) navigation.goBack()
            }}
          >
            Anular solicitud
          </Button>
        )}
      </KeyboardAwareForm>

      {/* Pedir el número de AX: un estado que dice "ya está en una orden de
          compra" sin decir cuál no se puede verificar después. */}
      <Modal visible={!!avanzar} transparent animationType="fade" onRequestClose={() => setAvanzar(null)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <YStack flex={1} backgroundColor="rgba(0,0,0,0.45)" alignItems="center" justifyContent="center" padding="$5">
          {avanzar && (
            <YStack backgroundColor="$backgroundElevated" borderRadius="$5" padding="$4" gap="$3" width="100%">
              <Text fontSize="$4" fontWeight="800" color="$text">{ETIQUETA[avanzar.estado]}</Text>
              <Text fontSize="$2" color="$textMuted">{avanzar.linea.Descripcion} · {avanzar.linea.CodigoAX}</Text>
              <Input
                value={referencia}
                onChangeText={setReferencia}
                placeholder={avanzar.estado === 'EN_SOLICITUD_COMPRA' ? 'N.º de solicitud de compra' : 'N.º de orden de compra'}
                placeholderTextColor={theme.textMuted?.val}
                color="$text"
                autoFocus
                backgroundColor="$background"
              />
              <XStack gap="$2" justifyContent="flex-end">
                <Button chromeless onPress={() => setAvanzar(null)}>Cancelar</Button>
                <Button
                  backgroundColor={ACCENT} color="#fff" disabled={!referencia.trim() || ocupado}
                  opacity={!referencia.trim() ? 0.5 : 1}
                  onPress={async () => {
                    const ok = await correr(() =>
                      svc.cambiarEstado(avanzar.linea.Id, { Estado: avanzar.estado, Referencia: referencia.trim() }))
                    if (ok) setAvanzar(null)
                  }}
                >
                  Confirmar
                </Button>
              </XStack>
            </YStack>
          )}
        </YStack>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!editando} transparent animationType="fade" onRequestClose={() => setEditando(null)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <YStack flex={1} backgroundColor="rgba(0,0,0,0.45)" alignItems="center" justifyContent="center" padding="$5">
            {editando && (
              <YStack backgroundColor="$backgroundElevated" borderRadius="$5" padding="$4" gap="$3" width="100%">
                <Text fontSize="$4" fontWeight="800" color="$text">Editar repuesto</Text>
                <Input
                  value={edParte} onChangeText={setEdParte}
                  placeholder="Número de parte" placeholderTextColor={theme.textMuted?.val}
                  color="$text" autoCapitalize="characters" backgroundColor="$background"
                />
                <Input
                  value={edNombre} onChangeText={setEdNombre}
                  placeholder="Nombre según el manual" placeholderTextColor={theme.textMuted?.val}
                  color="$text" autoCapitalize="characters" backgroundColor="$background"
                />
                <XStack alignItems="center" gap="$2">
                  <Text fontSize="$3" color="$textMuted">Cantidad</Text>
                  <Input
                    value={edCant}
                    onChangeText={v => setEdCant(v.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad" inputMode="numeric"
                    color="$text" fontWeight="700" width={80} textAlign="center"
                    backgroundColor="$background"
                  />
                </XStack>
                <XStack gap="$2" justifyContent="flex-end">
                  <Button chromeless onPress={() => setEditando(null)}>Cancelar</Button>
                  <Button
                    backgroundColor={ACCENT} color="#fff" disabled={ocupado}
                    onPress={async () => {
                      const ok = await correr(() => svc.editarLinea(editando.Id, {
                        NumeroParte: edParte.trim(),
                        Descripcion: edNombre.trim(),
                        Cantidad: Math.max(1, parseInt(edCant, 10) || 1),
                      }), 'Repuesto actualizado')
                      if (ok) setEditando(null)
                    }}
                  >
                    Guardar
                  </Button>
                </XStack>
              </YStack>
            )}
          </YStack>
        </KeyboardAvoidingView>
      </Modal>

      {/* Era el último: la solicitud queda vacía. Se pregunta en vez de decidir,
          porque muchas veces lo que se quiere es cambiar la pieza, no perder el
          número (ni volver a capturar máquina, motivo y observación). */}
      <Modal visible={!!quitarUltimo} transparent animationType="fade" onRequestClose={() => setQuitarUltimo(null)}>
        <YStack flex={1} backgroundColor="rgba(0,0,0,0.45)" alignItems="center" justifyContent="center" padding="$5">
          {quitarUltimo && (
            <YStack backgroundColor="$backgroundElevated" borderRadius="$5" padding="$4" gap="$3" width="100%">
              <Text fontSize="$4" fontWeight="800" color="$text">Es el último repuesto</Text>
              <Text fontSize="$3" color="$textMuted">
                Al quitar {quitarUltimo.Descripcion} la solicitud {sol.Numero} queda sin repuestos.
                ¿Qué hacemos con el número?
              </Text>
              <YStack gap="$2">
                <Button
                  backgroundColor="$background" borderWidth={1} borderColor="$border" color="$text"
                  disabled={ocupado}
                  onPress={async () => {
                    if (await correr(() => svc.eliminarLinea(quitarUltimo.Id, false), 'Repuesto quitado'))
                      setQuitarUltimo(null)
                  }}
                >
                  Dejarla abierta para otro repuesto
                </Button>
                <Button
                  backgroundColor="#dc2626" color="#fff" fontWeight="700" disabled={ocupado}
                  onPress={async () => {
                    if (await correr(() => svc.eliminarLinea(quitarUltimo.Id, true), 'Solicitud anulada', false)) {
                      setQuitarUltimo(null); navigation.goBack()
                    }
                  }}
                >
                  Anular la solicitud
                </Button>
                <Button chromeless onPress={() => setQuitarUltimo(null)}>Cancelar</Button>
              </YStack>
            </YStack>
          )}
        </YStack>
      </Modal>

      <Modal visible={historial != null} animationType="slide" onRequestClose={() => setHistorial(null)}>
        <YStack flex={1} backgroundColor="$background" paddingTop={insets.top + 12}>
          <XStack alignItems="center" justifyContent="space-between" paddingHorizontal="$4" paddingBottom="$3">
            <Text fontSize="$4" fontWeight="800" color="$text">Recorrido del repuesto</Text>
            <View onPress={() => setHistorial(null)} pressStyle={{ opacity: 0.7 }} padding="$2">
              <X size={22} color={theme.text?.val} />
            </View>
          </XStack>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {(historial ?? []).map(h => (
              <XStack key={h.Id} gap="$3" marginBottom="$3">
                <YStack alignItems="center">
                  <View width={10} height={10} borderRadius={5} backgroundColor={ACCENT} marginTop={5} />
                  <View flex={1} width={2} backgroundColor="$border" marginTop={2} />
                </YStack>
                <YStack flex={1} paddingBottom="$2">
                  <Text fontSize="$3" fontWeight="700" color="$text">
                    {ETIQUETA[h.EstadoNuevo as EstadoSolicitud] ?? h.EstadoNuevo}
                  </Text>
                  <Text fontSize="$2" color="$textMuted">
                    {fmtFechaHora(h.Fecha)} · {h.Usuario || h.User_Code}
                    {h.Origen !== 'MANUAL' ? (h.Origen === 'AX' ? ' · detectado en AX' : ' · por correo') : ''}
                  </Text>
                  {!!h.Referencia && <Text fontSize="$2" color="$text">Ref. {h.Referencia}</Text>}
                  {!!h.Comentario && <Text fontSize="$2" color="$textMuted" fontStyle="italic">{h.Comentario}</Text>}
                </YStack>
              </XStack>
            ))}
          </ScrollView>
        </YStack>
      </Modal>
    </YStack>
  )
}
