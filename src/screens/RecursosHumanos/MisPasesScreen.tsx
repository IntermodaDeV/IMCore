import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { RefreshControl } from 'react-native'
import { YStack, XStack, Text, View, ScrollView, Spinner, Button } from 'tamagui'
import { DoorOpen, DoorClosed, History, QrCode, Clock } from 'lucide-react-native'
import Page from '../../components/commons/Page'
import { usePasesHeader } from './usePasesHeader'
import { useAuth } from '../../context/AuthContext'
import { useShowToast } from '../../utils/useShowToast'
import { handleError } from '../../utils/errorHandler'
import { pasesService } from '../../api/modules/pases/pases.service'
import { IPase } from '../../api/modules/pases/pases.types'
import PaseQrDialog from './PaseQrDialog'
import { subscribeOpenMiPase } from '../../services/paseNavigation'
import { fmtFechaHora, sinCodigo, textoHoras, textoSecuencia } from './paseFormat'

const ESTADO_COLOR: Record<number, { bg: string; fg: string }> = {
  1: { bg: 'rgba(245,158,11,0.14)', fg: '#B45309' }, // Pendiente del jefe
  2: { bg: 'rgba(34,197,94,0.14)', fg: '#15803D' },  // Aprobado (las dos firmas)
  3: { bg: 'rgba(239,68,68,0.14)', fg: '#B91C1C' },  // Rechazado
  4: { bg: 'rgba(59,130,246,0.14)', fg: '#1D4ED8' }, // Utilizado
  5: { bg: 'rgba(148,163,184,0.18)', fg: '#64748B' },// Vencido
  6: { bg: 'rgba(168,85,247,0.14)', fg: '#7E22CE' }, // Pendiente RR. HH.
}


export default function MisPasesScreen() {
  const { user } = useAuth()
  const { showToast } = useShowToast()

  const [pases, setPases] = useState<IPase[]>([])
  // El pase cuyo QR se está mostrando. Solo llegan con Token los propios: el
  // servidor no lo entrega para los que uno creó a nombre de otra persona.
  const [qrPase, setQrPase] = useState<IPase | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  // El pase que viene señalado desde una notificación.
  const [highlightId, setHighlightId] = useState<number | null>(null)

  usePasesHeader('Mis pases')

  const load = async (silent = false) => {
    if (!user?.Code) return
    if (!silent) setLoading(true)
    try {
      const resp = await pasesService.getMisPases(user.Code)
      if (resp.Success) setPases(resp.Data ?? [])
      else showToast('error', 'Error', resp.ErrorMessage || 'No se pudo cargar', 4000, 'bottom')
    } catch (err) {
      showToast('error', 'Error', handleError(err).message, 4000, 'bottom')
    }
    setLoading(false)
    setRefreshing(false)
  }

  // `user?.Code` en las dependencias porque `load` se va sin hacer nada si la
  // sesión todavía no está restaurada, y al abrir la app desde una notificación
  // esta pantalla se monta antes que eso.
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.Code])

  // Los permisos cambian de estado mientras uno mira otra cosa: al volver a la
  // pantalla hay que releerlos, no mostrar la foto de hace un rato.
  useFocusEffect(
    useCallback(() => {
      load(true)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.Code]),
  )

  /**
   * Deep-link del aviso `pase_estado`: señala el permiso y refresca.
   *
   * Igual que en Aprobaciones, el destino se GUARDA si la sesión aún no está
   * lista: el bus lo entrega en cuanto la pantalla se suscribe, y en un arranque
   * en frío desde un push eso pasa antes de que AuthContext termine.
   */
  const pendiente = useRef<number | null>(null)

  const resaltarPase = (paseId: number) => {
    setHighlightId(paseId)
    setTimeout(() => setHighlightId(null), 4000)
    void load(true)
  }

  useEffect(() => {
    const unsub = subscribeOpenMiPase(paseId => {
      if (!user?.Code) { pendiente.current = paseId; return }
      resaltarPase(paseId)
    })
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.Code])

  useEffect(() => {
    if (!user?.Code || pendiente.current == null) return
    const guardado = pendiente.current
    pendiente.current = null
    resaltarPase(guardado)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.Code])


  return (
    <Page>
      <YStack flex={1} backgroundColor="$backgroundPage">
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
            <YStack padding="$4" gap="$3">
              {pases.length === 0 && (
                <YStack alignItems="center" justifyContent="center" paddingVertical="$8" gap="$2">
                  <History size={40} color="#94A3B8" />
                  <Text color="$textMuted">No tienes pases registrados</Text>
                </YStack>
              )}

              {pases.map((p) => {
                const esEntrada = p.Tipo === 'E'
                const color = ESTADO_COLOR[p.Estado_Id ?? 1] ?? ESTADO_COLOR[1]
                const resaltado = highlightId === p.Id
                return (
                  <YStack
                    key={p.Id}
                    backgroundColor="$backgroundElevated"
                    borderRadius="$4"
                    padding="$3"
                    gap="$2"
                    borderWidth={resaltado ? 2 : 0}
                    borderColor={resaltado ? '$primary' : 'transparent'}
                    shadowColor="#000"
                    shadowOffset={{ width: 0, height: 2 }}
                    shadowOpacity={0.07}
                    shadowRadius={6}
                    elevation={2}
                  >
                    <XStack alignItems="center" gap="$3">
                      <View
                        width={38}
                        height={38}
                        borderRadius={19}
                        backgroundColor={esEntrada ? 'rgba(34,197,94,0.12)' : 'rgba(255,85,26,0.12)'}
                        justifyContent="center"
                        alignItems="center"
                      >
                        {esEntrada
                          ? <DoorOpen size={18} color="#15803D" />
                          : <DoorClosed size={18} color="#FF551A" />}
                      </View>
                      <YStack flex={1}>
                        <Text fontWeight="700" fontSize={14} color="$text">
                          {sinCodigo(p.EmpleadoNombre)}
                        </Text>
                        <Text fontSize={12} color="$textMuted">
                          {p.Categoria || textoSecuencia(p.Tipo)}
                          {p.FechaPase ? ` · ${p.FechaPase}` : ''}
                        </Text>
                      </YStack>
                      <View
                        backgroundColor={color.bg}
                        paddingHorizontal="$2.5"
                        paddingVertical="$1.5"
                        borderRadius="$10"
                      >
                        <Text fontSize={11} fontWeight="700" style={{ color: color.fg }}>
                          {p.Estado}
                        </Text>
                      </View>
                    </XStack>

                    {/* Las horas previstas: es contra estas que Seguridad
                        compara la hora real en la puerta. */}
                    {!!textoHoras(p) && (
                      <XStack alignItems="center" gap="$1.5" paddingLeft={50}>
                        <Clock size={12} color="#94A3B8" />
                        <Text fontSize={12} color="$textMuted">{textoHoras(p)}</Text>
                      </XStack>
                    )}

                    <YStack gap="$0.5" paddingLeft={50}>
                      {/* Avance del pase cuando tiene dos movimientos. */}
                      {(p.MovimientosTotal ?? 1) > 1 && (
                        <Text fontSize={11} color="$textMuted">
                          {(p.MovimientosHechos ?? 0) === 0
                            ? 'Sin registrar todavía'
                            : (p.MovimientosHechos ?? 0) < (p.MovimientosTotal ?? 1)
                              ? `Falta ${p.Tipo === 'SE' ? 'el regreso' : 'la salida'}`
                              : 'Completo'}
                        </Text>
                      )}
                      {!!p.AprobadorNombre && (
                        <Text fontSize={11} color="$textMuted">Autoriza: {sinCodigo(p.AprobadorNombre)}</Text>
                      )}
                      {!!p.Observacion && (
                        <Text fontSize={11} color="$textMuted">Obs: {p.Observacion}</Text>
                      )}
                      {!!p.MotivoRechazo && (
                        <Text fontSize={11} color="#B91C1C">Rechazo: {p.MotivoRechazo}</Text>
                      )}
                      {!!p.Creation_Date && (
                        <Text fontSize={11} color="$textMuted">Creado: {fmtFechaHora(p.Creation_Date)}</Text>
                      )}
                      {!!p.Aprobacion_Date && (
                        <Text fontSize={11} color="#15803D">Jefe: {fmtFechaHora(p.Aprobacion_Date)}</Text>
                      )}
                      {!!p.RH_Aprobacion_Date && (
                        <Text fontSize={11} color="#15803D">
                          RR. HH.: {fmtFechaHora(p.RH_Aprobacion_Date)}
                        </Text>
                      )}
                      {!!p.RegistradoAt && (
                        <Text fontSize={11} color="#1D4ED8">Último registro: {fmtFechaHora(p.RegistradoAt)}</Text>
                      )}
                    </YStack>

                    {/* El QR sirve solo si el pase ya está aprobado y todavía
                        tiene movimientos por registrar. Es para cuando la
                        persona no trae el carnet; el token es suyo y no se
                        comparte. */}
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
