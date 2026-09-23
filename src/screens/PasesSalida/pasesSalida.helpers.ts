import { EstadoPase } from '../../api/modules/pasesSalida/pases.types'

// Color de acento del módulo de pases de salida (mismo naranja de la marca).
export const ACCENT = '#FF551A'

/** Fondo del acento para chips y badges. Legible en claro y en oscuro. */
export const ACCENT_BG = 'rgba(255, 85, 26, 0.18)'

/**
 * Feedback al presionar una TARJETA del módulo.
 *
 * SE APAGA LA SOMBRA, y esa es la parte que importa. Las tarjetas llevan
 * elevación (`shadows.sm`) y en Android la sombra se dibuja DETRÁS de la vista.
 * El tinte naranja es translúcido (9 %), así que mientras la sombra siga
 * encendida se transparenta a través de él y aparece como un halo gris pegado a
 * las orillas — que es justo lo que se veía. Bajarle la opacidad a la tarjeta,
 * que era lo de antes, provocaba lo mismo pero peor: apagaba además el texto y
 * los badges.
 *
 * Apagando la elevación durante la presión no hay nada detrás que se pueda
 * colar, y la tarjeta se aplana un instante: la misma lectura que tienen las
 * tarjetas de solicitudes de compra, que no se ensucian al tocarlas.
 *
 * `elevation` cubre Android y `shadowOpacity` cubre iOS; ninguna de las dos
 * afecta el layout, así que la tarjeta no se mueve ni salta.
 *
 * Es SOLO para tarjetas. En los íconos sueltos la opacidad sigue siendo lo
 * correcto: no tienen elevación ni un fondo que teñir.
 */
export const PRESS_CARD = {
  backgroundColor: '$primaryOpacity2',
  elevation: 0,
  shadowOpacity: 0,
} as const

/** Acceso que habilita crear pases. El alcance por material se valida aparte. */
export const ACCESO_SOLICITANTE = 'PSSolicitante'

/** La clave global con las horas de gracia (AdmSys.Configuracion). */
export const CLAVE_HORAS_GRACIA = 'PasesSalida.HorasGraciaSalida'

/**
 * La fecha más vieja para la que todavía tiene sentido crear o editar un pase.
 *
 * NO ES "HOY". Un pase no vence al terminar su día de salida: vence al final de
 * ese día MÁS las horas de gracia. Con las 24 h configuradas, uno fechado ayer
 * sigue siendo perfectamente válido durante todo el día de hoy — portería lo
 * deja salir. Bloquear ayer en el formulario le impedía al solicitante corregir
 * un pase que el sistema todavía acepta, que es justo lo contrario de lo que la
 * validación quería evitar.
 *
 * El cálculo es la fecha calendario de (ahora − gracia), que es exactamente el
 * punto donde FN_VigenciaSalida deja de responder VENCIDA:
 *
 *   Vence(D) = fin del día D + gracia        (lo que hace el SP)
 *   D sirve mientras  ahora <= Vence(D)  <=>  D >= fecha de (ahora − gracia)
 *
 * Sin horas conocidas devuelve HOY. Es el valor estricto a propósito: si la
 * configuración no se pudo leer, permitir una fecha de más crearía un pase que
 * nace vencido, y eso no lo corrige nadie.
 */
export const fechaMinimaSalida = (horasGracia?: number | null): string => {
  const horas = typeof horasGracia === 'number' && isFinite(horasGracia) && horasGracia > 0
    ? horasGracia
    : 0
  const d = new Date()
  d.setHours(d.getHours() - horas)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/**
 * Acceso que habilita registrar salidas y regresos SIN escanear el QR.
 *
 * Saltarse el QR es saltarse la prueba de que quien llegó traía el pase, así
 * que no alcanza con tener el menú de portería: es una excepción y se concede
 * aparte. Sin el acceso la opción ni se muestra.
 */
export const ACCESO_SALIDA_MANUAL = 'PSSalidaManual'

/** `user.Access` viene como una lista separada por comas. */
export const tieneAcceso = (access: string | null | undefined, key: string) =>
  (access ?? '').split(',').map(s => s.trim()).includes(key)

/**
 * Unidades que se ofrecen al capturar una línea.
 *
 * Es una constante y no un catálogo a propósito: son siete valores que casi no
 * cambian, y una lista fija evita el texto libre —que es lo que arruina
 * cualquier reporte por cantidad— sin costar una pantalla de mantenimiento.
 * El día que necesiten administrarlas, se vuelve tabla sin migrar nada.
 */
export const UNIDADES = ['Unidad', 'Par', 'Juego', 'Yarda', 'Rollo', 'Libra', 'Metro'] as const

/**
 * Color por estado del pase. Se separa del texto porque el mismo color se usa
 * en el borde de la tarjeta y en la píldora.
 */
export const COLOR_ESTADO: Record<EstadoPase, string> = {
  PSPEND: '#f59e0b',
  // En aprobación comparte familia con Pendiente —sigue esperando firmas— pero
  // en ámbar más profundo: ya avanzó, no está igual que uno recién creado.
  PSEAPR: '#d97706',
  PSAPR:  '#22c55e',
  PSREJ:  '#ef4444',
  PSSAL:  '#3b82f6',
  // Finalizado y Retornado son los dos finales buenos: comparten familia con
  // Salió (azul-verde) porque son la continuación de lo mismo, no otra cosa.
  PSFIN:  '#0ea5e9',
  PSRET:  '#14b8a6',
  // Vencido comparte el rojo apagado de lo que no llegó a nada: no es un
  // rechazo, pero tampoco salió.
  PSVEN:  '#b45309',
  PSANU:  '#64748b',
  PSELI:  '#64748b',
}

/**
 * Respaldo por si el pase viniera sin EstadoNombre. El nombre bueno lo manda el
 * servidor desde AdmSys.Status, que es donde se puede renombrar sin tocar la app.
 */
/**
 * Fondo de cada estado, en rgba explícito.
 *
 * No se calcula pegándole alfa al hex (`${color}22`): si el estado no estuviera
 * en el mapa, la concatenación produce un color inválido y el badge sale
 * transparente. Acá cada par color/fondo está escrito y siempre es válido.
 */
export const BG_ESTADO: Record<EstadoPase, string> = {
  PSPEND: 'rgba(245, 158, 11, 0.18)',
  PSEAPR: 'rgba(217, 119, 6, 0.18)',
  PSAPR:  'rgba(34, 197, 94, 0.18)',
  PSREJ:  'rgba(239, 68, 68, 0.18)',
  PSSAL:  'rgba(59, 130, 246, 0.18)',
  PSFIN:  'rgba(14, 165, 233, 0.18)',
  PSRET:  'rgba(20, 184, 166, 0.18)',
  PSVEN:  'rgba(180, 83, 9, 0.18)',
  PSANU:  'rgba(100, 116, 139, 0.18)',
  PSELI:  'rgba(100, 116, 139, 0.18)',
}

export const ETIQUETA_ESTADO: Record<EstadoPase, string> = {
  PSPEND: 'Pendiente',
  PSEAPR: 'En aprobación',
  PSAPR:  'Aprobado',
  PSREJ:  'Rechazado',
  PSSAL:  'Salió',
  PSFIN:  'Finalizado',
  PSRET:  'Retornado',
  PSVEN:  'Vencido',
  PSANU:  'Anulado',
  PSELI:  'Eliminado',
}

/**
 * Los estados que se ofrecen como filtro.
 *
 * PSELI queda fuera a propósito: un pase eliminado no vuelve a aparecer en
 * ninguna pantalla — el servidor ni lo devuelve —, así que ofrecerlo como
 * filtro sería ofrecer una búsqueda que siempre sale vacía.
 */
export const ESTADOS_FILTRO: EstadoPase[] =
  ['PSPEND', 'PSEAPR', 'PSAPR', 'PSREJ', 'PSSAL', 'PSFIN', 'PSRET', 'PSVEN', 'PSANU']

/**
 * Los tres valores visuales de un estado, con respaldo gris si el servidor
 * mandara un code que la app todavía no conoce. Una sola función para que
 * ninguna pantalla vuelva a armar el color a mano.
 */
export const estadoVisual = (estado?: string | null) => {
  const key = estado as EstadoPase
  return {
    color: COLOR_ESTADO[key] ?? '#64748b',
    bg: BG_ESTADO[key] ?? 'rgba(100, 116, 139, 0.18)',
    label: ETIQUETA_ESTADO[key] ?? estado ?? '',
  }
}

/**
 * En qué situación está el QR de un pase.
 *
 * El QR tiene una VIDA, no un interruptor:
 *   · nace al aprobarse —uno escaneable sin firmas es justo el agujero que este
 *     módulo cierra—,
 *   · sigue vivo mientras el pase está afuera, porque el retorno se registra
 *     escaneándolo,
 *   · y muere cuando el pase se cierra. Un código que sigue funcionando después
 *     de que el trámite terminó es un código que alguien puede volver a
 *     presentar en portería.
 *
 * Los tres casos necesitan mensajes DISTINTOS. Con un solo booleano, un pase
 * rechazado decía "estará disponible cuando se apruebe" — una espera que nunca
 * iba a terminar.
 */
export type SituacionQr = 'disponible' | 'pendiente' | 'cerrado'

const MOTIVO_QR: Record<string, string> = {
  PSVEN: 'Este pase venció sin usarse: se le pasó la fecha de salida y el plazo de gracia. Hay que crear uno nuevo.',
  PSFIN: 'Este pase ya finalizó: salió y no regresa, así que su código dejó de tener uso.',
  PSRET: 'Este pase ya retornó y quedó cerrado, así que su código dejó de tener uso.',
  PSREJ: 'Este pase fue rechazado, así que no llegará a tener código.',
  PSANU: 'Este pase fue anulado, así que su código ya no es válido.',
}

export const situacionQr = (estado?: string | null): { situacion: SituacionQr; motivo: string } => {
  if (estado === 'PSAPR' || estado === 'PSSAL') {
    return {
      situacion: 'disponible',
      motivo: 'Portería escanea este código para dejar salir lo que va en el pase.',
    }
  }
  const cerrado = MOTIVO_QR[estado ?? '']
  if (cerrado) return { situacion: 'cerrado', motivo: cerrado }
  return {
    situacion: 'pendiente',
    motivo: 'El código estará disponible cuando el pase reúna todas las firmas y quede aprobado.',
  }
}

/** Atajo para cuando solo interesa si hay QR que mostrar. */
export const tieneQr = (estado?: string | null) => situacionQr(estado).situacion === 'disponible'

/** Fecha corta para las tarjetas. Devuelve '' si no hay nada que mostrar. */
export const fmtFecha = (iso?: string | null): string => {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Fecha con hora, para el detalle. */
export const fmtFechaHora = (iso?: string | null): string => {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime())
    ? ''
    : d.toLocaleString('es-HN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
}

/** Cantidad sin decimales cuando es entera: "2" en vez de "2.0000". */
export const fmtCantidad = (n?: number | null): string => {
  if (n == null) return ''
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(4)))
}
