import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Modal, RefreshControl } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { YStack, XStack, Text, Button, View, ScrollView, Spinner } from 'tamagui'
import { Check, X, DoorOpen, DoorClosed, CheckCheck, Clock, ArrowRightLeft, CheckSquare, Square } from 'lucide-react-native'
import Page from '../../components/commons/Page'
import AppInput from '../../components/commons/AppInput'
import { usePasesHeader } from './usePasesHeader'
import { useAuth } from '../../context/AuthContext'
import { useShowToast } from '../../utils/useShowToast'
import { handleError } from '../../utils/errorHandler'
import { pasesService } from '../../api/modules/pases/pases.service'
import { IPase } from '../../api/modules/pases/pases.types'
import { subscribeOpenPaseAprobacion } from '../../services/paseNavigation'
import { sinCodigo, textoSecuencia } from './paseFormat'

const tieneAcceso = (access: string | null | undefined, key: string) =>
  (access ?? '').split(',').map(s => s.trim()).includes(key)

/** La segunda firma de los permisos personales. */
const ACCESO_RH = 'AutorizarPasesRH'

/**
 * «Aprobador de pases»: el rol de quienes pueden ser elegidos como jefe que
 * autoriza. Por Id y no por nombre a propósito — comparar el literal con acento
 * ya ha fallado antes en este proyecto.
 *
 * Hace falta porque tener `AutorizarPasesRH` NO convierte a nadie en jefe: los
 * cuatro de RR. HH. que ponen la segunda firma tienen rol General y no son
 * aprobadores de nadie. Sin esta distinción se les mostraba la pestaña «Como
 * jefe», que para ellos está vacía siempre y no puede dejar de estarlo.
 */
const ROL_APROBADOR_PASES = 9

/** Las horas previstas, en el orden de la secuencia del pase. */
const textoHoras = (p: IPase): string => {
  const salida = p.HoraSalida ? `Sale ${p.HoraSalida}` : ''
  const entrada = p.HoraEntrada ? `${p.Tipo === 'SE' ? 'Regresa' : 'Entra'} ${p.HoraEntrada}` : ''

  if (p.Tipo === 'ES') return [entrada, salida].filter(Boolean).join(' · ')
  return [salida, entrada].filter(Boolean).join(' · ')
}

export default function PaseAprobacionesScreen() {
  const { user, refreshUser } = useAuth()
  const { showToast } = useShowToast()

  const [pases, setPases] = useState<IPase[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [actingId, setActingId] = useState<number | null>(null)
  const [highlightId, setHighlightId] = useState<number | null>(null)

  // Modal de rechazo
  const [rejectPase, setRejectPase] = useState<IPase | null>(null)
  const [motivo, setMotivo] = useState('')

  // Dos bandejas. La de RR. HH. es la segunda firma y solo existe con el acceso;
  // el servidor la devuelve vacía a quien no lo tenga.
  const puedeRH = tieneAcceso(user?.Access, ACCESO_RH)

  // El rol dice quién PUEDE ser jefe; la red de seguridad cubre a quien salió
  // del rol pero todavía tiene permisos esperando su firma: esos no pueden
  // quedar huérfanos por esconderle la bandeja.
  const esAprobadorPorRol = (user?.Roles ?? []).some(r => r.Role_Id === ROL_APROBADOR_PASES)
  const [tienePendientesComoJefe, setTienePendientesComoJefe] = useState(false)
  const puedeJefe = esAprobadorPorRol || tienePendientesComoJefe

  const [modo, setModo] = useState<'jefe' | 'rh'>('jefe')

  // Selección para firmar en lote, en las dos bandejas.
  const [seleccion, setSeleccion] = useState<number[]>([])
  const [aprobandoLote, setAprobandoLote] = useState(false)

  usePasesHeader('Aprobaciones')

  // La lista viva para el handler del deep-link, que no se re-suscribe en cada
  // render: sin el ref leería el `pases` del render en que se registró.
  const pasesRef = useRef<IPase[]>([])
  useEffect(() => { pasesRef.current = pases }, [pases])

  const load = async (silent = false) => {
    if (!user?.Code) return
    if (!silent) setLoading(true)
    try {
      const resp = await pasesService.getPorAprobar(user.Code, modo)
      if (resp.Success) {
        const lista = resp.Data ?? []
        setPases(lista)
        // La selección se PODA contra lo que quedó en la lista. Sin esto, un
        // permiso ya firmado seguía contando en la barra de «autorizar
        // seleccionados» del pie: se salía de la pantalla, se volvía a entrar y
        // la barra seguía ahí, ofreciendo firmar algo que ya no existe.
        setSeleccion(prev => prev.filter(id => lista.some(p => p.Id === id)))
      }
      else showToast('error', 'Error', resp.ErrorMessage || 'No se pudo cargar', 4000, 'bottom')
    } catch (err) {
      showToast('error', 'Error', handleError(err).message, 4000, 'bottom')
    }
    setLoading(false)
    setRefreshing(false)
  }

  // OJO con `user?.Code` en las dependencias: `load` se va sin hacer nada si la
  // sesion todavia no esta restaurada. Al abrir la app desde un push, esta
  // pantalla se monta ANTES que eso, asi que sin esta dependencia la lista se
  // quedaba vacia para siempre y habia que salir y volver a entrar a mano.
  useEffect(() => {
    setSeleccion([])
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, user?.Code])

  // Y al volver a la pantalla: un permiso que otro autorizador ya firmo no
  // tiene por que seguir apareciendo, y uno recien pedido tiene que aparecer.
  useFocusEffect(
    useCallback(() => {
      // Volver a la pantalla es empezar de nuevo: sin selección arrastrada.
      setSeleccion([])
      // Y con los permisos frescos. Qué pestañas se ven depende de `Access` y
      // `Roles`, que viajan en la SESIÓN: sin esto, a quien le acaban de dar
      // (o quitar) el acceso de RR. HH. le seguía apareciendo lo de antes hasta
      // que cerraba la app por completo.
      void refreshUser()
      load(true)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [modo, user?.Code]),
  )

  /**
   * Red de seguridad de la bandeja del jefe.
   *
   * A quien no está en el rol se le esconde la pestaña «Como jefe», pero si
   * alguien salió del rol y todavía tiene permisos asignados a su nombre, esos
   * quedarían sin quien los firme y sin pantalla donde verlos. Se pregunta UNA
   * vez, y solo a quien no es aprobador por rol.
   */
  useEffect(() => {
    if (!user?.Code || esAprobadorPorRol || tienePendientesComoJefe) return
    pasesService.getPorAprobar(user.Code, 'jefe')
      .then(r => { if (r.Success && (r.Data ?? []).length > 0) setTienePendientesComoJefe(true) })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.Code, esAprobadorPorRol])

  // Arranca en la bandeja que la persona realmente puede usar. Se decide con la
  // sesión ya cargada: con `user` en null todavía no se sabe si es jefe.
  useEffect(() => {
    if (!user?.Code) return
    if (modo === 'jefe' && !puedeJefe && puedeRH) setModo('rh')
    if (modo === 'rh' && !puedeRH) setModo('jefe')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.Code, puedeJefe, puedeRH])

  const alternar = (id: number) =>
    setSeleccion(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))

  const todosSeleccionados = pases.length > 0 && seleccion.length === pases.length

  /**
   * Firma en lote. El resultado NO es todo-o-nada: si alguno ya lo tomó otro
   * autorizador, los demás entran igual y el mensaje dice cuántos quedaron.
   */
  const aprobarLote = async () => {
    if (seleccion.length === 0) return
    setAprobandoLote(true)
    try {
      const resp = await pasesService.aprobarLote({ Ids: seleccion, Create_By: user!.Code, Modo: modo })

      if (resp.Success) {
        showToast('success', 'Listo', resp.SuccessMessage || 'Permisos autorizados', 5000, 'bottom')
        setSeleccion([])
        await load(true)
      } else {
        showToast('error', 'Error', resp.ErrorMessage || 'No se pudo autorizar', 5000, 'bottom')
      }
    } catch (err) {
      showToast('error', 'Error', handleError(err).message, 5000, 'bottom')
    }
    setAprobandoLote(false)
  }

  /**
   * Deep-link desde notificación: abre la BANDEJA que corresponde, resalta el
   * pase y refresca.
   *
   * El aviso trae `modo`. Si no lo trae —avisos que ya habían salido antes de
   * que el servidor lo mandara— se deduce: se busca el pase en la bandeja
   * contraria y, si está ahí, se cambia. Sin esto, quien autoriza por RR. HH.
   * tocaba su notificación y caía en la bandeja del jefe, donde ese pase no
   * existe: el aviso lo dejaba peor que no tocarlo.
   */
  const aplicarDestino = ({ paseId, modo: destino }: { paseId: number; modo?: 'jefe' | 'rh' }) => {
    setHighlightId(paseId)
    setTimeout(() => setHighlightId(null), 4000)

    const ir = (m: 'jefe' | 'rh') => (m === modo ? load(true) : setModo(m))

    if (destino) { ir(destino === 'rh' && !puedeRH ? 'jefe' : destino); return }

    // Sin modo: si no está en la bandeja actual, se prueba la otra.
    if (pasesRef.current.some(p => p.Id === paseId)) { load(true); return }
    const otra = modo === 'jefe' ? 'rh' : 'jefe'
    if (otra === 'rh' && !puedeRH) { load(true); return }

    pasesService.getPorAprobar(user!.Code, otra)
      .then(r => {
        if (r.Success && (r.Data ?? []).some(p => p.Id === paseId)) setModo(otra)
        else load(true)
      })
      .catch(() => load(true))
  }

  /**
   * El destino del deep-link se GUARDA si la sesión todavía no está lista.
   *
   * El bus entrega el pase pendiente en cuanto esta pantalla se suscribe, y eso
   * pasa antes de que AuthContext termine de restaurar la sesión cuando la app
   * arranca desde un push. Atenderlo ahí lo desperdiciaba dos veces: `puedeRH`
   * todavía es falso —así que un aviso de RR. HH. caía en la bandeja del jefe—
   * y `load` se iba sin pedir nada. El destino ya se había consumido, así que
   * no quedaba rastro: la pantalla abría vacía y el aviso no servía de nada.
   */
  const destinoPendiente = useRef<{ paseId: number; modo?: 'jefe' | 'rh' } | null>(null)

  useEffect(() => {
    const unsub = subscribeOpenPaseAprobacion(destino => {
      if (!user?.Code) { destinoPendiente.current = destino; return }
      aplicarDestino(destino)
    })
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, puedeRH, user?.Code])

  useEffect(() => {
    if (!user?.Code || !destinoPendiente.current) return
    const guardado = destinoPendiente.current
    destinoPendiente.current = null
    aplicarDestino(guardado)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.Code])

  const aprobar = async (p: IPase) => {
    setActingId(p.Id)
    try {
      // La bandeja define qué firma se está poniendo. Como jefe el pase pasa a
      // esperar a RR. HH.; como RR. HH. queda aprobado y recién ahí sirve.
      const datos = { Id: p.Id, Create_By: user!.Code }
      const resp = modo === 'rh'
        ? await pasesService.aprobarRH(datos)
        : await pasesService.aprobar(datos)
      if (resp.Success) {
        showToast('success', 'Éxito', resp.SuccessMessage || 'Pase aprobado', 4000, 'bottom')
        await load(true)
      } else {
        showToast('error', 'Error', resp.ErrorMessage || 'No se pudo aprobar', 5000, 'bottom')
      }
    } catch (err) {
      showToast('error', 'Error', handleError(err).message, 5000, 'bottom')
    }
    setActingId(null)
  }

  const confirmarRechazo = async () => {
    if (!rejectPase) return
    setActingId(rejectPase.Id)
    try {
      const resp = await pasesService.rechazar({
        Id: rejectPase.Id,
        Create_By: user!.Code,
        MotivoRechazo: motivo.trim() || null,
      })
      if (resp.Success) {
        showToast('success', 'Listo', resp.SuccessMessage || 'Pase rechazado', 4000, 'bottom')
        setRejectPase(null)
        setMotivo('')
        await load(true)
      } else {
        showToast('error', 'Error', resp.ErrorMessage || 'No se pudo rechazar', 5000, 'bottom')
      }
    } catch (err) {
      showToast('error', 'Error', handleError(err).message, 5000, 'bottom')
    }
    setActingId(null)
  }

  return (
    <Page>
      <YStack flex={1} backgroundColor="$backgroundPage">

        {/* El selector solo cuando la persona tiene LAS DOS bandejas. Quien solo
            autoriza por RR. HH. no es jefe de nadie: mostrarle «Como jefe» era
            ofrecerle una lista que nunca va a tener nada. */}
        {puedeRH && puedeJefe && (
          <XStack padding="$4" paddingBottom="$0" gap="$2">
            {([
              { key: 'jefe' as const, label: 'Como jefe' },
              { key: 'rh' as const, label: 'RR. HH.' },
            ]).map((t) => {
              const activo = modo === t.key
              return (
                <View
                  key={t.key}
                  flex={1}
                  alignItems="center"
                  paddingVertical="$2.5"
                  borderRadius="$3"
                  borderWidth={1}
                  borderColor={activo ? '$primary' : '$border'}
                  backgroundColor={activo ? 'rgba(255,85,26,0.12)' : '$backgroundElevated'}
                  pressStyle={{ opacity: 0.7 }}
                  onPress={() => setModo(t.key)}
                >
                  <Text
                    fontSize={13}
                    fontWeight={activo ? '700' : '500'}
                    color={activo ? '$primary' : '$textMuted'}
                  >
                    {t.label}
                  </Text>
                </View>
              )
            })}
          </XStack>
        )}

        {/* Sin pestañas se pierde el único indicador de en calidad de qué se
            está firmando. Para quien solo autoriza por RR. HH. se dice acá. */}
        {puedeRH && !puedeJefe && (
          <XStack paddingHorizontal="$4" paddingTop="$4" paddingBottom="$0">
            <Text fontSize={12} color="$textMuted">
              Segunda firma de RR. HH. · permisos que el jefe ya autorizó
            </Text>
          </XStack>
        )}

        {/* Firmar en lote. Vale en las dos instancias: al jefe también le
            llegan varios del mismo día. */}
        {pases.length > 0 && (
          <XStack paddingHorizontal="$4" paddingTop="$3" alignItems="center" justifyContent="space-between">
            <XStack
              alignItems="center"
              gap="$2"
              pressStyle={{ opacity: 0.6 }}
              onPress={() => setSeleccion(todosSeleccionados ? [] : pases.map(p => p.Id))}
            >
              {todosSeleccionados
                ? <CheckSquare size={18} color="#FF551A" />
                : <Square size={18} color="#94A3B8" />}
              <Text fontSize={13} color={todosSeleccionados ? '$primary' : '$textMuted'} fontWeight="600">
                Seleccionar todos
              </Text>
            </XStack>

            <Text fontSize={12} color="$textMuted">
              {seleccion.length > 0 ? `${seleccion.length} de ${pases.length}` : `${pases.length} pendiente(s)`}
            </Text>
          </XStack>
        )}

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
                  <CheckCheck size={40} color="#94A3B8" />
                  <Text color="$textMuted">
                    {modo === 'rh'
                      ? 'No hay permisos esperando a RR. HH.'
                      : 'No tienes permisos pendientes de aprobar'}
                  </Text>
                </YStack>
              )}

              {pases.map((p) => {
                // Con dos movimientos no es "entrada" ni "salida": es un ida y vuelta.
                const dosMovimientos = (p.Tipo?.length ?? 1) > 1
                const esEntrada = p.Tipo === 'E'
                const resaltado = highlightId === p.Id
                return (
                  <YStack
                    key={p.Id}
                    backgroundColor="$backgroundElevated"
                    borderRadius="$4"
                    padding="$3"
                    gap="$3"
                    borderWidth={resaltado ? 2 : 1}
                    borderColor={resaltado ? '$primary' : '$border'}
                    shadowColor="#000"
                    shadowOffset={{ width: 0, height: 2 }}
                    shadowOpacity={0.07}
                    shadowRadius={6}
                    elevation={2}
                  >
                    <XStack alignItems="center" gap="$3">
                      {/* La casilla es su propio blanco: si seleccionara toda la
                          tarjeta chocaría con los botones de firmar y rechazar. */}
                      {(
                        <View
                          onPress={() => alternar(p.Id)}
                          pressStyle={{ opacity: 0.6 }}
                          paddingVertical="$2"
                          paddingRight="$1"
                        >
                          {seleccion.includes(p.Id)
                            ? <CheckSquare size={22} color="#FF551A" />
                            : <Square size={22} color="#94A3B8" />}
                        </View>
                      )}

                      <View
                        width={38}
                        height={38}
                        borderRadius={19}
                        backgroundColor={esEntrada ? 'rgba(34,197,94,0.12)' : 'rgba(255,85,26,0.12)'}
                        justifyContent="center"
                        alignItems="center"
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
                        </Text>

                        {/* Las horas: es lo que se está autorizando, no un detalle. */}
                        {!!textoHoras(p) && (
                          <XStack alignItems="center" gap="$1.5">
                            <Clock size={12} color="#94A3B8" />
                            <Text fontSize={12} color="$text" fontWeight="600">{textoHoras(p)}</Text>
                          </XStack>
                        )}

                        {!!p.Departamento && (
                          <Text fontSize={11} color="$textMuted">{sinCodigo(p.Departamento)}</Text>
                        )}

                        {/* En la bandeja de RR. HH. importa quién ya firmó. */}
                        {modo === 'rh' && !!p.Aprobado_By && (
                          <Text fontSize={11} color="#15803D">
                            Autorizado por {sinCodigo(p.AprobadorNombre) || p.Aprobado_By}
                          </Text>
                        )}
                        {modo === 'rh' && !p.Aprobado_By && (
                          <Text fontSize={11} color="$textMuted">
                            Sin jefe · autorización directa de RR. HH.
                          </Text>
                        )}
                        {!!p.Observacion && (
                          <Text fontSize={11} color="$textMuted">Obs: {p.Observacion}</Text>
                        )}
                      </YStack>
                    </XStack>

                    <XStack gap="$3">
                      <Button
                        flex={1}
                        height={42}
                        backgroundColor="$buttonSecondary"
                        borderRadius="$3"
                        pressStyle={{ opacity: 0.7 }}
                        disabled={actingId !== null}
                        onPress={() => { setRejectPase(p); setMotivo('') }}
                        icon={<X size={16} color="#B91C1C" />}
                      >
                        <Text color="#B91C1C" fontWeight="700">Rechazar</Text>
                      </Button>
                      <Button
                        flex={1}
                        height={42}
                        backgroundColor="$primary"
                        borderRadius="$3"
                        pressStyle={{ opacity: 0.7 }}
                        disabled={actingId !== null}
                        opacity={actingId === p.Id ? 0.6 : 1}
                        onPress={() => aprobar(p)}
                        icon={actingId === p.Id ? <Spinner color="white" /> : <Check size={16} color="white" />}
                      >
                        <Text color="white" fontWeight="700">Aprobar</Text>
                      </Button>
                    </XStack>
                  </YStack>
                )
              })}
            </YStack>
          </ScrollView>
        )}

        {/* Barra del lote. Aparece solo con algo seleccionado, para no ocupar
            pantalla cuando no hay nada que firmar. */}
        {seleccion.length > 0 && (
          <XStack
            padding="$3"
            gap="$2"
            backgroundColor="$backgroundElevated"
            borderTopWidth={1}
            borderTopColor="$border"
            alignItems="center"
          >
            <Button
              height={46}
              paddingHorizontal="$3"
              backgroundColor="$buttonSecondary"
              borderRadius="$3"
              pressStyle={{ opacity: 0.7 }}
              disabled={aprobandoLote}
              onPress={() => setSeleccion([])}
            >
              <Text color="$text" fontWeight="700">Quitar</Text>
            </Button>

            <Button
              flex={1}
              height={46}
              backgroundColor="$primary"
              borderRadius="$3"
              pressStyle={{ opacity: 0.8 }}
              disabled={aprobandoLote}
              opacity={aprobandoLote ? 0.6 : 1}
              onPress={aprobarLote}
              icon={aprobandoLote ? <Spinner color="white" /> : <CheckCheck size={18} color="white" />}
            >
              <Text color="white" fontWeight="700">
                {aprobandoLote ? 'Autorizando...' : `Autorizar ${seleccion.length}`}
              </Text>
            </Button>
          </XStack>
        )}

      </YStack>

      {/* Modal de rechazo */}
      <Modal visible={!!rejectPase} transparent animationType="fade" onRequestClose={() => setRejectPase(null)}>
        <View flex={1} backgroundColor="rgba(0,0,0,0.45)" justifyContent="center" padding="$4">
          <YStack backgroundColor="$backgroundElevated" borderRadius="$6" padding="$4" gap="$3">
            <Text fontSize={16} fontWeight="700" color="$text">Rechazar pase</Text>
            <Text fontSize={12} color="$textMuted">
              {rejectPase?.EmpleadoNombre} · {rejectPase?.Categoria}
            </Text>
            <AppInput label="Motivo del rechazo (opcional)" value={motivo} onChangeText={setMotivo} />
            <XStack gap="$3" marginTop="$2">
              <Button
                flex={1}
                height={44}
                backgroundColor="$buttonSecondary"
                borderRadius="$3"
                pressStyle={{ opacity: 0.7 }}
                onPress={() => setRejectPase(null)}
                disabled={actingId !== null}
              >
                <Text color="$text" fontWeight="700">Cancelar</Text>
              </Button>
              <Button
                flex={1}
                height={44}
                backgroundColor="#B91C1C"
                borderRadius="$3"
                pressStyle={{ opacity: 0.7 }}
                onPress={confirmarRechazo}
                disabled={actingId !== null}
                opacity={actingId !== null ? 0.6 : 1}
                icon={actingId !== null ? <Spinner color="white" /> : undefined}
              >
                <Text color="white" fontWeight="700">Rechazar</Text>
              </Button>
            </XStack>
          </YStack>
        </View>
      </Modal>
    </Page>
  )
}
