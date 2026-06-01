
export interface ExecutionResponse<T> {
  Data: T
  SuccessMessage: string
  ErrorMessage: string
  Success: boolean
}


export interface ExecutionResponseLogin<T> {
  InfoUser: string
  SuccessMessage: string
  ErrorMessage: string
  Success: boolean
}