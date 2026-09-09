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
  // Cuántas líneas CAMBIARON de estado. Solo lo llena el botón de validar toda la
  // factura; al marcar una línea viene en 0. Puede ser menor que el total: las que
  // ya estaban contadas no se vuelven a tocar.
  LineasAfectadas: number
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

/* ==========================================================================
   SALIDA DEL CD: facturas Y diarios en la MISMA pantalla.

   El guardia hace lo mismo con los dos —cuenta lo que sale y confirma—, así que
   la forma es común y `Tipo` dice cuál es. Los campos del otro flujo vienen en
   null: una factura no tiene almacenes y un diario no tiene cliente.

   ⚠ EL TIPO LO DECIDE EL SERVIDOR. La regla es «si empieza con DI es un diario»
   y vive en la API: si la tuviera la app, cambiarla obligaría a esperar una
   release de tienda. Acá se manda el texto tal cual y la respuesta dice qué era.
   ========================================================================== */

export type TipoSalidaCD = 'FACTURA' | 'DIARIO'

// Misma forma de línea que las facturas (para reusar la matriz tal cual) más el
// número de línea de AX, que en diarios puede ser fraccionario.
export interface ISalidaCDLinea extends ISalidaFacturaLinea {
  LineNumAX?: number | null
}

export type MotivoBloqueoCD = 'SALIO' | 'ANTERIOR_AL_CORTE' | 'DESCARTADA'

export interface ISalidaCD {
  Tipo: TipoSalidaCD
  Codigo: string | null
  DataAreaId: string | null
  Estado: string | null            // EN_REVISION | COMPLETADA | DESCARTADA
  FechaInicio: string | null
  FechaSalida: string | null
  GuardiaInicio: string | null
  GuardiaSalida: string | null
  GuardiaInicioCode: string | null
  GuardiaSalidaCode: string | null
  // El descarte. ⚠ Una fila EN_REVISION con FechaDescarte llena es una que se
  // descartó y se volvió a abrir: es el rastro, no un error.
  MotivoDescarte: string | null
  FechaDescarte: string | null
  GuardiaDescarte: string | null
  GuardiaDescarteCode: string | null
  FechaMinima: string | null
  AnteriorAlCorte: boolean
  MensajeBloqueo: string | null
  Bloqueada: boolean
  MotivoBloqueo: MotivoBloqueoCD | null
  // ── solo facturas ──
  Cliente: string | null
  FechaFactura: string | null
  PedidoVenta: string | null
  // ── solo diarios ──
  Descripcion: string | null
  TipoDiario: string | null        // JOURNALNAMEID de AX
  NombreDiario: string | null
  CategoriaDiario: number | null   // JOURNALTYPE: el número del enum de AX
  // El nombre de la categoría lo arma SQL: AX NO guarda las etiquetas de sus
  // enums. Un valor no visto llega como número, nunca en blanco.
  CategoriaNombre: string | null
  AlmacenOrigen: string | null
  AlmacenDestino: string | null
  EstadoAX: string | null          // 'Registrado' | 'Abierto'
  FechaRegistro: string | null     // ya en hora de Honduras
  Items: ISalidaCDLinea[]
}

// Fila del historial unificado.
export interface ISalidaCDHistorial {
  Tipo: TipoSalidaCD
  Codigo: string | null
  DataAreaId: string | null
  Estado: string | null
  FechaInicio: string | null
  FechaSalida: string | null
  FechaOrden: string | null
  GuardiaInicio: string | null
  GuardiaSalida: string | null
  GuardiaInicioCode: string | null
  GuardiaSalidaCode: string | null
  MotivoDescarte: string | null
  FechaDescarte: string | null
  GuardiaDescarte: string | null
  GuardiaDescarteCode: string | null
  TotalLineas: number
  LineasRevisadas: number
  TotalPiezas: number
  Cliente: string | null
  FechaFactura: string | null
  PedidoVenta: string | null
  Descripcion: string | null
  TipoDiario: string | null
  NombreDiario: string | null
  CategoriaDiario: number | null
  CategoriaNombre: string | null
  AlmacenOrigen: string | null
  AlmacenDestino: string | null
  EstadoAX: string | null
  FechaRegistro: string | null
  FechaMinima: string | null
  AnteriorAlCorte: boolean
  MensajeBloqueo: string | null
}

export interface ISalidaCDFiltros {
  tipo?: TipoSalidaCD
  codigo?: string
  cliente?: string
  estado?: string
  fecha?: string
  top?: number
}
