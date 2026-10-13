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
  DiasAviso: number
  /** 1 = el centro lleva comisiones por persona (520103 en ESTRUCTURA). */
  TieneComision?: number
  /** 1 = el centro lleva sueldo variable por persona (520104 en ESTRUCTURA). */
  TieneVariable?: number
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

export interface IConfirmarVariosRequest {
  Centros: { CentroCosto: string; GrupoCodigo: number }[]
  Comentario: string | null
}
