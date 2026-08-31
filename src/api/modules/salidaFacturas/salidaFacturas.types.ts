// Tipos del módulo Control de Salida de Facturas (CD).
// Espejo de los DTOs del backend (Core.Features.Facturas). La API mantiene
// PascalCase (PropertyNamingPolicy = null), por eso las claves van tal cual el JSON.
//
// Del guardia llegan DOS campos: el nombre (para mostrar) y el User_Code (la
// identidad). Los registros que dejó la app vieja traen solo el nombre, así que el
// Code puede venir null incluso en facturas ya salidas — mostrar siempre el nombre.

// Una línea de la factura: el artículo con su talla y color, que es lo que el
// guardia cuenta. LineNum es la llave dentro de la factura (viene de AX).
export interface ISalidaFacturaLinea {
  LineNum: number
  ItemId: string | null
  Descripcion: string | null
  Cantidad: number | null
  Talla: string | null
  Color: string | null
  Revisado: boolean
  FechaRevisado: string | null
  RevisadoPor: string | null        // nombre del guardia que la marcó
  RevisadoPorCode: string | null    // User_Code (null en registros de la app vieja)
}

// Cabecera de la factura en control.
export interface ISalidaFacturaCabecera {
  InvoiceId: string | null
  DataAreaId: string | null
  Cliente: string | null
  FechaFactura: string | null
  PedidoVenta: string | null
  Estado: string | null            // EN_REVISION | COMPLETADA
  FechaInicio: string | null
  FechaSalida: string | null
  GuardiaInicio: string | null      // nombre de quien la puso en revisión
  GuardiaSalida: string | null      // nombre de quien confirmó la salida
  GuardiaInicioCode: string | null  // User_Code (null en registros de la app vieja)
  GuardiaSalidaCode: string | null
  // Corte por fecha: el control arrancó el 31/08/2026 y lo anterior no se procesa.
  // La fecha vive en la BD (CTRL_SALIDA_CONFIG), no compilada, y el texto lo arma
  // el servidor para que sea el mismo en todos los caminos.
  FechaMinima: string | null
  AnteriorAlCorte: boolean
  MensajeBloqueo: string | null
}

// Lo que devuelve el escaneo. Bloqueada = no hay nada que marcar y no vienen
// artículos; MotivoBloqueo dice por qué (son dos avisos distintos para el guardia).
export type MotivoBloqueo = 'SALIO' | 'ANTERIOR_AL_CORTE'

export interface ISalidaFactura extends ISalidaFacturaCabecera {
  Bloqueada: boolean
  MotivoBloqueo: MotivoBloqueo | null
  Items: ISalidaFacturaLinea[]
}

// Avance tras marcar/desmarcar un artículo (evita recargar toda la factura).
export interface ISalidaFacturaAvance {
  TotalLineas: number
  LineasRevisadas: number
}

// Resultado de confirmar la salida.
export interface ISalidaFacturaResultado {
  Success: boolean
  SuccessMessage: string | null
  ErrorMessage: string | null
  FechaSalida: string | null
}

// Fila del historial: cabecera + avance de la revisión.
export interface ISalidaFacturaHistorial extends ISalidaFacturaCabecera {
  TotalLineas: number
  LineasRevisadas: number
  TotalPiezas: number
}

// Filtros del historial (todos opcionales). fecha en 'YYYY-MM-DD'.
export interface ISalidaFacturaFiltros {
  factura?: string
  cliente?: string
  fecha?: string
}
