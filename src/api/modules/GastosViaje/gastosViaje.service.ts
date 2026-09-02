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
  IExpenseDateRange,
} from './gastosViaje.types'



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

  getTaxConfig: async (_company: string): Promise<ExecutionResponse<ITaxConfig>> => {
    const res = await httpClient.get<IGiraApiResponse<{TAXCODE:string, TAXVALUE: number}[]>>(`Gira/TaxPercentage/${_company}`)
    return { Success: true, Data: { Rate: (res.Data[0].TAXVALUE / 100)}, SuccessMessage: 'OK', ErrorMessage: '' }
  },

  getExpenseDateRange: async (company: string): Promise<ExecutionResponse<IExpenseDateRange>> => {
    const res = await httpClient.get<IGiraApiResponse<IExpenseDateRange>>(`Gira/ExpenseDateRange/${company}`)
    return {
      Success: res.Succeeded,
      Data: res.Data,
      SuccessMessage: res.Message ?? '',
      ErrorMessage: res.Errors ?? '',
    }
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

  getHistoricalDetailById: async (
    id: string,
  ): Promise<ExecutionResponse<IGastoHistorialDetail>> => {
    const res = await httpClient.get<IGiraApiResponse<IGastoHistorialDetail>>(
      `Gira/HistoricalDetailById/${id}`
    )
    return {
      Success: res.Succeeded,
      Data: res.Data,
      SuccessMessage: res.Message ?? '',
      ErrorMessage: res.Errors ?? '',
    }
  },

  createGasto: async (data: ICreateGastoRequest, userCode: string): Promise<IGiraApiResponse<IGastoHistorialDetail>> => {
    const res = await httpClient.post<IGiraApiResponse<IGastoHistorialDetail>>(`Gira/ExpenseDetail/${userCode}`, data)
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

  
  getPendingApprovals: async (_company: string, finansiiCode: string, personalCode: string): Promise<ExecutionResponse<string>> => {
    const res = await httpClient.post<IGiraApiResponse<string>>(
      `Gira/PendingAX/${_company}/${finansiiCode}/${personalCode}`
    );
    return { Success: res.Succeeded, Data: res.Data, SuccessMessage: res.Message ?? "", ErrorMessage: res.Errors ?? "" }
  },

  approveGasto: async (_data: IApproveGastoRequest, _userCode: string): Promise<ExecutionResponse<boolean>> => {
    const res = await httpClient.post<IGiraApiResponse<IGastoHistorialDetail[]>>(
      `Gira/ApproveExpense/${_data.Company}/${_data.GastoId}/${_data.FinansiCode}/${_userCode}`
    );

    return {
      Success: res.Succeeded,
      Data: true,
      SuccessMessage: res.Message ?? "",
      ErrorMessage: res.Errors ?? res.Message ?? ""
    };
  },

  rejectGasto: async (_data: IRejectGastoRequest, _userCode: string): Promise<ExecutionResponse<boolean>> => {
    const res = await httpClient.post<IGiraApiResponse<IGastoHistorialDetail[]>>(
      `Gira/ApproveExpense/${_data.Company}/${_data.GastoId}/${_data.FinansiCode}/${_userCode}/${_data.Reason}`
    );

    return {
      Success: res.Succeeded,
      Data: true,
      SuccessMessage: res.Message ?? "",
      ErrorMessage: res.Errors ?? ""
    };
  },
}
