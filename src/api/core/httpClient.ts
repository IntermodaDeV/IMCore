import Config from 'react-native-config'
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { gzipSync, strToU8 } from 'fflate'
import { refreshAccessToken } from '../auth/refreshToken'
import { sessionManager } from './sessionManager'

type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'

type RequestOptions<TBody = any> = {
  method: HttpMethod
  url: string
  body?: TBody
  params?: Record<string, any>
  headers?: Record<string, string>
  // Tiempo máximo de espera en ms. Por defecto DEFAULT_TIMEOUT.
  // Usar 0 para desactivar el timeout (peticiones largas tipo SharePoint).
  timeoutMs?: number
  // Manda el cuerpo JSON comprimido (Content-Encoding: gzip). Solo para rutas cuyo
  // servidor lo acepta (IMCoreApi con UseRequestDecompression).
  gzip?: boolean
}

// Opciones extra por petición (ej. timeout). Permite que llamadas largas
// (SharePoint) suban el tiempo de espera sin afectar al resto de la app.
export type RequestConfig = {
  timeoutMs?: number
  gzip?: boolean
}

// Timeout por defecto: una petición normal nunca debería tardar más de esto.
// Evita que un fetch estancado deje un loader girando para siempre.
const DEFAULT_TIMEOUT = 30000

export class HttpError extends Error {
  status: number
  response: string
  // Motivo enviado por el servidor (header X-Session-Reason). 'forced' = cierre por admin.
  reason?: string

  constructor(status: number, response: string, reason?: string) {
    super(`HTTP ${status}`)
    this.name = 'HttpError'
    this.status = status
    this.response = response
    this.reason = reason
  }
}

export class NetworkError extends Error {
  constructor(
    message = 'No se pudo conectar con el servidor'
  ) {
    super(message)
    this.name = 'NetworkError'
  }
}

class HttpClient {
  private baseUrl = Config.API_URL

  private async fetchRequest<TResponse>(
    fullUrl: string,
    options: RequestInit,
    timeoutMs: number = DEFAULT_TIMEOUT
  ): Promise<TResponse> {
    // timeoutMs <= 0 => sin límite (peticiones largas tipo SharePoint).
    const controller =
      timeoutMs > 0 ? new AbortController() : null
    const timer =
      controller != null
        ? setTimeout(() => controller.abort(), timeoutMs)
        : null

    try {
      const response = await fetch(fullUrl, {
        ...options,
        signal: controller?.signal,
      })

      const text = await response.text()

      if (!response.ok) {
        const reason = response.headers.get('X-Session-Reason') ?? undefined
        throw new HttpError(response.status, text, reason)
      }

      return (text ? JSON.parse(text) : null) as TResponse
    } catch (error: any) {
      // Un fetch abortado por timeout llega como AbortError.
      if (error?.name === 'AbortError') {
        throw new NetworkError(
          'La solicitud tardó demasiado y se canceló'
        )
      }
      throw error
    } finally {
      if (timer != null) {
        clearTimeout(timer)
      }
    }
  }

  private buildQuery(
    params?: Record<string, any>
  ) {
    if (!params) return ''

    const query = new URLSearchParams()

    Object.entries(params).forEach(
      ([key, value]) => {
        if (
          value !== undefined &&
          value !== null
        ) {
          query.append(
            key,
            String(value)
          )
        }
      }
    )

    return query.toString()
      ? `?${query.toString()}`
      : ''
  }

  async request<
    TResponse = any,
    TBody = any
  >({
    method,
    url,
    body,
    params,
    headers,
    timeoutMs,
    gzip,
  }: RequestOptions<TBody>): Promise<TResponse> {
    const fullUrl =
      `${this.baseUrl}${url}${this.buildQuery(params)}`

    const token =
      await AsyncStorage.getItem('accessToken')

    const json = body ? JSON.stringify(body) : undefined
    const comprimir = gzip === true && json !== undefined

    const options: RequestInit = {
      method,
      headers: {
        ...(body
          ? {
              'Content-Type':
                'application/json',
            }
          : {}),
        ...(comprimir ? { 'Content-Encoding': 'gzip' } : {}),
        ...(headers || {}),
        ...(token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {}),
      },
      // iOS: se comprime aquí y fetch manda el Uint8Array como bytes.
      // Android: el módulo nativo BORRA Content-Encoding si el cuerpo no es texto
      // (NetworkingModule.kt) y, si es texto con esa cabecera, lo comprime él mismo.
      // Por eso allá va el JSON tal cual y la cabecera se respeta.
      body: comprimir && Platform.OS !== 'android'
        ? (gzipSync(strToU8(json!)) as any)
        : json,
    }

    try {
      return await this.fetchRequest<TResponse>(
        fullUrl,
        options,
        timeoutMs
      )
    } catch (error: any) {
      if (
        error instanceof HttpError &&
        error.status === 401
      ) {
        // Cierre de sesión forzado por un administrador: no intentamos refrescar,
        // mostramos directamente la pantalla "sesión cerrada por administrador".
        if (error.reason === 'forced') {
          sessionManager.notifyForcedLogout()
          throw error
        }

        const newToken =
          await refreshAccessToken()

        if (!newToken) {
          throw error
        }

        const retryOptions: RequestInit = {
          ...options,
          headers: {
            ...options.headers,
            Authorization: `Bearer ${newToken}`,
          },
        }

        return await this.fetchRequest<TResponse>(
          fullUrl,
          retryOptions,
          timeoutMs
        )
      }

      throw error
    }
  }

  /**
   * POST multipart (FormData). Reusa el mismo manejo de token y de refresh que
   * `request`, pero NO fija Content-Type: hay que dejar que fetch le ponga el
   * boundary del multipart. Fijarlo a mano rompe el parseo del lado del servidor.
   */
  async postForm<TResponse = any>(
    url: string,
    form: FormData,
    timeoutMs?: number
  ): Promise<TResponse> {
    const fullUrl = `${this.baseUrl}${url}`
    const token = await AsyncStorage.getItem('accessToken')

    const options: RequestInit = {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: form,
    }

    try {
      return await this.fetchRequest<TResponse>(fullUrl, options, timeoutMs)
    } catch (error: any) {
      if (error instanceof HttpError && error.status === 401) {
        if (error.reason === 'forced') {
          sessionManager.notifyForcedLogout()
          throw error
        }
        const newToken = await refreshAccessToken()
        if (!newToken) throw error

        return await this.fetchRequest<TResponse>(
          fullUrl,
          {
            ...options,
            headers: { ...options.headers, Authorization: `Bearer ${newToken}` },
          },
          timeoutMs
        )
      }
      throw error
    }
  }

  get<T>(
    url: string,
    params?: Record<string, any>,
    config?: RequestConfig
  ) {
    return this.request<T>({
      method: 'GET',
      url,
      params,
      timeoutMs: config?.timeoutMs,
    })
  }

  post<T, B = any>(
    url: string,
    body?: B,
    config?: RequestConfig
  ) {
    return this.request<T, B>({
      method: 'POST',
      url,
      body,
      timeoutMs: config?.timeoutMs,
      gzip: config?.gzip,
    })
  }

  put<T, B = any>(
    url: string,
    body?: B,
    config?: RequestConfig
  ) {
    return this.request<T, B>({
      method: 'PUT',
      url,
      body,
      timeoutMs: config?.timeoutMs,
    })
  }

  patch<T, B = any>(
    url: string,
    body?: B,
    config?: RequestConfig
  ) {
    return this.request<T, B>({
      method: 'PATCH',
      url,
      body,
      timeoutMs: config?.timeoutMs,
    })
  }

  delete<T>(
    url: string,
    params?: Record<string, any>,
    config?: RequestConfig
  ) {
    return this.request<T>({
      method: 'DELETE',
      url,
      params,
      timeoutMs: config?.timeoutMs,
    })
  }
}

export const httpClient = new HttpClient()