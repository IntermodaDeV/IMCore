// Solicitudes de repuestos NO catalogados. Espejo de Core.Features.Repuestos
// (SolicitudesDTOs.cs) y de los mismos tipos del web, para que las tres capas
// digan lo mismo.
//
// El estado vive en la LÍNEA: cada pieza avanza a su ritmo. El de la solicitud
// es DERIVADO (el de su línea más atrasada) y lo calcula el servidor.

export type EstadoSolicitud =
  | 'SOLICITADO'
  | 'ENVIADO'
  | 'CREADO'
  | 'EN_SOLICITUD_COMPRA'
  | 'EN_ORDEN_COMPRA'
  | 'INGRESADO'
  | 'CANCELADO'

export interface ISolicitud {
  Id: number
  Numero: string
  Fecha: string
  Solicitante: string
  SolicitanteNombre: string | null
  Modelo: string
  Ticket_Id: number | null
  TicketCodigo: string | null
  MotivoSolicitud_Id: number
  Motivo: string | null
  Observacion: string | null
  Estado: EstadoSolicitud
  Lineas: number
  SinCodigo: number
  SinEnviar: number
  Ingresadas: number
  Canceladas: number
  SinBarcode: number
  Creation_Date: string | null
  PuedeEditar?: boolean
  PuedeAnular?: boolean
  MotivoBloqueo?: string | null
  PuedeGestionar?: boolean
}

export interface ISolicitudLinea {
  Id: number
  Solicitud_Id: number
  NumeroParte: string
  Descripcion: string
  Cantidad: number
  Estructura: string | null
  Familia: string | null
  Correlativo: string | null
  CodigoAX: string | null
  Barcode: string | null
  // Dónde encontró el mecánico la pieza en el manual, para que quien codifica se
  // vaya al dibujo exacto. Texto y no número: los manuales paginan '4-7', 'A-12'.
  PaginaManual: string | null
  FiguraManual: string | null
  Estado: EstadoSolicitud
  FechaEnvioDM: string | null
  FechaCreacionAX: string | null
  FechaValidacionAX: string | null
  BarcodeOk: boolean | null
  PurchReqId: string | null
  FechaSolicitudCompra: string | null
  PurchId: string | null
  FechaOrdenCompra: string | null
  FechaIngreso: string | null
  Creation_Date: string | null
  /** Si ESTE usuario puede editar o quitar esta pieza (lo decide el servidor). */
  PuedeTocar?: boolean
  MotivoBloqueo?: string | null
}

export interface ISolicitudHistorial {
  Id: number
  EstadoAnterior: string | null
  EstadoNuevo: string
  Referencia: string | null
  Origen: 'MANUAL' | 'CORREO' | 'AX'
  Comentario: string | null
  User_Code: string
  Usuario: string | null
  Fecha: string
}

export interface IMotivoSolicitud {
  Id: number
  Name: string
  Orden: number
  Status_Id: number
}

export interface IModeloMaquina {
  Modelo: string
  Marca: string | null
  Maquinas: number
}

export interface ISolicitudPermisos {
  PuedeGestionar: boolean
  PuedeEditarEnviada: boolean
}

export interface ISolicitudResult {
  Success: boolean
  SuccessMessage: string | null
  ErrorMessage: string | null
  Id: number | null
  Numero: string | null
  CodigoAX: string | null
  Barcode: string | null
  Advertencia: string | null
}
