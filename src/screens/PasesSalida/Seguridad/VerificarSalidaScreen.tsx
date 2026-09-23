import React, { useCallback, useEffect, useState } from 'react'
import { ScrollView } from 'react-native'
import { Text, XStack, YStack, View, useTheme } from 'tamagui'
import { useNavigation, useRoute } from '@react-navigation/native'
import {
  ArrowLeft, Package, User, Send, RotateCcw, TriangleAlert, ShieldAlert, LogOut,
  MessageSquare, CalendarClock, IdCard,
} from 'lucide-react-native'
import dayjs from 'dayjs'

import { usePageHeader } from '../../../hooks/usePageHeader'
import { useShowToast } from '../../../utils/useShowToast'
import ConfirmDialog from '../../../components/commons/ConfirmDialog'
import SkeletonList from '../../../components/Skeletons/SkeletonList'
import ErrorState from '../../AdmSys/ErrorState'
import { AppError, handleError } from '../../../utils/errorHandler'
import { shadows } from '../../../theme/shadows'
import { ACCENT, ACCENT_BG, estadoVisual, fmtCantidad, fmtFecha, fmtFechaHora } from '../pasesSalida.helpers'
import { pasesService } from '../../../api/modules/pasesSalida/pases.service'
import { IPaseSalida, IPaseSalidaDetalle } from '../../../api/modules/pasesSalida/pases.types'

/**
 * Lo que ve el guardia después de escanear: qué tiene que dejar salir.
 *
 * ESTA PANTALLA ES UNA LISTA DE VERIFICACIÓN, no una ficha del pase. El guardia
 * está parado frente a un carro con cajas; lo único que necesita es contar y
 * comparar. Por eso la cantidad es el elemento más grande de cada línea y el
 * encabezado del pase queda reducido a lo mínimo — quién lo pide y a dónde va.
 *
 * SIRVE PARA LOS DOS ESCANEOS, y cuál es lo decide el ESTADO del pase, no el
 * guardia — es el mismo QR las dos veces:
 *     Aprobado -> está por salir -> "Generar salida"
 *     Salió    -> está afuera    -> "Registrar regreso"
 * Un solo botón que cambia de significado, en vez de dos: el guardia hace lo
 * mismo siempre —escanear y confirmar— y no tiene que elegir.
 *
 * EL CICLO: Aprobado -> Salió -> Finalizado (el que regresa),
 *           Aprobado -> Finalizado (el definitivo).
 * La confirmación dice con todas las letras dónde va a quedar, porque el guardia
 * no tiene por qué saberlo de memoria. Cancelar sale sin tocar nada.
 *
 * Si el pase ya cerró su ciclo el botón no se esconde, se bloquea con el motivo
 * a la vista: uno que desaparece deja al guardia sin saber si el problema es el
 * pase o la app.
 */

/** Alto del footer fijo: el scroll reserva ese espacio para no quedar tapado. */
const FOOTER_H = 116

const VERDE = '#22c55e'
const AMBAR = '#f59e0b'

export default function VerificarSalidaScreen() {
  const theme = useTheme()
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const { showToast } = useShowToast()

  const id: number = route.params?.id
  const correlativo: string = route.params?.correlativo ?? 'Pase'

  const [pase, setPase] = useState<IPaseSalida | null>(null)
  const [detalle, setDetalle] = useState<IPaseSalidaDetalle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<AppError | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [registrando, setRegistrando] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const [rPase, rDet] = await Promise.all([
        pasesService.getPase(id),
        pasesService.getDetalle(id),
      ])
      // El SP devuelve una fila; el arreglo trae 0 o 1 elemento.
      setPase(rPase.Data?.[0] ?? null)
      setDetalle(rDet.Data ?? [])
      setError(null)
    } catch (e) {
      setPase(null); setDetalle([])
      setError(handleError(e))
    }
  }, [id])

  useEffect(() => { (async () => { setLoading(true); await cargar(); setLoading(false) })() }, [cargar])

  /**
   * Registra el movimiento que corresponda: salida si el pase está aprobado,
   * regreso si está afuera. La hora la pone el servidor —el reloj del teléfono
   * no es fuente confiable para un dato que se audita— y el SP vuelve a validar
   * el estado, así que un cambio entre el escaneo y la confirmación no pasa.
   *
   * Al terminar se vuelve a la lista: el pase cambia de estado y por lo tanto
   * sale de la bandeja en la que estaba, que es la confirmación de que quedó
   * hecho.
   */
  const registrar = async () => {
    if (!pase) return
    // El estado ya decidió qué botón se mostró; acá se vuelve a leer para no
    // depender de que la pantalla no haya recargado entre medio.
    const esRegreso = pase.Estado === 'PSSAL'
    setRegistrando(true)
    try {
      const res = esRegreso
        ? await pasesService.registrarRetorno(pase.Id)
        : await pasesService.registrarSalida(pase.Id)
      if (res.Success) {
        setConfirmando(false)
        showToast('success', esRegreso ? 'Regreso registrado' : 'Salida registrada',
          res.SuccessMessage || 'El movimiento quedó registrado')
        navigation.goBack()
      } else {
        // El estado pudo cambiar entre el escaneo y la confirmación: se recarga
        // para que la pantalla deje de ofrecer algo que ya no se puede.
        setConfirmando(false)
        showToast('error', 'No se pudo registrar', res.ErrorMessage || 'Intente de nuevo')
        await cargar()
      }
    } catch (e: any) {
      setConfirmando(false)
      showToast('error', 'Error', e?.message || 'No se pudo registrar el movimiento')
    } finally { setRegistrando(false) }
  }

  usePageHeader({
    left: <ArrowLeft color={theme.text?.val} onPress={() => navigation.goBack()} />,
    center: <Text fontSize="$4" fontWeight="700" color="$text" numberOfLines={1}>{pase?.Correlativo ?? correlativo}</Text>,
  })

  if (loading) {
    return <View flex={1} backgroundColor="$background"><SkeletonList /></View>
  }

  if (error) {
    return (
      <View flex={1} backgroundColor="$background">
        <ErrorState
          type={error.type} title={error.title} message={error.message} errorCode={error.status}
          onRetry={async () => { setLoading(true); await cargar(); setLoading(false) }}
        />
      </View>
    )
  }

  if (!pase) {
    return (
      <View flex={1} backgroundColor="$background">
        <ErrorState
          type="general"
          title="No se encontró el pase"
          message="El código no corresponde a ningún pase vigente."
          onRetry={() => navigation.goBack()}
          retryLabel="Volver"
        />
      </View>
    )
  }

  const est = estadoVisual(pase.Estado)

  /* QUÉ SIGNIFICA ESTE ESCANEO lo dice el ESTADO del pase, no el guardia: es el
     mismo QR las dos veces.
       PSAPR -> está por salir     -> se registra la SALIDA
       PSSAL -> está afuera        -> se registra el REGRESO
     Cualquier otro estado ya cerró su ciclo y no admite nada. */
  const aprobado = pase.Estado === 'PSAPR'
  const esRetorno = pase.Estado === 'PSSAL'

  /* La fecha de salida la firmaron los autorizantes junto con el resto del
     pase, así que no se puede adelantar ni usar para siempre. El servidor ya
     resolvió en cuál de los tres casos cae; acá solo se muestra. El regreso NO
     se limita: lo que está afuera tiene que poder volver cuando vuelva. */
  const vigencia = pase.SalidaVigencia ?? 'OK'
  const anticipada = aprobado && vigencia === 'ANTICIPADA'
  const vencida = aprobado && vigencia === 'VENCIDA'
  // Fuera de horario es el único motivo que se arregla esperando: el pase está
  // bien, es el reloj. Por eso va en ámbar y no en rojo.
  const fueraHorario = aprobado && vigencia === 'FUERAHORARIO'
  // Días calendario, no diferencia de horas: "mañana" es mañana aunque falten
  // 20 horas o 30.
  const diasParaSalir = pase.FechaSalida
    ? dayjs(pase.FechaSalida).startOf('day').diff(dayjs().startOf('day'), 'day')
    : 0

  const puedeActuar = (aprobado && vigencia === 'OK') || esRetorno
  // Ámbar cuando solo hay que esperar (otro día u otra hora); rojo cuando no
  // hay nada que esperar.
  const soloEsperar = anticipada || fueraHorario
  // Cerrado de verdad: PSSAL no cuenta, ese todavía tiene el regreso pendiente.
  const cerrado = ['PSFIN', 'PSRET'].includes(pase.Estado)
  const totalLineas = detalle.length

  return (
    <View flex={1} backgroundColor="$background">
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: FOOTER_H + 16 }}>

        {/* ── El pase, en lo mínimo ── */}
        <YStack backgroundColor="$backgroundElevated" borderRadius="$4"
          borderLeftWidth={4} borderLeftColor={est.color} borderWidth={1} borderColor="$border"
          padding="$4" gap="$2.5" {...shadows.sm}>

          <XStack alignItems="center" gap="$2">
            <Text flex={1} fontSize={18} fontWeight="900" color="$text">{pase.Correlativo}</Text>
            <View backgroundColor={est.bg} borderWidth={1} borderColor={est.color}
              paddingHorizontal="$2.5" paddingVertical={4} borderRadius="$10">
              <Text fontSize={10} fontWeight="800" color={est.color}>
                {pase.EstadoNombre || est.label}
              </Text>
            </View>
          </XStack>

          <XStack alignItems="center" gap="$2" flexWrap="wrap">
            <View backgroundColor={ACCENT} borderRadius="$3" paddingHorizontal="$3" paddingVertical={5}>
              <Text fontSize={12} fontWeight="900" color="#fff">{pase.TipoSalida}</Text>
            </View>
            {pase.Retorna ? (
              <View backgroundColor={ACCENT_BG} borderWidth={1} borderColor={ACCENT}
                borderRadius="$3" paddingHorizontal="$2.5" paddingVertical={5}
                flexDirection="row" alignItems="center" gap={5}>
                <RotateCcw size={11} color={ACCENT} />
                <Text fontSize={10} fontWeight="800" color={ACCENT}>Debe regresar</Text>
              </View>
            ) : null}
          </XStack>

          {pase.EnviadoA ? (
            <XStack alignItems="flex-start" gap="$2">
              <Send size={13} color={theme.textMuted?.val} style={{ marginTop: 1 }} />
              <Text flex={1} fontSize={12} color="$text" fontWeight="600">{pase.EnviadoA}</Text>
            </XStack>
          ) : null}

          {/* También en la ficha, además del bloque resaltado de abajo: ahí es
              una instrucción ("cnfirme antes de dejar pasar") y solo sale
              cuando se puede actuar; acá es un dato del pase, y se ve siempre
              —incluso en uno ya cerrado, cuando alguien pregunta quién lo sacó. */}
          {pase.Responsable ? (
            <XStack alignItems="flex-start" gap="$2">
              <IdCard size={13} color={theme.textMuted?.val} style={{ marginTop: 1 }} />
              <Text flex={1} fontSize={12} color="$text" fontWeight="600">
                {pase.Responsable}
                <Text fontSize={11} color="$textMuted" fontWeight="400">  · retira</Text>
              </Text>
            </XStack>
          ) : null}
          <XStack alignItems="center" gap="$2">
            <User size={13} color={theme.textMuted?.val} />
            <Text flex={1} fontSize={11} color="$textMuted">
              {pase.Solicitante || pase.Create_By}
              {pase.Empresa ? ` · ${pase.Empresa}` : ''}
              {pase.FechaSalida ? ` · Sale ${fmtFecha(pase.FechaSalida)}` : ''}
            </Text>
          </XStack>

          {/* El comentario es contexto del pase, no una línea que salga: va acá
              y no al final, donde quedaba después de la lista a verificar. */}
          {pase.Comentario ? (
            <XStack alignItems="flex-start" gap="$2" marginTop={2} paddingTop="$2.5"
              borderTopWidth={1} borderTopColor="$border">
              <MessageSquare size={13} color={theme.textMuted?.val} style={{ marginTop: 1 }} />
              <Text flex={1} fontSize={11} color="$text">{pase.Comentario}</Text>
            </XStack>
          ) : null}
        </YStack>

        <View height={14} />

        {/* ── El aviso: es la razón de que esta pantalla exista ── */}
        {puedeActuar ? (
          <XStack alignItems="flex-start" gap="$2.5" backgroundColor="rgba(245, 158, 11, 0.15)"
            borderWidth={1} borderColor={AMBAR} borderRadius="$4"
            paddingHorizontal="$3" paddingVertical="$3" marginBottom="$3">
            <TriangleAlert size={16} color={AMBAR} style={{ marginTop: 1 }} />
            <YStack flex={1} gap={2}>
              <Text fontSize={12} fontWeight="900" color={AMBAR}>
                {esRetorno ? 'Revise antes de recibir' : 'Revise antes de dejar salir'}
              </Text>
              <Text fontSize={11} color={AMBAR} fontWeight="600">
                {esRetorno
                  /* Al recibir, lo que se compara es contra lo que SALIÓ: el
                     número de serie es el que dice si volvió el mismo equipo o
                     uno parecido. */
                  ? 'Cuente cada línea y compárela con lo que está regresando. Si falta algo o el número de serie no es el mismo, no registre el regreso.'
                  : 'Cuente cada línea y compárela con lo que va en el vehículo. Si algo no coincide —cantidad, marca o número de serie— no genere la salida.'}
              </Text>
              {esRetorno && pase.FechaSalidaReal ? (
                <Text fontSize={10} color={AMBAR} fontWeight="700" marginTop={2}>
                  Salió el {fmtFechaHora(pase.FechaSalidaReal)}
                  {pase.SalidaPorNombre || pase.SalidaPor
                    ? `, registrado por ${pase.SalidaPorNombre || pase.SalidaPor}`
                    : ''}.
                </Text>
              ) : null}
            </YStack>
          </XStack>
        ) : soloEsperar ? (
          /* No es un error del pase ni del guardia: falta esperar, nada más. Por
             eso va en ámbar y con el dato que hay que esperar en grande. */
          <YStack gap="$2" backgroundColor="rgba(245, 158, 11, 0.15)"
            borderWidth={1} borderColor={AMBAR} borderRadius="$4"
            paddingHorizontal="$3" paddingVertical="$3" marginBottom="$3">
            <XStack alignItems="center" gap="$2">
              <CalendarClock size={16} color={AMBAR} />
              <Text flex={1} fontSize={12} fontWeight="900" color={AMBAR}>
                {anticipada ? 'Este pase todavía no puede salir' : 'Fuera del horario de salida'}
              </Text>
            </XStack>
            <XStack alignItems="center" gap="$2.5">
              <YStack backgroundColor={AMBAR} borderRadius="$3"
                paddingHorizontal="$3" paddingVertical="$2" alignItems="center">
                <Text fontSize={10} fontWeight="800" color="#fff">
                  {anticipada ? 'SALE EL' : 'HORARIO'}
                </Text>
                <Text fontSize={16} fontWeight="900" color="#fff">
                  {anticipada
                    ? fmtFecha(pase.FechaSalida)
                    : `${pase.HoraDesde ?? '--:--'} a ${pase.HoraHasta ?? '--:--'}`}
                </Text>
              </YStack>
              <Text flex={1} fontSize={11} color={AMBAR} fontWeight="600">
                {anticipada
                  ? diasParaSalir === 1
                    ? 'Es para mañana. No lo deje salir hoy: la fecha es parte de lo que se autorizó.'
                    : `Faltan ${diasParaSalir} días. No lo deje salir hoy: la fecha es parte de lo que se autorizó.`
                  : pase.HorarioPropio
                    ? 'Este grupo tiene su propio horario de salida. Fuera de esa franja no puede pasar.'
                    : 'Es el horario general de portería. Fuera de esa franja no puede pasar.'}
              </Text>
            </XStack>
          </YStack>
        ) : (
          /* El pase no está aprobado, o venció: eso manda sobre todo lo demás,
             así que el aviso cambia de tono y de contenido. */
          <XStack alignItems="flex-start" gap="$2.5" backgroundColor="rgba(239, 68, 68, 0.15)"
            borderWidth={1} borderColor="#ef4444" borderRadius="$4"
            paddingHorizontal="$3" paddingVertical="$3" marginBottom="$3">
            <ShieldAlert size={16} color="#ef4444" style={{ marginTop: 1 }} />
            <YStack flex={1} gap={2}>
              <Text fontSize={12} fontWeight="900" color="#ef4444">
                {cerrado ? 'Este pase ya cerró su ciclo'
                  : vencida ? 'Este pase venció'
                    : 'Este pase no puede salir'}
              </Text>
              <Text fontSize={11} color="#ef4444" fontWeight="600">
                {cerrado
                  /* Un escaneo de más no es un error del guardia: puede ser el
                     mismo papel dando vueltas. Se le dice qué pasó y cuándo,
                     para que pueda averiguar en vez de quedarse trabado. */
                  ? [
                      pase.FechaSalidaReal
                        ? `Salió el ${fmtFechaHora(pase.FechaSalidaReal)}${
                            pase.SalidaPorNombre || pase.SalidaPor
                              ? ` (${pase.SalidaPorNombre || pase.SalidaPor})` : ''}`
                        : null,
                      pase.FechaRetorno
                        ? `y regresó el ${fmtFechaHora(pase.FechaRetorno)}${
                            pase.RetornoPorNombre || pase.RetornoPor
                              ? ` (${pase.RetornoPorNombre || pase.RetornoPor})` : ''}`
                        : null,
                    ].filter(Boolean).join(' ') + '. No lo deje pasar de nuevo.'
                  : vencida
                    /* Vencido no es lo mismo que rechazado: el pase estaba bien,
                       lo que se acabó es el plazo. Se dice la fecha para la que
                       era y hasta cuándo se pudo usar, así el solicitante sabe
                       exactamente qué pasó. */
                    ? `Era para el ${fmtFecha(pase.FechaSalida)} y el plazo para usarlo terminó el ${fmtFechaHora(pase.SalidaVence)}${
                        pase.HorasGracia != null ? ` (${pase.HorasGracia} h de margen)` : ''
                      }. El solicitante tiene que crear uno nuevo.`
                    : `Está en "${pase.EstadoNombre || est.label}" y solo puede salir lo que está aprobado. No deje salir nada de este pase.`}
              </Text>
            </YStack>
          </XStack>
        )}

        {/* ── Quién puede retirarlo ──
             Va ANTES de la lista de materiales y no dentro de la ficha del
             pase: es la primera comprobación que hace el guardia —contra la
             persona que tiene enfrente— y si esa falla no hace falta contar
             nada. Solo cuando todavía se puede actuar; en un pase cerrado es
             una instrucción para algo que ya no va a pasar. */}
        {puedeActuar && pase.Responsable ? (
          <YStack gap="$2" backgroundColor={ACCENT_BG} borderWidth={1.5} borderColor={ACCENT}
            borderRadius="$4" paddingHorizontal="$3" paddingVertical="$3" marginBottom="$3">
            <XStack alignItems="center" gap="$2">
              <IdCard size={16} color={ACCENT} />
              <Text flex={1} fontSize={11} fontWeight="900" color={ACCENT}>
                {esRetorno ? 'QUIEN DEBE TRAERLO DE VUELTA' : 'QUIEN PUEDE SACAR EL MATERIAL'}
              </Text>
            </XStack>
            <Text fontSize={20} fontWeight="900" color="$text">{pase.Responsable}</Text>
            <Text fontSize={11} color={ACCENT} fontWeight="700">
              Confirme su identidad antes de dejarlo pasar.
            </Text>
          </YStack>
        ) : null}

        {/* ── Qué sale: lo importante de la pantalla ── */}
        <XStack alignItems="center" gap="$2" paddingHorizontal="$1" paddingBottom="$2">
          <Package size={15} color={theme.primary?.val} />
          <Text flex={1} fontSize="$3" fontWeight="900" color="$text">
            {esRetorno ? 'Qué debe regresar' : 'Qué debe salir'} ({totalLineas})
          </Text>
        </XStack>

        <YStack gap="$2.5">
          {detalle.map((d, i) => (
            <XStack key={d.Id} backgroundColor="$backgroundElevated" borderRadius="$4"
              borderWidth={1} borderColor="$border" padding="$3.5" gap="$3" {...shadows.sm}>

              {/* La cantidad es lo que el guardia compara, así que es lo más
                  grande de la línea y no un dato al final del renglón. */}
              <YStack minWidth={62} alignItems="center" justifyContent="center"
                backgroundColor={ACCENT_BG} borderWidth={1} borderColor={ACCENT}
                borderRadius="$4" paddingHorizontal="$2" paddingVertical="$2.5">
                <Text fontSize={22} fontWeight="900" color={ACCENT} lineHeight={24}>
                  {fmtCantidad(d.Cantidad)}
                </Text>
                <Text fontSize={9} fontWeight="800" color={ACCENT}>
                  {(d.UnidadMedida || 'Unidad').toUpperCase()}
                </Text>
              </YStack>

              <YStack flex={1} gap={3} justifyContent="center">
                {/* La descripción arriba y en grande: es lo que identifica el
                    producto. El material es la categoría. */}
                <Text fontSize={14} fontWeight="800" color="$text">
                  {d.Descripcion || d.Material}
                </Text>
                <Text fontSize={11} color="$textMuted">
                  {d.Material}{d.EsEquipo ? ' · Equipo' : ''}
                </Text>

                {d.Marca || d.Modelo || d.Serie ? (
                  <XStack flexWrap="wrap" gap="$1.5" marginTop={2}>
                    {[
                      d.Marca ? { l: 'Marca', v: d.Marca } : null,
                      d.Modelo ? { l: 'Modelo', v: d.Modelo } : null,
                      d.Serie ? { l: 'Serie', v: d.Serie } : null,
                    ].filter(Boolean).map((f: any) => (
                      <YStack key={f.l} borderWidth={1} borderColor="$border" borderRadius="$3"
                        paddingHorizontal="$2" paddingVertical={3}>
                        <Text fontSize={8} color="$textMuted" fontWeight="700">{f.l.toUpperCase()}</Text>
                        <Text fontSize={11} color="$text" fontWeight="800">{f.v}</Text>
                      </YStack>
                    ))}
                  </XStack>
                ) : null}
              </YStack>

              <Text fontSize={11} color="$textMuted" fontWeight="700" alignSelf="flex-start">
                {i + 1}/{totalLineas}
              </Text>
            </XStack>
          ))}

          {totalLineas === 0 ? (
            <YStack alignItems="center" paddingVertical="$6" gap="$2">
              <Package size={24} color={theme.textMuted?.val} />
              <Text fontSize="$2" color="$textMuted">Este pase no tiene líneas.</Text>
            </YStack>
          ) : null}
        </YStack>
      </ScrollView>

      {/* Footer fijo con las dos salidas del flujo. */}
      <YStack position="absolute" left={0} right={0} bottom={0}
        backgroundColor="$background" borderTopWidth={1} borderTopColor="$border"
        paddingHorizontal="$3" paddingTop="$2.5" paddingBottom="$3" gap="$2">

        {!puedeActuar ? (
          <Text fontSize={10} fontWeight="700" textAlign="center"
            color={soloEsperar ? AMBAR : '#ef4444'}>
            {cerrado
              ? 'Este pase ya cerró su ciclo: no hay nada que registrar.'
              : anticipada
                ? `Vuelva el ${fmtFecha(pase.FechaSalida)} para darle salida.`
                : fueraHorario
                  ? `Solo puede salir entre las ${pase.HoraDesde} y las ${pase.HoraHasta}.`
                  : vencida
                    ? 'El plazo para usar este pase ya terminó.'
                    : 'Solo se puede generar la salida de un pase aprobado.'}
          </Text>
        ) : null}

        <XStack gap="$2.5">
          {/* Cancelar no toca nada: vuelve a la lista y ya. */}
          <View flex={1} onPress={() => navigation.goBack()} pressStyle={{ opacity: 0.85 }}
            borderWidth={1.5} borderColor="$border" borderRadius="$4" height={48}
            alignItems="center" justifyContent="center">
            <Text color="$text" fontWeight="800" fontSize="$3">Cancelar</Text>
          </View>

          {/* Un solo botón que cambia de significado con el estado del pase, en
              vez de dos: el guardia hace lo mismo las dos veces —escanear y
              confirmar— y no tiene que elegir entre salida y regreso.
              Bloqueado en vez de escondido: si desaparece, no sabe si el
              problema es el pase o la app. */}
          <View flex={1}
            onPress={puedeActuar && !registrando ? () => setConfirmando(true) : undefined}
            pressStyle={puedeActuar ? { opacity: 0.85 } : undefined}
            opacity={puedeActuar && !registrando ? 1 : 0.45}
            backgroundColor={puedeActuar ? (esRetorno ? ACCENT : VERDE) : '$border'}
            borderRadius="$4" height={48}
            alignItems="center" justifyContent="center" flexDirection="row" gap="$2">
            {esRetorno ? <RotateCcw size={17} color="#fff" /> : <LogOut size={17} color="#fff" />}
            <Text color="#fff" fontWeight="800" fontSize="$3">
              {esRetorno ? 'Registrar regreso' : 'Generar salida'}
            </Text>
          </View>
        </XStack>
      </YStack>

      {/* La confirmación no es un trámite: es donde se dice QUÉ va a pasar
          después, que es distinto según el tipo y el guardia no lo tiene por qué
          saber de memoria. */}
      <ConfirmDialog
        open={confirmando}
        onOpenChange={(o: boolean) => { if (!o && !registrando) setConfirmando(false) }}
        loading={registrando}
        title={esRetorno ? 'Registrar regreso' : 'Registrar salida'}
        message={esRetorno
          ? `Se registrará el regreso de ${pase.Correlativo} con la hora de este momento.`
          : `Se registrará la salida de ${pase.Correlativo} con la hora de este momento.`}
        extra={
          <YStack gap="$2">
            {/* El nombre se repite acá a propósito: es el último momento antes
                de entregar el material, y es el dato que más fácil se pasa por
                alto cuando hay fila en la puerta. */}
            {pase.Responsable ? (
              <XStack alignItems="center" gap="$2" backgroundColor="$backgroundHover"
                borderRadius="$3" paddingHorizontal="$2.5" paddingVertical="$2">
                <IdCard size={14} color={theme.textMuted?.val} />
                <YStack flex={1}>
                  <Text fontSize={10} color="$textMuted" fontWeight="700">ENTREGAR A</Text>
                  <Text fontSize={14} fontWeight="900" color="$text">{pase.Responsable}</Text>
                </YStack>
              </XStack>
            ) : null}

            <XStack alignItems="flex-start" gap="$2" backgroundColor={ACCENT_BG}
              borderWidth={1} borderColor={ACCENT} borderRadius="$3"
              paddingHorizontal="$2.5" paddingVertical="$2">
              {pase.Retorna
                ? <RotateCcw size={13} color={ACCENT} style={{ marginTop: 1 }} />
                : <LogOut size={13} color={ACCENT} style={{ marginTop: 1 }} />}
              <Text flex={1} fontSize={11} color={ACCENT} fontWeight="700">
                {esRetorno
                  ? 'Con esto el pase queda "Finalizado": salió y ya regresó, no habrá nada más que hacer con él.'
                  : pase.Retorna
                    ? 'Este pase debe regresar: quedará en "Salió", y al volver se escanea otra vez para cerrarlo.'
                    : 'Es una salida definitiva: el pase quedará "Finalizado" y no habrá nada más que hacer con él.'}
              </Text>
            </XStack>
            <Text fontSize={10} color="$textMuted">
              {totalLineas === 1
                ? `Confirme que la línea del pase coincide con lo que está ${esRetorno ? 'regresando' : 'saliendo'}.`
                : `Confirme que las ${totalLineas} líneas del pase coinciden con lo que está ${esRetorno ? 'regresando' : 'saliendo'}.`}
            </Text>
          </YStack>
        }
        confirmLabel={esRetorno ? 'Registrar regreso' : 'Registrar salida'}
        confirmColor={esRetorno ? ACCENT : VERDE}
        onConfirm={registrar}
      />
    </View>
  )
}
