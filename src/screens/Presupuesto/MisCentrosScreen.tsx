import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, AppState, FlatList, RefreshControl, useWindowDimensions } from 'react-native'
import { Spinner, Text, View, XStack, YStack, useTheme } from 'tamagui'
import { Check, ChevronRight, ClipboardCheck, Lock, Share2 } from 'lucide-react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { NotificationBell } from '../../components/notifications/NotificationBell'
import { usePageHeader } from '../../hooks/usePageHeader'
import { useShowToast } from '../../utils/useShowToast'
import { shadows } from '../../theme/shadows'
import { exigir, mensajeDeError, presupuestoService as api } from '../../api/modules/presupuesto/presupuesto.service'
import { IMiCentro, IUsuarioDelegado } from '../../api/modules/presupuesto/presupuesto.types'
import {
  ACCENT, Barra, Chip, ERR, EstadoChip, GRIS, OK, Observaciones, PlazoChip, WARN, centroOculto as oculto, esConfirmable, esDelegable,
  fmtFechaHora, lps, plazoRestante, totalObservaciones,
} from './comun'
import { Boton, Campo, Hoja } from './CentroScreen'

const INDIGO = '#4f46e5'
import ResumenMios from './ResumenMios'

// Presupuesto › Mis centros de costo (el revisor). Lo mismo que «Mis centros» del web, pensado para resolver
// rápido desde el teléfono: los centros sin observaciones se confirman todos de una vez y solo se abren los que
// tienen algo que mirar. Lo asignado y todavía sin habilitar se ve, pero no se edita.
// Se llega por el menú o tocando el aviso de habilitación / recordatorio (presupuesto_revision).

type Vista = 'pendientes' | 'observaciones' | 'todos'

export default function MisCentrosScreen() {
  const theme = useTheme()
  const navigation = useNavigation<any>()
  const insets = useSafeAreaInsets()
  const { showToast } = useShowToast()
  const { height, width } = useWindowDimensions()
  const compacto = height < 720 || width < 370

  usePageHeader({
    center: <Text fontSize="$4" fontWeight="700" color="$text">Mis centros de costo</Text>,
    right: <NotificationBell size={20} />,
  })

  const [centros, setCentros] = useState<IMiCentro[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refrescando, setRefrescando] = useState(false)
  const [vistaElegida, setVista] = useState<Vista | null>(null)
  const [verVacios, setVerVacios] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  // La lista de trabajo o el resumen de todos sus centros (por centro o por cuenta, con sus semanas).
  const [panel, setPanel] = useState<'centros' | 'resumen'>('centros')
  const [delegando, setDelegando] = useState(false)

  const cargar = useCallback(async () => {
    try {
      setCentros((await exigir(api.misCentros())).Data ?? [])
      setError(null)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setRefrescando(false)
    }
  }, [])

  // Los conteos cambian desde otros lados (Planificación, el web): al día cada minuto mientras está a la vista y al
  // volver la app al frente.
  useFocusEffect(useCallback(() => {
    void cargar()
    const t = setInterval(() => { void cargar() }, 60_000)
    const sub = AppState.addEventListener('change', e => { if (e === 'active') void cargar() })
    return () => { clearInterval(t); sub.remove() }
  }, [cargar]))

  // Los centros sin personas ni vacantes no tienen nada que revisar en sueldos: ocultos salvo que los pida. Si
  // Planificación habilitó uno (para agregar vacantes), sí se muestra: es trabajo pendiente (igual que el web).
  const todos = useMemo(() => centros ?? [], [centros])
  const vacios = todos.filter(oculto).length
  const base = useMemo(() => todos.filter(c => verVacios || !oculto(c)), [todos, verVacios])
  const pendientes = base.filter(c => c.Estado === 'Habilitado' || c.Estado === 'Vencido')
  const conObservaciones = pendientes.filter(c => totalObservaciones(c) > 0)
  const listos = base.filter(c => esConfirmable(c) && totalObservaciones(c) === 0)
  const sinHabilitar = base.filter(c => c.Estado === 'Sin habilitar').length
  const porVencer = base.filter(c => c.Estado === 'Habilitado' && plazoRestante(c.FechaLimite, c.DiasAviso)?.cerca)
  const primerLimite = porVencer.map(c => c.FechaLimite ?? '').sort()[0]
  const variasCorridas = new Set(todos.map(c => c.CorridaId)).size > 1
  // Delegar: el gerente pasa algunos de sus centros habilitados a otra persona (de la corrida más reciente).
  const delegables = todos.filter(c => esDelegable(c) && c.CorridaId === todos[0]?.CorridaId)

  const vista: Vista = vistaElegida ?? (pendientes.length > 0 ? 'pendientes' : 'todos')
  const filas = vista === 'pendientes' ? pendientes : vista === 'observaciones' ? conObservaciones : base

  const confirmarListos = () => {
    Alert.alert(
      `Confirmar ${listos.length} ${listos.length === 1 ? 'centro' : 'centros'}`,
      'No tienen observaciones: el personal y los salarios vienen de planilla. Una vez confirmados ya no se pueden editar, salvo que Planificación los reabra.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            setConfirmando(true)
            try {
              // Uno por corrida: el servicio confirma los centros de UNA corrida.
              const porCorrida = new Map<number, IMiCentro[]>()
              for (const c of listos) porCorrida.set(c.CorridaId, [...(porCorrida.get(c.CorridaId) ?? []), c])
              for (const [corridaId, lista] of porCorrida) {
                const r = await exigir(api.confirmarVarios(corridaId, {
                  Centros: lista.map(c => ({ CentroCosto: c.CentroCosto, GrupoCodigo: c.GrupoCodigo })), Comentario: null,
                }))
                showToast('success', 'Centros confirmados', r.SuccessMessage)
              }
            } catch (e) {
              showToast('error', 'No se pudo confirmar', mensajeDeError(e))
            } finally {
              setConfirmando(false)
              void cargar()
            }
          },
        },
      ],
    )
  }

  const pad = compacto ? '$2.5' : '$3.5'
  const tarjeta = {
    backgroundColor: '$backgroundElevated', borderRadius: '$4', borderWidth: 1, borderColor: '$border',
    padding: pad, marginBottom: compacto ? '$2' : '$3', ...shadows.sm,
  } as const

  const renderCentro = ({ item: c }: { item: IMiCentro }) => (
    <View {...tarjeta} pressStyle={{ opacity: 0.85 }}
      onPress={() => navigation.navigate('presupuestoCentro', { corridaId: c.CorridaId, cc: c.CentroCosto, grupo: c.GrupoCodigo })}>
      <XStack alignItems="center" gap="$3">
        <YStack flex={1} gap="$1">
          <XStack alignItems="center" gap="$2" flexWrap="wrap">
            <Text fontSize={compacto ? '$4' : '$5'} fontWeight="900" color="$text">{c.CentroCosto}</Text>
            <EstadoChip estado={c.Estado} />
            {c.Estado === 'Habilitado' && <PlazoChip fecha={c.FechaLimite} dias={c.DiasAviso} />}
          </XStack>
          <Text fontSize="$3" color="$text" numberOfLines={1}>{c.CentroCostoNombre}</Text>
          <Text fontSize="$2" color="$textMuted" numberOfLines={1}>
            {c.GrupoCodigo} {c.GrupoNombre}{variasCorridas ? ` · ${c.PresupuestoNombre} · ${c.CorridaNombre}` : ''}
          </Text>
          <XStack gap="$3" flexWrap="wrap">
            <Text fontSize="$2" color="$text">
              {c.Personas} {c.Personas === 1 ? 'persona' : 'personas'}{c.Vacantes > 0 ? ` + ${c.Vacantes} vac.` : ''}
            </Text>
            {/* Delegado sin el Personal: no ve a las personas, ni cuántas revisó. */}
            {c.VePersonal !== 0 && (
              <Text fontSize="$2" fontWeight="700" color={c.Plazas > 0 && c.Revisadas >= c.Plazas ? OK : '$textMuted'}>
                Revisados {c.Revisadas} de {c.Plazas}
              </Text>
            )}
            <Text fontSize="$2" color="$textMuted">L {lps(c.Total)} al año</Text>
          </XStack>
          {c.Plazas > 0 && c.VePersonal !== 0 && <Barra hechas={c.Revisadas} total={c.Plazas} />}
          {c.Estado !== 'Confirmado' && <Observaciones c={c} />}
          {(!!c.DelegadoA || c.EsDelegado === 1) && (
            <XStack><Chip texto={`${c.EsDelegado === 1 ? `TE LO DELEGÓ ${c.DelegadoPorNombre ?? ''}` : `DELEGADO A ${c.DelegadoNombre ?? c.DelegadoA}`}${c.Entregado === 1 ? ' · ENTREGADO' : ''}`.toUpperCase()} color={INDIGO} /></XStack>
          )}
          <Text fontSize="$1" color="$textMuted">
            {c.Estado === 'Confirmado' ? `Confirmado ${fmtFechaHora(c.FechaConfirmado)}`
              : c.Estado === 'Sin habilitar' ? 'Todavía sin fecha límite'
              : `Fecha límite: ${fmtFechaHora(c.FechaLimite)}`}
          </Text>
        </YStack>
        <ChevronRight size={20} color={theme.textMuted?.val} />
      </XStack>
    </View>
  )

  const contenedor = {
    paddingHorizontal: compacto ? 10 : 16, paddingTop: 4, paddingBottom: 110 + insets.bottom,
    width: '100%' as const, maxWidth: 1000, alignSelf: 'center' as const,
  }

  if (!centros && !error) {
    return <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor="$background"><Spinner size="large" color={ACCENT} /></YStack>
  }

  return (
    <View flex={1} backgroundColor="$background">
      <YStack paddingHorizontal={compacto ? 10 : 16} paddingTop={compacto ? 8 : 12} paddingBottom="$2" gap="$2"
        width="100%" maxWidth={1000} alignSelf="center">
        {!!error && <Text fontSize="$2" color={ERR}>{error}</Text>}
        {todos.length > 0 && (
          <XStack borderBottomWidth={1} borderColor="$border" gap="$4">
            {([['centros', 'Mis centros'], ['resumen', 'Resumen por Depto-CeCo']] as const).map(([v, t]) => (
              <View key={v} onPress={() => setPanel(v)} paddingVertical="$2" borderBottomWidth={2}
                borderColor={panel === v ? ACCENT : 'transparent'} marginBottom={-1}>
                <Text fontWeight="800" fontSize="$2" color={panel === v ? '$text' : '$textMuted'}>{t}</Text>
              </View>
            ))}
          </XStack>
        )}
        {panel === 'resumen' ? null : <>
        {sinHabilitar > 0 && (
          <XStack gap="$2" alignItems="flex-start" padding="$2.5" borderRadius="$3" backgroundColor={`${GRIS}1A`}>
            <Lock size={16} color={GRIS} />
            <Text flex={1} fontSize="$2" color="$text">
              Planificación todavía no habilita la revisión de {sinHabilitar === base.length ? 'estos centros' : `${sinHabilitar} de estos centros`}:
              ya puedes verlos, pero no editarlos ni confirmarlos. Te llegará un aviso con la fecha límite.
            </Text>
          </XStack>
        )}
        {porVencer.length > 0 && (
          <XStack gap="$2" alignItems="flex-start" padding="$2.5" borderRadius="$3" backgroundColor={`${WARN}22`}>
            <ClipboardCheck size={16} color={WARN} />
            <Text flex={1} fontSize="$2" color="$text">
              <Text fontWeight="800">Se acerca la fecha límite: </Text>
              {porVencer.length} {porVencer.length === 1 ? 'centro por confirmar vence' : 'centros por confirmar vencen'}{' '}
              {plazoRestante(primerLimite, porVencer[0]?.DiasAviso)?.texto.replace(/^Vence /, '')} ({fmtFechaHora(primerLimite)}).
            </Text>
          </XStack>
        )}
        <XStack borderWidth={1} borderColor="$border" borderRadius="$4" padding="$1" backgroundColor="$backgroundElevated" gap="$1">
          {([
            ['pendientes', `Por confirmar (${pendientes.length})`],
            ['observaciones', `Con observ. (${conObservaciones.length})`],
            ['todos', `Todos (${base.length})`],
          ] as const).map(([v, t]) => (
            <View key={v} flex={1} onPress={() => setVista(v)} pressStyle={{ opacity: 0.85 }}
              backgroundColor={vista === v ? ACCENT : 'transparent'} borderRadius="$3" height={compacto ? 30 : 34}
              alignItems="center" justifyContent="center">
              <Text fontWeight="800" fontSize="$1" color={vista === v ? '#fff' : '$textMuted'} numberOfLines={1}>{t}</Text>
            </View>
          ))}
        </XStack>
        {delegables.length > 0 && (
          <XStack alignSelf="flex-start" alignItems="center" gap={4} onPress={() => setDelegando(true)} hitSlop={8} pressStyle={{ opacity: 0.7 }}>
            <Share2 size={15} color={INDIGO} />
            <Text fontSize="$2" color={INDIGO} fontWeight="800">Delegar centros</Text>
          </XStack>
        )}
        {vacios > 0 && (
          <Text fontSize="$2" color={ACCENT} fontWeight="700" alignSelf="flex-end" onPress={() => setVerVacios(v => !v)}>
            {verVacios ? 'Ocultar centros sin personas' : `Mostrar ${vacios} ${vacios === 1 ? 'centro' : 'centros'} sin personas`}
          </Text>
        )}
        </>}
      </YStack>

      {panel === 'resumen' && todos.length > 0 && <ResumenMios corridaId={todos[0].CorridaId} compacto={compacto} />}
      {panel === 'centros' && <>

      <FlatList
        data={filas}
        keyExtractor={c => `${c.CorridaId}|${c.CentroCosto}|${c.GrupoCodigo}`}
        renderItem={renderCentro}
        contentContainerStyle={contenedor}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); void cargar() }}
          colors={[ACCENT]} tintColor={ACCENT} />}
        ListEmptyComponent={
          <YStack alignItems="center" paddingTop="$10" gap="$3">
            <ClipboardCheck size={42} color={theme.textMuted?.val} />
            <Text color="$textMuted" textAlign="center">
              {todos.length === 0
                ? 'No tienes centros de costo asignados para revisar.\nCuando Planificación te los habilite te llegará un aviso.'
                : vista === 'pendientes' ? 'No tienes centros por confirmar.'
                : vista === 'observaciones' ? 'Ningún centro por confirmar tiene observaciones.'
                : 'No hay centros en esta vista.'}
              {'\n'}Desliza hacia abajo para actualizar.
            </Text>
          </YStack>
        }
      />

      {delegando && (
        <Hoja titulo="Delegar centros" subtitulo="Por esta corrida" onCerrar={() => setDelegando(false)}>
          <DelegarCentros centros={delegables} onListo={() => { setDelegando(false); void cargar() }} />
        </Hoja>
      )}

      {listos.length > 0 && (
        <View position="absolute" left={0} right={0} bottom={0} paddingHorizontal={compacto ? 10 : 16} paddingTop="$2"
          paddingBottom={insets.bottom + 10} backgroundColor="$background" borderTopWidth={1} borderColor="$border">
          <View height={48} borderRadius="$4" backgroundColor={OK} alignItems="center" justifyContent="center"
            opacity={confirmando ? 0.6 : 1} pressStyle={{ opacity: 0.85 }} onPress={confirmando ? undefined : confirmarListos}
            maxWidth={1000} width="100%" alignSelf="center">
            {confirmando
              ? <Spinner color="#fff" />
              : <Text color="#fff" fontWeight="900">
                {listos.length === 1 ? 'Confirmar el centro sin observaciones' : `Confirmar los ${listos.length} sin observaciones`}
              </Text>}
          </View>
        </View>
      )}
      </>}
    </View>
  )
}

/** El gerente marca centros y elige a quién delegarlos (usuarios con «Mis centros de costo»); también quita la
 *  delegación. Volver a delegar uno que ya le entregaron se lo devuelve a la persona. */
function DelegarCentros({ centros, onListo }: { centros: IMiCentro[]; onListo: () => void }) {
  const { showToast } = useShowToast()
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [buscar, setBuscar] = useState('')
  const [usuarios, setUsuarios] = useState<IUsuarioDelegado[]>([])
  const [elegido, setElegido] = useState<IUsuarioDelegado | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const clave = (c: IMiCentro) => `${c.CentroCosto}|${c.GrupoCodigo}`
  const sel = centros.filter(c => marcados.has(clave(c)))
  const selDelegados = sel.filter(c => !!c.DelegadoA)

  useEffect(() => {
    const f = buscar.trim()
    if (f.length < 2) { setUsuarios([]); return }
    const t = setTimeout(() => {
      exigir(api.buscarDelegados(f)).then(r => setUsuarios(r.Data ?? [])).catch(() => setUsuarios([]))
    }, 400)
    return () => clearTimeout(t)
  }, [buscar])

  const correr = async (delegadoA: string | null, lista: IMiCentro[]) => {
    setOcupado(true)
    try {
      const r = await exigir(api.delegar(lista[0].CorridaId, delegadoA, lista.map(c => ({ CentroCosto: c.CentroCosto, GrupoCodigo: c.GrupoCodigo }))))
      showToast('success', delegadoA ? 'Delegado' : 'Delegación quitada', r.SuccessMessage)
      onListo()
    } catch (e) {
      showToast('error', 'No se pudo', mensajeDeError(e))
      setOcupado(false)
    }
  }

  return (
    <>
      <Text fontSize="$2" color="$textMuted">Marca los centros. No aparecen los que Planificación no deja delegar ni donde está tu salario.</Text>
      <YStack gap="$1.5">
        {centros.map(c => {
          const m = marcados.has(clave(c))
          return (
            <XStack key={clave(c)} alignItems="center" gap="$2.5" paddingVertical="$2" paddingHorizontal="$2" borderRadius="$3" borderWidth={1}
              borderColor={m ? ACCENT : '$border'} pressStyle={{ opacity: 0.7 }}
              onPress={() => setMarcados(s => { const n = new Set(s); if (n.has(clave(c))) n.delete(clave(c)); else n.add(clave(c)); return n })}>
              <View width={22} height={22} borderRadius={11} borderWidth={2} borderColor={m ? ACCENT : '$border'}
                backgroundColor={m ? ACCENT : 'transparent'} alignItems="center" justifyContent="center">
                {m && <Check size={14} color="#fff" />}
              </View>
              <YStack flex={1}>
                <Text fontSize="$3" fontWeight="700" color="$text" numberOfLines={1}>{c.CentroCosto} · {c.CentroCostoNombre}</Text>
                <Text fontSize="$1" color={c.DelegadoA ? INDIGO : '$textMuted'} numberOfLines={1}>
                  {c.DelegadoA ? `Delegado a ${c.DelegadoNombre ?? c.DelegadoA}${c.Entregado === 1 ? ' · entregado' : ''}` : `${c.Personas} personas`}
                </Text>
              </YStack>
            </XStack>
          )
        })}
      </YStack>
      {elegido ? (
        <XStack borderWidth={1.5} borderColor={INDIGO} borderRadius="$4" padding="$2.5" alignItems="center" gap="$2">
          <Text flex={1} fontSize="$3" fontWeight="800" color="$text" numberOfLines={1}>{elegido.UsuarioNombre ?? elegido.User_Code}</Text>
          <Text fontSize="$2" color={INDIGO} fontWeight="800" onPress={() => setElegido(null)}>Cambiar</Text>
        </XStack>
      ) : (
        <YStack gap="$1.5">
          <Campo etiqueta="¿A quién?" valor={buscar} cambiar={setBuscar} ayuda="Nombre o usuario (2 letras)" tipo="texto" />
          {usuarios.map(u => (
            <XStack key={u.User_Code} paddingVertical="$2" paddingHorizontal="$2" borderRadius="$3" borderWidth={1} borderColor="$border"
              pressStyle={{ opacity: 0.7 }} onPress={() => setElegido(u)}>
              <Text fontSize="$3" color="$text" numberOfLines={1}>{u.UsuarioNombre} ({u.User_Code})</Text>
            </XStack>
          ))}
          {buscar.trim().length >= 2 && usuarios.length === 0 && (
            <Text fontSize="$1" color="$textMuted">Nadie con «Mis centros de costo» con ese nombre.</Text>
          )}
        </YStack>
      )}
      <Text fontSize="$1" color="$textMuted">Ve y corrige esos centros hasta la fecha límite. Se le avisa por correo y en IMCore.</Text>
      <XStack gap="$2">
        {selDelegados.length > 0 && (
          <Boton texto={`Quitar (${selDelegados.length})`} color={INDIGO} secundario disabled={ocupado} onPress={() => void correr(null, selDelegados)} />
        )}
        <Boton texto={sel.length > 0 ? `Delegar ${sel.length}` : 'Delegar'} color={INDIGO} disabled={ocupado || sel.length === 0 || !elegido}
          onPress={() => void correr(elegido!.User_Code, sel)} />
      </XStack>
    </>
  )
}
