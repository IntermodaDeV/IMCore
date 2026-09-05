export interface IMotivo {
  Id: number
  Name: string
  Description?: string | null
  Status_Id: number
  Create_By?: string
  Modified_By?: string
}

export interface IHorarioDetalle {
  Id?: number
  Horario_Id?: number
  /** 1=Lunes .. 7=Domingo. Es el día en que la ventana ABRE:
   *  "Viernes 22:00-06:00" cierra el sábado. */
  DiaSemana: number
  HoraDesde: string // "HH:mm"
  HoraHasta: string // "HH:mm"
  /** HoraHasta <= HoraDesde -> la ventana termina al día siguiente */
  CruzaMedianoche?: boolean
}

export interface IHorario {
  Id: number
  Name: string
  Description?: string | null
  Status_Id: number
  Create_By?: string
  Modified_By?: string
  // Solo lectura (los arma el SP)
  VentanasCount?: number
  TieneNocturna?: boolean
  Resumen?: string | null // "Lun 08:00-12:00 · Lun 13:00-17:00 · ..."
  Dias?: string | null // "1,2,3,4,5"
  /** Horario RESERVADO: solo lo ve, y solo lo puede usar, quien tiene el acceso
   *  'VisitasLargaDuracion'. El servidor ni lo devuelve a los demás.
   *
   *  1 = reservado · 0 = de todos · omitido al guardar = no se toca. Es un NÚMERO
   *  y no un booleano porque el servidor necesita distinguir "false" de "no me lo
   *  mandaron": con un bool no nullable, un cliente que no conoce el campo lo
   *  desmarcaba en silencio. */
  SoloConAcceso?: number | null
  // Se envía al guardar; el backend reemplaza el detalle completo
  Detalle?: IHorarioDetalle[]
}

/** Ventana concreta de un pase: el snapshot del horario al generarlo. Editar el
 *  catálogo después NO la cambia, para no volver violación retroactiva lo pasado. */
export interface IVentanaPase {
  Id: number
  Visita_Id: number
  Dia: string // YYYY-MM-DD (día en que abre)
  VentanaInicio: string
  VentanaFin: string
  DuracionMinutos: number
  CruzaMedianoche: boolean
}

/** Lo que la app manda al capturar el documento del visitante */
export interface IIdentificacionRequest {
  VisitaAcceso_Id: number
  Visitante_Id?: number | null
  ImagenBase64?: string | null // sin el prefijo data:
  MimeType?: string | null
  Intentos?: number
  /** true = el guardia continúa sin lograr una foto legible (tras los reintentos) */
  OmitirPorGuardia?: boolean
  Create_By?: string
}

/** Veredicto de la lectura. NUNCA decide si la persona entra: eso es del guardia. */
export interface IIdentificacionResult {
  Id: number
  Legible: boolean
  NombreDetectado?: string | null
  DocumentoDetectado?: string | null
  TipoDocumento?: string | null
  Coincide?: boolean | null // null = no se pudo evaluar
  ScoreCoincidencia?: number | null
  NombreCotejado?: string | null
  Mensaje?: string | null
  Intentos: number
  /** la app debe pedir otra foto */
  ReintentarFoto: boolean
  /** se agotaron los intentos: ofrecer "continuar sin ID" */
  PermitirOmitir: boolean
}

/** Identificación ya guardada, para el historial (sin la imagen) */
export interface IIdentificacion {
  Id: number
  VisitaAcceso_Id: number
  Visitante_Id?: number | null
  MimeType?: string | null
  ImagenBytes?: number | null
  TieneImagen: boolean
  Legible: boolean
  NombreDetectado?: string | null
  DocumentoDetectado?: string | null
  TipoDocumento?: string | null
  Coincide?: boolean | null
  ScoreCoincidencia?: number | null
  NombreCotejado?: string | null
  MensajeOcr?: string | null
  Intentos: number
  OmitidoPorGuardia: boolean
  Create_By?: string | null
  Creation_Date?: string | null
  EntradaAt?: string | null
  AccessDate?: string | null
}

export interface IGenerarVisita {
  VisitTo: string
  Motivo_Id: number
  VisitReasonOther?: string | null
  EntryDate: string // YYYY-MM-DD (día del pase único; fallback)
  IsRecurrent?: boolean
  Dias?: string[] // YYYY-MM-DD (días permitidos: recurrente o rango expandido)
  /** Horario del catálogo. Si no cubre el día de semana de una fecha, esa fecha
   *  se descarta. null = ver HoraDesde/HoraHasta. */
  Horario_Id?: number | null
  /** Ventana escrita a mano ("HH:mm"), para no obligar a crear un horario en el
   *  catálogo. Solo se usan si Horario_Id es null, y van juntas o ninguna.
   *  Ambas null = día completo. A diferencia del catálogo, NO descarta días. */
  HoraDesde?: string | null
  HoraHasta?: string | null
  /** ¿Se le pide el documento al entrar? Encendido por defecto. */
  RequiereId?: boolean
  /** ¿En CADA entrada, o basta una vez por pase? Apagado por defecto: una
   *  lectura legible respalda el pase entero (un proveedor recurrente entrega el
   *  documento una vez). Pedirlo siempre es el respaldo extra y es opt-in. */
  IdCadaEntrada?: boolean
  /** Pase de larga duración (meses). Se DECLARA, no se deduce de la vigencia: si
   *  se dedujera, a quien tiene el acceso un pase rutinario de un mes le saldría
   *  marcado como largo —y mudo— sin haberlo pedido. El servidor rechaza la marca
   *  si el generador no tiene 'VisitasLargaDuracion'. */
  LargaDuracion?: boolean
  /** ¿Avisa cada entrada y salida? Solo se puede apagar en un pase de larga
   *  duración; en uno normal el servidor lo fuerza a true. */
  NotificaMovimientos?: boolean
  Create_By: string
  Personas: string[]
}

export interface IVisitaResult {
  Success: boolean
  SuccessMessage?: string
  ErrorMessage?: string
  Id: number
  Token: string
  /** Empresa que quedó REGISTRADA en el pase. Viene del servidor a propósito:
   *  la tarjeta que se comparte no puede adivinarla desde el usuario local. */
  Empresa?: string | null
  EmpresaCode?: string | null
  /** Cómo quedó el pase según el SERVIDOR: pudo forzar el aviso o rechazar la
   *  marca, así que la tarjeta no lo recalcula. */
  LargaDuracion?: boolean
  NotificaMovimientos?: boolean
  DiasVigencia?: number
  VenceEl?: string | null // YYYY-MM-DD
}

export interface IValidarResult {
  Success: boolean
  Valid: boolean
  Reason?: string // entrada | salida | salida_tarde | outoftime | outofrange | finished | notfound
  Message?: string
  Personas?: string | null
  VisitTo?: string | null
  Motivo?: string | null
  VisitReasonOther?: string | null
  EntryDate?: string | null
  UsedAt?: string | null // entrada del movimiento
  ExitAt?: string | null // salida del movimiento
  // ── Ventana horaria ──
  Horario?: string | null // nombre del horario aplicado (null = sin horario)
  /** En entrada/salida: la ventana del movimiento.
   *  En 'outoftime': trae la PRÓXIMA ventana disponible. */
  VentanaInicio?: string | null
  VentanaFin?: string | null
  /** Minutos que permaneció después del cierre de su ventana (ya descontada la
   *  tolerancia). 0 = salió en horario. Solo viene al registrar salida. */
  MinutosExceso?: number | null
  MinutosDentro?: number | null
  /** Solo viene en 1 al registrar ENTRADA: el documento se pide al entrar, no al salir */
  RequiereId?: boolean
  /** Movimiento contra el que se cuelga la foto del documento */
  AccesoId?: number | null
  /** ¿Este pase avisa sus movimientos? Lo decide el servidor. 1 = avisa · 0 =
   *  mudo · null = sin dato (una API vieja), que se lee como "avisa".
   *  Viaja como NÚMERO y no como booleano porque el mapeador SP→DTO de la API no
   *  soporta `bool?` y descartaba la columna en silencio. */
  Notifica?: number | null
  LargaDuracion?: boolean
  // ── Empresa del parque dueña del pase ──
  // El guardia atiende a las dos empresas del parque, así que tiene que ver de
  // cuál es el pase que acaba de escanear.
  Empresa?: string | null
  EmpresaCode?: string | null
}

export interface IHistorial {
  Id: number
  Token: string
  VisitTo: string
  Motivo: string
  VisitReasonOther?: string | null
  IsRecurrent?: boolean
  EntryDate: string
  StartDate?: string | null // primer día de vigencia
  EndDate?: string | null // último día de vigencia
  DiasCount?: number // días DISTINTOS (un día puede tener varias ventanas)
  VentanasCount?: number
  AccesosCount?: number
  Used: boolean
  UsedAt?: string | null // primera entrada
  ExitAt?: string | null // última salida
  DentroAhora?: boolean // tiene un movimiento sin salida (de cualquier fecha)
  EstadoPase?: string // pendiente | vigente | finalizado
  /** Pase de larga duración, y si avisa. EndDate ya dice hasta cuándo vale. */
  LargaDuracion?: boolean
  NotificaMovimientos?: boolean
  Status_Id: number
  Create_By?: string
  Creation_Date?: string
  Personas?: string
  // ── Horario aplicado ──
  Horario_Id?: number | null
  Horario?: string | null // null = sin restricción de hora
  // ── Control de tiempo adentro ──
  MinutosDentroTotal?: number | null
  MinutosExcesoTotal?: number
  MovimientosConExceso?: number
  // ── Identificación ──
  RequiereId?: boolean
  /** true = documento en cada entrada; false = una lectura respalda el pase.
   *  Cambia el significado de EntradasSinIdLegible. */
  IdCadaEntrada?: boolean
  IdentificacionesCount?: number
  IdLegiblesCount?: number
  IdNoCoincideCount?: number
  /** Entradas que exigían ID y quedaron sin uno legible: el hueco a vigilar */
  EntradasSinIdLegible?: number
  // ── Empresa del parque dueña del pase (snapshot al generarlo) ──
  Empresa_Id?: number
  Empresa?: string | null
  /** Con esto se elige el logo del QR sin depender del Id. */
  EmpresaCode?: string | null
}

export interface IVisitaAcceso {
  Id: number
  Visita_Id: number
  AccessDate: string // YYYY-MM-DD
  /** A qué ventana pertenece. Un día puede tener varias (horario de mañana y
   *  tarde) y por fecha no se pueden separar. */
  VisitaDia_Id?: number | null
  EntradaAt: string
  SalidaAt?: string | null
  EntradaBy?: string | null
  SalidaBy?: string | null
  /** Los mismos, ya traducidos a nombre por el servidor ('SISTEMA' → «Sistema»;
   *  un usuario borrado cae de vuelta al Code). Opcionales: una API vieja no
   *  los manda, y la pantalla tiene que seguir mostrando algo. */
  EntradaByNombre?: string | null
  SalidaByNombre?: string | null
  // Ventana que autorizó la entrada
  VentanaInicio?: string | null
  VentanaFin?: string | null
  MinutosExceso?: number | null // minutos fuera de ventana al salir; 0 = en horario
  MinutosDentro?: number | null // null mientras siga adentro
  CierreAuto?: boolean // true = salida inferida por el sistema, no escaneada
}

// ─────────────────────────── Tablero / Agenda ───────────────────────────

export type EstadoAgenda =
  | 'EnPlanta'      // entró y no ha salido, todavía dentro de su ventana
  | 'Vencida'       // entró y no ha salido, y su ventana ya cerró (+ tolerancia)
  | 'Finalizada'    // entró y salió en tiempo
  | 'ConExceso'     // entró y salió, pero pasado de tiempo
  | 'Programada'    // no ha entrado y su ventana no ha cerrado
  | 'NoSePresento'  // no ha entrado y su ventana ya cerró

/** Una fila por DÍA-VENTANA de pase: la unidad del tablero.
 *
 *  No es una fila por pase porque un recurrente de lunes a viernes es UN pase
 *  pero CINCO cosas en un calendario. Un mismo día puede tener varios
 *  movimientos (salió a almorzar y volvió); acá vienen agregados.
 *
 *  El Estado lo calcula el SERVIDOR (Visitas.SP_GetAgenda). La app NO lo
 *  recalcula: la tolerancia y el reloj tienen que ser los mismos que usó la
 *  validación en portería. */
export interface IAgenda {
  VisitaDia_Id: number
  Visita_Id: number
  Token?: string
  VisitTo: string
  Motivo: string
  VisitReasonOther?: string | null
  IsRecurrent: boolean
  Personas?: string | null
  PersonasCount: number

  Dia: string
  VentanaInicio: string
  VentanaFin: string
  Horario?: string | null

  Empresa_Id: number
  Empresa?: string | null
  EmpresaCode?: string | null

  AccesosCount: number
  PrimeraEntrada?: string | null
  /** Solo viene cuando YA cerraron todos los movimientos del día. */
  UltimaSalida?: string | null
  MinutosDentroTotal: number
  /** Exceso ya REGISTRADO en los movimientos cerrados. */
  MinutosExcesoTotal: number
  DentroAhora: boolean
  CierreAuto: boolean

  /** Negativo = la ventana ya abrió. */
  MinutosParaIniciar: number
  /** Exceso EN CURSO de quien sigue adentro, ya descontada la tolerancia. */
  MinutosExcesoEnCurso: number

  Estado: EstadoAgenda

  RequiereId: boolean
  IdCadaEntrada: boolean
  IdRespaldado: boolean

  Create_By?: string
  /** Nombre de quien generó el pase; cae al Code si no se resuelve. */
  CreadoPor?: string | null
  Creation_Date?: string
}
