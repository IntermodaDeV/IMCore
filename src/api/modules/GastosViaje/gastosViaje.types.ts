export type Company = 'IMHN' | 'IMGT' | 'IMCR'

export interface IGiraApiResponse<T> {
  Succeeded: boolean
  Message: string | null
  Errors: string | null
  Data: T
  EstatusCode: number
}

export interface IExpenseType {
  Id: number
  Name: string
  Journal?: string
  CompanyCode?: string
  State?: boolean
  Icon?: string
}

export interface IExpenseCategory {
  Id: number
  IdExpenseType: number
  Name: string
  IsInvoiceRequired: boolean
  IsDescriptionRequired: boolean
  IsImageRequired: boolean
  VendAccount?: string | null
  CompanyCode?: string
  Status?: boolean
  ExpenseType?: IExpenseType
}

export interface IAlimentacionSubtype {
  Id: number
  Name: string
}

export interface IFuelType {
  Id: number
  Name: string
}

export interface ICurrency {
  Id: number
  Name: string
  Code: string
}

export interface ITaxConfig {
  Rate: number
}

export interface IProviderSearchResult {
  Id: number
  Code: string
  Name: string
  Rtn: string
}

export type ExpenseStatus = 'Pendiente' | 'Sincronizado' | 'Rechazado'

export interface IGastoViaje {
  Id: number
  CategoryId: number
  CategoryName: string
  ExpenseTypeName: string
  InvoiceNumber?: string
  SerialNumber?: string
  Description?: string
  GravedAmount: number
  ExemptAmount: number
  Total: number
  CurrencyCode?: string
  InvoiceDate: string
  Status: ExpenseStatus
  ProviderCode: string
  ProviderName: string
  ProviderRtn?: string
  HasImage: boolean
  FuelTypeName?: string
  Gallons?: number
  RejectionReason?: string
  CreatedAt: string
  UserCode: string
  UserName?: string
  Company: Company
}

export interface IApproveGastoRequest {
  GastoId: number
  ApproverCode: string
  Company: Company
}

export interface IRejectGastoRequest {
  GastoId: number
  ApproverCode: string
  Company: Company
  Reason: string
}

export interface ICreateGastoRequest {
  UserCode: string
  Company: Company
  CategoryId: number
  InvoiceNumber?: string
  SerialNumber?: string
  Description?: string
  GravedAmount: number
  ExemptAmount: number
  Total: number
  CurrencyId?: number
  InvoiceDate: string
  ProviderCode?: string
  ProviderName: string
  ProviderRtn?: string
  ImageBase64?: string
  FuelTypeId?: number
  Gallons?: number
}

export interface ISolicitarProveedorRequest {
  UserCode: string
  ProviderName: string
  ProviderRtn?: string
  Country: string
  Justification: string
}
