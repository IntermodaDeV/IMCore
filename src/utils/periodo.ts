// Rangos de período (Semana / Mes / Año) con desplazamiento hacia atrás.
//
// Vivían dentro de screens/Repuestos/components.tsx, que además importa la
// cámara: cualquier pantalla que solo necesitara las fechas se traía el escáner
// de paso. Acá quedan sin dependencias, y aquel archivo las re-exporta para que
// nada de lo que ya existía cambie.

export type Periodo = 'semana' | 'mes' | 'anio'

export const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
export const MESES_L = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const padNum = (n: number) => String(n).padStart(2, '0')

// ISO local (sin zona) para que el rango coincida con Creation_Date del servidor.
export const toParam = (d: Date) =>
  `${d.getFullYear()}-${padNum(d.getMonth() + 1)}-${padNum(d.getDate())}T${padNum(d.getHours())}:${padNum(d.getMinutes())}:${padNum(d.getSeconds())}`

// Lunes 00:00 de la semana de `d`.
export function inicioSemana(d: Date) {
  const x = new Date(d); x.setHours(0, 0, 0, 0)
  const dow = (x.getDay() + 6) % 7   // 0 = lunes
  x.setDate(x.getDate() - dow)
  return x
}

// Rango [desde, hasta) + etiqueta según período y desplazamiento (0 = actual, -1 = anterior).
export function rango(periodo: Periodo, offset: number): { desde: Date; hasta: Date; label: string } {
  const now = new Date()
  if (periodo === 'semana') {
    const desde = inicioSemana(now); desde.setDate(desde.getDate() + offset * 7)
    const hasta = new Date(desde); hasta.setDate(desde.getDate() + 7)
    const fin = new Date(hasta); fin.setDate(hasta.getDate() - 1)
    const label = `${desde.getDate()} ${MESES[desde.getMonth()]} – ${fin.getDate()} ${MESES[fin.getMonth()]}`
    return { desde, hasta, label }
  }
  if (periodo === 'mes') {
    const desde = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    const hasta = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1)
    return { desde, hasta, label: `${MESES_L[desde.getMonth()]} ${desde.getFullYear()}` }
  }
  const desde = new Date(now.getFullYear() + offset, 0, 1)
  const hasta = new Date(now.getFullYear() + offset + 1, 0, 1)
  return { desde, hasta, label: `${desde.getFullYear()}` }
}
