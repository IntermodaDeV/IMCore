import { httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'
import {
  Company,
  IGiraApiResponse,
  IExpenseType,
  IExpenseCategory,
  IAlimentacionSubtype,
  IFuelType,
  ICurrency,
  ITaxConfig,
  IProviderSearchResult,
  IGastoViaje,
  ICreateGastoRequest,
  ISolicitarProveedorRequest,
  IApproveGastoRequest,
  IRejectGastoRequest,
} from './gastosViaje.types'

const MOCK_EXPENSE_TYPES: IExpenseType[] = [
  { Id: 1, Name: 'Alimentación' },
  { Id: 2, Name: 'Combustible' },
  { Id: 3, Name: 'Hospedaje' },
  { Id: 4, Name: 'Otros' },
]



const MOCK_FUEL_TYPES: IFuelType[] = [
  { Id: 1, Name: 'Diesel' },
  { Id: 2, Name: 'Regular' },
  { Id: 3, Name: 'Super' },
]

const MOCK_CURRENCIES: ICurrency[] = [
  { Id: 1, Name: 'Lempiras', Code: 'HNL' },
  { Id: 2, Name: 'Dólares', Code: 'USD' },
  { Id: 3, Name: 'Quetzales', Code: 'GTQ' },
]

const MOCK_PROVIDERS: IProviderSearchResult[] = [
  { Id: 1, Code: 'PVR-00001', Name: 'PUMA Centro',              Rtn: '06019011000053' },
  { Id: 2, Code: 'PVR-00002', Name: 'Texaco San Pedro',          Rtn: '05019005000021' },
  { Id: 3, Code: 'PVR-00003', Name: 'Restaurante El Buen Gusto', Rtn: '08011985000012' },
  { Id: 4, Code: 'PVR-00004', Name: 'Hotel Real Tegucigalpa',    Rtn: '08019004000078' },
  { Id: 5, Code: 'PVR-00005', Name: 'Ferrería Central',          Rtn: '08011972000034' },
]

const MOCK_HISTORY: IGastoViaje[] = [
  {
    Id: 1,
    CategoryId: 1,
    CategoryName: 'Restaurante',
    ExpenseTypeName: 'Alimentación',
    InvoiceNumber: '000-001-01-00000001',
    Description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    GravedAmount: 29.57,
    ExemptAmount: 0,
    Total: 34.00,
    InvoiceDate: '2026-06-17',
    Status: 'Pendiente',
    ProviderCode: 'PRV-0000001',
    ProviderName: 'Restaurante El Buen Gusto',
    HasImage: true,
    CreatedAt: '2026-06-17',
    UserCode: 'USR001',
    Company: 'IMHN',
  },
  {
    Id: 2,
    CategoryId: 3,
    CategoryName: 'Combustible',
    ExpenseTypeName: 'Combustible',
    InvoiceNumber: '000-002-01-00011580',
    Description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    GravedAmount: 1556.52,
    ExemptAmount: 0,
    Total: 1790.00,
    InvoiceDate: '2026-01-27',
    Status: 'Sincronizado',
    ProviderCode: 'PRV-0000001',
    ProviderName: 'PUMA Centro',
    ProviderRtn: '06019011000053',
    HasImage: true,
    FuelTypeName: 'Diesel',
    CreatedAt: '2026-01-27',
    UserCode: 'USR001',
    Company: 'IMHN',
  },
  {
    Id: 3,
    CategoryId: 4,
    CategoryName: 'Hotel',
    ExpenseTypeName: 'Hospedaje',
    InvoiceNumber: '000-002-01-00013470',
    GravedAmount: 913.04,
    ExemptAmount: 0,
    Total: 1050.00,
    InvoiceDate: '2026-02-20',
    Status: 'Pendiente',
    ProviderCode: 'PRV-0000001',
    ProviderName: 'Hotel Real Tegucigalpa',
    HasImage: true,
    CreatedAt: '2026-02-20',
    UserCode: 'USR001',
    Company: 'IMHN',
  },
  {
    Id: 4,
    CategoryId: 7,
    CategoryName: 'Gastos varios',
    ExpenseTypeName: 'Otros',
    InvoiceNumber: '000-003-01-00012690',
    GravedAmount: 304.35,
    ExemptAmount: 0,
    Total: 350.00,
    InvoiceDate: '2026-02-18',
    Status: 'Pendiente',
    ProviderCode: 'PRV-0000001',
    ProviderName: 'Ferrería Central',
    HasImage: false,
    CreatedAt: '2026-02-18',
    UserCode: 'USR001',
    Company: 'IMHN',
  },
  {
    Id: 5,
    CategoryId: 3,
    CategoryName: 'Combustible',
    ExpenseTypeName: 'Combustible',
    InvoiceNumber: '000-001-01-00009820',
    GravedAmount: 391.30,
    ExemptAmount: 0,
    Total: 450.00,
    InvoiceDate: '2026-01-15',
    Status: 'Rechazado',
    ProviderCode: 'PRV-0000001',
    ProviderName: 'Texaco San Pedro',
    HasImage: true,
    FuelTypeName: 'Regular',
    RejectionReason: 'Factura ilegible. Por favor resubir imagen con mejor calidad.',
    CreatedAt: '2026-01-15',
    UserCode: 'USR001',
    Company: 'IMHN',
  },
]

const MOCK_PENDING_APPROVALS: IGastoViaje[] = [
  {
    Id: 101, CategoryId: 1, CategoryName: 'Restaurante', ExpenseTypeName: 'Alimentación',
    InvoiceNumber: '000-001-01-00000234', GravedAmount: 86.96, ExemptAmount: 0, Total: 100.00,
    CurrencyCode: 'HNL', InvoiceDate: '2026-06-20', Status: 'Pendiente',
    ProviderCode: 'PRV-0000003', ProviderName: 'Restaurante El Buen Gusto', HasImage: true,
    CreatedAt: '2026-06-20T08:14:00.000Z', UserCode: 'USR-0001', UserName: 'Carlos Martínez', Company: 'IMHN',
  },
  {
    Id: 102, CategoryId: 3, CategoryName: 'Combustible', ExpenseTypeName: 'Combustible',
    InvoiceNumber: '000-002-01-00045120', GravedAmount: 652.17, ExemptAmount: 0, Total: 750.00,
    CurrencyCode: 'HNL', InvoiceDate: '2026-06-19', Status: 'Pendiente',
    ProviderCode: 'PRV-0000001', ProviderName: 'PUMA Centro', ProviderRtn: '06019011000053',
    FuelTypeName: 'Diesel', Gallons: 22.5, HasImage: true,
    CreatedAt: '2026-06-19T14:30:00.000Z', UserCode: 'USR-0002', UserName: 'María López', Company: 'IMHN',
  },
  {
    Id: 103, CategoryId: 4, CategoryName: 'Hotel', ExpenseTypeName: 'Hospedaje',
    InvoiceNumber: '000-003-01-00011890', GravedAmount: 1739.13, ExemptAmount: 0, Total: 2000.00,
    CurrencyCode: 'HNL', InvoiceDate: '2026-06-18', Status: 'Pendiente',
    ProviderCode: 'PRV-0000004', ProviderName: 'Hotel Real Tegucigalpa', HasImage: true,
    Description: 'Estadía 2 noches — reunión de directivos en Tegucigalpa',
    CreatedAt: '2026-06-18T10:00:00.000Z', UserCode: 'USR-0003', UserName: 'Roberto Andrade', Company: 'IMHN',
  },
  {
    Id: 104, CategoryId: 7, CategoryName: 'Gastos varios', ExpenseTypeName: 'Otros',
    InvoiceNumber: '000-004-01-00008760', GravedAmount: 130.43, ExemptAmount: 0, Total: 150.00,
    CurrencyCode: 'HNL', InvoiceDate: '2026-06-17', Status: 'Pendiente',
    ProviderCode: 'PRV-0000005', ProviderName: 'Ferrería Central', HasImage: false,
    Description: 'Materiales para instalación de equipo',
    CreatedAt: '2026-06-17T16:45:00.000Z', UserCode: 'USR-0004', UserName: 'Ana Figueroa', Company: 'IMHN',
  },
  {
    Id: 105, CategoryId: 2, CategoryName: 'Supermercado', ExpenseTypeName: 'Alimentación',
    InvoiceNumber: '000-001-01-00001120', GravedAmount: 43.48, ExemptAmount: 0, Total: 50.00,
    CurrencyCode: 'USD', InvoiceDate: '2026-06-16', Status: 'Pendiente',
    ProviderCode: 'PRV-0000006', ProviderName: 'La Colonia San Pedro', HasImage: true,
    CreatedAt: '2026-06-16T12:20:00.000Z', UserCode: 'USR-0001', UserName: 'Carlos Martínez', Company: 'IMHN',
  },
]

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

export const gastosViajeService = {
  getExpenseTypes: async (company: Company): Promise<ExecutionResponse<IExpenseType[]>> => {
    const res = await httpClient.get<IGiraApiResponse<IExpenseType[]>>(`Gira/ExpensesTypes/${company}`)
    return {
      Success: res.Succeeded,
      Data: res.Data,
      SuccessMessage: res.Message ?? '',
      ErrorMessage: res.Errors ?? '',
    }
  },

  getCategories: async (expenseTypeId: number, company: Company): Promise<ExecutionResponse<IExpenseCategory[]>> => {
    const res = await httpClient.get<IGiraApiResponse<IExpenseCategory[]>>(`Gira/ExpensesCategories/${company}`)
    return {
      Success: res.Succeeded,
      Data: res.Data.filter(c => c.IdExpenseType === expenseTypeId),
      SuccessMessage: res.Message ?? '',
      ErrorMessage: res.Errors ?? '',
    }
  },

  getAlimentacionSubtypes: async (): Promise<ExecutionResponse<IAlimentacionSubtype[]>> => {
    const res = await httpClient.get<IGiraApiResponse<IAlimentacionSubtype[]>>('Gira/Meals')
    return {
      Success: res.Succeeded,
      Data: res.Data,
      SuccessMessage: res.Message ?? '',
      ErrorMessage: res.Errors ?? '',
    }
  },

  getFuelTypes: async (): Promise<ExecutionResponse<IFuelType[]>> => {
    await delay(100)
    return { Success: true, Data: MOCK_FUEL_TYPES, SuccessMessage: 'OK', ErrorMessage: '' }
  },

  getCurrencies: async (_company: Company): Promise<ExecutionResponse<ICurrency[]>> => {
    await delay(100)
    return { Success: true, Data: MOCK_CURRENCIES, SuccessMessage: 'OK', ErrorMessage: '' }
  },

  getTaxConfig: async (_company: Company): Promise<ExecutionResponse<ITaxConfig>> => {
    await delay(100)
    return { Success: true, Data: { Rate: 0.15 }, SuccessMessage: 'OK', ErrorMessage: '' }
  },

  getProviders: async (_company: Company): Promise<ExecutionResponse<IProviderSearchResult[]>> => {
    await delay(300)
    return { Success: true, Data: MOCK_PROVIDERS, SuccessMessage: 'OK', ErrorMessage: '' }
  },

  searchProvider: async (query: string): Promise<ExecutionResponse<IProviderSearchResult[]>> => {
    await delay(300)
    const q = query.trim().toLowerCase()
    if (!q) return { Success: true, Data: MOCK_PROVIDERS, SuccessMessage: 'OK', ErrorMessage: '' }
    const results = MOCK_PROVIDERS.filter(p =>
      p.Code.toLowerCase().includes(q) ||
      p.Name.toLowerCase().includes(q) ||
      p.Rtn.includes(q)
    )
    if (results.length > 0) return { Success: true, Data: results, SuccessMessage: 'Proveedores encontrados', ErrorMessage: '' }
    return { Success: false, Data: [], SuccessMessage: '', ErrorMessage: 'No se encontraron proveedores' }
  },

  getHistory: async (_userCode: string, _company: Company): Promise<ExecutionResponse<IGastoViaje[]>> => {
    await delay(600)
    return { Success: true, Data: MOCK_HISTORY, SuccessMessage: 'OK', ErrorMessage: '' }
  },

  createGasto: async (data: ICreateGastoRequest): Promise<ExecutionResponse<IGastoViaje>> => {
    await delay(800)
    const newGasto: IGastoViaje = {
      Id: Math.floor(Math.random() * 9000) + 1000,
      CategoryId: data.CategoryId,
      CategoryName: 'Pendiente',
      ExpenseTypeName: 'Pendiente',
      ProviderCode: data.ProviderCode ?? '',
      InvoiceNumber: data.InvoiceNumber,
      SerialNumber: data.SerialNumber,
      Description: data.Description,
      GravedAmount: data.GravedAmount,
      ExemptAmount: data.ExemptAmount,
      Total: data.Total,
      InvoiceDate: data.InvoiceDate,
      Status: 'Pendiente',
      ProviderName: data.ProviderName,
      ProviderRtn: data.ProviderRtn,
      HasImage: !!data.ImageBase64,
      CreatedAt: new Date().toISOString(),
      UserCode: data.UserCode,
      Company: data.Company,
    }
    return { Success: true, Data: newGasto, SuccessMessage: 'Gasto registrado correctamente', ErrorMessage: '' }
  },

  solicitarProveedor: async (_data: ISolicitarProveedorRequest): Promise<ExecutionResponse<boolean>> => {
    await delay(600)
    return { Success: true, Data: true, SuccessMessage: 'Solicitud enviada correctamente', ErrorMessage: '' }
  },

  syncGastos: async (_userCode: string, _company: Company): Promise<ExecutionResponse<IGastoViaje[]>> => {
    await delay(1000)
    return { Success: true, Data: MOCK_HISTORY, SuccessMessage: 'Sincronización completada', ErrorMessage: '' }
  },

  // TODO: conectar al endpoint real
  getPendingApprovals: async (_company: Company): Promise<ExecutionResponse<IGastoViaje[]>> => {
    await delay(600)
    return { Success: true, Data: MOCK_PENDING_APPROVALS, SuccessMessage: 'OK', ErrorMessage: '' }
  },

  // TODO: conectar al endpoint real
  approveGasto: async (_data: IApproveGastoRequest): Promise<ExecutionResponse<boolean>> => {
    await delay(700)
    return { Success: true, Data: true, SuccessMessage: 'Gasto aprobado correctamente', ErrorMessage: '' }
  },

  // TODO: conectar al endpoint real
  rejectGasto: async (_data: IRejectGastoRequest): Promise<ExecutionResponse<boolean>> => {
    await delay(700)
    return { Success: true, Data: true, SuccessMessage: 'Gasto rechazado correctamente', ErrorMessage: '' }
  },
}
