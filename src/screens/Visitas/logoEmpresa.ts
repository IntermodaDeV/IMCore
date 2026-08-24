import { ImageSourcePropType } from 'react-native'
import { securityService } from '../../api/modules/security/security.service'

/**
 * El logo que va en el centro del QR del pase.
 *
 * Sale de la BD (Security.Empresa.Logo, base64) y NO empaquetado en la app:
 * sumar una empresa al parque no puede depender de publicar una versión nueva y
 * esperar la revisión de la tienda.
 *
 * El logo que se muestra es el de la empresa DEL PASE, no el del usuario que
 * mira: portería atiende a las dos empresas y cada pase tiene que salir con el
 * suyo.
 *
 * El símbolo de Intermoda queda empaquetado solo como RESPALDO: si la llamada al
 * catálogo falla (portería con señal mala), un pase de Intermoda no pierde el
 * logo que ya tenía. Para las demás empresas, sin catálogo el QR se dibuja sin
 * logo — que es correcto: mejor sin logo que con el de otra empresa.
 */

const RESPALDO_INTERMODA = require('../../assets/logo-simbolo-intermoda.png')
const CODIGO_INTERMODA = 'IM'

/**
 * Tamaño del logo como fracción del lado del QR.
 *
 * Estaba en 21% (44 sobre 210) con la corrección de errores por omisión, que es
 * bastante al límite: el logo tapa módulos y lo que queda tiene que alcanzar
 * para reconstruirlos. A 14% con corrección ALTA queda más discreto y además más
 * confiable de leer.
 */
export const FRACCION_LOGO = 0.14
/** 'H' recupera hasta el 30% del código: es lo que hace seguro taparle el centro. */
export const NIVEL_QR = 'H' as const

/** Lado del logo para un QR de `ladoQr` px. */
export const tamanoLogo = (ladoQr: number) => Math.round(ladoQr * FRACCION_LOGO)

type Mapa = Record<string, ImageSourcePropType>

// Caché a nivel de módulo: la app no usa react-query, así que se guarda acá y
// vive lo que vive el proceso. Los logos no cambian en la práctica.
let cache: Mapa | null = null
// La promesa en vuelo, para que dos pantallas montando a la vez no disparen dos
// llamadas (Generar e Historial se abren una detrás de la otra).
let enVuelo: Promise<Mapa> | null = null

async function traer(): Promise<Mapa> {
  const mapa: Mapa = {}
  try {
    const resp = await securityService.getEmpresas(true, true)
    if (resp.Success) {
      for (const e of resp.Data ?? []) {
        if (e.Logo && e.Code) {
          mapa[e.Code] = { uri: `data:${e.LogoMime || 'image/png'};base64,${e.Logo}` }
        }
      }
    }
  } catch {
    // Silencio a propósito: quedarse sin logo no puede romper la pantalla del
    // pase ni sacarle un toast al guardia. Se cae al respaldo de abajo.
  }
  // Si el catálogo no trajo el de Intermoda, se usa el empaquetado.
  if (!mapa[CODIGO_INTERMODA]) mapa[CODIGO_INTERMODA] = RESPALDO_INTERMODA
  return mapa
}

/** Carga (una sola vez) los logos de todas las empresas, indexados por código. */
export function cargarLogosEmpresa(): Promise<Mapa> {
  if (cache) return Promise.resolve(cache)
  if (!enVuelo) {
    enVuelo = traer().then((m) => {
      cache = m
      enVuelo = null
      return m
    })
  }
  return enVuelo
}

/** Logo de una empresa por su código. `undefined` = QR sin logo. */
export function logoDe(
  logos: Mapa | null,
  empresaCode?: string | null
): ImageSourcePropType | undefined {
  if (!logos) return undefined
  return empresaCode ? logos[empresaCode] : undefined
}
