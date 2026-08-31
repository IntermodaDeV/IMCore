/**
 * Vincular un usuario con su empleado de planilla.
 *
 * Los códigos viven en Security.UserExternalCodes con dos KeyVar: 'Payweb' (el
 * código de personal) y 'Alterno' (el que trae el QR del carnet). Son los que
 * usan los permisos personales para saber qué empleado es cada usuario.
 */

/** Empleado de planilla, candidato a quedar vinculado. */
export type IEmpleadoPlanilla = {
  /** Código de personal. Se guarda como KeyVar 'Payweb'. */
  Employees_Code: string | null
  /** Código alterno, el del carnet. Se guarda como KeyVar 'Alterno'. */
  Cod_Alterno: string | null
  Email: string | null
  /** Nombre completo, para mostrarlo en la lista. */
  Employees_Name: string | null
  Posicion: string | null
  Centro_Costos: string | null
  Cod_Planilla: string | null
  Company_Code: string | null

  /** Nombre y apellido ya separados por planilla; acá no se parte texto. */
  PrimerNombre: string | null
  ApePaterno: string | null

  /** Si ninguno de sus dos códigos está tomado por otro usuario. */
  Disponible: boolean
  /** Usuario que ya lo tiene, cuando Disponible es false. */
  UsuarioAsignado: string | null
}

/**
 * A qué empleado está vinculado un usuario.
 *
 * Trae los códigos guardados Y el empleado que planilla dice que son. Cuando el
 * vínculo está mal, el nombre del empleado no es el del usuario — así se ve el
 * error sin salir a comparar contra nada.
 */
export type IEmpleadoVinculado = {
  EmployeeCode: string | null
  CodAlterno: string | null
  /**
   * El empleado resuelto. NULL si el código no existe en planilla y también si
   * es ambiguo: varios empleados con ese código y ninguno con el alterno
   * guardado.
   */
  Empleado: IEmpleadoPlanilla | null
  /** Si el código guardado corresponde a alguien en planilla. */
  ExisteEnPlanilla: boolean
  /**
   * Cuántos empleados tienen ese código de personal. Suele ser 1, pero planilla
   * lo numera por empresa: el 000005 existe en cinco empresas y son cinco
   * personas distintas.
   */
  CoincidenciasEnPlanilla: number
  /** Si el alterno guardado es el que planilla le da a ese empleado. */
  AlternoCoincide: boolean
}

/** Lo que se manda para vincular. Quién lo hace lo saca el servidor del token. */
export type IVincularEmpleado = {
  User_Code: string
  EmployeeCode: string
  CodAlterno?: string | null
}

export type IVincularResult = {
  Success: number
  SuccessMessage: string | null
  ErrorMessage: string | null
  EmployeeCode: string | null
  CodAlterno: string | null
}
