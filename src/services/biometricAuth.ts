import * as Keychain from 'react-native-keychain'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Servicio dedicado en el Keychain/Keystore para las credenciales del login.
const SERVICE = 'hn.com.intermoda.imcore.biometric'
// Bandera en AsyncStorage para saber si el usuario activó el ingreso biométrico
// SIN tener que disparar el prompt de biometría al abrir el login.
const FLAG = 'biometricEnabled'

export type BiometryKind = 'FaceID' | 'TouchID' | 'Fingerprint' | 'Face' | 'Iris' | 'OpticID' | null

export type StoredCredentials = { code: string; password: string }

// Tipo de biometría que soporta el equipo (o null si no hay/ no está configurada).
export async function getBiometryType(): Promise<BiometryKind> {
  try {
    return (await Keychain.getSupportedBiometryType()) as BiometryKind
  } catch {
    return null
  }
}

// Etiqueta amigable para la UI según el tipo de biometría (iOS y Android).
export function biometryLabel(kind: BiometryKind): string {
  switch (kind) {
    case 'FaceID':
      return 'Face ID'
    case 'TouchID':
      return 'Touch ID'
    case 'OpticID':
      return 'Optic ID'
    case 'Face':
      return 'reconocimiento facial'
    case 'Iris':
      return 'iris'
    case 'Fingerprint':
      return 'huella'
    default:
      return 'biometría'
  }
}

// ¿El tipo de biometría es facial? (para elegir el ícono de rostro vs. huella)
export function isFaceBiometry(kind: BiometryKind): boolean {
  return kind === 'FaceID' || kind === 'Face' || kind === 'OpticID'
}

// ¿El usuario ya activó el ingreso biométrico en este dispositivo?
export async function isBiometricEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(FLAG)) === '1'
  } catch {
    return false
  }
}

// Guarda usuario+contraseña en el Keystore/Secure Enclave, protegidos por biometría.
// BIOMETRY_CURRENT_SET invalida el secreto si cambian las huellas/rostro registrados.
export async function enableBiometric(code: string, password: string): Promise<boolean> {
  try {
    await Keychain.setGenericPassword(code, password, {
      service: SERVICE,
      accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    })
    await AsyncStorage.setItem(FLAG, '1')
    return true
  } catch (e) {
    console.log('enableBiometric error', e)
    return false
  }
}

// Pide la biometría al OS y devuelve las credenciales guardadas (o null si falla/cancela).
export async function getBiometricCredentials(promptTitle: string): Promise<StoredCredentials | null> {
  try {
    const res = await Keychain.getGenericPassword({
      service: SERVICE,
      authenticationPrompt: { title: promptTitle },
    })
    if (!res) return null
    return { code: res.username, password: res.password }
  } catch (e) {
    // Incluye cancelación del usuario o biometría cambiada/invalidada.
    console.log('getBiometricCredentials error', e)
    return null
  }
}

// Borra las credenciales biométricas y la bandera.
export async function disableBiometric(): Promise<void> {
  try {
    await Keychain.resetGenericPassword({ service: SERVICE })
  } catch (e) {
    console.log('disableBiometric error', e)
  }
  try {
    await AsyncStorage.removeItem(FLAG)
  } catch {}
}