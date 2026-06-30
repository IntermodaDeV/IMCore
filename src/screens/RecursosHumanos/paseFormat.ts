// Formateo de fechas para las pantallas de pases.

// DATETIME (creación/aprobación/registro) -> "dd/mm/aaaa hh:mm"
export const fmtFechaHora = (iso?: string | null): string => {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime())
    ? String(iso)
    : d.toLocaleString('es-HN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
}

// FechaPase viene como "YYYY-MM-DD" -> "dd/mm/aaaa"
export const fmtFecha = (s?: string | null): string => {
  if (!s) return ''
  const [y, m, d] = String(s).split('-')
  return y && m && d ? `${d}/${m}/${y}` : String(s)
}
