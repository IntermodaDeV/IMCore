// Tipos de api/Presupuesto que usa la app (la parte del revisor). Son los mismos del web
// (IMCoreWeb/src/api/modules/presupuesto/presupuesto.types.ts): si cambia uno, cambia el otro.

export type EstadoRevision = 'Sin habilitar' | 'Habilitado' | 'Vencido' | 'Confirmado' | 'Cerrado'

export interface IMiCentro {
  CorridaId: number
  CorridaNombre: string
  PresupuestoNombre: string
  Anio: number
  EmpresaNombre: string
  CentroCosto: string
  CentroCostoNombre: string
  DepartamentoNombre: string | null
  GrupoCodigo: number
  GrupoNombre: string
  Estado: EstadoRevision
  FechaLimite: string | null
  FechaConfirmado: string | null
  /** 0 = sin acceso · 1 = solo lectura · 2 = puede editar */
  Acceso: number
  Plazas: number
  Personas: number
  Vacantes: number
  /** Salario mensual de planilla de quienes siguen en planilla (lo que se paga hoy). */
  PlanillaMensual: number
  Total: number
  SinSalarioRH: number
  FueraDePlanilla: number
  VacantesSinSalario: number
  BajoMinimo: number
  TemporalesSinFin: number
  Ajustadas: number
  Revisadas: number
  /** Días antes de la fecha límite en que se avisa (configuración global Presupuesto.RecordatorioDiasAntes). */
  DiasAviso: number
  /** 1 = me lo delegó mi gerente (DelegadoPorNombre). DelegadoA / DelegadoNombre = a quién lo delegué yo. */
  EsDelegado?: number
  DelegadoA?: string | null
  DelegadoNombre?: string | null
  DelegadoPorNombre?: string | null
  Entregado?: number
  FechaEntregado?: string | null
  /** 1 = este usuario lo puede confirmar (el gerente, o el delegado si la corrida lo dice). */
  PuedeConfirmar?: number
  /** Por qué no se puede delegar: candado de Planificación, o ahí está su propio salario. */
  NoDelegable?: number
  TienePropia?: number
}

/** Usuario a quien se puede delegar (activo y con «Mis centros de costo»). */
export interface IUsuarioDelegado {
  User_Code: string
  UsuarioNombre: string | null
}

export interface ICentroEncabezado {
  CorridaId: number
  CorridaNombre: string
  CorridaEstado: 'Abierta' | 'Cerrada'
  PresupuestoNombre: string
  Anio: number
  EmpresaNombre: string
  CentroCosto: string
  CentroCostoNombre: string
  DepartamentoNombre: string | null
  GrupoCodigo: number
  GrupoNombre: string
  Estado: EstadoRevision
  FechaLimite: string | null
  Revisor: string | null
  RevisorNombre: string | null
  ConfirmadoPor: string | null
  FechaConfirmado: string | null
  Comentario: string | null
  Acceso: number
  EsAdministrador: number
  EsRevisor: number
  /** 1 = me lo delegó su revisor (RevisorNombre). DelegadoA / DelegadoNombre = a quién lo delegó el revisor. */
  EsDelegado?: number
  DelegadoA?: string | null
  DelegadoNombre?: string | null
  Entregado?: number
  FechaEntregado?: string | null
  ComentarioEntrega?: string | null
  /** Parámetro de la corrida: 1 = confirma el delegado; 0 = lo entrega y confirma el gerente. */
  DelegadoConfirma?: number
  PuedeConfirmar?: number
  PuedeEntregar?: number
  DiasAviso: number
  /** 1 = el centro lleva comisiones por persona (520103 en ESTRUCTURA). */
  TieneComision?: number
  /** 1 = el centro lleva sueldo variable por persona (520104 en ESTRUCTURA). */
  TieneVariable?: number
  /** Salario mínimo mensual de la corrida: para «usar el mínimo» al agregar una vacante. */
  SalarioMinimo?: number | null
  /** Cuántas cuentas de «Otros gastos de personal» tiene el centro en este grupo (0 = no se muestra la sección). */
  CuentasCaptura?: number
  /** Versiones guardadas (una por confirmación); 0 o sin el dato = no se muestra la sección. */
  Versiones?: number
}

/** Una versión del centro: cada confirmación guarda una (en la app, solo la lista con sus totales). */
export interface IVersion {
  Version: number
  Fecha: string | null
  Usuario: string | null
  UsuarioNombre: string | null
  Comentario: string | null
  Personas: number
  Vacantes: number
  Total: number
}

/** Una cuenta que captura el gerente en su centro, con cuántos eventos tiene y lo que suman en el año. */
export interface ICuentaCaptura {
  Cuenta: number
  Nombre: string
  /** Quién la captura en este centro: el gerente o un área (EncargadoNombre). */
  Captura?: 'Gerente' | 'Encargado'
  EncargadoNombre?: string | null
  /** 1 = este usuario puede poner eventos en ella (una API vieja no lo manda: se toma como 1). */
  Editable?: number
  Eventos: number
  Total: number
  /** Lo que cargó Planificación en la cuenta y el centro (montos anuales e importación): lo del gerente se suma. */
  MontoPlanificacion?: number
}

/** Evento del gerente: colaboradores × valor por colaborador en cada mes marcado (Meses: bit 0 = enero), en las semanas
 *  marcadas o parejo en el año (Reparto; esos dos se ponen en el web). */
export interface IEvento {
  Id: number
  Cuenta: number
  CuentaNombre: string
  Motivo: string
  Colaboradores: number
  Valor: number
  /** HNL o USD (los dólares se pasan con la tasa de cambio de su semana). */
  Moneda?: 'HNL' | 'USD'
  Meses: number
  /** Una API vieja no lo manda: por meses. */
  Reparto?: 'Meses' | 'Semanas' | 'Anual'
  /** Con Reparto = Semanas, las marcadas: «46,50». */
  Semanas?: string | null
  /** Lo que suma en el año, en lempiras (meses dentro de la regla de reparto y después de la semana de corte). */
  MontoAnio: number
  MesesEnAnio: number
  Modified_By: string | null
  Modification_Date: string | null
  /** Quién captura la cuenta en el centro: el gerente, un área (EncargadoNombre) o nadie. */
  Captura?: 'Gerente' | 'Encargado' | 'No'
  EncargadoNombre?: string | null
  /** 1 = este usuario lo puede cambiar o quitar. */
  Editable?: number
  CapturoNombre?: string | null
}

export interface IEventoRequest {
  CorridaId: number
  CentroCosto: string
  Cuenta: number
  Motivo: string
  Colaboradores: number
  Valor: number
  Moneda?: 'HNL' | 'USD'
  Reparto?: 'Meses' | 'Semanas' | 'Anual'
  /** 1 a 12. */
  Meses: number[]
  /** 1 a 53, con Reparto = Semanas. */
  Semanas?: number[]
}

export interface IPlaza {
  Id: number
  Origen: 'Planilla' | 'Vacante'
  /** Personas que representa la fila: vacantes en lote (1 a 9999); planilla siempre 1. */
  Cantidad: number
  CodPersonal: string | null
  CodAlterno: string | null
  Nombre: string
  Cargo: string | null
  Clase: 'Directo' | 'Indirecto' | 'Administrativo'
  TipoPlanilla: string | null
  TipoPlanillaNombre: string | null
  EsSemanal: number
  EsDolares: number
  FechaIngreso: string | null
  /** Siempre MENSUAL (como lo guarda planilla), también en la planilla semanal. */
  SalarioPlanilla: number | null
  Salario: number | null
  SalarioManual: number
  /** En fracción: 0.08 = 8 %. null = el % general de su clase. */
  PorcIncremento: number | null
  IncrementoAplica: string | null
  /** % general que le toca (salario mínimo o indirectos), sin su excepción. */
  PorcGeneral?: number | null
  /** Semana desde la que entra el incremento de su clase; null = la corrida no tiene incremento. */
  SemanaIncremento?: number | null
  /** Comisión mensual (moneda de su planilla). Suma a la base de 13.º, 14.º y preaviso. */
  ComisionMensual?: number | null
  /** Sueldo variable mensual. Suma a la base de 13.º, 14.º y preaviso. */
  VariableMensual?: number | null
  DiasVacaciones: number | null
  DiasVacacionesLey: number | null
  SemanaInicio: number
  /** 53 = todo el año. */
  SemanaFin: number
  SinSalarioRH: number
  EnPlanilla: number
  BajoMinimo: number
  /** 1 = quitada del presupuesto (Comentario = motivo). */
  Excluida: number
  /** 1 = es el propio usuario: no puede cambiar su salario (lo corrige quien tiene el acceso a salarios). */
  EsPropia?: number
  Revisado: number
  RevisadoPor: string | null
  FechaRevisado: string | null
  Comentario: string | null
  Modified_By: string | null
  Modification_Date: string | null
  /** La parte que llegó desde una semana: la fila de origen (en otro centro). */
  PlazaOrigenId?: number | null
  /** Movida a este centro: de dónde viene. */
  VieneDe?: string | null
  /** Movida todo el año a otro centro (solo en su centro de planilla, para saberlo y deshacerlo). */
  MovidoA?: string | null
  /** Se queda aquí hasta la semana anterior a PasaDesde; desde ahí va a PasaA (PasaAPlazaId = esa parte). */
  PasaA?: string | null
  PasaDesde?: number | null
  PasaAPlazaId?: number | null
  MovidoPor?: string | null
  MovidoPorNombre?: string | null
  FechaMovido?: string | null
  MotivoMovido?: string | null
}

/** Un centro al que se puede mover gente (tiene cuenta de sueldo), con su revisor. */
export interface ICentroDestino {
  CentroCosto: string
  CentroCostoNombre: string | null
  DepartamentoNombre: string | null
  Grupos: string | null
  Revisores: string | null
  Confirmado: number
  SuspendidoAX: number
}

/** Mover personas: todo el año (SemanaDesde vacío) o desde una semana. */
export interface IMoverPersonasRequest {
  Ids: number[]
  Destino: string
  SemanaDesde: number | null
  Motivo: string
}

/** La fila completa: % y días en null vuelven al valor por defecto. */
export interface IPlazaRequest {
  Salario: number | null
  PorcIncremento: number | null
  DiasVacaciones: number | null
  SemanaInicio: number
  SemanaFin: number
  Comentario: string | null
  /** Solo vacantes: cuántas iguales (1 a 9999). */
  Cantidad?: number | null
  /** Sin mandar = no cambia; 0 = quitarla. */
  ComisionMensual?: number
  /** Sin mandar = no cambia; 0 = quitarlo. */
  VariableMensual?: number
}

/** Vacante nueva (una fila puede valer varias iguales). Salario siempre MENSUAL; sin «hasta» = 53 (todo el año). */
export interface IVacanteRequest {
  CorridaId: number
  CentroCosto: string
  GrupoCodigo: number
  Cargo: string
  Nombre: string | null
  Salario: number | null
  SemanaInicio: number
  SemanaFin: number
  EsSemanal: boolean
  Comentario: string | null
  Cantidad: number
}

export interface IConfirmarVariosRequest {
  Centros: { CentroCosto: string; GrupoCodigo: number }[]
  Comentario: string | null
}

/** Una cuenta de un centro + grupo por semana: el resumen de todos los centros del revisor. */
export interface IResumenConsolidado {
  CentroCosto: string
  CentroCostoNombre: string | null
  DepartamentoNombre: string | null
  GrupoCodigo: number
  GrupoNombre: string | null
  Cuenta: number
  NombreCuenta: string | null
  P01: number; P02: number; P03: number; P04: number; P05: number; P06: number; P07: number
  P08: number; P09: number; P10: number; P11: number; P12: number; P13: number
  Total: number
  /** Las semanas del año en un arreglo JSON: «[123.45, 0, …]» (una API vieja no lo manda: se usan los períodos). */
  Semanas?: string | null
  /** Personas del centro + grupo en cada semana, en un arreglo JSON: «[12, 12, …]». */
  Personas?: string | null
}

/** Un cargo del catálogo de planilla (para la vacante). */
export interface ICargoPlanilla {
  Nombre: string
}
