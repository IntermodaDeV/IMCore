import { httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'
import { IAgenda, IGenerarVisita, IHistorial, IHorario, IHorarioDetalle, IIdentificacion, IIdentificacionRequest, IIdentificacionResult, IMotivo, IValidarResult, IVentanaPase, IVisitaResult, IVisitaAcceso } from './visitas.types'

const schema = 'Visitas'

export const visitasService = {
  // Motivos
  getMotivos: (onlyActive: boolean = true) =>
    httpClient.get<ExecutionResponse<IMotivo[]>>(`${schema}/Motivos?onlyActive=${onlyActive}`),

  saveMotivo: (data: IMotivo) =>
    httpClient.post<ExecutionResponse<any>, IMotivo>(`${schema}/Motivos`, data),

  changeStatusMotivo: (data: IMotivo) =>
    httpClient.put<ExecutionResponse<any>, IMotivo>(`${schema}/Motivos`, data),

  // Horarios de visita
  getHorarios: (onlyActive: boolean = true) =>
    httpClient.get<ExecutionResponse<IHorario[]>>(`${schema}/Horarios?onlyActive=${onlyActive}`),

  // Ventanas de un horario: sirve para previsualizar cuántos días de un rango
  // quedan realmente habilitados (un horario L-V sobre lunes-a-domingo son 5, no 7).
  getHorarioDetalle: (horarioId: number) =>
    httpClient.get<ExecutionResponse<IHorarioDetalle[]>>(`${schema}/HorarioDetalle?horario_Id=${horarioId}`),

  saveHorario: (data: IHorario) =>
    httpClient.post<ExecutionResponse<any>, IHorario>(`${schema}/Horarios`, data),

  changeStatusHorario: (data: IHorario) =>
    httpClient.put<ExecutionResponse<any>, IHorario>(`${schema}/Horarios`, data),

  // Ventanas concretas de un pase (el snapshot del horario al generarlo)
  getVentanasDePase: (visitaId: number) =>
    httpClient.get<ExecutionResponse<IVentanaPase[]>>(`${schema}/Ventanas?visita_Id=${visitaId}`),

  // Pases
  generar: (data: IGenerarVisita) =>
    httpClient.post<ExecutionResponse<IVisitaResult>, IGenerarVisita>(`${schema}/Generar`, data),

  getHistorial: (userCode: string) =>
    httpClient.get<ExecutionResponse<IHistorial[]>>(`${schema}/Historial?user_Code=${userCode}`),

  getAccesos: (visitaId: number) =>
    httpClient.get<ExecutionResponse<IVisitaAcceso[]>>(`${schema}/Accesos?visita_Id=${visitaId}`),

  // Agenda del tablero: una fila por día-ventana en el rango. Sin fechas
  // devuelve la semana corriente (lunes a domingo) resuelta por el servidor.
  // Las fechas van como 'YYYY-MM-DD' a propósito: mandar un ISO con zona hace
  // que el servidor reciba el día anterior desde Honduras.
  getAgenda: (userCode: string, desde?: string, hasta?: string) => {
    const q = [`user_Code=${encodeURIComponent(userCode)}`]
    if (desde) q.push(`desde=${desde}`)
    if (hasta) q.push(`hasta=${hasta}`)
    return httpClient.get<ExecutionResponse<IAgenda[]>>(`${schema}/Agenda?${q.join('&')}`)
  },

  // Detalle de un pase por Id (para abrir desde una notificación)
  getVisitaById: (visitaId: number) =>
    httpClient.get<ExecutionResponse<IHistorial>>(`${schema}/Detalle?visita_Id=${visitaId}`),

  // Identificación del visitante: la foto viaja al servidor, que la lee con
  // Claude y coteja el nombre. La llave de la API nunca está en la app.
  // Variante multipart: la cámara embebida solo tiene un URI de archivo, no
  // base64. FormData con el URI es lo que RN maneja nativo, sin conversiones
  // frágiles, y viaja 33% más liviano que base64.
  guardarIdentificacionFoto: (params: {
    VisitaAcceso_Id: number
    Intentos: number
    OmitirPorGuardia: boolean
    Create_By: string
    fotoUri?: string | null
    fotoMime?: string
    /** Región del marco guía; el servidor recorta a esto antes de leer y guardar */
    recorteAncho?: number
    recorteAspecto?: number
  }) => {
    const fd = new FormData()
    fd.append('visitaAcceso_Id', String(params.VisitaAcceso_Id))
    fd.append('intentos', String(params.Intentos))
    fd.append('omitirPorGuardia', String(params.OmitirPorGuardia))
    fd.append('create_By', params.Create_By)
    if (params.recorteAncho != null) fd.append('recorteAncho', String(params.recorteAncho))
    if (params.recorteAspecto != null) fd.append('recorteAspecto', String(params.recorteAspecto))
    if (params.fotoUri) {
      fd.append('imagen', {
        uri: params.fotoUri,
        type: params.fotoMime || 'image/jpeg',
        name: 'documento.jpg',
      } as any)
    }
    return httpClient.postForm<ExecutionResponse<IIdentificacionResult>>(
      `${schema}/IdentificacionFoto`,
      fd
    )
  },

  guardarIdentificacion: (data: IIdentificacionRequest) =>
    httpClient.post<ExecutionResponse<IIdentificacionResult>, IIdentificacionRequest>(
      `${schema}/Identificacion`,
      data
    ),

  getIdentificaciones: (visitaId: number) =>
    httpClient.get<ExecutionResponse<IIdentificacion[]>>(`${schema}/Identificaciones?visita_Id=${visitaId}`),

  getIdentificacionImagen: (id: number) =>
    httpClient.get<ExecutionResponse<{ Id: number; MimeType?: string; ImagenBase64?: string }>>(
      `${schema}/IdentificacionImagen?id=${id}`
    ),

  validar: (token: string, userCode: string) =>
    httpClient.post<ExecutionResponse<IValidarResult>, { Token: string; Create_By: string }>(
      `${schema}/Validar`,
      { Token: token, Create_By: userCode }
    ),
}
