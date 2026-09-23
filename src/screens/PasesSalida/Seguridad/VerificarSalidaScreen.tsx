import React, { useCallback, useEffect, useState } from 'react'
import { ScrollView } from 'react-native'
import { Text, XStack, YStack, View, useTheme } from 'tamagui'
import { useNavigation, useRoute } from '@react-navigation/native'
import {
  ArrowLeft, Package, User, Send, RotateCcw, TriangleAlert, ShieldAlert, LogOut,
  MessageSquare, CalendarClock, IdCard, DoorOpen, ShieldCheck,
} from 'lucide-react-native'
import dayjs from 'dayjs'

import { usePageHeader } from '../../../hooks/usePageHeader'
import { useShowToast } from '../../../utils/useShowToast'
import SkeletonList from '../../../components/Skeletons/SkeletonList'
import ErrorState from '../../AdmSys/ErrorState'
import { AppError, handleError } from '../../../utils/errorHandler'
import { shadows } from '../../../theme/shadows'
import {
  ACCENT, ACCENT_BG, MINUTOS_SALIDA_RECIENTE, estadoVisual, fmtCantidad, fmtFecha,
  fmtFechaHora, haceCuanto, miPorton,
} from '../pasesSalida.helpers'
import { useAuth } from '../../../context/AuthContext'
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
  const { user } = useAuth()

  /* En qué portón está parado ESTE guardia. Sale de su acceso: nadie tiene los
     dos, así que no hay nada que elegir ni que pueda equivocarse. */
  const miPuestoKey = miPorton(user?.Access)


  const id: number = route.params?.id
  const correlativo: string = route.params?.correlativo ?? 'Pase'

  const [pase, setPase] = useState<IPaseSalida | null>(null)
  const [detalle, setDetalle] = useState<IPaseSalidaDetalle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<AppError | null>(null)
  const [registrando, setRegistrando] = useState(false)

  /**
   * Hacia dónde va el material, cuando el sistema no lo puede saber.
   *
   * `null` = todavía no se preguntó. Solo se usa en el caso ambiguo —el pase
   * salió hace poco por el OTRO portón—, y ahí la pregunta va ANTES de mostrar
   * nada: qué pantalla corresponde depende de la respuesta, y enseñar la de
   * regreso a alguien que está viendo material salir es inducirlo al error.
   */
  const [direccion, setDireccion] = useState<'SALE' | 'VUELVE' | null>(null)

  const cargar = useCallback(async () => {
    try {
      const [rPase, rDet] = await Promise.all([
        pasesService.getPase(id),
        pasesService.getDetalle(id),
      ])
      // El SP devuelve una fila; el arreglo trae 0 o 1 elemento.
      const p = rPase.Data?.[0] ?? null
      setPase(p)
      setDetalle(rDet.Data ?? [])
      setError(null)

      /* Presentarse en un portón con un pase que YA SALIÓ es un hecho aunque no
         cambie nada: es el pase que salió por planta y pasa por seguridad. Sin
         este registro no queda ninguna prueba de que cruzó el segundo portón, y
         esa es la pregunta que motivó todo el cambio.

         Best-effort y en silencio: si falla, el guardia igual está viendo el
         pase y puede actuar. Molestarlo con un error por una anotación de
         auditoría sería peor que no tenerla. */
      if (p && ['PSSAL', 'PSFIN', 'PSRET'].includes(p.Estado)) {
        pasesService.registrarCruce(p.Id).catch(() => {})
      }
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
        showToast('success', esRegreso ? 'Regreso registrado' : 'Salida registrada',
          res.SuccessMessage || 'El movimiento quedó registrado')
        navigation.goBack()
      } else {
        // El estado pudo cambiar entre el escaneo y la confirmación: se recarga
        // para que la pantalla deje de ofrecer algo que ya no se puede.
        showToast('error', 'No se pudo registrar', res.ErrorMessage || 'Intente de nuevo')
        await cargar()
      }
    } catch (e: any) {
      showToast('error', 'Error', e?.message || 'No se pudo registrar el movimiento')
    } finally { setRegistrando(false) }
  }

  /**
   * "Va saliendo": el material NO está regresando, solo pasa por este portón
   * camino a la calle. No hay estado que mover — el pase ya salió — pero sí un
   * hecho que dejar anotado.
   *
   * Es un botón y no "no toque nada" a propósito: las dos respuestas a la
   * pregunta tienen que costar lo mismo. Si una fuera una acción y la otra
   * cerrar la pantalla, la de cerrar se elegiría por comodidad y no por lo que
   * el guardia vio.
   */
  const vaSaliendo = async () => {
    if (!pase) return
    /* El cruce ya se anotó al abrir la pantalla; el SP agrupa por minuto, así
       que esta segunda llamada no duplica. Se hace igual para que la anotación
       corresponda a la decisión y no solo a haber mirado. */
    try { await pasesService.registrarCruce(pase.Id) } catch { /* auditoría, no bloquea */ }
    showToast('success', 'Anotado', 'Quedó registrado que el pase pasó por este portón.')
    navigation.goBack()
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

  /* ── El problema de los dos portones ───────────────────────────────────────
     Un pase que salió por planta y camina hacia la salida principal está en
     PSSAL, EXACTAMENTE IGUAL que uno que vuelve de la calle. Ningún dato los
     distingue: mismo estado, misma salida registrada. Así que la pantalla NO
     adivina — afirma el hecho ("ya salió, por acá, hace tanto") y deja que el
     guardia, que es el único que ve hacia dónde camina la persona, decida.

     Lo único que sí se puede calcular es cuán probable es cada caso, y eso
     sirve para poner una red donde el error es caro: registrar un regreso que
     no ocurrió cierra el pase, lo saca de "pendiente de regreso" y nadie vuelve
     a perseguir ese material. */
  const salioPorOtroPorton =
    !!pase.SalidaPuestoKey && !!miPuestoKey && pase.SalidaPuestoKey !== miPuestoKey
  const salidaReciente =
    pase.MinutosDesdeSalida != null && pase.MinutosDesdeSalida < MINUTOS_SALIDA_RECIENTE
  /* Salió hace poco POR EL OTRO PORTÓN: puede estar yendo o viniendo, y ningún
     dato lo dice. Acá se pregunta; en cualquier otro caso no hace falta — un
     pase que salió hace tres días solo puede estar volviendo. */
  const regresoDudoso = esRetorno && salioPorOtroPorton && salidaReciente

  /* Un pase DEFINITIVO no queda en PSSAL: al registrar su salida se cierra en
     PSFIN. Así que cuando pasa por el segundo portón no hay ninguna duda que
     preguntar —no va a volver nunca— pero SÍ está saliendo, y el guardia
     necesita lo mismo: que le digan que ya fue revisado y poder dejar rastro.

     `FechaRetorno` es lo que separa los dos caminos a PSFIN: el definitivo que
     salió no la tiene; el que regresó y se cerró, sí. Sin esa condición, un
     pase que ya volvió y está adentro diría "puede dejar pasar". */
  const salidaDefinitivaEnTransito =
    pase.Estado === 'PSFIN' && !pase.FechaRetorno && !!pase.FechaSalidaReal
    && salioPorOtroPorton && salidaReciente

  /* Modo salida: el material va hacia la calle y acá no se registra ninguna
     salida —ya se registró en el otro portón—. Se llega por dos caminos: el
     pase con retorno cuyo guardia contestó "está saliendo", y el definitivo,
     que no necesita que le pregunten nada. */
  const modoSalida = (regresoDudoso && direccion === 'SALE') || salidaDefinitivaEnTransito

  /* ── LA PREGUNTA, ANTES DE MOSTRAR NADA ───────────────────────────────────
     Se contesta primero porque de la respuesta depende QUÉ pantalla
     corresponde. Mostrar la de regreso —con su botón de "Registrar regreso"—
     a alguien que está viendo material SALIR es ponerle el error a un toque de
     distancia. Y es lo único que el sistema no puede deducir: el guardia ve
     hacia dónde camina la persona, los datos no. */
  if (regresoDudoso && direccion === null) {
    return (
      <View flex={1} backgroundColor="$background" padding="$4" justifyContent="center" gap="$4">
        <YStack alignItems="center" gap="$2">
          <Text fontSize={22} fontWeight="900" color="$text">{pase.Correlativo}</Text>
          <Text fontSize={13} color="$textMuted" textAlign="center">
            {pase.TipoSalida}{pase.EnviadoA ? ` · ${pase.EnviadoA}` : ''}
          </Text>
        </YStack>

        {/* El hecho que permite contestar. Va antes que la pregunta a propósito:
            "hace 12 minutos" es lo que la responde. */}
        <YStack backgroundColor={ACCENT_BG} borderWidth={1.5} borderColor={ACCENT}
          borderRadius="$4" padding="$3.5" gap="$1.5">
          <XStack alignItems="center" gap="$2">
            <DoorOpen size={16} color={ACCENT} />
            <Text flex={1} fontSize={11} fontWeight="900" color={ACCENT}>ESTE PASE YA SALIÓ</Text>
            <Text fontSize={12} fontWeight="900" color={ACCENT}>
              {haceCuanto(pase.MinutosDesdeSalida)}
            </Text>
          </XStack>
          <Text fontSize={14} fontWeight="800" color="$text">
            {fmtFechaHora(pase.FechaSalidaReal)}
            {pase.SalidaPuesto ? ` · ${pase.SalidaPuesto}` : ''}
          </Text>
          {pase.SalidaPorNombre || pase.SalidaPor ? (
            <Text fontSize={11} color="$textMuted">
              Registró: {pase.SalidaPorNombre || pase.SalidaPor}
            </Text>
          ) : null}
        </YStack>

        <Text fontSize={18} fontWeight="900" color="$text" textAlign="center">
          ¿El material está saliendo o regresando?
        </Text>

        {/* Las dos respuestas, del mismo tamaño y en el mismo nivel: ninguna es
            "lo normal" ni se puede elegir por descuido. */}
        <YStack gap="$2.5">
          <View onPress={() => setDireccion('SALE')} pressStyle={{ opacity: 0.85 }}
            backgroundColor={VERDE} borderRadius="$4" paddingVertical="$3.5"
            paddingHorizontal="$4" flexDirection="row" alignItems="center" gap="$3">
            <LogOut size={22} color="#fff" />
            <YStack flex={1} gap={1}>
              <Text color="#fff" fontWeight="900" fontSize={16}>Está saliendo</Text>
              <Text color="#fff" fontSize={11} opacity={0.9}>
                Va camino a la calle. El pase no cambia.
              </Text>
            </YStack>
          </View>

          <View onPress={() => setDireccion('VUELVE')} pressStyle={{ opacity: 0.85 }}
            backgroundColor={ACCENT} borderRadius="$4" paddingVertical="$3.5"
            paddingHorizontal="$4" flexDirection="row" alignItems="center" gap="$3">
            <RotateCcw size={22} color="#fff" />
            <YStack flex={1} gap={1}>
              <Text color="#fff" fontWeight="900" fontSize={16}>Está regresando</Text>
              <Text color="#fff" fontSize={11} opacity={0.9}>
                Vuelve a entrar. Habrá que contar y cerrar el pase.
              </Text>
            </YStack>
          </View>
        </YStack>

        <View onPress={() => navigation.goBack()} pressStyle={{ opacity: 0.85 }}
          borderWidth={1.5} borderColor="$border" borderRadius="$4" height={48}
          alignItems="center" justifyContent="center">
          <Text color="$text" fontWeight="800" fontSize="$3">Cancelar</Text>
        </View>
      </View>
    )
  }

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

        {/* ── Modo salida: ya lo revisaron en el otro portón ──
             Acá NO se pide contar de nuevo. El pase pasó por el portón donde se
             registró la salida y ahí se verificó; repetir la instrucción haría
             que el guardia desconfíe de un control que ya se hizo, y que la
             fila avance más lento por nada. */}
        {modoSalida ? (
          <XStack alignItems="flex-start" gap="$2.5" backgroundColor="rgba(34, 197, 94, 0.15)"
            borderWidth={1.5} borderColor={VERDE} borderRadius="$4"
            paddingHorizontal="$3" paddingVertical="$3" marginBottom="$3">
            <ShieldCheck size={18} color={VERDE} style={{ marginTop: 1 }} />
            <YStack flex={1} gap={2}>
              <Text fontSize={13} fontWeight="900" color={VERDE}>
                Ya fue revisado{pase.SalidaPuesto ? ` en ${pase.SalidaPuesto}` : ''}
              </Text>
              <Text fontSize={12} color={VERDE} fontWeight="600">
                Puede dejar pasar sin problemas.
              </Text>
            </YStack>
          </XStack>
        ) : puedeActuar ? (
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
        {(puedeActuar || modoSalida) && pase.Responsable ? (
          <YStack gap="$2" backgroundColor={ACCENT_BG} borderWidth={1.5} borderColor={ACCENT}
            borderRadius="$4" paddingHorizontal="$3" paddingVertical="$3" marginBottom="$3">
            <XStack alignItems="center" gap="$2">
              <IdCard size={16} color={ACCENT} />
              <Text flex={1} fontSize={11} fontWeight="900" color={ACCENT}>
                {esRetorno && !modoSalida ? 'QUIEN DEBE TRAERLO DE VUELTA' : 'QUIEN PUEDE SACAR EL MATERIAL'}
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
            {modoSalida ? 'Qué lleva'
              : esRetorno ? 'Qué debe regresar'
                : 'Qué debe salir'} ({totalLineas})
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

        {!puedeActuar && !modoSalida ? (
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

        {/* Qué va a pasar al tocar el botón. Vivía dentro del diálogo de
            confirmación; al quitarlo se sube acá, porque es lo único que ese
            diálogo decía y la pantalla no: el guardia no tiene por qué saber de
            memoria si este pase queda abierto esperando el regreso o si se
            cierra para siempre.

            Con duda de portón NO se muestra: el bloque de la pregunta ya dice
            qué pasa con cada respuesta, y repetirlo justo encima de los botones
            solo agrega ruido donde hay que decidir. */}
        {puedeActuar && !regresoDudoso ? (
          <XStack alignItems="flex-start" gap="$2" marginBottom="$2"
            backgroundColor={ACCENT_BG} borderWidth={1} borderColor={ACCENT}
            borderRadius="$3" paddingHorizontal="$2.5" paddingVertical="$2">
            {pase.Retorna
              ? <RotateCcw size={13} color={ACCENT} style={{ marginTop: 1 }} />
              : <LogOut size={13} color={ACCENT} style={{ marginTop: 1 }} />}
            <Text flex={1} fontSize={11} color={ACCENT} fontWeight="700">
              {esRetorno
                ? 'Al registrarlo el pase queda "Finalizado": salió y ya regresó, no habrá nada más que hacer con él.'
                : pase.Retorna
                  ? 'Este pase debe regresar: quedará en "Salió", y al volver se escanea otra vez para cerrarlo.'
                  : 'Es una salida definitiva: el pase quedará "Finalizado" y no habrá nada más que hacer con él.'}
            </Text>
          </XStack>
        ) : null}

        {/* En modo salida NO hay nada que registrar: el pase ya salió por el
            otro portón. El botón solo deja constancia de que pasó por acá y
            cierra — por eso dice "dejar pasar" y no "registrar". */}
        {modoSalida ? (
          <XStack gap="$2.5">
            {/* "Volver" solo tiene sentido si hubo una pregunta que rehacer.
                En el pase definitivo no la hubo, así que es "Cancelar". */}
            <View flex={1}
              onPress={regresoDudoso ? () => setDireccion(null) : () => navigation.goBack()}
              pressStyle={{ opacity: 0.85 }}
              borderWidth={1.5} borderColor="$border" borderRadius="$4" height={48}
              alignItems="center" justifyContent="center">
              <Text color="$text" fontWeight="800" fontSize="$3">
                {regresoDudoso ? 'Volver' : 'Cancelar'}
              </Text>
            </View>

            <View flex={1} onPress={registrando ? undefined : vaSaliendo}
              pressStyle={{ opacity: 0.85 }} opacity={registrando ? 0.6 : 1}
              backgroundColor={VERDE} borderRadius="$4" height={48}
              alignItems="center" justifyContent="center" flexDirection="row" gap="$2">
              <LogOut size={17} color="#fff" />
              <Text color="#fff" fontWeight="800" fontSize="$3">Dejar pasar</Text>
            </View>
          </XStack>
        ) : (
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
            onPress={puedeActuar && !registrando ? registrar : undefined}
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
        )}
      </YStack>

    </View>
  )
}
