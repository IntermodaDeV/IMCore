export interface Users {
  id?: number
  travelExpense: string
  expenseType: string
  provider: string
  providerRtn: string
  invoiceNumber: string
  description: string
  taxableAmount: number
  exemptAmount: number
  total: number
  invoiceDate: string
  status: 'Aprobado' | 'Pendiente' | string
}