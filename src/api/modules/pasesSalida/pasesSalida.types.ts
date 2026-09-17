// Tipo de salida: las columnas de la matriz de autorización
// (Prestado, Venta, Reparación, Donación).
// Retorna = el tipo implica que lo que sale debe volver.
export interface ITipoSalida {
  Id: number
  Name: string
  Retorna: boolean
  Status_Id: number
}

export interface ITipoSalidaManage {
  Id?: number
  Name: string
  Retorna: boolean
}

// Material: lo que sale de la empresa (repuestos, tela, láminas, muestras…).
// Son las filas de la matriz de autorización.
export interface IMaterial {
  Id: number
  Name: string
  /** Se identifica por serie: al pedirlo exige marca, modelo y serie. */
  EsEquipo: boolean
  Status_Id: number
  /**
   * El grupo al que pertenece. Un pase solo lleva materiales de un grupo, así
   * que el formulario lo usa para filtrar el selector.
   */
  Grupo_Id?: number | null
  Grupo?: string | null
}

export interface IMaterialManage {
  Id?: number
  Name: string
  EsEquipo: boolean
}
