// Tipos del módulo Repuestos (Despacho de repuestos / diarios de rebaja AX).
// Espejo de los DTOs del backend (Core.Features.Repuestos). La API mantiene
// PascalCase (PropertyNamingPolicy = null), por eso las claves van tal cual el JSON.

// Cabecera de diario (SP_Diario_PorUsuario → local). NumeroLineas = líneas confirmadas.
export interface IDiario {
  JournalId: string
  Descripcion: string
  NumeroLineas: number
  Almacen: string
  Estado: string   // ABIERTO | POSTEADO | ELIMINADO
  FechaCreacion: string | null
  FechaPosteo: string | null
  CostoTotal: number
}

// Línea de diario (AX) enriquecida con el ticket local. Varias filas pueden
// compartir LineNum; el grano fino es el Barcode.
export interface ILinea {
  JournalId: string
  LineNum: number
  ItemId: string
  Descripcion: string
  Cantidad: number
  Almacen: string
  Ubicacion: string
  Barcode: string
  // Enlace al ticket de Mantenimiento (persistencia local en IMCore).
  Ticket_Id: number | null
  TicketCodigo: string | null
  Costo: number | null   // costo unitario congelado (solo diarios posteados)
  Fecha: string | null   // fecha/hora en que se agregó la línea (local)
}

// Costo unitario de referencia (promedio AX) de un repuesto.
export interface ICosto {
  ItemId: string
  Barcode: string
  CostoUnitario: number
  Nombre: string
}

// Costo total de repuestos por ticket.
export interface ICostoPorTicket {
  Ticket_Id: number | null
  TicketCodigo: string | null
  NumRepuestos: number
  CostoTotal: number
}

// Resultado unificado de una escritura en AX (espejo de AxResult del proxy).
// Ok=true sólo cuando AX confirmó. Code='NO_RESPONSE' = timeout (estado desconocido).
export interface IAxResult {
  Ok: boolean
  JournalId?: string | null
  ItemId?: string | null
  Descripcion?: string | null
  Message?: string | null
  Error?: string | null
  CodError?: string | null
  Code?: string | null
}

// ── Requests ────────────────────────────────────────────────────────────────
// UserCode lo pone el backend desde el JWT (no se envía).
export interface ICrearDiario {
  JournalName?: string   // default backend 'Sal_Repues'
  Descripcion?: string | null
  Almacen?: string | null
}

// Agregar línea (repuesto escaneado). El LineNum lo reserva el backend, no se envía.
// Ticket_Id/TicketCodigo enlazan al ticket de Mantenimiento (obligatorio en la app).
export interface IAgregarLinea {
  Barcode: string
  Cantidad: number
  Ubicacion?: string | null
  Almacen: string
  Ticket_Id?: number | null
  TicketCodigo?: string | null
}
