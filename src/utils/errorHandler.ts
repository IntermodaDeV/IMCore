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
      title: 'Sin conexión',
      message: 'No se pudo establecer conexión con el servidor. Verifique su red e inténtelo de nuevo.',
    }
  }

  if (error instanceof HttpError) {
    switch (error.status) {
      case 400:
        return {
          title: 'Solicitud inválida',
          message: error.response || 'Los datos enviados no son válidos. Revise la información e inténtelo de nuevo.',
          status: error.status,
        }

      case 401:
        return {
          title: 'Sesión expirada',
          message: 'Su sesión ha expirado o no es válida. Por favor inicie sesión nuevamente para continuar.',
          status: error.status,
        }

      case 403:
        return {
          title: 'Sin permisos',
          message: 'Su usuario no tiene permisos para acceder a este recurso. Contacte al administrador si cree que esto es un error.',
          status: error.status,
        }

      case 404:
        return {
          title: 'Recurso no encontrado',
          message: 'El recurso solicitado en el servidor no existe o fue eliminado. Si el problema persiste, contacte soporte.',
          status: error.status,
        }

      case 500:
        return {
          title: 'Error del servidor',
          message: 'El servidor encontró un error interno al procesar su solicitud. Inténtelo de nuevo en unos momentos.',
          status: error.status,
        }

      default:
        return {
          title: `Error (${error.status})`,
          message: error.response || `Ocurrió un error inesperado (código ${error.status}). Si el problema persiste, contacte soporte.`,
          status: error.status,
        }
    }
  }

  return {
    title: 'Error inesperado',
    message: 'Ocurrió un error inesperado en la aplicación. Intente cerrar y reabrir la pantalla.',
  }
}