export type TCompany = 'IMHN' | 'IMGT' | 'IMCR'


export enum ECompany {
  IMHN = 'IMHN',
  IMGT = 'IMGT',
  IMCR = 'IMCR',
}



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
  MarkupCode?: string
  CompanyCode?: string
}

export interface ICurrency {
  Id: number
  Name: string
  Code: string
}

export interface ITaxConfig {
  Rate: number
}

export interface IGiraVendorResponse {
  VATNUM: string
  NAME: string
  ACCOUNTNUM: string
  CURRENCY: string
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
  Company: TCompany
  Icon?: string
}

export interface IGastoHistorialDetail {
  Id: number
  ExpenseCategoryId: number
  MealId: number | null
  FuelTypeId: number | null
  StatusId: number
  PersonalCode: string
  VendAccount: string
  VendName: string
  VatNum: string
  Currency: string
  Description: string | null
  InvoiceId: string | null
  SeriesNum: string | null
  ExemptAmount: number
  GravadoAmount: number
  InvoiceAmount: number
  InvoiceDate: string
  ImagePath: string | null
  CreationDate: string
  PersonalCodeAdmin: string | null
  RejectionMotive: string | null
  JournalNum: string | null
  CompanyCode: string
  AXMessage: string | null
  InUse: boolean
  ExpenseCategoryName: string
  ExpenseTypeName: string
  Icon: string
  FuelTypeName: string | null
  StatusName: string
  Code: string
  Name: string
}

export interface IGastoHistorialResponse {
  Details: IGastoHistorialDetail[]
  PendingAmount: number
}

export interface IApproveGastoRequest {
  GastoId: number
  ApproverCode: string
  Company: string
}

export interface IRejectGastoRequest {
  GastoId: number
  ApproverCode: string
  Company: string
  Reason: string
}

export interface ICreateGastoRequest {
  id: number
  expenseCategoryId: number
  mealId: number | null
  fuelTypeId: number | null
  statusId: number
  personalCode: string
  vendAccount: string
  description: string
  invoiceId: string
  seriesNum: string
  exemptAmount: number
  gravadoAmount: number
  invoiceAmount: number
  invoiceDate: string
  imagePath: string | null
  imageBase64: string
  personalCodeAdmin: string
  rejectionMotive: string
  journalNum: string
  companyCode: string
  axMessage: string
  inUse: boolean
}

export interface ISolicitarProveedorRequest {
  PersonalCode: string
  VendName: string
  VatNum?: string
  CompanyCode: string
  Justification: string
}
