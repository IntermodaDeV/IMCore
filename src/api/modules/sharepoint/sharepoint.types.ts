// Respuesta estándar del endpoint de SharePoint en IMCoreApi (wrapper Response<T>).
export interface SharePointResponse<T> {
  Succeeded: boolean
  Message: string | null
  Errors: string[] | null
  Data: T
  EstatusCode: number
}

// Un ítem de la lista de SharePoint. Los campos vienen en Fields con los nombres
// internos de Graph (field_1, Title, etc.).
export interface SharePointItem {
  Id: string
  Fields: Record<string, any>
}
