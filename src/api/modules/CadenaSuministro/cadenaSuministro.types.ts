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
  ImporteNeto: number
  Categoria: string
  Articulos: ISolicitudCompraArticulo[]
  expandido?: boolean
  justificacion?: string
}