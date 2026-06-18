import Config from 'react-native-config'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { refreshAccessToken } from '../auth/refreshToken'

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
}

// Opciones extra por petición (ej. timeout). Permite que llamadas largas
// (SharePoint) suban el tiempo de espera sin afectar al resto de la app.
export type RequestConfig = {
  timeoutMs?: number
}

// Timeout por defecto: una petición normal nunca debería tardar más de esto.
// Evita que un fetch estancado deje un loader girando para siempre.
const DEFAULT_TIMEOUT = 30000

export class HttpError extends Error {
  status: number
  response: string

  constructor(status: number, response: string) {
    super(`HTTP ${status}`)
    this.name = 'HttpError'
    this.status = status
    this.response = response
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
        throw new HttpError(response.status, text)
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
  }: RequestOptions<TBody>): Promise<TResponse> {
    const fullUrl =
      `${this.baseUrl}${url}${this.buildQuery(params)}`

    const token =
      await AsyncStorage.getItem('accessToken')

    const options: RequestInit = {
      method,
      headers: {
        ...(body
          ? {
              'Content-Type':
                'application/json',
            }
          : {}),
        ...(headers || {}),
        ...(token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {}),
      },
      body: body
        ? JSON.stringify(body)
        : undefined,
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