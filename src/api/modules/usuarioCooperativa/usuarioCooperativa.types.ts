/**
 * Alta de usuarios de cooperativa a partir de un empleado de planilla.
 */

/** Empleado de planilla, candidato a convertirse en usuario. */
export type IEmpleadoUsuario = {
  /** Código de personal. Se guarda como código externo KeyVar 'Payweb'. */
  Employees_Code: string | null
  /** Código alterno. Se guarda como código externo KeyVar 'Alterno'. */
  Cod_Alterno: string | null
  Email: string | null
  /** Nombre completo, para mostrarlo en la lista. */
  Employees_Name: string | null
  Posicion: string | null
  Centro_Costos: string | null
  Cod_Planilla: string | null
  Company_Code: string | null

  /**
   * Nombre y apellido ya separados por el servidor.
   *
   * No se parten acá a propósito: el nombre completo de planilla concatena
   * cuatro campos y separarlo por posición se rompe con quien tenga un solo
   * nombre.
   */
  PrimerNombre: string | null
  ApePaterno: string | null

  /** Si todavía no tiene usuario. Los tomados se muestran, no se esconden. */
  Disponible: boolean
  /** Usuario que ya tiene ese código, cuando Disponible es false. */
  UsuarioAsignado: string | null
}

/** Respuesta de la verificación puntual de un código. */
export type ICodigoDisponible = {
  Disponible: boolean
  UserCode: string | null
  UserName: string | null
}

/** Lo que manda el formulario. El tipo, rol, empresa y compañía los fija el servidor. */
export type ICrearUsuarioCooperativa = {
  Code: string
  Name: string
  LastName: string
  Email: string
  /** En claro. La API la hashea antes de guardarla. */
  Password: string
  Theme?: string
  EmployeeCode: string
  CodAlterno?: string | null
}

export type ICrearUsuarioCooperativaResult = {
  Success: number
  SuccessMessage: string | null
  ErrorMessage: string | null
  UserId: number | null
}
