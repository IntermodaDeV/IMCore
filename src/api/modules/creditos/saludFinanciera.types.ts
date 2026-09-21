// Salud Financiera — la cartera por cobrar al corte (Créditos).
//
// En la app es un RESUMEN: los cuatro números, los tramos y quién más debe.
// El detalle por asesor y la tendencia viven en el web, que tiene el ancho para
// mostrarlos.
//
// DOS COSAS QUE HAY QUE SABER PARA LEER ESTOS NÚMEROS:
//  · `Saldo` viene en la moneda de cada COMPAÑÍA (imhn HNL, imgt GTQ, imcr CRC,
//    imsl USD), así que en dólares se convierte por compañía con la tasa
//    vigente AL CORTE. `Moneda` dice en qué está lo que llegó.
//  · El corte PUEDE TENER DÍAS: el almacén guarda un solo snapshot del día
//    corriente, lo borra para rehacerlo y no refresca fin de semana. Por eso
//    `DiasDelCorte` se muestra siempre.

export interface ISaludResumen {
  FechaCorte: string
  Moneda: string
  TipoCambio?: number | null
  FechaTipoCambio?: string | null
  DiasTipoCambio?: number | null
  FilasSinTasa: number
  DiasDelCorte: number

  Cartera: number
  AlDia: number
  Vencido: number
  /** Vencido a más de 60 días: lo que ya no se cobra solo. */
  Critico: number

  Tramo_1_29: number
  Tramo_30_60: number
  Tramo_61_270: number
  Tramo_271: number

  Clientes: number
  ClientesConMora: number
  ClientesCriticos: number
  Documentos: number
  DocumentosVencidos: number

  PctVencido: number
  PctCritico: number
  PctClientesConMora: number
}

export interface ISaludCorte {
  FechaCorte: string
  Cartera: number
  Vencido: number
  Critico: number
  Clientes: number
  PctVencido: number
  PctCritico: number
}

export interface ISaludGrupo {
  Clave: string
  Nombre?: string | null
  Cartera: number
  Vencido: number
  Critico: number
  Clientes: number
  ClientesConMora: number
  PctVencido: number
}

export interface ISaludCliente {
  CodigoCliente: string
  Cliente?: string | null
  Empresa?: string | null
  Asesor?: string | null
  Cartera: number
  Vencido: number
  DiasMax: number
  /** 0 al día · 1 A(1-29) · 2 B(30-60) · 3 C(61-270) · 4 D(271+). */
  Categoria: number
  PctVencido: number
}

export interface ISaludFinanciera {
  Resumen: ISaludResumen
  PorEmpresa: ISaludGrupo[]
  PorAsesor: ISaludGrupo[]
  Clientes: ISaludCliente[]
  Tendencia: ISaludCorte[]
}
