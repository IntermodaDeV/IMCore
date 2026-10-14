import React, { useCallback, useMemo, useState } from 'react'
import { Alert, AppState, FlatList, Modal, RefreshControl, TextInput, useWindowDimensions } from 'react-native'
import { Spinner, Text, View, XStack, YStack, useTheme } from 'tamagui'
import { ArrowLeft, Check, Lock, Plus, X } from 'lucide-react-native'
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import KeyboardAwareForm from '../../components/commons/KeyboardAwareForm'
import { usePageHeader } from '../../hooks/usePageHeader'
import { useShowToast } from '../../utils/useShowToast'
import { shadows } from '../../theme/shadows'
import { exigir, mensajeDeError, presupuestoService as api } from '../../api/modules/presupuesto/presupuesto.service'
import { ICentroEncabezado, IMiCentro, IPlaza } from '../../api/modules/presupuesto/presupuesto.types'
import {
  ACCENT, AZUL, Barra, Chip, ERR, EstadoChip, GRIS, OK, Observaciones, PlazoChip, WARN, aMensual, aSemanal, centroOculto,
  esTemporal, etiquetaSalario, fmtFechaHora, fueraDePlanilla, lps, mostrarSalario, temporalSinFin, tieneObservacion,
} from './comun'

// Presupuesto › un centro de costo (el revisor). Igual que en el web, pero sencillo: la lista de personas, marcar
// revisadas (una, varias o todas), agregar vacantes y confirmar. Para corregir a alguien se toca su tarjeta y se abre
// un panel con pocos campos. El resumen por período está en Mis centros; lo de Administración se queda en el web.
// Mis centros es la vista del REVISOR: solo se edita lo habilitado y dentro del plazo, también si es administrador.

type Vista = 'todas' | 'pendientes' | 'observaciones'

export default function CentroScreen() {
  const theme = useTheme()
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const insets = useSafeAreaInsets()
  const { showToast } = useShowToast()
  const { height, width } = useWindowDimensions()
  const compacto = height < 720 || width < 370
  const corridaId = Number(route.params?.corridaId)
  const cc = String(route.params?.cc ?? '')
  const grupo = Number(route.params?.grupo)

  usePageHeader({
    left: <ArrowLeft color={theme.text?.val} onPress={() => navigation.goBack()} />,
    center: <Text fontSize="$4" fontWeight="700" color="$text">{cc}</Text>,
  }, [cc])

  const [enc, setEnc] = useState<ICentroEncabezado | null>(null)
  const [plazas, setPlazas] = useState<IPlaza[] | null>(null)
  const [mios, setMios] = useState<IMiCentro[]>([])
  const [error, setError] = useState<string | null>(null)
  const [refrescando, setRefrescando] = useState(false)
  const [vista, setVista] = useState<Vista>('todas')
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [editando, setEditando] = useState<IPlaza | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [verQuitados, setVerQuitados] = useState(false)
  const [agregando, setAgregando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const [e, p, m] = await Promise.all([
        exigir(api.encabezado(corridaId, cc, grupo)), exigir(api.plazas(corridaId, cc, grupo)), exigir(api.misCentros(corridaId)),
      ])
      setEnc(e.Data?.[0] ?? null)
      setPlazas(p.Data ?? [])
      setMios(m.Data ?? [])
      setError(null)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setRefrescando(false)
    }
  }, [corridaId, cc, grupo])

  // Al volver la app al frente, al día con lo que cambió en otro lado (sin intervalos: se puede estar corrigiendo).
  useFocusEffect(useCallback(() => {
    void cargar()
    const sub = AppState.addEventListener('change', e => { if (e === 'active') void cargar() })
    return () => sub.remove()
  }, [cargar]))

  const filas = useMemo(() => plazas ?? [], [plazas])
  const activas = filas.filter(p => p.Excluida !== 1)
  const quitadas = filas.filter(p => p.Excluida === 1)
  const revisadas = activas.filter(p => p.Revisado === 1).length
  const personas = activas.filter(p => p.Origen === 'Planilla').length
  // En personas: una fila de 1000 vacantes cuenta 1000.
  const vacantes = activas.filter(p => p.Origen === 'Vacante').reduce((s, p) => s + (p.Cantidad ?? 1), 0)
  // El total del año del centro (lo mismo que suma Mis centros), al día con cada recarga.
  const total = mios.find(c => c.CentroCosto === cc && c.GrupoCodigo === grupo)?.Total ?? 0
  const conteo = {
    SinSalarioRH: activas.filter(p => p.SinSalarioRH === 1).length,
    FueraDePlanilla: activas.filter(fueraDePlanilla).length,
    // En personas: una vacante en lote (× 1000) cuenta 1000, igual que en el web.
    VacantesSinSalario: activas.filter(p => p.Origen === 'Vacante' && !((p.Salario ?? 0) > 0)).reduce((s, p) => s + (p.Cantidad ?? 1), 0),
    BajoMinimo: activas.filter(p => p.BajoMinimo === 1).reduce((s, p) => s + (p.Cantidad ?? 1), 0),
    TemporalesSinFin: activas.filter(temporalSinFin).length,
  }
  const visibles = vista === 'pendientes' ? activas.filter(p => p.Revisado !== 1)
    : vista === 'observaciones' ? activas.filter(tieneObservacion) : activas

  const puedeEditar = enc?.Acceso === 2 && enc.Estado === 'Habilitado'
  const puedeConfirmar = puedeEditar && enc?.EsRevisor === 1
  const seleccionadas = activas.filter(p => sel.has(p.Id))
  const selPendientes = seleccionadas.filter(p => p.Revisado !== 1)
  const todasSeleccionadas = visibles.length > 0 && visibles.every(p => sel.has(p.Id))

  const alternar = (id: number) => setSel(s => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  const correr = async (accion: () => Promise<{ SuccessMessage: string }>, titulo: string) => {
    setOcupado(true)
    try {
      const r = await accion()
      showToast('success', titulo, r.SuccessMessage)
      setSel(new Set())
      await cargar()
      return true
    } catch (e) {
      showToast('error', 'No se pudo', mensajeDeError(e))
      return false
    } finally {
      setOcupado(false)
    }
  }

  const marcar = (revisado: boolean, ids: number[]) =>
    correr(() => exigir(api.marcarRevisado(corridaId, cc, grupo, revisado, ids)), revisado ? 'Revisado' : 'Marca quitada')

  // Después de confirmar, el siguiente centro por confirmar del revisor (dando la vuelta), sin volver a la lista. Los
  // mismos que muestra Mis centros: también el habilitado sin personas (para agregar vacantes).
  const siguiente = (() => {
    const lista = mios.filter(c => !centroOculto(c))
    const i = lista.findIndex(c => c.CentroCosto === cc && c.GrupoCodigo === grupo)
    return Array.from({ length: Math.max(lista.length - 1, 0) }, (_, k) => lista[(Math.max(i, 0) + 1 + k) % lista.length])
      .find(c => c.Estado === 'Habilitado' && !(c.CentroCosto === cc && c.GrupoCodigo === grupo)) ?? null
  })()

  // Su revisor deshace la confirmación para corregir algo, mientras no venza el plazo (después, Planificación).
  const puedeReabrir = !!enc && enc.Estado === 'Confirmado' && enc.EsRevisor === 1 && enc.CorridaEstado === 'Abierta'
    && !!enc.FechaLimite && new Date(enc.FechaLimite.replace(' ', 'T')).getTime() > Date.now()
  const reabrir = () => {
    Alert.alert(`Reabrir ${cc}`, 'Vuelve a quedar habilitado para corregirlo. Después hay que confirmarlo otra vez antes de la fecha límite.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Reabrir', onPress: () => { void correr(() => exigir(api.reabrirCentro(corridaId, cc, grupo)), 'Centro reabierto') } },
    ])
  }

  // Confirmado: al siguiente pendiente (el botón ya dice cuál) o de vuelta a la lista, como en el web.
  const alConfirmar = () => {
    setConfirmando(false)
    if (siguiente) navigation.replace('presupuestoCentro', { corridaId: siguiente.CorridaId, cc: siguiente.CentroCosto, grupo: siguiente.GrupoCodigo })
    else navigation.goBack()
  }

  const pad = compacto ? '$2.5' : '$3'
  const tarjeta = {
    backgroundColor: '$backgroundElevated', borderRadius: '$4', borderWidth: 1, borderColor: '$border',
    padding: pad, marginBottom: '$2', ...shadows.sm,
  } as const

  const renderPersona = ({ item: p }: { item: IPlaza }) => {
    const marcada = sel.has(p.Id)
    // Su propio salario no lo cambia el gerente (lo corrige quien tiene el acceso a salarios); sí lo puede marcar revisado.
    const editable = puedeEditar && p.EsPropia !== 1
    return (
      <View {...tarjeta} borderColor={marcada ? ACCENT : '$border'} pressStyle={editable ? { opacity: 0.85 } : undefined}
        onPress={editable ? () => setEditando(p) : undefined}>
        <XStack alignItems="center" gap="$3">
          {puedeEditar && (
            <View onPress={() => alternar(p.Id)} hitSlop={12} width={26} height={26} borderRadius={13} borderWidth={2}
              borderColor={marcada ? ACCENT : '$border'} backgroundColor={marcada ? ACCENT : 'transparent'}
              alignItems="center" justifyContent="center" accessibilityRole="checkbox" accessibilityState={{ checked: marcada }}>
              {marcada && <Check size={16} color="#fff" />}
            </View>
          )}
          <YStack flex={1} gap={2}>
            <Text fontSize="$3" fontWeight="800" color="$text" numberOfLines={1}>{p.Nombre}</Text>
            <Text fontSize="$2" color="$textMuted" numberOfLines={1}>
              {p.Origen === 'Vacante' ? 'Vacante' : p.CodPersonal}{p.Cargo ? ` · ${p.Cargo}` : ''}
            </Text>
            <XStack gap="$1" flexWrap="wrap" marginTop={2}>
              {p.EsPropia === 1 && <Chip texto="SU SALARIO · SOLO LECTURA" color={GRIS} />}
              {(p.Cantidad ?? 1) > 1 && <Chip texto={`× ${p.Cantidad.toLocaleString('es-HN')}`} color={ACCENT} />}
              {p.Revisado === 1 && <Chip texto="✓ REVISADO" color={OK} />}
              {p.SinSalarioRH === 1 && <Chip texto="SIN SALARIO DE RR. HH." color={WARN} />}
              {p.Origen === 'Vacante' && !((p.Salario ?? 0) > 0) && <Chip texto="VACANTE SIN SALARIO" color={ERR} />}
              {fueraDePlanilla(p) && <Chip texto="YA NO ESTÁ EN PLANILLA" color={WARN} />}
              {p.BajoMinimo === 1 && <Chip texto="DEBAJO DEL MÍNIMO" color="#ca8a04" />}
              {esTemporal(p) && <Chip texto={temporalSinFin(p) ? 'TEMPORAL · ¿HASTA QUÉ SEMANA?' : 'TEMPORAL'} color="#9333ea" />}
              {p.EsDolares === 1 && <Chip texto="US$" color={AZUL} />}
              {p.PorcIncremento != null && <Chip texto={`EXCEPCIÓN ${fmtPorc(p.PorcIncremento)}`} color={WARN} />}
              {(p.SemanaInicio > 1 || p.SemanaFin < 53) && <Chip texto={`SEMANAS ${p.SemanaInicio}–${Math.min(p.SemanaFin, 52)}`} color={GRIS} />}
            </XStack>
          </YStack>
          <YStack alignItems="flex-end" maxWidth="40%">
            <Text fontSize="$3" fontWeight="900" color={(p.Salario ?? 0) > 0 ? '$text' : ERR} numberOfLines={1}>
              {(p.Salario ?? 0) > 0 ? mostrarSalario(p, p.Salario) : 'Sin salario'}
            </Text>
            {p.SalarioManual === 1 && p.SalarioPlanilla != null && (
              <Text fontSize="$1" color="$textMuted" numberOfLines={1}>planilla {mostrarSalario(p, p.SalarioPlanilla)}</Text>
            )}
            {(p.Salario ?? 0) > 0 && incrementoDe(p, p.PorcIncremento, p.SemanaFin).aplica && (() => {
              const i = incrementoDe(p, p.PorcIncremento, p.SemanaFin)
              return (
                <Text fontSize="$1" color={p.PorcIncremento != null ? WARN : '$textMuted'} numberOfLines={1}>
                  +{fmtPorc(i.efectivo)} sem. {i.desde}: {mostrarSalario(p, (p.Salario as number) * (1 + i.efectivo))}
                </Text>
              )
            })()}
            {((p.ComisionMensual ?? 0) > 0 || (p.VariableMensual ?? 0) > 0) && (
              <Text fontSize="$1" color="$textMuted" numberOfLines={1}>
                {[(p.ComisionMensual ?? 0) > 0 ? `com. ${montoMes(p, p.ComisionMensual)}` : '',
                  (p.VariableMensual ?? 0) > 0 ? `var. ${montoMes(p, p.VariableMensual)}` : ''].filter(Boolean).join(' · ')} /mes
              </Text>
            )}
          </YStack>
        </XStack>
      </View>
    )
  }

  if (!enc || !plazas) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor="$background" padding="$4" gap="$3">
        {error ? <Text color={ERR} textAlign="center">{error}</Text>
          : plazas && !enc ? <Text color="$textMuted" textAlign="center">Este centro no está asignado a ti en esta corrida.</Text>
          : <Spinner size="large" color={ACCENT} />}
      </YStack>
    )
  }

  const aviso = (color: string, texto: string) => (
    <XStack gap="$2" alignItems="flex-start" padding="$2.5" borderRadius="$3" backgroundColor={`${color}1A`}>
      <Lock size={16} color={color} />
      <Text flex={1} fontSize="$2" color="$text">{texto}</Text>
    </XStack>
  )

  const encabezado = (
    <YStack gap="$2" paddingBottom="$2">
      <YStack gap={2}>
        <XStack alignItems="center" gap="$2" flexWrap="wrap">
          <Text fontSize="$5" fontWeight="900" color="$text">{enc.CentroCostoNombre}</Text>
          <EstadoChip estado={enc.Estado} />
          {enc.Estado === 'Habilitado' && <PlazoChip fecha={enc.FechaLimite} dias={enc.DiasAviso} />}
        </XStack>
        <Text fontSize="$2" color="$textMuted">
          {enc.GrupoCodigo} {enc.GrupoNombre} · {enc.PresupuestoNombre} · {enc.CorridaNombre}
        </Text>
        {enc.Estado === 'Habilitado' && <Text fontSize="$2" color="$textMuted">Fecha límite: {fmtFechaHora(enc.FechaLimite)}</Text>}
        <Text fontSize="$3" fontWeight="800" color="$text">Total del año: L {lps(total)}</Text>
      </YStack>
      {enc.Estado === 'Sin habilitar' && aviso(GRIS,
        'Planificación todavía no habilita la revisión de este centro: ya puedes verlo, pero no editarlo ni confirmarlo.')}
      {enc.Estado === 'Vencido' && aviso(WARN, `Venció el plazo (${fmtFechaHora(enc.FechaLimite)}). Pídele a Planificación más tiempo.`)}
      {enc.Estado === 'Confirmado' && aviso(OK,
        `Confirmado por ${enc.ConfirmadoPor} el ${fmtFechaHora(enc.FechaConfirmado)}. ${puedeReabrir
          ? `Si hay que corregir algo, reábrelo (hasta el ${fmtFechaHora(enc.FechaLimite)}).`
          : 'Si hay que corregir algo, pídele a Planificación que lo reabra.'}${enc.Comentario ? `\nComentario: ${enc.Comentario}` : ''}`)}
      {puedeReabrir && <Boton texto="Reabrir para corregir" color={WARN} secundario disabled={ocupado} onPress={reabrir} />}
      <YStack gap={4}>
        <XStack justifyContent="space-between">
          <Text fontSize="$2" color="$text">
            {personas} {personas === 1 ? 'persona' : 'personas'}{vacantes > 0 ? ` · ${vacantes} ${vacantes === 1 ? 'vacante' : 'vacantes'}` : ''}
          </Text>
          <Text fontSize="$2" fontWeight="700" color={activas.length > 0 && revisadas >= activas.length ? OK : '$textMuted'}>
            Revisadas {revisadas} de {activas.length}
          </Text>
        </XStack>
        <Barra hechas={revisadas} total={activas.length} />
      </YStack>
      {enc.Estado !== 'Confirmado' && <Observaciones c={conteo} />}
      {puedeEditar && (
        <XStack alignSelf="flex-end" alignItems="center" gap={4} onPress={() => setAgregando(true)} hitSlop={8}
          pressStyle={{ opacity: 0.7 }} accessibilityRole="button">
          <Plus size={16} color={ACCENT} />
          <Text fontSize="$2" color={ACCENT} fontWeight="800">Agregar vacante</Text>
        </XStack>
      )}
      <Opciones valor={vista} cambiar={setVista} opciones={[
        ['todas', `Todas (${activas.length})`],
        ['pendientes', `Sin revisar (${activas.length - revisadas})`],
        ['observaciones', `Con observ. (${activas.filter(tieneObservacion).length})`],
      ]} />
      {puedeEditar && visibles.length > 0 && (
        <XStack justifyContent="space-between" alignItems="center">
          <Text fontSize="$2" color={ACCENT} fontWeight="700"
            onPress={() => setSel(todasSeleccionadas ? new Set() : new Set(visibles.map(p => p.Id)))}>
            {todasSeleccionadas ? 'Quitar selección' : `Seleccionar ${vista === 'todas' ? 'todas' : 'estas'} (${visibles.length})`}
          </Text>
          <Text fontSize="$1" color="$textMuted">Toca una persona para corregirla</Text>
        </XStack>
      )}
    </YStack>
  )

  const pie = quitadas.length > 0 ? (
    <YStack gap="$2" paddingTop="$2">
      <Text fontSize="$2" color={ACCENT} fontWeight="700" onPress={() => setVerQuitados(v => !v)}>
        {verQuitados ? 'Ocultar' : 'Ver'} quitados del presupuesto ({quitadas.length})
      </Text>
      {verQuitados && quitadas.map(p => (
        <XStack key={p.Id} {...tarjeta} opacity={0.85} alignItems="center" gap="$3">
          <YStack flex={1}>
            <Text fontSize="$3" fontWeight="700" color="$text" numberOfLines={1}>{p.Nombre}</Text>
            <Text fontSize="$2" color="$textMuted" numberOfLines={2}>{p.CodPersonal} · {p.Comentario}</Text>
          </YStack>
          {puedeEditar && (
            <Text fontSize="$2" color={ACCENT} fontWeight="800"
              onPress={() => void correr(() => exigir(api.incluirPlaza(p.Id)), 'Vuelve al presupuesto')}>Incluir</Text>
          )}
        </XStack>
      ))}
    </YStack>
  ) : null

  // Barra de abajo: con selección, marcar lo seleccionado; sin selección, marcar todo lo pendiente y confirmar.
  const botonera = puedeEditar ? (
    seleccionadas.length > 0 ? (
      <XStack gap="$2">
        {selPendientes.length < seleccionadas.length && (
          <Boton texto={`Quitar marca (${seleccionadas.length - selPendientes.length})`} color={GRIS} secundario disabled={ocupado}
            onPress={() => void marcar(false, seleccionadas.filter(p => p.Revisado === 1).map(p => p.Id))} />
        )}
        {selPendientes.length > 0 && (
          <Boton texto={`Marcar ${selPendientes.length} revisada${selPendientes.length === 1 ? '' : 's'}`} color={ACCENT} disabled={ocupado}
            onPress={() => void marcar(true, selPendientes.map(p => p.Id))} />
        )}
      </XStack>
    ) : (
      <XStack gap="$2">
        {revisadas < activas.length && (
          <Boton texto="Marcar todas revisadas" color={ACCENT} secundario={puedeConfirmar} disabled={ocupado}
            onPress={() => void marcar(true, [])} />
        )}
        {puedeConfirmar && <Boton texto="Confirmar centro" color={OK} disabled={ocupado} onPress={() => setConfirmando(true)} />}
      </XStack>
    )
  ) : null

  return (
    <View flex={1} backgroundColor="$background">
      <FlatList
        data={visibles}
        keyExtractor={p => String(p.Id)}
        renderItem={renderPersona}
        ListHeaderComponent={encabezado}
        ListFooterComponent={pie}
        contentContainerStyle={{
          paddingHorizontal: compacto ? 10 : 16, paddingTop: compacto ? 8 : 12, paddingBottom: 100 + insets.bottom,
          width: '100%', maxWidth: 1000, alignSelf: 'center',
        }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); void cargar() }}
          colors={[ACCENT]} tintColor={ACCENT} />}
        ListEmptyComponent={activas.length > 0
          ? <Text color="$textMuted" textAlign="center" paddingTop="$6">No hay personas en esta vista.</Text>
          : (
            // Centro sin personas: se habilitó para agregar las vacantes que necesite (o confirmarlo vacío).
            <YStack alignItems="center" gap="$3" paddingTop="$6">
              <Text color="$textMuted" textAlign="center">
                Este centro no tiene personas en planilla.{puedeEditar ? ' Agrega las vacantes que necesite; si no necesita, confírmalo así.' : ''}
              </Text>
              {puedeEditar && (
                <XStack width="100%" maxWidth={320}>
                  <Boton texto="Agregar vacante" color={ACCENT} disabled={ocupado} onPress={() => setAgregando(true)} />
                </XStack>
              )}
            </YStack>
          )}
      />

      {botonera && (
        <View position="absolute" left={0} right={0} bottom={0} paddingHorizontal={compacto ? 10 : 16} paddingTop="$2"
          paddingBottom={insets.bottom + 10} backgroundColor="$background" borderTopWidth={1} borderColor="$border">
          <View maxWidth={1000} width="100%" alignSelf="center">{botonera}</View>
        </View>
      )}

      <EditarPersona plaza={editando} corridaId={corridaId} cc={cc} grupo={grupo} onCerrar={() => setEditando(null)} onListo={() => { setEditando(null); void cargar() }}
        tieneComision={enc?.TieneComision === 1} tieneVariable={enc?.TieneVariable === 1} />
      {agregando && (
        <AgregarVacante corridaId={corridaId} cc={cc} grupo={grupo} salarioMinimo={enc.SalarioMinimo ?? null}
          onCerrar={() => setAgregando(false)} onListo={() => { setAgregando(false); void cargar() }} />
      )}
      {confirmando && (
        <ConfirmarCentro corridaId={corridaId} cc={cc} grupo={grupo} personas={personas} vacantes={vacantes} total={total}
          sinRevisar={activas.length - revisadas} fechaLimite={enc.FechaLimite} siguiente={siguiente}
          onCerrar={() => setConfirmando(false)} onListo={alConfirmar} />
      )}
    </View>
  )
}

/** Selector de una opción (pastillas), como el SegmentedControl del web. */
function Opciones<T extends string>({ valor, opciones, cambiar }: {
  valor: T; opciones: readonly (readonly [T, string])[]; cambiar: (v: T) => void
}) {
  return (
    <XStack borderWidth={1} borderColor="$border" borderRadius="$4" padding="$1" backgroundColor="$backgroundElevated" gap="$1">
      {opciones.map(([v, t]) => (
        <View key={v} flex={1} onPress={() => cambiar(v)} pressStyle={{ opacity: 0.85 }}
          backgroundColor={valor === v ? ACCENT : 'transparent'} borderRadius="$3" height={32}
          alignItems="center" justifyContent="center" accessibilityRole="button" accessibilityState={{ selected: valor === v }}>
          <Text fontWeight="800" fontSize="$1" color={valor === v ? '#fff' : '$textMuted'} numberOfLines={1}>{t}</Text>
        </View>
      ))}
    </XStack>
  )
}

/** Panel que sube desde abajo: título, cerrar y el formulario (el teclado no tapa los campos). */
function Hoja({ titulo, subtitulo, onCerrar, children }: {
  titulo: string; subtitulo?: string; onCerrar: () => void; children: React.ReactNode
}) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onCerrar}>
      <View flex={1} backgroundColor="rgba(0,0,0,0.45)" justifyContent="flex-end">
        <View onPress={onCerrar} flex={1} />
        <View backgroundColor="$backgroundElevated" borderTopLeftRadius={18} borderTopRightRadius={18} maxHeight="88%"
          paddingBottom={insets.bottom}>
          <XStack alignItems="center" gap="$3" paddingHorizontal={16} paddingTop="$3" paddingBottom="$2"
            borderBottomWidth={1} borderColor="$border">
            <YStack flex={1}>
              <Text fontSize="$4" fontWeight="900" color="$text" numberOfLines={1}>{titulo}</Text>
              {subtitulo ? <Text fontSize="$2" color="$textMuted" numberOfLines={1}>{subtitulo}</Text> : null}
            </YStack>
            <View onPress={onCerrar} hitSlop={12} width={40} height={40} borderRadius={20} borderWidth={1} borderColor="$border"
              alignItems="center" justifyContent="center" accessibilityRole="button" accessibilityLabel="Cerrar">
              <X size={22} color={theme.text?.val} />
            </View>
          </XStack>
          <KeyboardAwareForm contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, gap: 12 }}>
            {children}
          </KeyboardAwareForm>
        </View>
      </View>
    </Modal>
  )
}

type TipoCampo = 'entero' | 'decimal' | 'texto' | 'parrafo'

function Campo({ etiqueta, valor, cambiar, ayuda, tipo = 'entero' }: {
  etiqueta: string; valor: string; cambiar: (t: string) => void; ayuda: string; tipo?: TipoCampo
}) {
  const theme = useTheme()
  const parrafo = tipo === 'parrafo'
  return (
    <YStack gap={4}>
      <Text fontSize="$2" fontWeight="700" color="$text">{etiqueta}</Text>
      <TextInput value={valor} onChangeText={cambiar} placeholder={ayuda} placeholderTextColor={theme.textMuted?.val}
        keyboardType={tipo === 'decimal' ? 'decimal-pad' : tipo === 'entero' ? 'number-pad' : 'default'}
        autoCapitalize={tipo === 'texto' ? 'characters' : 'sentences'}
        multiline={parrafo}
        style={[{
          flex: 1, fontSize: 16, color: theme.text?.val, backgroundColor: theme.background?.val, borderWidth: 1,
          borderColor: theme.border?.val, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
        }, parrafo ? { minHeight: 60, textAlignVertical: 'top' } : null]} />
    </YStack>
  )
}

function Boton({ texto, color, onPress, secundario = false, disabled = false }: {
  texto: string; color: string; onPress: () => void; secundario?: boolean; disabled?: boolean
}) {
  return (
    <View flex={1} height={46} borderRadius="$4" alignItems="center" justifyContent="center" paddingHorizontal="$2"
      backgroundColor={secundario ? 'transparent' : color} borderWidth={secundario ? 1.5 : 0} borderColor={color}
      opacity={disabled ? 0.5 : 1} pressStyle={{ opacity: 0.8 }} onPress={disabled ? undefined : onPress}>
      <Text color={secundario ? color : '#fff'} fontWeight="900" fontSize="$3" numberOfLines={1}>{texto}</Text>
    </View>
  )
}

// ---------------------------------------------------------------- corregir una persona
// Pocos campos y todos opcionales: vacío = lo que dice planilla (salario), el % general o los días de ley. Guardar
// también deja a la persona revisada. Quitar del presupuesto pide el motivo, como en el web.

const MOTIVOS = ['Ya no labora en la empresa', 'Se trasladó a otro centro de costo', 'Otro']

const num = (t: string) => {
  const v = Number(t.replace(/,/g, '').trim())
  return t.trim() === '' || Number.isNaN(v) ? null : v
}

/** Comisión o variable: siempre MENSUAL, en la moneda de su planilla (también en la semanal). */
const montoMes = (p: IPlaza, v: number | null | undefined) => `${p.EsDolares === 1 ? 'US$ ' : ''}${lps(v, 2)}`

/** El incremento de una persona: su % (excepción) o el general de su clase, desde qué semana y si le alcanza a tocar. */
function incrementoDe(p: IPlaza, porc: number | null | undefined, fin: number) {
  const efectivo = porc ?? p.PorcGeneral ?? 0
  const desde = p.SemanaIncremento == null ? null : Math.max(p.SemanaIncremento, p.SemanaInicio)
  return { efectivo, desde, aplica: desde != null && desde <= Math.min(fin, 52) && efectivo > 0 }
}
const fmtPorc = (v: number) => `${(v * 100).toLocaleString('es-HN', { maximumFractionDigits: 2 })} %`

function EditarPersona({ plaza: p, corridaId, cc, grupo, onCerrar, onListo, tieneComision, tieneVariable }: {
  plaza: IPlaza | null; corridaId: number; cc: string; grupo: number; onCerrar: () => void; onListo: () => void
  tieneComision: boolean; tieneVariable: boolean
}) {
  const { showToast } = useShowToast()
  const semanal = p?.EsSemanal === 1
  const salarioInicial = p?.Salario == null ? '' : String(semanal ? aSemanal(p.Salario) : p.Salario)
  const porcInicial = p?.PorcIncremento == null ? '' : String(Number((p.PorcIncremento * 100).toFixed(4)))
  const diasInicial = p?.DiasVacaciones == null ? '' : String(p.DiasVacaciones)
  const hastaInicial = p == null || p.SemanaFin >= 52 ? '' : String(p.SemanaFin)
  const cantidadInicial = String(p?.Cantidad ?? 1)
  const comisionInicial = p?.ComisionMensual ? String(p.ComisionMensual) : ''
  const variableInicial = p?.VariableMensual ? String(p.VariableMensual) : ''

  const [salario, setSalario] = useState('')
  const [porc, setPorc] = useState('')
  const [dias, setDias] = useState('')
  const [hasta, setHasta] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [comision, setComision] = useState('')
  const [variable, setVariable] = useState('')
  const [comentario, setComentario] = useState('')
  const [quitando, setQuitando] = useState(false)
  const [motivo, setMotivo] = useState(MOTIVOS[0])
  const [detalle, setDetalle] = useState('')
  const [ocupado, setOcupado] = useState(false)

  // Cada vez que se abre con otra persona, los campos arrancan con lo suyo.
  React.useEffect(() => {
    setSalario(salarioInicial); setPorc(porcInicial); setDias(diasInicial); setHasta(hastaInicial); setCantidad(cantidadInicial)
    setComision(comisionInicial); setVariable(variableInicial)
    setComentario(p?.Comentario ?? ''); setQuitando(false); setMotivo(MOTIVOS[0]); setDetalle('')
  }, [p?.Id])

  if (!p) return null
  const cambio = salario !== salarioInicial || porc !== porcInicial || dias !== diasInicial || hasta !== hastaInicial
    || comentario !== (p.Comentario ?? '') || cantidad !== cantidadInicial || comision !== comisionInicial || variable !== variableInicial
  const hastaNum = num(hasta)
  const cantidadNum = num(cantidad)
  const cantidadMal = p.Origen === 'Vacante' && (cantidadNum == null || cantidadNum < 1 || cantidadNum > 9999 || !Number.isInteger(cantidadNum))
  const hastaMal = hastaNum != null && (hastaNum < p.SemanaInicio || hastaNum > 52)
  const montoMal = (num(comision) ?? 0) < 0 || (num(variable) ?? 0) < 0
  const textoMotivo = motivo === 'Otro' ? detalle.trim() : (detalle.trim() ? `${motivo}: ${detalle.trim()}` : motivo)

  const correr = async (accion: () => Promise<{ SuccessMessage: string }>, titulo: string) => {
    setOcupado(true)
    try {
      const r = await accion()
      showToast('success', titulo, r.SuccessMessage)
      onListo()
    } catch (e) {
      showToast('error', 'No se pudo', mensajeDeError(e))
    } finally {
      setOcupado(false)
    }
  }

  const guardar = () => {
    // Si el salario no se tocó va el mismo de antes: pasar por semanal y volver redondearía centavos.
    const s = salario === salarioInicial ? p.Salario : num(salario)
    void correr(() => exigir(api.modificarPlaza(p.Id, {
      Salario: s == null ? null : (salario !== salarioInicial && semanal ? aMensual(s) : s),
      PorcIncremento: num(porc) == null ? null : (num(porc) as number) / 100,
      DiasVacaciones: num(dias),
      SemanaInicio: p.SemanaInicio,
      SemanaFin: hastaNum == null || hastaNum >= 52 ? 53 : hastaNum,
      Comentario: comentario.trim() || null,
      Cantidad: p.Origen === 'Vacante' ? cantidadNum : undefined,
      // Solo si se tocaron (vacío = 0 = quitar): si no, la base las deja como están.
      ComisionMensual: comision !== comisionInicial ? (num(comision) ?? 0) : undefined,
      VariableMensual: variable !== variableInicial ? (num(variable) ?? 0) : undefined,
    })), 'Guardado')
  }

  const campo = (etiqueta: string, valor: string, cambiar: (t: string) => void, ayuda: string, opciones: { decimal?: boolean; multilinea?: boolean } = {}) => (
    <Campo etiqueta={etiqueta} valor={valor} cambiar={cambiar} ayuda={ayuda}
      tipo={opciones.multilinea ? 'parrafo' : opciones.decimal ? 'decimal' : 'entero'} />
  )

  return (
    <Hoja titulo={p.Nombre} onCerrar={onCerrar}
      subtitulo={`${p.Origen === 'Vacante' ? 'Vacante' : p.CodPersonal}${p.Cargo ? ` · ${p.Cargo}` : ''}${p.SalarioPlanilla != null ? ` · planilla ${mostrarSalario(p, p.SalarioPlanilla)}` : ''}`}>
      {!quitando ? (
        <>
          {p.Origen === 'Vacante' && campo('Cantidad (vacantes iguales)', cantidad, setCantidad, '1')}
          {cantidadMal && <Text fontSize="$1" color={ERR}>La cantidad va de 1 a 9999.</Text>}
          {campo(`${etiquetaSalario(p)}${(cantidadNum ?? 1) > 1 ? ', de cada una' : ''}`, salario, setSalario,
            p.SalarioPlanilla != null ? `Planilla: ${mostrarSalario(p, p.SalarioPlanilla)}` : 'Sin salario', { decimal: true })}
          <XStack gap="$3">
            <YStack flex={1}>{campo('% de incremento', porc, setPorc,
              `General: ${fmtPorc(p.PorcGeneral ?? 0)}${p.IncrementoAplica === 'Salario mínimo' ? ' (mínimo)' : ''}`, { decimal: true })}</YStack>
            <YStack flex={1}>{campo('Días de vacaciones', dias, setDias, `Por ley: ${p.DiasVacacionesLey ?? 0}`)}</YStack>
          </XStack>
          {(() => {
            // El salario que quedaría con el incremento, mientras escribe (salario y % del formulario).
            const s = salario === salarioInicial ? p.Salario : (num(salario) == null ? null : (semanal ? aMensual(num(salario) as number) : num(salario)))
            const i = incrementoDe(p, num(porc) == null ? null : (num(porc) as number) / 100, hastaNum == null || hastaNum >= 52 ? 53 : hastaNum)
            if (!s || s <= 0) return null
            return (
              <Text fontSize="$2" color={num(porc) != null ? WARN : '$textMuted'}>
                {i.aplica
                  ? `Con incremento (${fmtPorc(i.efectivo)}${num(porc) != null ? ', excepción' : ''}): ${mostrarSalario(p, s * (1 + i.efectivo))} desde la semana ${i.desde}`
                  : 'Sin incremento en sus semanas.'}
              </Text>
            )
          })()}
          {(tieneComision || tieneVariable) && (
            <XStack gap="$3">
              {tieneComision && <YStack flex={1}>{campo('Comisión al mes', comision, setComision, 'Sin comisión', { decimal: true })}</YStack>}
              {tieneVariable && <YStack flex={1}>{campo('Sueldo variable al mes', variable, setVariable, 'Sin variable', { decimal: true })}</YStack>}
            </XStack>
          )}
          {montoMal && <Text fontSize="$1" color={ERR}>La comisión y el variable no pueden ser negativos.</Text>}
          {campo(esTemporal(p) ? 'Última semana del contrato' : 'Hasta la semana', hasta, setHasta,
            `Todo el año${p.SemanaInicio > 1 ? ` (desde la ${p.SemanaInicio})` : ''}`)}
          {hastaMal && <Text fontSize="$1" color={ERR}>La semana va de {p.SemanaInicio} a 52.</Text>}
          {campo('Comentario', comentario, setComentario, 'Opcional', { multilinea: true })}
          <Text fontSize="$1" color="$textMuted">Vacío = lo de planilla, el % general o los días de ley. Al guardar queda revisada.</Text>
          <XStack gap="$2">
            {cambio
              ? <Boton texto="Guardar" color={ACCENT} disabled={ocupado || hastaMal || cantidadMal || montoMal} onPress={guardar} />
              : p.Revisado !== 1
                ? <Boton texto="Está bien: marcar revisada" color={OK} disabled={ocupado}
                    onPress={() => void correr(() => exigir(api.marcarRevisado(corridaId, cc, grupo, true, [p.Id])), 'Revisada')} />
                : <Boton texto="Cerrar" color={GRIS} secundario onPress={onCerrar} />}
          </XStack>
          <Text fontSize="$2" color={ERR} fontWeight="700" textAlign="center" paddingVertical="$2"
            onPress={() => p.Origen === 'Vacante'
              ? Alert.alert('Quitar vacante', `¿Quitar «${p.Nombre}» del presupuesto?`, [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Quitar', style: 'destructive', onPress: () => void correr(() => exigir(api.quitarVacante(p.Id)), 'Vacante quitada') },
                ])
              : setQuitando(true)}>
            {p.Origen === 'Vacante' ? 'Quitar esta vacante' : 'Quitar del presupuesto'}
          </Text>
        </>
      ) : (
        <>
          <Text fontSize="$3" color="$text">
            Deja de contar en el presupuesto de este centro. Queda en «Quitados» con el motivo y se puede volver a incluir;
            aunque se refresque la planilla, no vuelve sola.
          </Text>
          <YStack gap="$2">
            {MOTIVOS.map(m => (
              <XStack key={m} gap="$2" alignItems="center" onPress={() => setMotivo(m)} paddingVertical="$1.5">
                <View width={20} height={20} borderRadius={10} borderWidth={2} borderColor={motivo === m ? ACCENT : '$border'}
                  alignItems="center" justifyContent="center">
                  {motivo === m && <View width={10} height={10} borderRadius={5} backgroundColor={ACCENT} />}
                </View>
                <Text fontSize="$3" color="$text">{m}</Text>
              </XStack>
            ))}
          </YStack>
          {campo(motivo === 'Otro' ? 'Explica el motivo' : 'Detalle (opcional)', detalle, setDetalle, '', { multilinea: true })}
          <XStack gap="$2">
            <Boton texto="Volver" color={GRIS} secundario onPress={() => setQuitando(false)} />
            <Boton texto="Quitar" color={ERR} disabled={ocupado || !textoMotivo}
              onPress={() => void correr(() => exigir(api.excluirPlaza(p.Id, textoMotivo)), 'Quitado del presupuesto')} />
          </XStack>
        </>
      )}
    </Hoja>
  )
}

// ---------------------------------------------------------------- agregar una vacante
// Lo mismo que en el web: cargo, cuántas iguales, salario (semanal o mensual) y las semanas en que cuesta.

function AgregarVacante({ corridaId, cc, grupo, salarioMinimo, onCerrar, onListo }: {
  corridaId: number; cc: string; grupo: number; salarioMinimo: number | null; onCerrar: () => void; onListo: () => void
}) {
  const { showToast } = useShowToast()
  const [cargo, setCargo] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [planilla, setPlanilla] = useState<'mensual' | 'semanal'>('mensual')
  const [salario, setSalario] = useState('')
  const [desde, setDesde] = useState('1')
  const [hasta, setHasta] = useState('')
  const [comentario, setComentario] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const semanal = planilla === 'semanal'
  const cantidadNum = num(cantidad)
  const salarioNum = num(salario)
  const desdeNum = num(desde)
  const hastaNum = num(hasta)
  const cantidadMal = cantidadNum == null || cantidadNum < 1 || cantidadNum > 9999 || !Number.isInteger(cantidadNum)
  const semanasMal = desdeNum == null || desdeNum < 1 || desdeNum > 52 || !Number.isInteger(desdeNum)
    || (hastaNum != null && (hastaNum < desdeNum || hastaNum > 52 || !Number.isInteger(hastaNum)))
  const listo = !!cargo.trim() && (salarioNum ?? 0) > 0 && !cantidadMal && !semanasMal
  const minimo = salarioMinimo ? (semanal ? aSemanal(salarioMinimo) : salarioMinimo) : null

  const agregar = async () => {
    setOcupado(true)
    try {
      const r = await exigir(api.agregarVacante({
        CorridaId: corridaId, CentroCosto: cc, GrupoCodigo: grupo, Cargo: cargo.trim(), Nombre: null,
        // En semanal se escribe el semanal y se guarda el mensual (lo que guarda planilla). Sin «hasta» = todo el año.
        Salario: semanal ? aMensual(salarioNum as number) : salarioNum,
        SemanaInicio: desdeNum as number, SemanaFin: hastaNum == null || hastaNum >= 52 ? 53 : hastaNum,
        EsSemanal: semanal, Comentario: comentario.trim() || null, Cantidad: cantidadNum as number,
      }))
      showToast('success', 'Vacante agregada', r.SuccessMessage)
      onListo()
    } catch (e) {
      showToast('error', 'No se pudo', mensajeDeError(e))
      setOcupado(false)
    }
  }

  return (
    <Hoja titulo="Agregar vacante" subtitulo={cc} onCerrar={onCerrar}>
      <Campo etiqueta="Cargo" valor={cargo} cambiar={setCargo} ayuda="Ej.: OPERARIO" tipo="texto" />
      <XStack gap="$3">
        <YStack flex={1}><Campo etiqueta="Cantidad" valor={cantidad} cambiar={setCantidad} ayuda="1" /></YStack>
        <YStack flex={1} gap={4}>
          <Text fontSize="$2" fontWeight="700" color="$text">Planilla</Text>
          <Opciones valor={planilla} cambiar={setPlanilla} opciones={[['mensual', 'Mensual'], ['semanal', 'Semanal']]} />
        </YStack>
      </XStack>
      {cantidadMal && <Text fontSize="$1" color={ERR}>La cantidad va de 1 a 9999.</Text>}
      <Campo etiqueta={`Salario ${semanal ? 'semanal' : 'mensual'}${(cantidadNum ?? 1) > 1 ? ', de cada una' : ''}`} valor={salario}
        cambiar={setSalario} ayuda="L" tipo="decimal" />
      {minimo != null && (
        <Text fontSize="$2" color={ACCENT} fontWeight="800" alignSelf="flex-start" onPress={() => setSalario(String(minimo))}>
          Usar el mínimo: L {lps(minimo, 2)}
        </Text>
      )}
      {(cantidadNum ?? 1) > 1 && (salarioNum ?? 0) > 0 && (
        <Text fontSize="$2" color="$textMuted">
          Las {(cantidadNum as number).toLocaleString('es-HN')}: L {lps((cantidadNum as number) * (salarioNum as number), 2)} {semanal ? 'por semana' : 'al mes'}.
        </Text>
      )}
      <XStack gap="$3">
        <YStack flex={1}><Campo etiqueta="Desde la semana" valor={desde} cambiar={setDesde} ayuda="1" /></YStack>
        <YStack flex={1}><Campo etiqueta="Hasta la semana" valor={hasta} cambiar={setHasta} ayuda="52" /></YStack>
      </XStack>
      {semanasMal && <Text fontSize="$1" color={ERR}>Las semanas van de 1 a 52, y «hasta» no antes de «desde».</Text>}
      <Campo etiqueta="Comentario" valor={comentario} cambiar={setComentario} ayuda="Opcional" tipo="parrafo" />
      <XStack gap="$2">
        <Boton texto={(cantidadNum ?? 1) > 1 && !cantidadMal ? `Agregar ${(cantidadNum as number).toLocaleString('es-HN')}` : 'Agregar'}
          color={ACCENT} disabled={ocupado || !listo} onPress={() => void agregar()} />
      </XStack>
    </Hoja>
  )
}

// ---------------------------------------------------------------- confirmar el centro
// Lo mismo que en el web: qué se confirma, hasta cuándo se puede reabrir y un comentario para Planificación.

function ConfirmarCentro({ corridaId, cc, grupo, personas, vacantes, total, sinRevisar, fechaLimite, siguiente, onCerrar, onListo }: {
  corridaId: number; cc: string; grupo: number; personas: number; vacantes: number; total: number; sinRevisar: number
  fechaLimite: string | null; siguiente: IMiCentro | null; onCerrar: () => void; onListo: () => void
}) {
  const { showToast } = useShowToast()
  const [comentario, setComentario] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const confirmar = async () => {
    setOcupado(true)
    try {
      const r = await exigir(api.confirmar(corridaId, cc, grupo, comentario.trim() || null))
      showToast('success', 'Centro confirmado', r.SuccessMessage)
      onListo()
    } catch (e) {
      showToast('error', 'No se pudo', mensajeDeError(e))
      setOcupado(false)
    }
  }

  return (
    <Hoja titulo={`Confirmar ${cc}`} onCerrar={onCerrar}>
      <Text fontSize="$3" color="$text">
        {personas} {personas === 1 ? 'persona' : 'personas'}, {vacantes} {vacantes === 1 ? 'vacante' : 'vacantes'} y un total
        de L {lps(total)} en el año.
        {sinRevisar === 1 ? ' La que no marcaste queda revisada.' : sinRevisar > 1 ? ` Las ${sinRevisar} que no marcaste quedan revisadas.` : ''}
      </Text>
      <Text fontSize="$2" color="$textMuted">
        Queda en solo lectura. {fechaLimite
          ? `Si hay que corregir algo, lo reabres tú hasta el ${fmtFechaHora(fechaLimite)}.`
          : 'Si hay que corregir algo, pídele a Planificación que lo reabra.'}
      </Text>
      <Campo etiqueta="Comentario para Planificación" valor={comentario} cambiar={setComentario} ayuda="Opcional" tipo="parrafo" />
      <XStack gap="$2">
        <Boton texto={siguiente ? `Confirmar y seguir con ${siguiente.CentroCosto}` : 'Confirmar y volver'} color={OK}
          disabled={ocupado} onPress={() => void confirmar()} />
      </XStack>
    </Hoja>
  )
}
