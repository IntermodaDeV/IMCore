import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { RefreshControl } from 'react-native'
import { YStack, XStack, Text, View, ScrollView, Spinner } from 'tamagui'
import {
  AlertTriangle, ClipboardCheck, Clock, DoorClosed, DoorOpen, LogIn,
} from 'lucide-react-native'
import Page from '../../components/commons/Page'
import { usePasesHeader } from './usePasesHeader'
import { useShowToast } from '../../utils/useShowToast'
import { handleError } from '../../utils/errorHandler'
import { pasesService } from '../../api/modules/pases/pases.service'
import { IPaseTablero, SituacionPase } from '../../api/modules/pases/pases.types'
import { PeriodoFiltro, fmtLocal, usePeriodo } from '../Mantenimiento/periodo'
import {
  estaAtrasado, etiquetaSituacion, fmtFecha, nombrePersona, sinCodigo,
  situacionInfo, soloHora, textoCarnet, textoDuracion, textoProximo, textoSecuencia,
} from './paseFormat'

/**
 * Tablero de pases en el teléfono: quién está afuera con permiso, a quién le
 * falta salir y a quién le falta entrar.
 *
 * Mismo contenido que el tablero del web y las mismas dos reglas: TODO sale de
 * UNA consulta (api/Pases/Tablero) y la SITUACIÓN la decide el servidor, del
 * mismo conteo de movimientos que usa la portería al validar.
 *
 * Lo único que cambia es la forma: en una pantalla de teléfono no caben seis
 * paneles lado a lado, así que los grupos son PESTAÑAS con su contador. Se
 * entra en la que importa —"Afuera"— y el resto queda a un toque.
 *
 * EL PERÍODO CAMBIA EL SENTIDO de lo que se ve, y la pantalla lo dice:
 *   · En DÍA (hoy) es un tablero en vivo: "Afuera" es quien está afuera ahora.
 *   · En SEMANA o MES es un resumen: el "Afuera" de un día que ya pasó es un
 *     permiso al que nunca le registraron el regreso —"Sin cerrar"—, y el
 *     atraso no se mide, porque contra "ahora" no querría decir nada.
 */

/** Cada cuánto se refresca solo. Esta pantalla se deja abierta en la portería. */
const REFRESCO_MS = 60_000

type Grupo = 'afuera' | 'por_entrar' | 'por_salir' | 'firma' | 'resto'

const GRUPOS: Array<{
  key: Grupo
  label: string
  icono: any
  situaciones: SituacionPase[]
  vacio: string
}> = [
  {
    key: 'afuera', label: 'Afuera', icono: DoorOpen,
    situaciones: ['afuera'],
    vacio: 'Nadie está afuera con permiso pendiente de regreso.',
  },
  {
    key: 'por_entrar', label: 'Por entrar', icono: LogIn,
    situaciones: ['por_entrar'],
    vacio: 'Nadie está pendiente de entrar.',
  },
  {
    // 'adentro' es quien ya entró con un permiso de "entrar y salir": para la
    // puerta es el mismo trámite pendiente que el que todavía no sale.
    key: 'por_salir', label: 'Por salir', icono: DoorClosed,
    situaciones: ['por_salir', 'adentro'],
    vacio: 'Nadie está pendiente de salir.',
  },
  {
    key: 'firma', label: 'Sin firma', icono: ClipboardCheck,
    situaciones: ['pendiente_jefe', 'pendiente_rh'],
    vacio: 'Ningún permiso del día espera firma.',
  },
  {
    key: 'resto', label: 'Cerrados', icono: Clock,
    situaciones: ['completo', 'rechazado', 'anulado', 'vencido'],
    vacio: 'Todavía no hay permisos cerrados.',
  },
]

const pad = (n: number) => String(n).padStart(2, '0')
const hoyISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const sumarDias = (iso: string, dias: number): string => {
  const [y, m, d] = iso.split('-').map(Number)
  const f = new Date(y, (m ?? 1) - 1, d ?? 1)
  f.setDate(f.getDate() + dias)
  return `${f.getFullYear()}-${pad(f.getMonth() + 1)}-${pad(f.getDate())}`
}

export default function PaseTableroScreen() {
  const { showToast } = useShowToast()

  // Arranca en DÍA: el tablero es una pantalla del día y así se usa casi
  // siempre. Semana y mes están para revisar, no para vigilar.
  const periodo = usePeriodo('dia')
  const [filas, setFilas] = useState<IPaseTablero[]>([])
  const [grupo, setGrupo] = useState<Grupo>('afuera')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // El hook entrega [desde, hasta) y el SP espera los dos extremos INCLUSIVOS,
  // así que el final se corre un milisegundo para atrás.
  const desde = fmtLocal(periodo.desde).slice(0, 10)
  const hasta = fmtLocal(new Date(periodo.hasta.getTime() - 1)).slice(0, 10)
  const unDia = desde === hasta
  const esHoy = unDia && desde === hoyISO()

  usePasesHeader('Tablero de pases')

  const load = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const resp = await pasesService.getTablero(desde, hasta)
      if (resp.Success) setFilas(resp.Data ?? [])
      else showToast('error', 'Error', resp.ErrorMessage || 'No se pudo cargar', 4000, 'bottom')
    } catch (err) {
      showToast('error', 'Error', handleError(err).message, 4000, 'bottom')
    }
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta])

  // Al volver a la pantalla se relee: los permisos se firman y se registran en
  // la puerta mientras uno mira otra cosa, así que la lista de hace un rato ya
  // no dice la verdad.
  useFocusEffect(
    useCallback(() => {
      load(true)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [desde, hasta]),
  )

  // Solo el tablero de HOY se refresca solo: uno de otro día ya no cambia.
  useEffect(() => {
    if (!esHoy) return
    const id = setInterval(() => load(true), REFRESCO_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esHoy, desde])

  const porGrupo = useMemo(() => {
    const acc = {} as Record<Grupo, IPaseTablero[]>
    for (const g of GRUPOS) {
      acc[g.key] = filas.filter(f => f.Situacion && g.situaciones.includes(f.Situacion))
    }
    return acc
  }, [filas])

  const atrasados = filas.filter(estaAtrasado).length
  const activas = porGrupo[grupo] ?? []
  const grupoActual = GRUPOS.find(g => g.key === grupo)!

  // En un período, las pestañas se llaman por lo que de verdad son: lo de
  // "afuera" pasa a ser lo que quedó sin cerrar.
  const etiquetaGrupo = (g: typeof GRUPOS[number]): string => {
    if (esHoy) return g.label
    if (g.key === 'afuera') return 'Sin cerrar'
    if (g.key === 'por_salir') return 'No se usó'
    if (g.key === 'por_entrar') return 'No llegó'
    return g.label
  }

  return (
    <Page>
      <YStack flex={1} backgroundColor="$backgroundPage">
        {/* El período. Arriba porque cambia TODO lo que sigue, incluido el
            significado de las pestañas. */}
        <YStack padding="$3" paddingBottom="$2" gap="$2" backgroundColor="$backgroundElevated">
          <PeriodoFiltro {...periodo} modos={['dia', 'semana', 'mes']} />
          <Text fontSize={11} color="$textMuted" textAlign="center">
            {filas.length} {filas.length === 1 ? 'permiso' : 'permisos'}
            {esHoy && atrasados > 0 ? ` · ${atrasados} pasado(s) de hora` : ''}
            {!esHoy ? ' · resumen del período' : ''}
          </Text>
        </YStack>

        {/* Las pestañas son los contadores: se ve de un vistazo dónde hay algo
            sin tener que entrar a cada una. */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} flexGrow={0}>
          <XStack padding="$2" gap="$2">
            {GRUPOS.map(g => {
              const n = (porGrupo[g.key] ?? []).length
              const tarde = (porGrupo[g.key] ?? []).filter(estaAtrasado).length
              const activo = g.key === grupo
              const Icono = g.icono
              return (
                // Mismo estilo de pestaña que las bandejas de Aprobaciones:
                // fondo teñido y texto en el color de marca, no relleno pleno.
                <View
                  key={g.key}
                  onPress={() => setGrupo(g.key)}
                  paddingHorizontal="$3"
                  paddingVertical="$2.5"
                  borderRadius="$3"
                  borderWidth={1}
                  borderColor={activo ? '$primary' : '$border'}
                  backgroundColor={activo ? 'rgba(255,85,26,0.12)' : '$backgroundElevated'}
                  pressStyle={{ opacity: 0.7 }}
                >
                  <XStack alignItems="center" gap="$2">
                    <Icono size={14} color={activo ? '#FF551A' : '#94A3B8'} />
                    <Text fontSize={12} fontWeight={activo ? '700' : '500'} color={activo ? '$primary' : '$textMuted'}>
                      {etiquetaGrupo(g)}
                    </Text>
                    {/* El contador se pone rojo cuando ahí hay alguien pasado
                        de hora: es lo único que pide que alguien haga algo. */}
                    <View
                      paddingHorizontal={6}
                      borderRadius={999}
                      backgroundColor={tarde > 0 ? '#dc2626' : '$background'}
                    >
                      <Text fontSize={11} fontWeight="700" color={tarde > 0 ? '#FFFFFF' : '$textMuted'}>
                        {n}
                      </Text>
                    </View>
                  </XStack>
                </View>
              )
            })}
          </XStack>
        </ScrollView>

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
                onRefresh={() => { setRefreshing(true); load(true) }}
                tintColor="#FF551A"
              />
            }
          >
            <YStack padding="$3" gap="$2" paddingBottom="$6">
              {activas.length === 0 ? (
                <YStack alignItems="center" paddingVertical="$8" gap="$2">
                  <grupoActual.icono size={40} color="#94A3B8" />
                  <Text color="$textMuted" textAlign="center" paddingHorizontal="$4">
                    {grupoActual.vacio}
                  </Text>
                </YStack>
              ) : (
                activas.map(f => {
                  const info = situacionInfo(f.Situacion)
                  const tarde = estaAtrasado(f)
                  // Un solo color por fila: rojo si se pasó de la hora, y si no
                  // el del concepto.
                  const color = tarde ? '#dc2626' : info.color

                  return (
                    <YStack
                      key={f.Id}
                      backgroundColor="$backgroundElevated"
                      borderRadius="$4"
                      borderLeftWidth={3}
                      borderLeftColor={color}
                      padding="$3"
                      gap="$1"
                    >
                      <XStack justifyContent="space-between" alignItems="flex-start" gap="$2">
                        <YStack flex={1}>
                          <Text fontSize={14} fontWeight="700" color={tarde ? '#dc2626' : '$text'}>
                            {nombrePersona(f.EmpleadoNombre)}
                          </Text>
                          <Text fontSize={11} color="$textMuted">
                            {[sinCodigo(f.Departamento), textoCarnet(f)].filter(Boolean).join(' · ')}
                          </Text>
                        </YStack>
                        <View paddingHorizontal="$2" paddingVertical={2} borderRadius="$3" backgroundColor={info.bg}>
                          <Text fontSize={10} fontWeight="700" style={{ color: info.color }}>
                            {etiquetaSituacion(f)}
                          </Text>
                        </View>
                      </XStack>

                      <XStack alignItems="center" gap="$2" flexWrap="wrap">
                        <Text fontSize={12} color="$textMuted">
                          {/* En un rango la fila tiene que decir DE QUÉ DÍA es:
                              dentro de una pestaña de varios días, el título ya
                              no lo dice. */}
                          {!unDia ? `${fmtFecha(f.FechaPase)} · ` : ''}
                          {f.Categoria}
                          {f.Categoria !== textoSecuencia(f.Tipo) ? ` · ${textoSecuencia(f.Tipo)}` : ''}
                        </Text>
                      </XStack>

                      {!!textoProximo(f) && (
                        <XStack alignItems="center" gap="$2">
                          {tarde && <AlertTriangle size={12} color="#dc2626" />}
                          <Text fontSize={12} fontWeight={tarde ? '700' : '500'} color={tarde ? '#dc2626' : '$text'}>
                            {textoProximo(f)}
                          </Text>
                        </XStack>
                      )}

                      {!!f.UltimoMovAt && (
                        <Text fontSize={11} color="$textMuted">
                          {f.UltimoMovTipo === 'S' ? 'Salió' : 'Entró'} {soloHora(f.UltimoMovAt)}
                          {f.MinutosDesdeUltimo != null ? ` · hace ${textoDuracion(f.MinutosDesdeUltimo)}` : ''}
                        </Text>
                      )}

                      {!!f.Observacion && (
                        <Text fontSize={11} color="$textMuted">Obs: {f.Observacion}</Text>
                      )}
                      {!!f.MotivoRechazo && (
                        <Text fontSize={11} color="#B91C1C">Motivo: {f.MotivoRechazo}</Text>
                      )}
                    </YStack>
                  )
                })
              )}
            </YStack>
          </ScrollView>
        )}
      </YStack>
    </Page>
  )
}
