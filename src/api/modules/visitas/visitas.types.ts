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
  EntryDate: string // YYYY-MM-DD
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
  Reason?: string // ok | used | notfound
  Message?: string
  Personas?: string | null
  VisitTo?: string | null
  Motivo?: string | null
  VisitReasonOther?: string | null
  EntryDate?: string | null
  UsedAt?: string | null
}

export interface IHistorial {
  Id: number
  Token: string
  VisitTo: string
  Motivo: string
  VisitReasonOther?: string | null
  EntryDate: string
  Used: boolean
  UsedAt?: string | null
  ExitAt?: string | null
  Status_Id: number
  Create_By?: string
  Creation_Date?: string
  Personas?: string
}
