import { MenuDTO, IMenuControl } from '../../api/modules/security/security.types'

// Calcula TODOS los cambios de estado al alternar un menú, en ambas direcciones
// (espejo de la versión web). 1 = activo, 2 = inactivo.
//  - Desactivar un padre  -> desactiva sus descendientes activos.
//  - Activar un hijo       -> activa toda la cadena de ancestros.
//  - Desactivar un hijo    -> si el padre queda sin hijos activos, se desactiva
//                             (subiendo en cadena), excepto "Inicio".
export function computeMenuCascade(
  menu: MenuDTO[],
  controls: IMenuControl[],
  toggledId: number,
  newStatus: 1 | 2,
): Map<number, 1 | 2> {
  const childrenOf = new Map<number, number[]>()
  const parentOf = new Map<number, number | null>()
  const byId = new Map<number, MenuDTO>()
  for (const m of menu) {
    byId.set(m.Id, m)
    parentOf.set(m.Id, m.ParentMenu_Id ?? null)
    if (m.ParentMenu_Id) {
      const arr = childrenOf.get(m.ParentMenu_Id) ?? []
      arr.push(m.Id)
      childrenOf.set(m.ParentMenu_Id, arr)
    }
  }

  const currentActive = (id: number) =>
    controls.some(c => c.Menu_Id === id && c.Status_Id === 1)
  const changes = new Map<number, 1 | 2>()
  const isActiveAfter = (id: number) =>
    changes.has(id) ? changes.get(id) === 1 : currentActive(id)
  const isInicio = (id: number) => {
    const m = byId.get(id)
    return (m?.Route ?? '').toLowerCase() === 'inicio' || (m?.Name ?? '').toLowerCase() === 'inicio'
  }

  changes.set(toggledId, newStatus)

  if (newStatus === 2) {
    const stack = [...(childrenOf.get(toggledId) ?? [])]
    while (stack.length) {
      const d = stack.pop() as number
      if (isActiveAfter(d)) changes.set(d, 2)
      for (const k of childrenOf.get(d) ?? []) stack.push(k)
    }
    let cur = parentOf.get(toggledId) ?? null
    while (cur != null) {
      const anyActiveChild = (childrenOf.get(cur) ?? []).some(ch => isActiveAfter(ch))
      if (!isInicio(cur) && isActiveAfter(cur) && !anyActiveChild) {
        changes.set(cur, 2)
        cur = parentOf.get(cur) ?? null
      } else break
    }
  } else {
    let cur = parentOf.get(toggledId) ?? null
    while (cur != null) {
      if (!isActiveAfter(cur)) changes.set(cur, 1)
      cur = parentOf.get(cur) ?? null
    }
  }

  return changes
}

// Construye los payloads de MenuControl a partir de los cambios calculados.
export function buildMenuControlPayloads(
  changes: Map<number, 1 | 2>,
  controls: IMenuControl[],
  opts: { typeId: 6 | 7; createBy: string; rolId?: number | null; userCode?: string | null },
): IMenuControl[] {
  const out: IMenuControl[] = []
  for (const [id, status] of changes) {
    const existing = controls.find(c => c.Menu_Id === id)
    out.push(
      existing
        ? { ...existing, Status_Id: status, Type_Id: opts.typeId, Create_By: opts.createBy }
        : {
            Id: -1,
            Menu_Id: id,
            User_Code: opts.userCode ?? null,
            Rol_Id: opts.rolId ?? null,
            Status_Id: status,
            Type_Id: opts.typeId,
            Create_By: opts.createBy,
          },
    )
  }
  return out
}
