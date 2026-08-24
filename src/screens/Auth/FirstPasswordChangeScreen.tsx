import React, { useMemo, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable } from 'react-native'
import { YStack, XStack, Text, Button, ScrollView, Spinner, View } from 'tamagui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Eye, EyeOff, Check, X, ShieldCheck, KeyRound } from 'lucide-react-native'
import AppInput from '../../components/commons/AppInput'
import { securityService } from '../../api/modules/security/security.service'
import { useAuth } from '../../context/AuthContext'
import { useShowToast } from '../../utils/useShowToast'

/**
 * Cambio de contraseña obligatorio en el primer ingreso (usuarios Cooperativa).
 *
 * Es una pantalla BLOQUEANTE: se monta desde App.tsx en lugar del navegador,
 * igual que SessionExpiredScreen, así que no hay header ni forma de salir sin
 * completarla (o cerrar sesión). No pide la contraseña actual: la identidad ya
 * quedó probada por el login que emitió el token con el que se llama al
 * endpoint, y el servidor revalida que el usuario sea de Cooperativa.
 */

type Regla = {
  label: string
  cumple: (v: string) => boolean
}

// Las mismas reglas las revalida el servidor en SetInitialPassword. Acá viven
// para poder mostrarlas en vivo, no como barrera de seguridad.
const REGLAS: Regla[] = [
  { label: 'Al menos 8 caracteres', cumple: v => v.length >= 8 },
  { label: 'Al menos una letra', cumple: v => /[a-zA-Z]/.test(v) },
  { label: 'Al menos un número', cumple: v => /[0-9]/.test(v) },
]

export default function FirstPasswordChangeScreen() {
  const insets = useSafeAreaInsets()
  const { user, logout, finishInitialPasswordChange } = useAuth()
  const { showToast } = useShowToast()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [touchedConfirm, setTouchedConfirm] = useState(false)
  const [loading, setLoading] = useState(false)

  const reglasEstado = useMemo(
    () => REGLAS.map(r => ({ ...r, ok: r.cumple(password) })),
    [password]
  )

  const cumpleTodo = reglasEstado.every(r => r.ok)
  const coincide = confirm.length > 0 && password === confirm
  const puedeGuardar = cumpleTodo && coincide && !loading

  const guardar = async () => {
    if (!puedeGuardar) return

    setLoading(true)
    try {
      const response = await securityService.setInitialPassword({ NewPassword: password })

      if (!response?.Success) {
        // El servidor dice que ya no hay cambio pendiente: la contraseña se
        // guardó en un intento anterior y lo que quedó desincronizado es la
        // bandera local. Se limpia para no dejar al usuario atrapado en esta
        // pantalla pidiéndole algo que el servidor ya no acepta.
        if (response?.ErrorMessage?.includes('no hay un cambio') ||
            response?.ErrorMessage?.toLowerCase().includes('pendiente')) {
          await finishInitialPasswordChange()
          return
        }

        showToast('error', 'Error', response?.ErrorMessage || 'No se pudo actualizar la contraseña', 5000, 'top')
        return
      }

      showToast('success', 'Listo', 'Tu contraseña quedó actualizada', 4000, 'top')
      // Baja la bandera: al re-renderizar, App.tsx ya deja pasar al menú.
      await finishInitialPasswordChange()
    } catch {
      showToast('error', 'Error', 'Ocurrió un problema al actualizar la contraseña', 5000, 'top')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        flex={1}
        backgroundColor="$backgroundPage"
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 24,
          justifyContent: 'center',
        }}
        keyboardShouldPersistTaps="handled"
      >
        <YStack gap="$5" maxWidth={440} width="100%" alignSelf="center">

          {/* Encabezado */}
          <YStack gap="$3" alignItems="center">
            <View
              width={72}
              height={72}
              borderRadius={36}
              backgroundColor="$primary"
              alignItems="center"
              justifyContent="center"
            >
              <ShieldCheck size={36} color="#FFFFFF" />
            </View>

            <Text fontSize={24} fontWeight="700" color="$text" textAlign="center">
              Crea tu contraseña
            </Text>

            <Text fontSize={15} color="$textMuted" textAlign="center" lineHeight={21}>
              {user?.Name
                ? `Hola ${user.Name}, es tu primer ingreso.`
                : 'Es tu primer ingreso.'}
              {' '}Por seguridad, elege una contraseña nueva antes de continuar.
            </Text>
          </YStack>

          {/* Formulario */}
          <YStack gap="$4">
            <AppInput
              label="Contraseña nueva"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              rightElement={
                <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={8}>
                  {showPassword ? <EyeOff size={20} color="#777" /> : <Eye size={20} color="#777" />}
                </Pressable>
              }
            />

            <AppInput
              label="Confirmar contraseña"
              value={confirm}
              onChangeText={setConfirm}
              onBlur={() => setTouchedConfirm(true)}
              secureTextEntry={!showConfirm}
              autoCapitalize="none"
              // El error solo aparece cuando ya escribió algo y salió del campo,
              // para no regañarlo mientras todavía está tecleando.
              error={touchedConfirm && confirm.length > 0 && !coincide ? 'Las contraseñas no coinciden' : undefined}
              status={coincide ? 'success' : undefined}
              rightElement={
                <Pressable onPress={() => setShowConfirm(!showConfirm)} hitSlop={8}>
                  {showConfirm ? <EyeOff size={20} color="#777" /> : <Eye size={20} color="#777" />}
                </Pressable>
              }
            />
          </YStack>

          {/* Requisitos, en vivo */}
          <YStack
            gap="$2.5"
            padding="$4"
            borderRadius="$4"
            backgroundColor="$backgroundSurface"
            borderWidth={1}
            borderColor="$border"
          >
            <XStack gap="$2" alignItems="center" marginBottom="$1">
              <KeyRound size={16} color="#777" />
              <Text fontSize={13} fontWeight="600" color="$textMuted">
                La contraseña debe tener
              </Text>
            </XStack>

            {reglasEstado.map(r => (
              <XStack key={r.label} gap="$2.5" alignItems="center">
                {r.ok
                  ? <Check size={16} color="#22C55E" />
                  : <X size={16} color="#94A3B8" />}
                <Text
                  fontSize={14}
                  color={r.ok ? '$success' : '$textMuted'}
                >
                  {r.label}
                </Text>
              </XStack>
            ))}
          </YStack>

          {/* Acciones */}
          <YStack gap="$3">
            <Button
              backgroundColor={puedeGuardar ? '$primary' : '$buttonSecondary'}
              color={puedeGuardar ? '#FFFFFF' : '$textMuted'}
              height={50}
              borderRadius="$4"
              fontWeight="600"
              fontSize={16}
              disabled={!puedeGuardar}
              onPress={guardar}
              pressStyle={{ opacity: 0.85 }}
              icon={loading ? <Spinner color="#FFFFFF" /> : undefined}
            >
              {loading ? 'Guardando...' : 'Guardar y continuar'}
            </Button>

            {/* Única salida: cerrar sesión. Así no queda atrapado si entró con
                el usuario equivocado. */}
            <Button
              chromeless
              height={44}
              color="$textMuted"
              fontSize={14}
              disabled={loading}
              onPress={logout}
              pressStyle={{ opacity: 0.6 }}
            >
              Cerrar sesión
            </Button>
          </YStack>

        </YStack>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
