import { NativeEventEmitter, NativeModules, Platform } from 'react-native'

// Teclas de volumen como «una pieza más / una menos» de la última barra (Escanear).
// Solo Android (PDA y teléfonos): iOS no deja usar los botones de volumen de forma confiable.
// El módulo nativo solo consume las teclas mientras está ARMADO; desarmado, el volumen es normal.

export type TeclaVolumen = { tecla: 'subir' | 'bajar'; repeticion: number }

const Mod = Platform.OS === 'android' ? NativeModules.TeclasVolumen : undefined

/** Hay teclas de volumen que se puedan usar (Android con el módulo nativo). */
export const hayTeclasVolumen = !!Mod

export function armarTeclasVolumen(activo: boolean) {
  try { Mod?.armar(activo) } catch { /* sin el módulo: el volumen sigue normal */ }
}

export function escucharTeclasVolumen(fn: (e: TeclaVolumen) => void): () => void {
  if (!Mod) return () => {}
  const sub = new NativeEventEmitter(Mod).addListener('teclaVolumen', e => fn(e as TeclaVolumen))
  return () => sub.remove()
}
