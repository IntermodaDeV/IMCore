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
  Articulos: ISolicitudCompraArticulo[]
  expandido?: boolean
  justificacion?: string
}

export interface IApprovalHistory {
  Solicitud: string
  User_Code: string
  Estado: string
  Preparador: string
  ImporteNeto: number
  Categoria: string
  Name: string
  Creation_Date: string
}

export interface ISolicitud {
  Solicitud: string
  Usuario: string
  Estado: string
  PreparadorCode?: string
  Preparador: string
  ImporteNeto: number
  Categoria: string
}