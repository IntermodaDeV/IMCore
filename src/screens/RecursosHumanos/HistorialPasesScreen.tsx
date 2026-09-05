import React, { useCallback, useEffect, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { RefreshControl } from 'react-native'
import { YStack, XStack, Text, View, ScrollView, Spinner } from 'tamagui'
import { DoorOpen, DoorClosed, FileStack, ArrowRightLeft, Clock, QrCode } from 'lucide-react-native'
import Page from '../../components/commons/Page'
import SearchInput from '../../components/commons/SearchInput'
import { PeriodoFiltro, fmtLocal, usePeriodo } from '../Mantenimiento/periodo'
import { usePasesHeader } from './usePasesHeader'
import { useAuth } from '../../context/AuthContext'
import { useShowToast } from '../../utils/useShowToast'
import { handleError } from '../../utils/errorHandler'
import { pasesService } from '../../api/modules/pases/pases.service'
import { IPase } from '../../api/modules/pases/pases.types'
import PaseQrDialog from './PaseQrDialog'
import { sinCodigo, textoCarnet, textoHoras, textoSecuencia } from './paseFormat'
import { fmtFechaHora } from './paseFormat'

const ESTADO_COLOR: Record<number, { bg: string; fg: string }> = {
  6: { bg: 'rgba(168,85,247,0.14)', fg: '#7E22CE' }, // Pendiente RR. HH.
  1: { bg: 'rgba(245,158,11,0.14)', fg: '#B45309' },
  2: { bg: 'rgba(34,197,94,0.14)', fg: '#15803D' },
  3: { bg: 'rgba(239,68,68,0.14)', fg: '#B91C1C' },
  4: { bg: 'rgba(59,130,246,0.14)', fg: '#1D4ED8' },
  5: { bg: 'rgba(148,163,184,0.18)', fg: '#64748B' },
}

export default function HistorialPasesScreen() {
  const { user } = useAuth()
  const { showToast } = useShowToast()

  // Arranca en SEMANA: lo que se consulta casi siempre es "esta semana", y el
  // día suelto ya lo cubre el tablero.
  const periodo = usePeriodo('semana')

  const [pases, setPases] = useState<IPase[]>([])
  // El QR solo se puede mostrar de los permisos propios: el servidor no manda
  // el token de los de otra persona, aunque el historial los liste.
  const [qrPase, setQrPase] = useState<IPase | null>(null)
  const [filtered, setFiltered] = useState<IPase[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  usePasesHeader('Historial de pases')

  // El hook entrega [desde, hasta) y el SP espera los dos extremos INCLUSIVOS.
  const desde = fmtLocal(periodo.desde).slice(0, 10)
  const hasta = fmtLocal(new Date(periodo.hasta.getTime() - 1)).slice(0, 10)

  const load = async (silent = false) => {
    if (!user?.Code) return
    if (!silent) setLoading(true)
    try {
      // El rango va al SERVIDOR y no al filtro de la lista: el SP tiene tope,
      // así que filtrando acá un período viejo se vería vacío por culpa del
      // tope y no porque no hubiera permisos.
      const resp = await pasesService.getHistorialTodos(user.Code, desde, hasta)
      if (resp.Success) {
        setPases(resp.Data ?? [])
        setFiltered(resp.Data ?? [])
      } else {
        showToast('error', 'Error', resp.ErrorMessage || 'No se pudo cargar', 4000, 'bottom')
      }
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

  return (
    <Page>
      <YStack flex={1} backgroundColor="$backgroundPage">
        <View paddingHorizontal="$4" paddingTop="$3" paddingBottom="$2">
          <PeriodoFiltro {...periodo} />
        </View>

        <View paddingHorizontal="$4">
          <SearchInput
            data={pases}
            searchKeys={['EmpleadoNombre', 'EmpleadoCode', 'CodAlterno', 'Departamento', 'Estado', 'Categoria']}
            onResults={setFiltered}
            placeholder="Buscar por empleado, código, estado…"
          />
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
              <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true) }} tintColor="#FF551A" />
            }
          >
            <YStack paddingHorizontal="$4" paddingBottom="$4" gap="$3">
              {filtered.length === 0 && (
                <YStack alignItems="center" justifyContent="center" paddingVertical="$8" gap="$2">
                  <FileStack size={40} color="#94A3B8" />
                  <Text color="$textMuted">Sin pases para mostrar</Text>
                </YStack>
              )}

              {filtered.map((p) => {
                const dosMovimientos = (p.Tipo?.length ?? 1) > 1
                const esEntrada = p.Tipo === 'E'
                const color = ESTADO_COLOR[p.Estado_Id ?? 1] ?? ESTADO_COLOR[1]
                return (
                  <YStack
                    key={p.Id}
                    backgroundColor="$backgroundElevated"
                    borderRadius="$4"
                    padding="$3"
                    gap="$2"
                    shadowColor="#000"
                    shadowOffset={{ width: 0, height: 2 }}
                    shadowOpacity={0.07}
                    shadowRadius={6}
                    elevation={2}
                  >
                    <XStack alignItems="center" gap="$3">
                      <View
                        width={38} height={38} borderRadius={19}
                        backgroundColor={esEntrada ? 'rgba(34,197,94,0.12)' : 'rgba(255,85,26,0.12)'}
                        justifyContent="center" alignItems="center"
                      >
                        {dosMovimientos
                          ? <ArrowRightLeft size={18} color="#FF551A" />
                          : esEntrada
                            ? <DoorOpen size={18} color="#15803D" />
                            : <DoorClosed size={18} color="#FF551A" />}
                      </View>
                      <YStack flex={1} gap="$0.5">
                        <Text fontWeight="700" fontSize={14} color="$text">
                          {sinCodigo(p.EmpleadoNombre)}
                        </Text>
                        <Text fontSize={12} color="$textMuted">
                          {p.Categoria || textoSecuencia(p.Tipo)}
                          {p.FechaPase ? ` · ${p.FechaPase}` : ''}
                          {p.Departamento ? ` · ${sinCodigo(p.Departamento)}` : ''}
                        </Text>
                        {!!textoHoras(p) && (
                          <XStack alignItems="center" gap="$1.5">
                            <Clock size={12} color="#94A3B8" />
                            <Text fontSize={12} color="$textMuted">{textoHoras(p)}</Text>
                          </XStack>
                        )}
                      </YStack>
                      <View backgroundColor={color.bg} paddingHorizontal="$2.5" paddingVertical="$1.5" borderRadius="$10">
                        <Text fontSize={11} fontWeight="700" style={{ color: color.fg }}>{p.Estado}</Text>
                      </View>
                    </XStack>

                    <YStack gap="$0.5" paddingLeft={50}>
                      <Text fontSize={11} color="$textMuted">
                        {textoCarnet(p)}{p.EmpleadoCode ? ` · planilla ${p.EmpleadoCode}` : ''}
                      </Text>
                      {!!p.AprobadorNombre && <Text fontSize={11} color="$textMuted">Aprueba: {p.AprobadorNombre}</Text>}
                      {!!p.Creation_Date && <Text fontSize={11} color="$textMuted">Creado: {fmtFechaHora(p.Creation_Date)}</Text>}
                      {!!p.Aprobacion_Date && <Text fontSize={11} color="#15803D">Jefe: {fmtFechaHora(p.Aprobacion_Date)}</Text>}
                      {!!p.RH_Aprobacion_Date && (
                        <Text fontSize={11} color="#15803D">RR. HH.: {fmtFechaHora(p.RH_Aprobacion_Date)}</Text>
                      )}
                      {!!p.RegistradoAt && (
                        <Text fontSize={11} color="#1D4ED8">Último registro: {fmtFechaHora(p.RegistradoAt)}</Text>
                      )}
                    </YStack>

                    {/* Solo aparece en los permisos propios y aprobados: el
                        token de los de otra persona no llega del servidor. */}
                    {!!p.Token && p.Estado_Id === 2 && (
                      <XStack
                        alignItems="center"
                        justifyContent="center"
                        gap="$2"
                        marginTop="$1"
                        paddingVertical="$2.5"
                        borderRadius="$3"
                        borderWidth={1}
                        borderColor="$border"
                        backgroundColor="$backgroundSurface"
                        pressStyle={{ opacity: 0.7 }}
                        onPress={() => setQrPase(p)}
                      >
                        <QrCode size={16} color="#FF551A" />
                        <Text fontSize={13} fontWeight="700" color="$primary">Mostrar QR en la puerta</Text>
                      </XStack>
                    )}
                  </YStack>
                )
              })}
            </YStack>
          </ScrollView>
        )}
      </YStack>

      <PaseQrDialog pase={qrPase} onClose={() => setQrPase(null)} />
    </Page>
  )
}
