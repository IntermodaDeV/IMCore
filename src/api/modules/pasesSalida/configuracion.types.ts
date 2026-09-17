// Configuración de firmas: grupos de materiales y, por cada tipo de salida,
// los pasos de firma que pide.

/** Una fila del cuadro de autorización. */
export interface IGrupo {
  Id: number
  Name: string
  Status_Id: number
  /** Cuántos materiales tiene asignados. */
  Materiales: number
  /** Para cuántos tipos de salida ya hay firmas configuradas. */
  Reglas: number
}

export interface IGrupoManage {
  Id?: number
  Name: string
}

export interface IMaterialConGrupo {
  Id: number
  Name: string
  Status_Id: number
  Grupo_Id: number | null
  Grupo: string | null
}

/** La lista COMPLETA de materiales del grupo; lo que no venga queda sin grupo. */
export interface IGrupoMateriales {
  Grupo_Id: number
  Materiales: number[]
}

/**
 * La matriz aplanada: una fila por acceso. Los tipos de salida sin regla vienen
 * con `Regla_Id` nulo — son la "x" del cuadro.
 */
export interface IReglaFila {
  TipoSalida_Id: number
  TipoSalida: string
  Retorna: boolean
  Regla_Id: number | null
  /**
   * La combinación está PROHIBIDA (una herramienta no se dona). Distinto de
   * `Regla_Id` nulo, que es "nadie la ha configurado todavía".
   */
  NoPermitido: boolean
  ReglaFirma_Id: number | null
  Paso: number | null
  Access_Id: number | null
  AccesoKeyVar: string | null
  AccesoName: string | null
}

/**
 * Una celda configurada, sin el detalle de sus firmas.
 *
 * Es lo que el formulario de alta necesita para bloquear el material en el
 * momento de agregarlo. Lo que NO aparece en la lista está sin configurar.
 */
export interface IReglaResumen {
  Grupo_Id: number
  TipoSalida_Id: number
  NoPermitido: boolean
  /** Cuántas firmas pide. Cero sin `NoPermitido` = quedó a medio configurar. */
  Firmas: number
}

/**
 * Por qué un grupo no se puede usar con un tipo de salida, o null si sí se
 * puede. Es la misma regla que aplica el SP al guardar, así que el formulario y
 * el servidor no pueden discrepar.
 */
export function motivoBloqueo(
  reglas: IReglaResumen[],
  grupoId: number | null | undefined,
  tipoSalidaId: number | null | undefined,
): 'noPermitido' | 'sinConfigurar' | null {
  // Sin tipo elegido no se puede saber todavía: no se bloquea nada.
  if (grupoId == null || tipoSalidaId == null) return null
  const r = reglas.find(x => x.Grupo_Id === grupoId && x.TipoSalida_Id === tipoSalidaId)
  if (!r) return 'sinConfigurar'
  if (r.NoPermitido) return 'noPermitido'
  return r.Firmas > 0 ? null : 'sinConfigurar'
}

/** Una firma elegible (Security.Access, Category 'PaseSalida'). */
export interface IAccesoFirma {
  Id: number
  KeyVar: string
  Name: string
}

/** Un paso de firma: cualquiera de estos accesos lo satisface. */
export interface IReglaPaso {
  Accesos: number[]
}

/**
 * Reemplaza la celda completa. Pasos vacío la deja sin configurar;
 * `NoPermitido` la prohíbe y gana sobre los pasos que se manden.
 */
export interface IReglaGuardar {
  Grupo_Id: number
  TipoSalida_Id: number
  NoPermitido?: boolean
  Pasos: IReglaPaso[]
}

// ── Solicitantes ─────────────────────────────────────────────────────────────

/** Usuario con el acceso PSSolicitante, concedido por usuario o por rol. */
export interface ISolicitante {
  User_Code: string
  Nombre: string
  Email: string | null
  /** Cuántos materiales puede pedir. Cero = no puede crear pases. */
  Materiales: number
}

export interface IMaterialSolicitante {
  Id: number
  Name: string
  Status_Id: number
  Asignado: boolean
}

/** La lista COMPLETA del solicitante; lo que no venga se quita. */
export interface ISolicitanteMateriales {
  User_Code: string
  Materiales: number[]
}

// ── Vista armada en el cliente a partir de IReglaFila ────────────────────────

export interface ICeldaPaso {
  ReglaFirma_Id: number | null
  Paso: number
  Accesos: { Id: number; Name: string }[]
}

export interface ICelda {
  TipoSalida_Id: number
  TipoSalida: string
  Retorna: boolean
  Regla_Id: number | null
  /** Prohibida explícitamente. Con esto en true, `Pasos` siempre viene vacío. */
  NoPermitido: boolean
  Pasos: ICeldaPaso[]
}

/**
 * Arma el cuadro a partir de las filas planas del SP. Se agrupa por tipo de
 * salida y dentro por paso; un tipo sin `Regla_Id` queda con `Pasos` vacío,
 * que es la "x".
 */
export function armarCeldas(filas: IReglaFila[]): ICelda[] {
  const porTipo = new Map<number, ICelda>()

  for (const f of filas) {
    let celda = porTipo.get(f.TipoSalida_Id)
    if (!celda) {
      celda = {
        TipoSalida_Id: f.TipoSalida_Id,
        TipoSalida: f.TipoSalida,
        Retorna: f.Retorna,
        Regla_Id: f.Regla_Id,
        NoPermitido: !!f.NoPermitido,
        Pasos: [],
      }
      porTipo.set(f.TipoSalida_Id, celda)
    }
    if (f.Paso == null) continue

    let paso = celda.Pasos.find(p => p.Paso === f.Paso)
    if (!paso) {
      paso = { ReglaFirma_Id: f.ReglaFirma_Id, Paso: f.Paso, Accesos: [] }
      celda.Pasos.push(paso)
    }
    if (f.Access_Id != null && !paso.Accesos.some(a => a.Id === f.Access_Id)) {
      paso.Accesos.push({ Id: f.Access_Id, Name: f.AccesoName ?? '' })
    }
  }

  const celdas = Array.from(porTipo.values())
  celdas.forEach(c => c.Pasos.sort((a, b) => a.Paso - b.Paso))
  return celdas
}
