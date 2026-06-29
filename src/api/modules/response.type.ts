
export interface ExecutionResponse<T> {
  Data: T
  SuccessMessage: string
  ErrorMessage: string
  Success: boolean
  extras?: Record<string, any>
}


export interface ExecutionResponseLogin<T> {
  InfoUser: string
  SuccessMessage: string
  ErrorMessage: string
  Success: boolean
}