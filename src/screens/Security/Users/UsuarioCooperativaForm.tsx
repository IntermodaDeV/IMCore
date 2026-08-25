import React, { useCallback, useEffect, useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView as RNScrollView } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { YStack, XStack, Text, Button, View, Spinner, styled } from 'tamagui'
import { ArrowLeft, Search, UserCheck, AlertCircle, Building2, IdCard } from 'lucide-react-native'
import AppInput from '../../../components/commons/AppInput'
import { usuarioCooperativaService } from '../../../api/modules/usuarioCooperativa/usuarioCooperativa.service'
import { IEmpleadoUsuario } from '../../../api/modules/usuarioCooperativa/usuarioCooperativa.types'
import { usePageHeader } from '../../../hooks/usePageHeader'
import { useKeyboardHeight } from '../../../hooks/useKeyboardInset'
import { handleError } from '../../../utils/errorHandler'
import { useShowToast } from '../../../utils/useShowToast'
import { shadows } from '../../../theme/shadows'

/**
 * Alta de un usuario de cooperativa a partir de un empleado de planilla.
 *
 * Es una pantalla aparte del formulario normal de usuarios, no una variante de
 * él: acá el tipo, el rol, la empresa y la compañía no se eligen — los fija el
 * servidor. Lo único que se llena es el usuario, el nombre y la contraseña.
 *
 * Se llega por el botón de la pantalla de usuarios, que solo ven quienes tienen
 * el acceso 'userCooperativa'. La API exige ese mismo acceso: esconder el botón
 * es comodidad, el permiso se valida del otro lado.
 */

const ArrowLeftStyled = styled(ArrowLeft, { color: '$text' })

/** Prefijo de la contraseña inicial. Igual que el del servidor. */
const PREFIJO_PASSWORD = 'ITM'

/** Contraseña sugerida para un empleado: ITM + su código. */
const passwordSugerida = (employeeCode: string | null | undefined) =>
  PREFIJO_PASSWORD + (employeeCode ?? '').trim()

/** Capitaliza "LAURA KARINA" -> "Laura Karina". Planilla lo guarda en mayúsculas. */
const capitalizar = (texto: string | null | undefined): string =>
  (texto ?? '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')

export default function UsuarioCooperativaForm() {
  const navigation = useNavigation()
  const { showToast } = useShowToast()

  // ── Buscador ──────────────────────────────────────────────────────────
  const [filtro, setFiltro] = useState('')
  const [empleados, setEmpleados] = useState<IEmpleadoUsuario[]>([])
  const [buscando, setBuscando] = useState(false)
  const [elegido, setElegido] = useState<IEmpleadoUsuario | null>(null)

  // ── Formulario ────────────────────────────────────────────────────────
  const [code, setCode] = useState('')
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)

  // En Android con edge-to-edge, adjustResize no achica la ventana, así que el
  // KeyboardAvoidingView por sí solo no alcanza.
  const kbHeight = useKeyboardHeight()
  const bottomPad = Platform.OS === 'android' ? kbHeight : 0

  usePageHeader({
    center: (
      <Text fontSize={16} fontWeight="700" color="$text">
        Usuario de cooperativa
      </Text>
    ),
    left: (
      <View onPress={() => navigation.goBack()} pressStyle={{ opacity: 0.6 }} hitSlop={10}>
        <ArrowLeftStyled />
      </View>
    ),
  })

  const buscar = useCallback(async (texto: string) => {
    setBuscando(true)
    try {
      const response = await usuarioCooperativaService.buscarEmpleados(texto)

      if (response?.Success && response.Data) {
        setEmpleados(response.Data)
      } else {
        setEmpleados([])
        if (response?.ErrorMessage) {
          showToast('error', 'Error', response.ErrorMessage, 5000, 'top')
        }
      }
    } catch (err) {
      setEmpleados([])
      showToast('error', 'Error', handleError(err).message, 5000, 'top')
    } finally {
      setBuscando(false)
    }
    // showToast queda fuera: cambia de identidad en cada render y dispararía
    // la búsqueda en bucle.
  }, [])

  // Búsqueda con retardo: la lista sale de la planilla, y consultar en cada
  // tecla haría una llamada por letra.
  useEffect(() => {
    if (elegido) return

    const t = setTimeout(() => buscar(filtro), 400)
    return () => clearTimeout(t)
  }, [filtro, elegido, buscar])

  /**
   * Toma los datos del empleado y arma el usuario.
   *
   * El Code queda vacío a propósito: se escribe a mano, como en el formulario
   * normal. Todo lo demás se puede corregir antes de guardar.
   */
  const elegir = async (empleado: IEmpleadoUsuario) => {
    if (!empleado.Disponible) {
      showToast(
        'error',
        'Empleado ya registrado',
        `El código ${empleado.Employees_Code} ya está asignado al usuario ${empleado.UsuarioAsignado ?? ''}.`.trim(),
        6000,
        'top',
      )
      return
    }

    setElegido(empleado)
    setNombre(capitalizar(empleado.PrimerNombre))
    setApellido(capitalizar(empleado.ApePaterno))
    setEmail(empleado.Email?.trim() ?? '')
    setPassword(passwordSugerida(empleado.Employees_Code))
    setErrores({})

    // Segunda comprobación contra la base. La marca de la lista puede tener
    // segundos de antigüedad; esto pregunta por este empleado, ahora.
    try {
      const check = await usuarioCooperativaService.verificarCodigo(empleado.Employees_Code ?? '')

      if (check?.Success && check.Data && !check.Data.Disponible) {
        showToast(
          'error',
          'Empleado ya registrado',
          `El código ${empleado.Employees_Code} ya está asignado al usuario ${check.Data.UserCode ?? ''}.`.trim(),
          6000,
          'top',
        )
        setElegido(null)
      }
    } catch {
      // Si la comprobación falla se sigue: el alta la repite del lado del
      // servidor y ahí sí es determinante.
    }
  }

  const validar = (): boolean => {
    const e: Record<string, string> = {}

    if (!elegido) e.empleado = 'Elegí un empleado'
    if (!code.trim()) e.code = 'El usuario es obligatorio'
    if (!nombre.trim()) e.nombre = 'El nombre es obligatorio'
    if (!apellido.trim()) e.apellido = 'El apellido es obligatorio'
    if (!password.trim()) e.password = 'La contraseña es obligatoria'

    setErrores(e)
    return Object.keys(e).length === 0
  }

  const guardar = async () => {
    if (!validar() || !elegido) return

    setGuardando(true)
    try {
      const response = await usuarioCooperativaService.crear({
        Code: code.trim(),
        Name: nombre.trim(),
        LastName: apellido.trim(),
        Email: email.trim(),
        Password: password,
        EmployeeCode: elegido.Employees_Code ?? '',
        CodAlterno: elegido.Cod_Alterno,
      })

      if (response?.Success) {
        showToast('success', 'Listo', 'El usuario fue creado correctamente', 4000, 'top')
        navigation.goBack()
      } else {
        showToast('error', 'Error', response?.ErrorMessage || 'No se pudo crear el usuario', 6000, 'top')
      }
    } catch (err) {
      showToast('error', 'Error', handleError(err).message, 5000, 'top')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <YStack style={{ flex: 1 }} backgroundColor="$backgroundPage">
        <RNScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 + bottomPad }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <YStack gap="$4">

            {/* ── Paso 1: el empleado ───────────────────────────────── */}
            {!elegido ? (
              <YStack gap="$3">
                <Text fontSize={13} color="$textMuted">
                  Buscá al empleado por código o nombre. Sus datos van a llenar el usuario.
                </Text>

                <AppInput
                  label="Buscar empleado"
                  value={filtro}
                  onChangeText={setFiltro}
                  placeholder="Código o nombre"
                  autoCapitalize="none"
                  prefix={<Search size={16} color="#94A3B8" />}
                />

                {buscando && (
                  <XStack alignItems="center" gap="$2" paddingVertical="$2">
                    <Spinner size="small" color="$primary" />
                    <Text fontSize={13} color="$textMuted">Buscando...</Text>
                  </XStack>
                )}

                {!buscando && empleados.length === 0 && (
                  <Text fontSize={13} color="$textMuted" paddingVertical="$2">
                    No hay empleados que coincidan.
                  </Text>
                )}

                {empleados.map(emp => (
                  <XStack
                    key={emp.Employees_Code ?? ''}
                    alignItems="center"
                    gap="$3"
                    padding="$3.5"
                    backgroundColor="$backgroundElevated"
                    borderRadius="$4"
                    borderWidth={1}
                    borderColor="$border"
                    pressStyle={{ opacity: 0.6 }}
                    // Los tomados NO se esconden: se muestran apagados y al
                    // tocarlos explican por qué no se pueden usar. Desaparecer
                    // sin explicación deja a quien busca creyendo que el
                    // empleado no existe.
                    opacity={emp.Disponible ? 1 : 0.55}
                    onPress={() => elegir(emp)}
                    {...shadows.sm}
                  >
                    <YStack flex={1} gap="$1">
                      <Text fontSize={14} fontWeight="600" color="$text">
                        {capitalizar(emp.Employees_Name)}
                      </Text>

                      {!!emp.Posicion && (
                        <Text fontSize={11} color="$textMuted">
                          {capitalizar(emp.Posicion)}
                        </Text>
                      )}

                      {!emp.Disponible && (
                        <XStack alignItems="center" gap="$1.5" marginTop="$1">
                          <AlertCircle size={12} color="#EF4444" />
                          <Text fontSize={11} color="$error">
                            Ya tiene usuario{emp.UsuarioAsignado ? `: ${emp.UsuarioAsignado}` : ''}
                          </Text>
                        </XStack>
                      )}
                    </YStack>
                  </XStack>
                ))}
              </YStack>
            ) : (
              <>
                {/* ── Paso 2: el usuario ─────────────────────────────── */}
                <YStack
                  gap="$2.5"
                  padding="$3.5"
                  backgroundColor="$backgroundElevated"
                  borderRadius="$4"
                  borderWidth={1}
                  borderColor="$border"
                  {...shadows.sm}
                >
                  <XStack alignItems="center" gap="$2.5">
                    <UserCheck size={18} color="#22C55E" />
                    <YStack flex={1}>
                      <Text fontSize={14} fontWeight="700" color="$text">
                        {capitalizar(elegido.Employees_Name)}
                      </Text>
                      <Text fontSize={11} color="$textMuted">
                        Código {elegido.Employees_Code}
                        {elegido.Cod_Alterno ? ` · Alterno ${elegido.Cod_Alterno}` : ''}
                      </Text>
                    </YStack>
                  </XStack>

                  {!!elegido.Centro_Costos && (
                    <XStack alignItems="center" gap="$2">
                      <Building2 size={14} color="#94A3B8" />
                      <Text fontSize={12} color="$textMuted" flex={1}>
                        {capitalizar(elegido.Centro_Costos)}
                      </Text>
                    </XStack>
                  )}

                  <View alignSelf="flex-start">
                    <Text
                      fontSize={12}
                      color="$primary"
                      fontWeight="600"
                      pressStyle={{ opacity: 0.6 }}
                      onPress={() => {
                        setElegido(null)
                        setErrores({})
                      }}
                    >
                      Cambiar empleado
                    </Text>
                  </View>
                </YStack>

                <AppInput
                  label="Usuario"
                  value={code}
                  onChangeText={(v: string) => {
                    setCode(v)
                    setErrores(p => ({ ...p, code: '' }))
                  }}
                  placeholder="Con el que va a iniciar sesión"
                  autoCapitalize="none"
                  error={errores.code}
                />

                <XStack gap="$3">
                  <View flex={1}>
                    <AppInput
                      label="Nombre"
                      value={nombre}
                      onChangeText={(v: string) => {
                        setNombre(v)
                        setErrores(p => ({ ...p, nombre: '' }))
                      }}
                      error={errores.nombre}
                    />
                  </View>
                  <View flex={1}>
                    <AppInput
                      label="Apellido"
                      value={apellido}
                      onChangeText={(v: string) => {
                        setApellido(v)
                        setErrores(p => ({ ...p, apellido: '' }))
                      }}
                      error={errores.apellido}
                    />
                  </View>
                </XStack>

                <AppInput
                  label="Correo"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="correo@intermoda.com.hn"
                  autoCapitalize="none"
                  keyboardType="email-address"
                />

                <AppInput
                  label="Contraseña inicial"
                  value={password}
                  onChangeText={(v: string) => {
                    setPassword(v)
                    setErrores(p => ({ ...p, password: '' }))
                  }}
                  autoCapitalize="none"
                  error={errores.password}
                  // Visible a propósito: hay que dictársela al empleado, y
                  // taparla obligaría a escribirla a ciegas para verificarla.
                  statusMessage="Se le debe que entregar al empleado. El usuario debe cambiarla al entrar por primera vez."
                />

                {/* Lo que no se elige. Se dice para que nadie lo busque. */}
                <XStack alignItems="flex-start" gap="$2" paddingHorizontal="$1">
                  <View marginTop={2}>
                    <IdCard size={14} color="#94A3B8" />
                  </View>
                  <Text fontSize={11} color="$textMuted" flex={1}>
                    Se crea como usuario de Cooperativa, con el rol Cooperativa y la
                    empresa Intermoda. Sus códigos de planilla se guardan junto con el usuario.
                  </Text>
                </XStack>

                <XStack gap="$2" marginTop="$2">
                  <Button
                    flex={1}
                    height={48}
                    borderRadius={12}
                    backgroundColor="$buttonSecondary"
                    pressStyle={{ opacity: 0.7 }}
                    disabled={guardando}
                    onPress={() => navigation.goBack()}
                  >
                    <Text color="$textSecondary" fontWeight="600">Cancelar</Text>
                  </Button>

                  <Button
                    flex={1}
                    height={48}
                    borderRadius={12}
                    backgroundColor="$primary"
                    pressStyle={{ opacity: 0.8 }}
                    disabled={guardando}
                    icon={guardando ? <Spinner color="#FFFFFF" /> : undefined}
                    onPress={guardar}
                  >
                    <Text color="white" fontWeight="700">
                      {guardando ? 'Guardando...' : 'Crear usuario'}
                    </Text>
                  </Button>
                </XStack>
              </>
            )}
          </YStack>
        </RNScrollView>
      </YStack>
    </KeyboardAvoidingView>
  )
}
