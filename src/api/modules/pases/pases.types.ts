// Tipos del módulo de Recursos Humanos / Pases de personal.

export interface IPaseCategoria {
  Id?: number
  Name: string
  Tipo: string // 'E' = entrada, 'S' = salida
  Description?: string | null
  Status_Id?: number
  Create_By?: string
  Modified_By?: string
}

export interface IEmpleado {
  EmpleadoCode: string
  CodAlterno?: string | null
  EmpleadoNombre: string
  cod_Departamento?: string | null
  Departamento?: string | null
  JefeCode?: string | null
  JefeNombre?: string | null
}

export interface IAprobador {
  User_Code: string
  Nombre: string
  ExternalCode?: string | null // código PayWeb (para preseleccionar al jefe)
}

export interface ICrearPase {
  EmpleadoCode: string
  Categoria_Id: number
  FechaPase: string // YYYY-MM-DD
  Observacion?: string | null
  Create_By: string
  AprobadorUser?: string
  AprobadorNombre?: string
}

export interface IPaseResult {
  Success: boolean
  SuccessMessage?: string
  ErrorMessage?: string
  Id?: number
  AprobadorUser?: string
  JefeNombre?: string
}

export interface IPase {
  Id: number
  EmpleadoCode?: string
  CodAlterno?: string | null
  EmpleadoNombre?: string
  Departamento?: string | null
  cod_Departamento?: string | null
  Categoria_Id?: number
  Categoria?: string
  Tipo?: string // E | S
  JefeCode?: string | null
  JefeNombre?: string | null
  AprobadorUser?: string | null
  AprobadorNombre?: string | null
  FechaPase?: string
  Observacion?: string | null
  Estado_Id?: number // 1=Pendiente 2=Aprobado 3=Rechazado 4=Utilizado 5=Vencido
  Estado?: string
  MotivoRechazo?: string | null
  Aprobado_By?: string | null
  Aprobacion_Date?: string | null
  Create_By?: string | null
  Creation_Date?: string | null
  RegistradoAt?: string | null
}

export interface IAprobarPase {
  Id: number
  Create_By: string
  MotivoRechazo?: string | null
}

export interface IRegistrarAcceso {
  EmpleadoCode: string
  Create_By: string
}

export interface IRegistrarAccesoResult {
  Success: boolean
  Valid: boolean
  Reason?: string // entrada | salida | notfound
  Message?: string
  PaseId?: number
  EmpleadoCode?: string
  EmpleadoNombre?: string
  Categoria?: string
  Tipo?: string
  FechaHora?: string
}
