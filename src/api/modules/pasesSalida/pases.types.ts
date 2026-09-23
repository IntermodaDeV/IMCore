// El pase de salida en sí.

/**
 * Code del estado en AdmSys.Status, Category 'PaseSalida'. Llevan prefijo PS
 * porque el Code es único en toda la tabla y CooInter ya usa PEND, APR y REJ.
 *
 * No hay borrador: el pase nace en PSPEND cuando el solicitante lo crea.
 *
 * Al registrar la salida, a dónde va depende del TIPO:
 *   · el que regresa   -> PSSAL "Salió", abierto hasta que el retorno lo cierre
 *   · el definitivo    -> PSFIN "Finalizado", no queda nada que esperar
 * Un pase aprobado que nunca salió y se le pasó el plazo lo cierra solo un job
 * de la API en PSVEN: la condición ya la veía portería, pero sin el estado el
 * solicitante nunca se enteraba.
 */
export type EstadoPase =
  | 'PSPEND' | 'PSEAPR' | 'PSAPR' | 'PSREJ' | 'PSSAL' | 'PSFIN' | 'PSRET'
  | 'PSVEN' | 'PSANU' | 'PSELI'

/**
 * Los estados en que el pase todavía tiene algo por delante. El resto ya cerró.
 * Se define acá y no en cada pantalla para que "abierto" signifique lo mismo en
 * todas.
 */
export const ESTADOS_ABIERTOS: EstadoPase[] = ['PSPEND', 'PSEAPR', 'PSAPR', 'PSSAL']

export const ESTADOS_CERRADOS: EstadoPase[] = ['PSFIN', 'PSRET', 'PSREJ', 'PSVEN', 'PSANU']

export interface IPaseSalida {
  Id: number
  Correlativo: string
  TipoSalida_Id: number
  TipoSalida: string
  Retorna: boolean
  Comentario: string | null
  EnviadoA: string | null
  /**
   * Quién va a retirar el material, con nombre y apellido. NO es el
   * solicitante: puede ser un motorista o un proveedor sin acceso a IMCore. Es
   * lo que portería compara contra el documento antes de dejar pasar.
   * Null en los pases creados antes de que existiera el campo.
   */
  Responsable?: string | null
  /** La fecha que el solicitante PLANEÓ. No es cuándo salió. */
  FechaSalida: string | null
  FechaRetorno: string | null
  /**
   * Cuándo salió REALMENTE, con hora, puesta por el servidor al registrarla en
   * portería. Null mientras no haya salido.
   */
  FechaSalidaReal?: string | null
  /** El guardia que registró la salida. */
  SalidaPor?: string | null
  SalidaPorNombre?: string | null
  /**
   * El guardia que recibió el regreso. Junto con `FechaRetorno` es lo que
   * distingue un préstamo que volvió de una venta que salió: los dos terminan
   * en Finalizado, pero solo el primero tiene estas dos.
   */
  RetornoPor?: string | null
  RetornoPorNombre?: string | null

  /**
   * Si el pase se puede usar HOY. Lo calcula el servidor con la misma función
   * que aplica el registro de salida, así que la pantalla y el SP no pueden
   * discrepar.
   *   OK            se puede
   *   ANTICIPADA    la fecha de salida todavía no llegó
   *   VENCIDA       pasó la fecha y se consumió la ventana de gracia
   *   FUERAHORARIO  es el día correcto, pero no la hora
   */
  SalidaVigencia?: 'OK' | 'ANTICIPADA' | 'VENCIDA' | 'FUERAHORARIO' | null
  /** Hasta cuándo se puede usar: fin del día de salida + la gracia. */
  SalidaVence?: string | null
  /** La gracia configurada (AdmSys.Configuracion), en horas. */
  HorasGracia?: number | null
  /** Horario en que este pase puede salir, ya resuelto: el del grupo, o el general. */
  HoraDesde?: string | null
  HoraHasta?: string | null
  /** true si el horario es propio del grupo; false si hereda el general. */
  HorarioPropio?: boolean
  Estado: EstadoPase
  /** El nombre para mostrar, del mismo catálogo. */
  EstadoNombre: string | null
  Status_Id: number
  /** Solo mientras está en PSPEND. Lo resuelve el SP. */
  PuedeEditar: boolean
  Create_By: string
  Solicitante: string | null
  /**
   * Empresa del parque dueña del pase, copiada de quien lo creó. El QR lleva su
   * logo. No es la del que mira: quien aprueba y comparte el pase puede ser de
   * otra empresa, y esa tarjeta ya salió por WhatsApp.
   */
  Empresa_Id?: number
  Empresa?: string | null
  EmpresaCode?: string | null
  Creation_Date: string | null
  Modified_By: string | null
  Modification_Date: string | null
  Lineas: number
  /** Cuántos requisitos de firma tiene el pase. */
  FirmasRequeridas: number
  /** Cuántos ya están cumplidos. Iguales = listo para autorizar. */
  FirmasDadas: number
  /**
   * Solo en la bandeja de aprobaciones: el paso que el acceso consultado puede
   * firmar. Null fuera de esa consulta.
   */
  MiPaso?: number | null
  /**
   * El primer paso sin firmar. Null cuando la cadena terminó. Es lo que resalta
   * la línea de firmas.
   */
  PasoActual?: number | null
  /**
   * Solo en la bandeja "pendiente regreso" de portería: cuántos días lleva
   * afuera. Es lo que hace accionable la lista — 40 días no es 2.
   */
  DiasAfuera?: number | null
}

/**
 * Un pase sobre el que portería puede actuar sin escanear.
 *
 * Extiende el pase con lo que hace falta para ENCONTRARLO cuando no se tiene el
 * correlativo a mano: el grupo y los materiales en texto. Sin eso, buscar sin
 * el código es imposible — nadie recuerda "PS2609-00017", recuerda "el de las
 * herramientas de Juan".
 */
export interface IPaseSalidaManual extends IPaseSalida {
  /** SALIDA (está aprobado) o REGRESO (está afuera). Lo decide el estado. */
  Accion: 'SALIDA' | 'REGRESO'
  Grupo: string | null
  /** Materiales y descripciones concatenados, para buscar por texto. */
  Materiales: string | null
}

/**
 * Las tres bandejas de portería.
 *   PEND  autorizado y todavía no sale, organizado por fecha prevista
 *   FIN   el ciclo terminó: salió definitivo, o salió y ya regresó
 *   REG   está afuera y debe volver
 */
export type BandejaPorteria = 'PEND' | 'FIN' | 'REG'

/** Una alternativa de firma del pase. Las del mismo Paso son intercambiables. */
export interface IPaseSalidaAuth {
  Id: number
  PaseSalida_Id: number
  Paso: number
  Access_Id: number
  FirmaNombre: string
  AccesoKeyVar: string | null
  /** null = pendiente, true = firmó, false = rechazó. */
  IsAuth: boolean | null
  UserAuth: string | null
  FirmadoPor: string | null
  FechaAuth: string | null
  Comentario: string | null
}

/**
 * Un movimiento del pase: cuándo cambió de estado, a cuál y quién lo movió.
 *
 * Es la VIDA del pase, distinta de la bitácora de firmas: esa dice quién
 * autorizó y qué falta; esta dice qué le fue pasando.
 */
export interface IPaseSalidaEstado {
  Id: number
  PaseSalida_Id: number
  Fecha: string
  Estado: EstadoPase
  EstadoNombre: string | null
  User_Code: string | null
  Usuario: string | null
  /**
   * TRIGGER = hecho registrado en vivo. BACKFILL = reconstruido de los datos
   * que había antes de que existiera el historial, así que la fecha puede ser
   * aproximada.
   */
  Origen: 'TRIGGER' | 'BACKFILL' | null
}

/** Un paso de la bitácora, ya armado a partir de las alternativas. */
export interface IPasoFirma {
  Paso: number
  /** Los cargos que pueden darla; cualquiera sirve. */
  Alternativas: string[]
  /** Quién firmó y cuándo, si ya pasó. */
  FirmadoPor: string | null
  FechaAuth: string | null
  Rechazado: boolean
  Firmado: boolean
}

/**
 * Agrupa las alternativas por paso. Un paso está firmado si CUALQUIERA de sus
 * alternativas tiene IsAuth true — esa es la definición de alternativa.
 */
export function armarBitacora(filas: IPaseSalidaAuth[]): IPasoFirma[] {
  const porPaso = new Map<number, IPasoFirma>()

  for (const f of filas) {
    let p = porPaso.get(f.Paso)
    if (!p) {
      p = { Paso: f.Paso, Alternativas: [], FirmadoPor: null, FechaAuth: null, Rechazado: false, Firmado: false }
      porPaso.set(f.Paso, p)
    }
    p.Alternativas.push(f.FirmaNombre.replace(/^Firma /, ''))
    if (f.IsAuth === true) {
      p.Firmado = true
      p.FirmadoPor = f.FirmadoPor || f.UserAuth
      p.FechaAuth = f.FechaAuth
    }
    if (f.IsAuth === false) p.Rechazado = true
  }

  return Array.from(porPaso.values()).sort((a, b) => a.Paso - b.Paso)
}

/**
 * Las tres bandejas del firmante: lo que espera mi firma, y mi historial de
 * aprobadas y rechazadas.
 */
export type BandejaFirma = 'PEND' | 'APR' | 'REJ'

/**
 * Firmar. El paso no viaja: lo resuelve el servidor tomando el actual de la
 * cadena, así no se puede firmar adelantado.
 */
export interface IPaseSalidaFirmar {
  Id: number
  Access_Id: number
  /** true aprueba, false rechaza. */
  IsAuth: boolean
  /** Obligatorio al rechazar. */
  Comentario?: string | null
}

/** Un acceso de firma del usuario (Security.Access, PSFirma*). */
export interface IFirmaUsuario {
  Id: number
  KeyVar: string
  Name: string
}

export interface IPaseSalidaDetalle {
  Id: number
  PaseSalida_Id: number
  Material_Id: number
  Material: string
  /** Para reabrir el formulario sabiendo si exige modelo y serie. */
  EsEquipo: boolean
  Descripcion: string | null
  Cantidad: number
  UnidadMedida: string | null
  Marca: string | null
  Modelo: string | null
  Serie: string | null
}

// ── Guardado ─────────────────────────────────────────────────────────────────

export interface IPaseSalidaLinea {
  Material_Id: number
  Descripcion?: string | null
  Cantidad: number
  UnidadMedida?: string | null
  Marca?: string | null
  Modelo?: string | null
  Serie?: string | null
}

/** Id menor o igual a cero (mandá -1) crea; mayor que cero edita. */
export interface IPaseSalidaGuardar {
  Id: number
  TipoSalida_Id: number
  Comentario?: string | null
  EnviadoA?: string | null
  /** Quién retira el material. Obligatorio, con nombre y apellido. */
  Responsable?: string | null
  FechaSalida?: string | null
  // FechaRetorno no va acá: es la fecha en que la cosa REGRESÓ y la llena el
  // proceso de retorno, no el solicitante.
  Detalle: IPaseSalidaLinea[]
}

/** Lo que devuelve el guardado, además de Success/mensajes. */
export interface IPaseGuardado {
  Id: number
  Correlativo: string
}
