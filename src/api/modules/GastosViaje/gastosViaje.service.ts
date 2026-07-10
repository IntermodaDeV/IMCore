import { httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'
import {
  TCompany,
  IGiraApiResponse,
  IGiraVendorResponse,
  IExpenseType,
  IExpenseCategory,
  IAlimentacionSubtype,
  IFuelType,
  ICurrency,
  ITaxConfig,
  IProviderSearchResult,
  IGastoViaje,
  IGastoHistorialDetail,
  IGastoHistorialResponse,
  ICreateGastoRequest,
  ISolicitarProveedorRequest,
  IApproveGastoRequest,
  IRejectGastoRequest,
} from './gastosViaje.types'


const MOCK_CURRENCIES: ICurrency[] = [
  { Id: 1, Name: 'Lempiras', Code: 'HNL' },
  { Id: 2, Name: 'Dólares', Code: 'USD' },
  { Id: 3, Name: 'Quetzales', Code: 'GTQ' },
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
  getExpenseTypes: async (company: string): Promise<ExecutionResponse<IExpenseType[]>> => {
    const res = await httpClient.get<IGiraApiResponse<IExpenseType[]>>(`Gira/ExpensesTypes/${company}`)
    return {
      Success: res.Succeeded,
      Data: res.Data,
      SuccessMessage: res.Message ?? '',
      ErrorMessage: res.Errors ?? '',
    }
  },

  getCategories: async (expenseTypeId: number, company: string): Promise<ExecutionResponse<IExpenseCategory[]>> => {
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

  getFuelTypes: async (company: string): Promise<ExecutionResponse<IFuelType[]>> => {
    const res = await httpClient.get<IGiraApiResponse<IFuelType[]>>(`Gira/FuelTypes/${company}`)
    return {
      Success: res.Succeeded,
      Data: res.Data,
      SuccessMessage: res.Message ?? '',
      ErrorMessage: res.Errors ?? '',
    }
  },

  getCurrencies: async (_company: string): Promise<ExecutionResponse<ICurrency[]>> => {
    await delay(100)
    return { Success: true, Data: MOCK_CURRENCIES, SuccessMessage: 'OK', ErrorMessage: '' }
  },

  getTaxConfig: async (_company: string): Promise<ExecutionResponse<ITaxConfig>> => {
    const res = await httpClient.get<IGiraApiResponse<{TAXCODE:string, TAXVALUE: number}[]>>(`Gira/TaxPercentage/${_company}`)
    return { Success: true, Data: { Rate: (res.Data[0].TAXVALUE / 100)}, SuccessMessage: 'OK', ErrorMessage: '' }
  },

  searchProvider: async (query: string, company: string): Promise<ExecutionResponse<IGiraVendorResponse[]>> => {
    const res = await httpClient.get<IGiraApiResponse<IGiraVendorResponse[]>>(`Gira/Vendors/${encodeURIComponent(query)}/${company}`)
    return {
      Success: res.Succeeded,
      Data: res.Data,
      SuccessMessage: res.Message ?? '',
      ErrorMessage: res.Errors ?? '',
    }
  },

  getHistory: async (
    personalCode: string,
    company: string,
    dateFrom: string,
    dateTo: string,
    statusId: number
  ): Promise<ExecutionResponse<IGastoHistorialResponse>> => {
    const res = await httpClient.get<IGiraApiResponse<IGastoHistorialResponse>>(
      `Gira/HistoricalDetails/${company}/${statusId}/${dateFrom}/${dateTo}?personalCode=${personalCode}`
    )
    return {
      Success: res.Succeeded,
      Data: { Details: res.Data.Details, PendingAmount: res.Data.PendingAmount },
      SuccessMessage: res.Message ?? '',
      ErrorMessage: res.Errors ?? '',
    }
  },

  getHistoryRevision: async (
    company: string,
    dateFrom: string,
    dateTo: string,
    statusId: number
  ): Promise<ExecutionResponse<IGastoHistorialDetail[]>> => {
    const res = await httpClient.get<IGiraApiResponse<IGastoHistorialDetail[]>>(
      `Gira/PendingApprovals/${company}`
    )
    return {
      Success: res.Succeeded,
      Data: res.Data,
      SuccessMessage: res.Message ?? '',
      ErrorMessage: res.Errors ?? '',
    }
  },

  createGasto: async (data: ICreateGastoRequest): Promise<IGiraApiResponse<IGastoHistorialDetail>> => {
    const res = await httpClient.post<IGiraApiResponse<IGastoHistorialDetail>>('Gira/ExpenseDetail', data)
    return {
      Succeeded: res.Succeeded,
      Data: res.Data,
      Message: res.Message ?? '',
      Errors: '',
      EstatusCode: res.EstatusCode ?? 0
    }
  },

  solicitarProveedor: async (
    companyCode: string,
    _data: ISolicitarProveedorRequest
  ): Promise<ExecutionResponse<ISolicitarProveedorRequest>> => {
    const res = await httpClient.post<IGiraApiResponse<ISolicitarProveedorRequest>>(
      `Gira/EmailNewVendor/${companyCode}`,
      _data
    );

    return {
      Success: res.Succeeded,
      Data: res.Data,
      SuccessMessage: res.Message ?? "",
      ErrorMessage: res.Errors ?? ""
    };
  },

  
  getPendingApprovals: async (_company: string, _userCode: string): Promise<ExecutionResponse<string>> => {
    const res = await httpClient.post<IGiraApiResponse<string>>(
      `Gira/PendingAX/${_company}/${_userCode}`
    );
    return { Success: res.Succeeded, Data: res.Data, SuccessMessage: res.Message ?? "", ErrorMessage: res.Errors ?? "" }
  },

  approveGasto: async (_data: IApproveGastoRequest): Promise<ExecutionResponse<boolean>> => {
    const res = await httpClient.post<IGiraApiResponse<IGastoHistorialDetail[]>>(
      `Gira/ApproveExpense/${_data.Company}/${_data.GastoId}/${_data.FinansiCode}`
    );

    return {
      Success: res.Succeeded,
      Data: true,
      SuccessMessage: res.Message ?? "",
      ErrorMessage: res.Errors ?? ""
    };
  },

  rejectGasto: async (_data: IRejectGastoRequest): Promise<ExecutionResponse<boolean>> => {
    const res = await httpClient.post<IGiraApiResponse<IGastoHistorialDetail[]>>(
      `Gira/ApproveExpense/${_data.Company}/${_data.GastoId}/${_data.FinansiCode}/${_data.Reason}`
    );

    return {
      Success: res.Succeeded,
      Data: true,
      SuccessMessage: res.Message ?? "",
      ErrorMessage: res.Errors ?? ""
    };
  },
}
