import { HttpError, NetworkError } from "../api/core/httpClient"

export type AppError = {
  type?: string | undefined
  title: string
  message: string
  status?: number
}

export const handleError = (error: unknown): AppError => {
  if (error instanceof NetworkError) {
    return {
      title: 'Conexión',
      message: 'No se pudo conectar con el servidor',
    }
  }

  if (error instanceof HttpError) {
    switch (error.status) {
      case 400:
        return {
          title: 'Solicitud inválida',
          message: error.response,
          status: error.status,
        }

      case 401:
        return {
          title: 'No autorizado',
          message: 'Debe iniciar sesión nuevamente',
          status: error.status,
        }

      case 403:
        return {
          title: 'Acceso denegado',
          message: 'No tiene permisos para realizar esta acción',
          status: error.status,
        }

      case 404:
        return {
          title: 'No encontrado',
          message: 'La ruta solicitada no existe',
          status: error.status,
        }

      case 500:
        return {
          title: 'Error interno',
          message: 'Ocurrió un error en el servidor',
          status: error.status,
        }

      default:
        return {
          title: 'Error',
          message: error.response || 'Error desconocido',
          status: error.status,
        }
    }
  }

  return {
    title: 'Error',
    message: 'Ocurrió un error inesperado',
  }
}