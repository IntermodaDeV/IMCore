export interface ISolicitudCompraArticulo {
  NombreProducto?: string
  Cantidad: number
  Precio: number
  Moneda: string
  ImporteNeto: number
}

export interface ISolicitudCompraUsuario {
  Solicitud: string
  Preparador: string
  PreparadorCode?: string
  ImporteNeto: number
  Categoria: string
  Comentario?: string
  Articulos: ISolicitudCompraArticulo[]
  expandido?: boolean
  justificacion?: string
}

export interface IApprovalHistoryDetalle {
  Id: number
  ApprovalHistory_Id: number
  NombreProducto?: string
  Cantidad: number
  Precio: number
  Moneda: string
  ImporteNeto: number
}

export interface IApprovalHistory {
  Id: number
  Solicitud: string
  User_Code: string
  Estado: string
  Preparador: string
  ImporteNeto: number
  Categoria: string
  Comentario?: string
  Name: string
  Creation_Date: string
  Articulos?: IApprovalHistoryDetalle[]
}

export interface ISolicitud {
  Solicitud: string
  Usuario: string
  Estado: string
  PreparadorCode?: string
  Preparador: string
  ImporteNeto: number
  Categoria: string
  Comentario?: string
}