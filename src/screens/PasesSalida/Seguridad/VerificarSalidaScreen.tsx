import React, { useCallback, useEffect, useState } from 'react'
import { ScrollView } from 'react-native'
import { Text, XStack, YStack, View, Input, useTheme } from 'tamagui'
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

  /**
   * Cuánto está volviendo de cada línea AHORA, tecleado por el guardia.
   *
   * Clave = Id de la línea, valor = lo que escribió, como texto. Se guarda como
   * texto y no como número porque viene de un input: convertirlo en cada tecla
   * haría que borrar el último dígito deje un 0 pegado que hay que borrar
   * aparte.
   *
   * Solo se usa en los pases que admiten regreso parcial. Lo que no está en el
   * mapa no viaja: no hace falta mandar ceros.
   */
  const [vueltas, setVueltas] = useState<Record<number, string>>({})

  /**
   * Si lo que trae es la MISMA entrega que ya se registró en el otro portón, o
   * unas unidades nuevas.
   *
   * `null` = todavía no se preguntó. Mismo criterio que `direccion`: la pregunta
   * va ANTES de mostrar las cantidades, porque enseñarle los campos a alguien
   * que está viendo pasar material ya contado es ponerle el doble conteo a un
   * toque de distancia.
   */
  const [entregaMisma, setEntregaMisma] = useState<'MISMO' | 'OTRAS' | null>(null)

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
  /**
   * Escribe lo que el guardia teclea, sin dejarlo pasar del máximo.
   *
   * Se corrige al vuelo en vez de rebotar al guardar: el error se ve en el
   * momento en que se comete y sobre la línea que lo tiene, no tres pantallas
   * después y sin saber cuál de ocho fue.
   *
   * Se recorta al máximo en lugar de borrar lo escrito porque ese máximo es casi
   * siempre lo que quiso poner — un 30 donde iban 3 es un dedo de más, no otra
   * intención.
   *
   * El servidor lo vuelve a validar igual: esto es comodidad, no el control.
   */
  const escribirVuelta = (detalleId: number, max: number, texto: string) => {
    const n = Number(texto.replace(',', '.'))
    if (Number.isFinite(n) && n > max) {
      showToast('warning', 'No puede volver más de lo que falta',
        `De esta línea solo faltan ${fmtCantidad(max)}.`)
      setVueltas(prev => ({ ...prev, [detalleId]: String(max) }))
      return
    }
    /* Se guarda el texto CRUDO y no el número: convertirlo en cada tecla haría
       que "2." se vuelva "2" y no se pueda escribir "2.5". */
    setVueltas(prev => ({ ...prev, [detalleId]: texto }))
  }

  /**
   * Registra lo que el guardia tecleó línea por línea.
   *
   * Solo viajan las líneas con un número mayor que cero: las que no traen nada
   * hoy simplemente no se mandan. El servidor decide si con esto se completa el
   * pase —y lo cierra— o si queda en Regreso parcial.
   *
   * No se valida acá que no se devuelva de más: el SP lo hace con el saldo real
   * y con el nombre del material en el mensaje. Repetir la cuenta en el cliente
   * daría dos verdades el día que una se quede vieja.
   */
  const registrarLoQueVuelve = async () => {
    if (!pase) return
    const lineas = Object.entries(vueltas)
      .map(([id, txt]) => ({ Detalle_Id: Number(id), Cantidad: Number(txt.replace(',', '.')) }))
      .filter(l => Number.isFinite(l.Cantidad) && l.Cantidad > 0)

    if (!lineas.length) {
      showToast('warning', 'Sin cantidades', 'Escriba cuánto está regresando de cada línea.')
      return
    }

    setRegistrando(true)
    try {
      const res = await pasesService.registrarRetornoParcial(pase.Id, lineas)
      if (res.Success) {
        showToast(
          'success',
          res.Estado === 'PSFIN' ? 'Regreso completo' : 'Regreso parcial registrado',
          res.SuccessMessage || 'El movimiento quedó registrado',
        )
        navigation.goBack()
      } else {
        showToast('error', 'No se pudo registrar', res.ErrorMessage || 'Intente de nuevo')
        setVueltas({})
        await cargar()
      }
    } catch (e: any) {
      showToast('error', 'Error', e?.message || 'No se pudo registrar el movimiento')
    } finally { setRegistrando(false) }
  }

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
    /* PASO y no VERIFICO: acá el guardia DECIDIÓ que el material cruza por este
       portón, y eso es un hecho distinto de haber abierto la pantalla.

       La diferencia no es solo de auditoría: es lo que hace que la próxima vez
       que este pase se escanee acá ya no se pregunte si sale o regresa — ya
       cruzó por este portón saliendo, así que solo puede estar volviendo. */
    try { await pasesService.registrarCruce(pase.Id, 'PASO') } catch { /* auditoría, no bloquea */ }
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
  /* PSREPA cuenta como "afuera": devolvió una parte y sigue debiendo el resto,
     así que este escaneo también es un regreso. */
  const esRetorno = pase.Estado === 'PSSAL' || pase.Estado === 'PSREPA'

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

  /* ¿Este pase YA cruzó por MI portón saliendo?
     Si ya cruzó, la duda desaparece: el material salió por acá, así que si está
     de vuelta frente a mí solo puede estar entrando.

     Cuenta el portón donde se registró la salida y aquellos donde un guardia
     confirmó el paso con "Dejar pasar". NO cuenta haber abierto la pantalla:
     eso pasa JUSTO ANTES de contestar la pregunta, y usarlo como señal haría
     que la pregunta se tapara a sí misma en el primer escaneo. */
  const yaCruzoMiPorton =
    !!miPuestoKey
    && (pase.PuestosCruzadosSalida ?? '').split(',').map(s => s.trim()).includes(miPuestoKey)

  /* Salió hace poco POR EL OTRO PORTÓN y todavía no pasó por el mío: puede estar
     yendo o viniendo, y ningún dato lo dice. Solo ahí se pregunta.

     En cualquier otro caso no hace falta: un pase que salió hace tres días solo
     puede estar volviendo, y uno que ya cruzó por acá también. */
  const regresoDudoso =
    esRetorno && salioPorOtroPorton && salidaReciente && !yaCruzoMiPorton

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

  /* ── El mismo problema, en el camino de vuelta ─────────────────────────────
     El regreso recorre la ida al revés: calle -> portón 2 -> portón 1 -> planta.
     El material se registra en el PRIMER portón que encuentra volviendo, el
     pase queda cerrado, y después sigue caminando hasta el otro.

     Ahí el guardia escanea un pase cerrado. Hasta ahora eso era un callejón sin
     salida —"ya cerró su ciclo", sin nada que hacer— y no quedaba ninguna prueba
     de que el material entró a planta.

     ACÁ NO SE PREGUNTA NADA, a diferencia de la salida. Un pase que ya registró
     su retorno está cerrado: no puede estar saliendo otra vez, así que no hay
     ambigüedad que resolver. Se afirma el hecho y se ofrece dejar constancia.

     Las tres condiciones son las gemelas de las de la salida: que haya vuelto,
     que haya vuelto por el OTRO portón, y que haya sido hace poco — si volvió la
     semana pasada, este pase es historia y no hay ningún tránsito en curso. */
  const volvioPorOtroPorton =
    !!pase.RetornoPuestoKey && !!miPuestoKey && pase.RetornoPuestoKey !== miPuestoKey
  const regresoReciente =
    pase.MinutosDesdeRetorno != null && pase.MinutosDesdeRetorno < MINUTOS_SALIDA_RECIENTE

  /* ¿El material que volvió ya pasó por MI portón?
     Se calcula acá arriba porque lo usan dos cosas: el tránsito de vuelta y el
     "ya ingresó completo". La ventana la resuelve el servidor —arranca en la
     última entrega parcial o, si no hubo, en la fecha de retorno— así que sirve
     igual para el que volvió de a poco y para el que volvió de una vez. */
  const yaCruzoEstaEntrega =
    !!miPuestoKey
    && (pase.PuestosCruzadosRetorno ?? '').split(',').map(s => s.trim()).includes(miPuestoKey)

  /* Todavía va caminando entre portones. Si ya cruzó por el mío, el recorrido
     terminó y corresponde otro mensaje: ya está adentro. */
  const regresoEnTransito =
    cerrado && !!pase.FechaRetorno && volvioPorOtroPorton && regresoReciente
    && !yaCruzoEstaEntrega

  /* Volvió completo y el recorrido terminó. No hay nada que hacer, pero sí algo
     que DECIR: el material está en la empresa. "Ya cerró su ciclo" era cierto y
     mudo — no distinguía un préstamo que volvió de una venta que se fue. */
  const ingresoCompleto = cerrado && !!pase.FechaRetorno && !regresoEnTransito

  /* ── Regreso por partes ────────────────────────────────────────────────────
     El pase entra por acá cuando alguna de sus líneas quedó marcada como
     "puede regresar por partes". Entonces el guardia no toca un botón de todo o
     nada: escribe cuánto trae de cada línea.

     Se ofrece aunque el pase esté en PSSAL y sea la primera entrega — puede que
     vuelva todo de una vez, y en ese caso el pase se cierra igual. Y se ofrece
     también en PSREPA, que es la segunda entrega en adelante.

     Las líneas sin cantidad (Camión) no entran: no hay número que descontar, y
     partir un camión en pedazos no significa nada. */
  /* `PSREPA` entra siempre, aunque ninguna línea tenga ya la marca: el
     solicitante puede quitársela a lo que todavía no vuelve, y sin esta
     condición el pase caería en el botón de todo o nada — que exige PSSAL y lo
     rebotaría sin dejar ninguna salida. */
  const admiteParcial =
    esRetorno && (pase.Estado === 'PSREPA' || detalle.some(d => d.RegresoParcial === true))

  /* ── La entrega parcial que viene caminando ────────────────────────────────
     Entrando, los portones se cruzan al revés que saliendo: primero la salida
     principal, después planta. Así que una entrega registrada en uno se va a
     presentar en el otro minutos después.

     Y ahí los dos casos se ven IGUAL en los datos: puede ser el mismo material
     que acaban de registrar yendo a bodega, o unas unidades nuevas que llegaron
     después. Un pase en Regreso parcial con saldo pendiente admite las dos.

     Igual que en la salida, quien puede contestar es el guardia — él ve de
     dónde viene la persona. Y para contestar necesita el hecho: qué se
     registró, cuánto y hace cuánto. */
  const entregaEnOtroPorton =
    !!pase.UltimoRetornoPuestoKey && !!miPuestoKey
    && pase.UltimoRetornoPuestoKey !== miPuestoKey
  const entregaReciente =
    pase.MinutosDesdeUltimoRetorno != null
    && pase.MinutosDesdeUltimoRetorno < MINUTOS_SALIDA_RECIENTE
  const entregaDudosa =
    admiteParcial && entregaEnOtroPorton && entregaReciente && !yaCruzoEstaEntrega

  /* Contestó que es el mismo material: no hay nada que registrar, solo dejarlo
     pasar y anotar el cruce — igual que en la salida. */
  const entregaEsLaMisma = entregaDudosa && entregaMisma === 'MISMO'

  /* Los tres tránsitos comparten todo lo que importa: acá no se registra nada,
     el movimiento ya se registró en el otro portón, y lo único que queda es
     dejar pasar y anotar que cruzó. Lo que cambia es hacia dónde va y qué se
     registró antes, y eso solo afecta las palabras. */
  const modoTransito = modoSalida || regresoEnTransito || entregaEsLaMisma
  const modoParcial = admiteParcial && !modoTransito

  /* Lo que el guardia lleva tecleado, para el resumen del pie. */
  const totalTecleado = Object.values(vueltas)
    .map(t => Number(t.replace(',', '.')))
    .filter(n => Number.isFinite(n) && n > 0)
    .length

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

  /* ── LA MISMA PREGUNTA, EN EL CAMINO DE VUELTA ────────────────────────────
     Una entrega parcial se registró en un portón y el material se presenta en
     el otro minutos después. Puede ser lo mismo yendo a bodega, o unidades
     nuevas que llegaron atrás. Los datos no los separan.

     Se pregunta ANTES de mostrar las cantidades por la misma razón que en la
     salida: enseñarle los campos a alguien que está viendo pasar material ya
     contado es ponerle el doble conteo a un toque de distancia. Y el doble
     conteo no se nota — el saldo baja y nadie vuelve a buscar lo que falta. */
  if (entregaDudosa && entregaMisma === null) {
    return (
      <View flex={1} backgroundColor="$background" padding="$4" justifyContent="center" gap="$4">
        <YStack alignItems="center" gap="$2">
          <Text fontSize={22} fontWeight="900" color="$text">{pase.Correlativo}</Text>
          <Text fontSize={13} color="$textMuted" textAlign="center">
            {pase.TipoSalida}{pase.EnviadoA ? ` · ${pase.EnviadoA}` : ''}
          </Text>
        </YStack>

        {/* El hecho que permite contestar: QUÉ se registró, no solo cuándo. El
            guardia compara ese resumen contra las cajas que tiene enfrente y la
            pregunta se contesta sola. */}
        <YStack backgroundColor={ACCENT_BG} borderWidth={1.5} borderColor={ACCENT}
          borderRadius="$4" padding="$3.5" gap="$1.5">
          <XStack alignItems="center" gap="$2">
            <RotateCcw size={16} color={ACCENT} />
            <Text flex={1} fontSize={11} fontWeight="900" color={ACCENT}>
              YA SE REGISTRÓ UN REGRESO
            </Text>
            <Text fontSize={12} fontWeight="900" color={ACCENT}>
              {haceCuanto(pase.MinutosDesdeUltimoRetorno)}
            </Text>
          </XStack>
          {pase.UltimoRetornoResumen ? (
            <Text fontSize={16} fontWeight="900" color="$text">
              {pase.UltimoRetornoResumen}
            </Text>
          ) : null}
          <Text fontSize={12} color="$textMuted">
            {fmtFechaHora(pase.UltimoRetornoFecha)}
            {pase.UltimoRetornoPuesto ? ` · ${pase.UltimoRetornoPuesto}` : ''}
          </Text>
        </YStack>

        <Text fontSize={18} fontWeight="900" color="$text" textAlign="center">
          ¿Es ese mismo material, o son otras unidades?
        </Text>

        {/* Las dos respuestas, del mismo tamaño y en el mismo nivel: ninguna es
            "lo normal" ni se puede elegir por descuido. */}
        <YStack gap="$2.5">
          <View onPress={() => setEntregaMisma('MISMO')} pressStyle={{ opacity: 0.85 }}
            backgroundColor={VERDE} borderRadius="$4" paddingVertical="$3.5"
            paddingHorizontal="$4" flexDirection="row" alignItems="center" gap="$3">
            <ShieldCheck size={22} color="#fff" />
            <YStack flex={1} gap={1}>
              <Text color="#fff" fontWeight="900" fontSize={16}>Es el mismo</Text>
              <Text color="#fff" fontSize={11} opacity={0.9}>
                Ya lo contaron en el otro portón. No se registra nada.
              </Text>
            </YStack>
          </View>

          <View onPress={() => setEntregaMisma('OTRAS')} pressStyle={{ opacity: 0.85 }}
            backgroundColor={ACCENT} borderRadius="$4" paddingVertical="$3.5"
            paddingHorizontal="$4" flexDirection="row" alignItems="center" gap="$3">
            <Package size={22} color="#fff" />
            <YStack flex={1} gap={1}>
              <Text color="#fff" fontWeight="900" fontSize={16}>Son otras unidades</Text>
              <Text color="#fff" fontSize={11} opacity={0.9}>
                Llegaron aparte. Hay que contarlas y registrarlas.
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
        {modoTransito ? (
          <XStack alignItems="flex-start" gap="$2.5" backgroundColor="rgba(34, 197, 94, 0.15)"
            borderWidth={1.5} borderColor={VERDE} borderRadius="$4"
            paddingHorizontal="$3" paddingVertical="$3" marginBottom="$3">
            <ShieldCheck size={18} color={VERDE} style={{ marginTop: 1 }} />
            <YStack flex={1} gap={2}>
              <Text fontSize={13} fontWeight="900" color={VERDE}>
                {entregaEsLaMisma
                  ? `Ya se contó${pase.UltimoRetornoPuesto ? ` en ${pase.UltimoRetornoPuesto}` : ''}`
                  : regresoEnTransito
                    ? `Ya regresó${pase.RetornoPuesto ? ` por ${pase.RetornoPuesto}` : ''}`
                    : `Ya fue revisado${pase.SalidaPuesto ? ` en ${pase.SalidaPuesto}` : ''}`}
              </Text>
              <Text fontSize={12} color={VERDE} fontWeight="600">
                {entregaEsLaMisma && pase.UltimoRetornoResumen
                  ? `${pase.UltimoRetornoResumen}. Puede dejar pasar sin problemas.`
                  : 'Puede dejar pasar sin problemas.'}
              </Text>
            </YStack>
          </XStack>
        ) : ingresoCompleto ? (
          /* Volvió completo y ya terminó su recorrido por los portones. No hay
             nada que hacer, pero sí algo que decir: dónde está el material.
             Verde y no gris — esto es un final bueno, no un pase inservible. */
          <XStack alignItems="flex-start" gap="$2.5" backgroundColor="rgba(34, 197, 94, 0.15)"
            borderWidth={1.5} borderColor={VERDE} borderRadius="$4"
            paddingHorizontal="$3" paddingVertical="$3" marginBottom="$3">
            <ShieldCheck size={18} color={VERDE} style={{ marginTop: 1 }} />
            <YStack flex={1} gap={2}>
              <Text fontSize={13} fontWeight="900" color={VERDE}>
                Este pase ya ingresó completo
              </Text>
              <Text fontSize={12} color={VERDE} fontWeight="600">
                El material está en la empresa. No hay nada pendiente.
              </Text>
              <Text fontSize={11} color={VERDE} opacity={0.85}>
                Regresó {fmtFechaHora(pase.FechaRetorno)}
                {pase.RetornoPuesto ? ` · ${pase.RetornoPuesto}` : ''}
                {pase.RetornoPorNombre || pase.RetornoPor
                  ? ` · recibió ${pase.RetornoPorNombre || pase.RetornoPor}` : ''}
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
                    : 'Es el horario general de seguridad. Fuera de esa franja no puede pasar.'}
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
        {(puedeActuar || modoTransito) && pase.Responsable ? (
          <YStack gap="$2" backgroundColor={ACCENT_BG} borderWidth={1.5} borderColor={ACCENT}
            borderRadius="$4" paddingHorizontal="$3" paddingVertical="$3" marginBottom="$3">
            <XStack alignItems="center" gap="$2">
              <IdCard size={16} color={ACCENT} />
              <Text flex={1} fontSize={11} fontWeight="900" color={ACCENT}>
                {regresoEnTransito ? 'QUIEN LO TRAE DE VUELTA'
                  : esRetorno && !modoSalida ? 'QUIEN DEBE TRAERLO DE VUELTA'
                    : 'QUIEN PUEDE SACAR EL MATERIAL'}
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
            {regresoEnTransito ? 'Qué trae de vuelta'
              : modoSalida ? 'Qué lleva'
                : esRetorno ? 'Qué debe regresar'
                  : 'Qué debe salir'} ({totalLineas})
          </Text>
        </XStack>

        {/* ── Regresó todo ──
             El caso más común es que vuelva completo, y hacerlo línea por línea
             en un pase de ocho materiales es ocho veces la misma decisión. Este
             botón llena todo lo que falta de una vez; después el guardia corrige
             la línea que no cuadre, que es mucho menos trabajo que al revés.

             "Limpiar" al lado y no un diálogo: si se equivocó al tocarlo, tiene
             que poder deshacerlo con el mismo esfuerzo con que lo hizo. */}
        {modoParcial ? (
          <XStack gap="$2" paddingBottom="$2.5">
            <View flex={1} onPress={() => {
              const todo: Record<number, string> = {}
              for (const d of detalle) {
                const f = d.CantidadPendiente ?? d.Cantidad
                if (d.Cantidad != null && (f ?? 0) > 0) todo[d.Id] = String(f)
              }
              setVueltas(todo)
            }} pressStyle={{ opacity: 0.8 }}
              backgroundColor={ACCENT_BG} borderWidth={1.5} borderColor={ACCENT}
              borderRadius="$4" height={42} alignItems="center" justifyContent="center"
              flexDirection="row" gap="$2">
              <RotateCcw size={15} color={ACCENT} />
              <Text fontSize={12} fontWeight="900" color={ACCENT}>Regresó todo</Text>
            </View>

            {totalTecleado > 0 ? (
              <View onPress={() => setVueltas({})} pressStyle={{ opacity: 0.8 }}
                borderWidth={1.5} borderColor="$border" borderRadius="$4" height={42}
                paddingHorizontal="$3.5" alignItems="center" justifyContent="center">
                <Text fontSize={12} fontWeight="800" color="$textMuted">Limpiar</Text>
              </View>
            ) : null}
          </XStack>
        ) : null}

        <YStack gap="$2.5">
          {detalle.map((d, i) => {
            const yaVolvio = d.CantidadRetornada ?? 0
            /* Lo que el guardia todavía puede recibir. Viene calculado del
               servidor: es el número que decide si el pase se cierra, y no
               puede depender de que dos clientes redondeen igual. */
            const falta = d.CantidadPendiente ?? d.Cantidad
            /* Se puede teclear si el pase admite parcial, la línea tiene
               cantidad y todavía falta algo. Una línea ya completa no se toca:
               ofrecer un campo ahí es ofrecer devolver de más. */
            const puedeTeclear = modoParcial && d.Cantidad != null && (falta ?? 0) > 0
            /* En modo parcial el número grande es lo que FALTA, no lo que salió:
               es contra eso que el guardia cuenta lo que tiene enfrente. */
            const numeroGrande = modoParcial ? falta : d.Cantidad

            return (
            <YStack key={d.Id} backgroundColor="$backgroundElevated" borderRadius="$4"
              borderWidth={1} borderColor="$border" padding="$3.5" gap="$2.5" {...shadows.sm}>
            <XStack gap="$3">

              {/* La cantidad es lo que el guardia compara, así que es lo más
                  grande de la línea y no un dato al final del renglón.

                  Cuando lo que sale es un camión no hay cantidad que comparar, y
                  el guardia tiene que saber que eso es la regla y no un dato que
                  se perdió: se dice con todas las letras en vez de dejar el
                  recuadro vacío o inventar un «1». */}
              {d.Cantidad == null ? (
                <YStack minWidth={62} maxWidth={72} alignItems="center" justifyContent="center"
                  borderWidth={1} borderColor="$border"
                  borderRadius="$4" paddingHorizontal="$2" paddingVertical="$2.5">
                  <Text fontSize={11} fontWeight="900" color="$textMuted" textAlign="center">
                    CAMIÓN
                  </Text>
                </YStack>
              ) : (
                <YStack minWidth={62} alignItems="center" justifyContent="center"
                  backgroundColor={(falta ?? 0) > 0 ? ACCENT_BG : 'rgba(34, 197, 94, 0.15)'}
                  borderWidth={1} borderColor={(falta ?? 0) > 0 ? ACCENT : VERDE}
                  borderRadius="$4" paddingHorizontal="$2" paddingVertical="$2.5">
                  <Text fontSize={22} fontWeight="900" lineHeight={24}
                    color={(falta ?? 0) > 0 ? ACCENT : VERDE}>
                    {fmtCantidad(numeroGrande)}
                  </Text>
                  <Text fontSize={9} fontWeight="800"
                    color={(falta ?? 0) > 0 ? ACCENT : VERDE}>
                    {(d.UnidadMedida || 'Unidad').toUpperCase()}
                  </Text>
                </YStack>
              )}

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

            {/* ── Cuánto está volviendo ──
                 Solo en los pases que admiten regreso parcial. El campo va
                 DEBAJO y no al lado del número: el guardia primero cuenta lo
                 que tiene enfrente y después lo escribe, y ponerlos a la par
                 invita a copiar el número de arriba sin contar.

                 La línea ya completa no muestra campo sino el visto: ofrecer
                 dónde escribir en algo que ya volvió es ofrecer devolver de
                 más. */}
            {modoParcial && d.Cantidad != null ? (
              (falta ?? 0) > 0 ? (
                <XStack alignItems="center" gap="$2.5" borderTopWidth={1}
                  borderTopColor="$border" paddingTop="$2.5">
                  <YStack flex={1} gap={1}>
                    <Text fontSize={11} fontWeight="800" color="$text">
                      {puedeTeclear ? '¿Cuánto regresa ahora?' : 'Falta que regrese'}
                    </Text>
                    <Text fontSize={10} color="$textMuted">
                      Salió {fmtCantidad(d.Cantidad)}
                      {yaVolvio > 0 ? ` · ya volvieron ${fmtCantidad(yaVolvio)}` : ''}
                      {d.RegresoParcial === true ? '' : ' · debe volver completo'}
                    </Text>
                  </YStack>

                  {/* Atajo para el caso más común: vuelve todo lo que falta.
                      Ahorra teclear, y sobre todo ahorra equivocarse al teclear
                      un número que el sistema ya sabe. */}
                  <View
                    onPress={() => setVueltas(prev => ({ ...prev, [d.Id]: String(falta) }))}
                    pressStyle={{ opacity: 0.7 }} hitSlop={6}
                    borderWidth={1.5} borderColor={ACCENT} borderRadius="$3"
                    paddingHorizontal="$2.5" height={44} justifyContent="center">
                    <Text fontSize={11} fontWeight="900" color={ACCENT}>Todo</Text>
                  </View>

                  {/* color y placeholderTextColor explícitos: sin ellos, con el
                      backgroundColor forzado el texto tecleado quedaba del color
                      del tema claro y en oscuro no se leía. */}
                  <Input
                    width={82}
                    height={44}
                    textAlign="center"
                    fontSize={18}
                    fontWeight="900"
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={theme.textMuted?.val}
                    color="$text"
                    borderWidth={1.5}
                    borderColor={vueltas[d.Id] ? ACCENT : '$border'}
                    backgroundColor="$backgroundPage"
                    value={vueltas[d.Id] ?? ''}
                    onChangeText={(v: string) => escribirVuelta(d.Id, falta ?? 0, v)}
                  />
                </XStack>
              ) : (
                <XStack alignItems="center" gap="$2" borderTopWidth={1}
                  borderTopColor="$border" paddingTop="$2.5">
                  <ShieldCheck size={14} color={VERDE} />
                  <Text flex={1} fontSize={11} fontWeight="800" color={VERDE}>
                    Ya regresó completo
                  </Text>
                </XStack>
              )
            ) : null}
            </YStack>
            )
          })}

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

        {!puedeActuar && !modoTransito ? (
          <Text fontSize={10} fontWeight="700" textAlign="center"
            color={soloEsperar ? AMBAR : '#ef4444'}>
            {ingresoCompleto
              ? 'El material ya está adentro: no hay nada que registrar.'
              : cerrado
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
              {/* Con regreso por partes no se puede prometer que el pase cierra:
                  depende de lo que el guardia escriba. Decir "quedará
                  Finalizado" y que después quede abierto es peor que no decir
                  nada. */}
              {modoParcial
                ? 'Escriba cuánto regresa de cada línea. Si vuelve todo, el pase se cierra; si falta algo, queda en "Regreso parcial" y sigue pendiente.'
                : esRetorno
                  ? 'Al registrarlo el pase queda "Finalizado": salió y ya regresó, no habrá nada más que hacer con él.'
                  : pase.Retorna
                    ? 'Este pase debe regresar: quedará en "Salió", y al volver se escanea otra vez para cerrarlo.'
                    : 'Es una salida definitiva: el pase quedará "Finalizado" y no habrá nada más que hacer con él.'}
            </Text>
          </XStack>
        ) : null}

        {/* En tránsito NO hay nada que registrar: el movimiento ya se registró
            en el otro portón, sea la salida o el regreso. El botón solo deja
            constancia de que pasó por acá y cierra — por eso dice "dejar pasar"
            y no "registrar". */}
        {modoTransito ? (
          <XStack gap="$2.5">
            {/* "Volver" solo tiene sentido si hubo una pregunta que rehacer.
                Ni el pase definitivo ni el que ya regresó la tuvieron, así que
                para ellos es "Cancelar". */}
            <View flex={1}
              onPress={regresoDudoso ? () => setDireccion(null)
                : entregaEsLaMisma ? () => setEntregaMisma(null)
                  : () => navigation.goBack()}
              pressStyle={{ opacity: 0.85 }}
              borderWidth={1.5} borderColor="$border" borderRadius="$4" height={48}
              alignItems="center" justifyContent="center">
              <Text color="$text" fontWeight="800" fontSize="$3">
                {regresoDudoso || entregaEsLaMisma ? 'Volver' : 'Cancelar'}
              </Text>
            </View>

            <View flex={1} onPress={registrando ? undefined : vaSaliendo}
              pressStyle={{ opacity: 0.85 }} opacity={registrando ? 0.6 : 1}
              backgroundColor={VERDE} borderRadius="$4" height={48}
              alignItems="center" justifyContent="center" flexDirection="row" gap="$2">
              {regresoEnTransito
                ? <RotateCcw size={17} color="#fff" />
                : <LogOut size={17} color="#fff" />}
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
              problema es el pase o la app.

              En regreso por partes va al SP de cantidades y no al de todo o
              nada, y además exige haber tecleado algo: sin número no hay nada
              que registrar, y dejarlo activo solo produciría un error. */}
          <View flex={1}
            onPress={puedeActuar && !registrando && (!modoParcial || totalTecleado > 0)
              ? (modoParcial ? registrarLoQueVuelve : registrar)
              : undefined}
            pressStyle={puedeActuar ? { opacity: 0.85 } : undefined}
            opacity={puedeActuar && !registrando && (!modoParcial || totalTecleado > 0) ? 1 : 0.45}
            backgroundColor={puedeActuar ? (esRetorno ? ACCENT : VERDE) : '$border'}
            borderRadius="$4" height={48}
            alignItems="center" justifyContent="center" flexDirection="row" gap="$2">
            {esRetorno ? <RotateCcw size={17} color="#fff" /> : <LogOut size={17} color="#fff" />}
            {/* Corto a propósito: el botón comparte fila con "Cancelar" y con
                un texto largo el renglón se parte. Qué se está registrando ya lo
                dice toda la pantalla de arriba. */}
            <Text color="#fff" fontWeight="800" fontSize="$3">
              {modoParcial ? 'Registrar'
                : esRetorno ? 'Registrar regreso'
                  : 'Generar salida'}
            </Text>
          </View>
        </XStack>
        )}
      </YStack>

    </View>
  )
}
