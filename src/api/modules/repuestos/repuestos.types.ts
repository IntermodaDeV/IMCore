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

  // De dónde salió el costo: 'ULTIMA_COMPRA' es el criterio vigente desde el
  // 21-sep-2026 y 'MIGRADO' son las piezas que nunca se han comprado, cuyo valor es el
  // de la migración (L 0.01) y es el correcto. 'PROMEDIO' y las etiquetas AX_* quedan
  // de legado, en líneas congeladas antes del cambio.
  CostoFuente?: string | null
  // ⚠ Ya no se enciende: comparaba contra la valuación de AX, que se descartó. Se deja
  // el campo para no romper el contrato con la API mientras se limpia.
  CostoSospechoso?: boolean
  PrecioUltimaCompra?: number | null
  // REPUESTO va contra un ticket; SUMINISTRO contra un centro de costo, que lo
  // trae el articulo desde AX (lo resuelve el servidor, no la app).
  Tipo: 'REPUESTO' | 'SUMINISTRO'
  CentroCosto: string | null
  CentroCostoNombre: string | null
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
  // Omitido = REPUESTO (comportamiento de siempre). Con 'SUMINISTRO' no se manda
  // ticket y el servidor resuelve el centro de costo del articulo en AX.
  Tipo?: 'REPUESTO' | 'SUMINISTRO'
}

// Consumo de suministros por centro de costo en un periodo. KPI SEPARADO del de
// repuestos: los suministros son de planta y no se usan en un ticket concreto.
export interface ISuministroPorCentroCosto {
  CentroCosto: string
  CentroCostoNombre: string | null
  Salidas: number
  Unidades: number
  CostoTotal: number
  SinCosto: number
}

// Consumo de repuestos por ACTIVO (maquina) en un periodo.
export interface IRepuestoPorActivo {
  Activo: string
  Modelo: string | null
  Salidas: number
  Tickets: number
  Unidades: number
  CostoTotal: number
  SinCosto: number
}

// Consumo por ARTICULO. Sirve para repuestos y suministros segun el tipo pedido.
// `Destinos` = a cuantas maquinas (o centros de costo) distintos fue.
export interface IConsumoItem {
  ItemId: string | null
  Descripcion: string | null
  Salidas: number
  Unidades: number
  CostoTotal: number
  CostoUnitario: number
  SinCosto: number
  Destinos: number
}

/**
 * Una línea que AX va a RECHAZAR al postear porque la pieza está en bodega pero sin
 * costo registrado.
 *
 * `Fisico` mayor que cero y `Valuadas` en cero es el caso típico: la orden de compra
 * se recibió pero contabilidad no ha registrado la factura, así que AX ve la pieza
 * pero no sabe cuánto vale y se niega a descargarla. AX cancela el diario ENTERO por
 * una sola línea así, y su mensaje no dice cuál es — de ahí este chequeo previo.
 */
export interface ILineaBloqueada {
  LineNum: number
  ItemId: string
  Descripcion: string
  /** Lo que el diario quiere descargar, en positivo. */
  Pide: number
  /** Lo que hay en bodega. */
  Fisico: number
  /** Lo que AX sabe costear. Si es menor que Pide, rechaza. */
  Valuadas: number
  /** Orden de compra recibida y sin facturar, si se encontró. */
  PurchId?: string | null
  Proveedor?: string | null
  ProveedorNombre?: string | null
  SinFacturar: number
}

/** Resultado de apartar las bloqueadas en un diario nuevo. */
export interface IMoverBloqueadas {
  Ok: boolean
  NuevoJournalId?: string | null
  /** true = se movieron a un diario que ya existía; false = se creó uno. */
  Reusado: boolean
  Movidas: number[]
  /** Las que NO se pudieron apartar: el diario original sigue sin poder postearse. */
  NoSeMovieron: string[]
  Error?: string | null
}

/** Un centro de costo vigente en AX. `Nombre` puede venir vacío (depende de qué
 *  tablas de AX ve la conexión); ahí queda el código, que igual identifica. */
export interface ICentroCosto {
  Dimension: string
  Valor: string
  Nombre: string
  /** Cuántos artículos lo usan. Sirve para poner primero los habituales. */
  ItemId: string
}
