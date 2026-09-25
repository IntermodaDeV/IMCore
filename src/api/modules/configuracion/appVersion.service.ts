import { httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'

// Última versión publicada en la tienda de una plataforma (claves App.<Plat>.*
// de las configuraciones globales). Endpoint ANÓNIMO: se consulta desde el login.
export interface IAppVersion {
  Platform: 'android' | 'ios'
  Version: string      // '1.5.3', solo para mostrar
  Build: number        // lo que se compara contra el build instalado
  BuildMinimo: number  // por debajo de esto la app no deja seguir; 0 = nunca
}

export const appVersionService = {
  get: (platform: string) =>
    httpClient.get<ExecutionResponse<IAppVersion>>('App/Version', { platform }),
}
