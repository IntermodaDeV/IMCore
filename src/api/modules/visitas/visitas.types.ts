export interface IMotivo {
  Id: number
  Name: string
  Description?: string | null
  Status_Id: number
  Create_By?: string
  Modified_By?: string
}

export interface IGenerarVisita {
  VisitTo: string
  Motivo_Id: number
  VisitReasonOther?: string | null
  EntryDate: string // YYYY-MM-DD (día del pase único; fallback)
  IsRecurrent?: boolean
  Dias?: string[] // YYYY-MM-DD (días permitidos: recurrente o rango expandido)
  Create_By: string
  Personas: string[]
}

export interface IVisitaResult {
  Success: boolean
  SuccessMessage?: string
  ErrorMessage?: string
  Id: number
  Token: string
}

export interface IValidarResult {
  Success: boolean
  Valid: boolean
  Reason?: string // entrada | salida | outofrange | notfound
  Message?: string
  Personas?: string | null
  VisitTo?: string | null
  Motivo?: string | null
  VisitReasonOther?: string | null
  EntryDate?: string | null
  UsedAt?: string | null // entrada del movimiento
  ExitAt?: string | null // salida del movimiento
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
  DiasCount?: number
  AccesosCount?: number
  Used: boolean
  UsedAt?: string | null // primera entrada
  ExitAt?: string | null // última salida
  DentroAhora?: boolean // tiene un movimiento abierto hoy
  EstadoPase?: string // pendiente | vigente | finalizado
  Status_Id: number
  Create_By?: string
  Creation_Date?: string
  Personas?: string
}

export interface IVisitaAcceso {
  Id: number
  Visita_Id: number
  AccessDate: string // YYYY-MM-DD
  EntradaAt: string
  SalidaAt?: string | null
  EntradaBy?: string | null
  SalidaBy?: string | null
}
