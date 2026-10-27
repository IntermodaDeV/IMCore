/* ============================================================================
   Uso de Claude — lo que la app usa de api/UsoClaude (el resumen del mes).
   Espejo parcial de IMCoreWeb/src/api/modules/usoClaude/usoClaude.types.ts.

   El costo es ESTIMADO A PRECIO DE API (OpenTelemetry): con asientos de Team no
   es lo que se factura. Lo del CSV de la consola llega en formato largo (una fila
   por persona y columna) porque sus columnas no son fijas.
   ============================================================================ */

export interface IUsoMensual {
  Periodo: string
  Producto: string
  Email: string
  Nombre?: string | null
  CuentaId?: number | null
  DiasActivos: number
  /** Días de la persona en el mes contando todos los productos: Code y Cowork el mismo día es UN día. */
  DiasActivosTotal: number
  Sesiones: number
  Prompts: number
  Solicitudes: number
  CostoUsd: number
  TokensEntrada: number
  TokensSalida: number
  TokensCacheLectura: number
  TokensCacheCreacion: number
  LineasAgregadas: number
  LineasEliminadas: number
  Commits: number
  PullRequests: number
  UltimaActividad?: string | null
}

export interface ICsvValorMensual {
  Periodo: string
  Reporte: string
  Email: string
  Nombre?: string | null
  Clave: string
  Etiqueta: string
  Valor: number
  UltimaActividad?: string | null
  /** Qué parte del mes cubre lo importado de ese reporte (DiasCubiertos < tramo = hay un hueco). */
  Desde?: string | null
  Hasta?: string | null
  DiasCubiertos?: number | null
}

export interface IAsientoMensual {
  Periodo: string
  CuentaId: number
  Email: string
  Nombre: string
  Asiento?: string | null
}

/** De un archivo de la consola de 30, 60 o 90 días, la última actividad de cada persona. */
export interface IVentanaPersona {
  ImportacionId: number
  Desde: string
  Hasta: string
  Email: string
  Nombre?: string | null
  UltimaActividad?: string | null
}

export interface IUsoClaude {
  Mensual: IUsoMensual[]
  Csv: ICsvValorMensual[]
  Asientos: IAsientoMensual[]
  /** Falta en una API anterior a las ventanas. */
  Ventanas?: IVentanaPersona[]
}
