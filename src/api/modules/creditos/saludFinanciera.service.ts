import { httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'
import { ISaludFinanciera } from './saludFinanciera.types'

// api/SaludFinanciera. SOLO CONSULTA. El permiso es la opción de menú
// 'creditosSaludFinanciera', que la API valida contra la BD en cada llamada:
// la misma llave que usa el web, así que no hay un acceso aparte para el teléfono.
const schema = 'SaludFinanciera'

export const saludFinancieraService = {
  /**
   * Todo el corte en una llamada.
   *   empresa — 'imhn' | 'imgt' | 'imcr' | 'imsl'. Vacío = las cuatro.
   *   usd     — false deja el monto en la moneda de la compañía; pedilo solo
   *             con UNA empresa elegida.
   *
   * `meses` y `tope` van chicos: la app no dibuja la tendencia ni lista
   * cientos de clientes, y el payload viaja por datos móviles.
   */
  getCorte: (empresa: string, usd = true, refrescar = false) =>
    httpClient.get<ExecutionResponse<ISaludFinanciera>>(schema, {
      empresa: empresa || undefined,
      usd,
      todos: false,
      meses: 2,
      tope: 25,
      // Arrastrar hacia abajo tiene que traer datos NUEVOS, no lo que el
      // servidor guardó. La API guarda cada combinación 5 minutos porque la
      // tabla del almacén es un heap de 119 MB sin índices; sin esto, tirar de
      // la pantalla daría siempre lo mismo y parecería que no hace nada.
      refrescar,
    }),
}
