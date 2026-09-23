// Administración de Faltantes/Sobrantes de paquetes de venta (Créditos).
//
// En la app el módulo es de SOLO CONSULTA: la corrida se arma y se calcula en el
// web (son cientos de clientes, pesos que ajustar y un archivo que descargar).
// Acá solo se contesta "¿en qué quedó?", que es lo que se pregunta cuando llega
// la notificación o cuando alguien está fuera de la oficina.

export type ModoCorrida = 'FALTANTES' | 'SOBRANTES'

/** BORRADOR → INSUMOS → CALCULADA → APLICADA. Puede quedar en ERROR. */
export type EstadoCorrida = 'BORRADOR' | 'INSUMOS' | 'CALCULADA' | 'APLICADA' | 'ERROR'

/** Estado del proceso de carga de datos de AX, que corre en segundo plano. */
export type EstadoProceso = 'EN_CURSO' | 'OK' | 'ERROR' | 'CANCELADO'

/**
 * Cabecera de una corrida. Es el MISMO DTO que consume el web (CorridaDTO): la
 * app no pide un endpoint propio, usa `GET AdministracionPaquetes/Corridas`.
 */
export interface ICorrida {
  Id: number
  CodigoPaquete: string
  Modo: ModoCorrida
  Estado: EstadoCorrida
  Descripcion?: string | null
  Empresas?: string | null

  W1_Mora: number
  W2_Volumen: number
  W3_Afectacion: number
  W4_Retenidos: number
  ExcluirExportacion: boolean
  FactorAjusteSobrante: number

  FechaInsumos?: string | null
  FechaCalculo?: string | null

  /** Cuántos SKU traía el balance. */
  TotalSku?: number | null
  /** Unidades que HABÍA que repartir (la meta del balance). */
  TotalUnidadesMeta?: number | null
  /** Unidades que el reparto SÍ alcanzó a colocar. Admin/Meta = la cobertura. */
  TotalUnidadesAdmin?: number | null
  TotalLineasTocadas?: number | null
  TotalClientesAfect?: number | null
  /** Clientes que entraron al reparto. Denominador de TotalClientesAfect. */
  TotalClientesSel?: number | null

  Create_By: string
  Creation_Date: string

  // Última carga de insumos. Va en el listado para ver de un vistazo cuál quedó
  // a medias sin abrir una por una.
  /** INSUMOS o ENVIO_AX: no es lo mismo leer AX que escribirle. */
  ProcesoTipo?: string | null
  ProcesoEstado?: EstadoProceso | null
  /** Cuánto lleva. En el envío es el % de líneas que AX ya confirmó. */
  ProcesoPaso?: number | null
  ProcesoPasosTotal?: number | null
  ProcesoFase?: string | null
  ProcesoError?: string | null
  ProcesoIntento?: number | null
  ProcesoSegundos?: number | null
}

/** Cómo va el lote contra AX. Lo poco que el teléfono necesita saber. */
export interface IEstadoEnvioAx {
  Corrida_Id: number
  /** Líneas que hay que mandar. */
  Total: number
  /** Confirmadas por AX. */
  Enviadas: number
  /** Con un problema que alguien tiene que mirar. */
  ConError: number
  /** Todo lo que falta, incluyendo las de error. */
  Pendientes: number
  Unidades: number
  UltimoEnvio: string | null
  /** DEV o PRODUCCION. */
  Ambiente: string | null
  /** El PAQUETE completo: faltantes y sobrantes juntos. */
  PorModo: IEnvioPorModo[]
}

/**
 * Lo que el PAQUETE lleva subido a AX de un modo. En el teléfono es lo más útil
 * de toda la pantalla: quien dejó subiendo el lote pregunta «¿ya está todo el
 * 1026T?», no «¿cómo fue la corrida 9?».
 */
export interface ICorridaDelModo {
  Corrida_Id: number
  Lineas: number
  Enviadas: number
}

export interface IEnvioPorModo {
  Modo: string
  /** Qué corridas lo compusieron y cuánto pone cada una. Casi siempre es una. */
  Corridas: ICorridaDelModo[]
  Lineas: number
  Enviadas: number
  Pendientes: number
  ConError: number
  /** Unidades CONFIRMADAS por AX. */
  Unidades: number
  Pedidos: number
  Clientes: number
  UltimoEnvio: string | null
}
