import React, { useCallback, useMemo, useState } from 'react'
import { Alert, FlatList, RefreshControl, useWindowDimensions } from 'react-native'
import { Spinner, Text, View, XStack, YStack, useTheme } from 'tamagui'
import { ChevronRight, ClipboardCheck, Lock } from 'lucide-react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { NotificationBell } from '../../components/notifications/NotificationBell'
import { usePageHeader } from '../../hooks/usePageHeader'
import { useShowToast } from '../../utils/useShowToast'
import { shadows } from '../../theme/shadows'
import { exigir, mensajeDeError, presupuestoService as api } from '../../api/modules/presupuesto/presupuesto.service'
import { IMiCentro } from '../../api/modules/presupuesto/presupuesto.types'
import {
  ACCENT, Barra, ERR, EstadoChip, GRIS, OK, Observaciones, PlazoChip, WARN, esConfirmable, fmtFechaHora, lps, plazoRestante,
  totalObservaciones,
} from './comun'

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

  useFocusEffect(useCallback(() => { void cargar() }, [cargar]))

  // Los centros sin personas ni vacantes no tienen nada que revisar en sueldos: ocultos salvo que los pida.
  const todos = useMemo(() => centros ?? [], [centros])
  const vacios = todos.filter(c => c.Plazas === 0).length
  const base = useMemo(() => todos.filter(c => verVacios || c.Plazas > 0), [todos, verVacios])
  const pendientes = base.filter(c => c.Estado === 'Habilitado' || c.Estado === 'Vencido')
  const conObservaciones = pendientes.filter(c => totalObservaciones(c) > 0)
  const listos = base.filter(c => esConfirmable(c) && totalObservaciones(c) === 0)
  const sinHabilitar = base.filter(c => c.Estado === 'Sin habilitar').length
  const porVencer = base.filter(c => c.Estado === 'Habilitado' && plazoRestante(c.FechaLimite, c.DiasAviso)?.cerca)
  const primerLimite = porVencer.map(c => c.FechaLimite ?? '').sort()[0]
  const variasCorridas = new Set(todos.map(c => c.CorridaId)).size > 1

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
            <Text fontSize="$2" fontWeight="700" color={c.Plazas > 0 && c.Revisadas >= c.Plazas ? OK : '$textMuted'}>
              Revisados {c.Revisadas} de {c.Plazas}
            </Text>
            <Text fontSize="$2" color="$textMuted">L {lps(c.Total)} al año</Text>
          </XStack>
          {c.Plazas > 0 && <Barra hechas={c.Revisadas} total={c.Plazas} />}
          {c.Estado !== 'Confirmado' && <Observaciones c={c} />}
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
        {vacios > 0 && (
          <Text fontSize="$2" color={ACCENT} fontWeight="700" alignSelf="flex-end" onPress={() => setVerVacios(v => !v)}>
            {verVacios ? 'Ocultar centros sin personas' : `Mostrar ${vacios} ${vacios === 1 ? 'centro' : 'centros'} sin personas`}
          </Text>
        )}
      </YStack>

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

      {listos.length > 0 && (
        <View position="absolute" left={0} right={0} bottom={0} paddingHorizontal={compacto ? 10 : 16} paddingTop="$2"
          paddingBottom={insets.bottom + 10} backgroundColor="$background" borderTopWidth={1} borderColor="$border">
          <View height={48} borderRadius="$4" backgroundColor={OK} alignItems="center" justifyContent="center"
            opacity={confirmando ? 0.6 : 1} pressStyle={{ opacity: 0.85 }} onPress={confirmando ? undefined : confirmarListos}
            maxWidth={1000} width="100%" alignSelf="center">
            {confirmando
              ? <Spinner color="#fff" />
              : <Text color="#fff" fontWeight="900">Confirmar los {listos.length} sin observaciones</Text>}
          </View>
        </View>
      )}
    </View>
  )
}
