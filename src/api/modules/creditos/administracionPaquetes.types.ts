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
