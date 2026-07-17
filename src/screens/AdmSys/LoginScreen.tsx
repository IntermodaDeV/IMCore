import React, { useEffect, useState } from 'react'
import DeviceInfo from 'react-native-device-info'
import { YStack, Card, Input, Button, Text, XStack, Spinner, ScrollView, AlertDialog  } from 'tamagui'
import { ImageBackground, Image, KeyboardAvoidingView, Platform, Keyboard, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { User, Lock, LogIn,Eye, EyeOff, KeyRound, MailCheck } from 'lucide-react-native'
import { shadows } from '../../theme/shadows'
import { useForm, Controller } from 'react-hook-form'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useAuth } from '../../context/AuthContext'
import { securityService } from '../../api/modules/security/security.service'
import { useMenu } from '../../context/MenuContext'
import { Pressable } from 'react-native'
import { useShowToast } from '../../utils/useShowToast'
import { useRoute } from '@react-navigation/native'

type FormData = {
  Code: string
  password: string
}

type RouteParams = {
  Code?: string
}
export default function LoginScreen() {
  const navigation = useNavigation()
  const { showToast } = useShowToast()
  const { refreshMenu } = useMenu()
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [lift, setLift] = useState(0)
  const liftRef = React.useRef(0)
  const btnRef = React.useRef<any>(null)
  const { login } = useAuth()

  // Reactivar cuenta
  const [openReactivate, setOpenReactivate] = useState(false)
  const [openReactivateSent, setOpenReactivateSent] = useState(false)
  const [reactivating, setReactivating] = useState(false)
  const [reactivateInput, setReactivateInput] = useState('')
  const [reactivateMasked, setReactivateMasked] = useState('')
  // 'id' = pide usuario/correo ; 'domain' = pide contraseña de dominio (cuentas AD)
  const [reactivateStep, setReactivateStep] = useState<'id' | 'domain'>('id')
  const [reactivatePassword, setReactivatePassword] = useState('')
  const [showReactivatePassword, setShowReactivatePassword] = useState(false)
  const route = useRoute()
  const params = route.params as RouteParams
  const { control, handleSubmit, formState: { errors }, reset } = useForm<FormData>({
    defaultValues: {
      Code: params?.Code ?? '',
      password: '',
    },
    mode: 'onTouched'
  })


  const loginUser = async (data: FormData) => {
    try {
      setLoading(true)
      const device = await DeviceInfo.getDeviceName()
      const ipAddress = await DeviceInfo.getIpAddress()
      const brand = DeviceInfo.getBrand()
      const systemName = DeviceInfo.getSystemName()
      const systemVersion = DeviceInfo.getSystemVersion()

      let info = {
        Code: data.Code.replace(/\s+/g, ''), // el usuario nunca lleva espacios
        password: data.password,
        IPAddress: ipAddress,
        Device: `${brand} ${device} (${systemName} ${systemVersion})`,
      }
      const response = await securityService.login(info)
      if (!response?.Success) {
        showToast('error', 'Error', response?.ErrorMessage || 'Ocurrió un problema al iniciar sesión', 5000, 'top')
        return
      }

      // Guardar el token ANTES de pedir el menú (los endpoints [Authorize] lo requieren)
      if (response.AccessToken) {
        await AsyncStorage.setItem('accessToken', response.AccessToken)
      }
      if (response.RefreshToken) {
        await AsyncStorage.setItem('refreshToken', response.RefreshToken)
      }

      const user = JSON.parse(response.InfoUser)
      await AsyncStorage.setItem('userCode', user.Code)
      await refreshMenu(user.Code)
      // navigation.navigate('Loading' as never)
      login(user)

    } catch (error) {
      showToast('error', 'Error', 'Ocurrió un problema al iniciar sesión', 5000, 'top')
    } finally {
      setLoading(false)
    }
  }

  const openReactivateDialog = () => {
    setReactivateInput('')
    setReactivatePassword('')
    setShowReactivatePassword(false)
    setReactivateStep('id')
    setOpenReactivate(true)
  }

  // Paso 1: el usuario ingresa su usuario/correo.
  const handleReactivateContinue = async () => {
    if (!reactivateInput.trim()) {
      showToast('error', 'Error', 'Ingresa tu usuario o correo', 4000, 'top')
      return
    }
    setReactivating(true)
    try {
      const response = await securityService.recoverAccount({ Identifier: reactivateInput.trim() })
      if (response?.Success) {
        if (response.extras?.RequiresDomainPassword) {
          // Cuenta de Active Directory: pedir la contraseña de dominio (no se envía correo)
          setReactivateStep('domain')
        } else {
          // Cuenta normal: ya se envió el correo
          setReactivateMasked(response.extras?.Email || '')
          setOpenReactivate(false)
          setOpenReactivateSent(true)
        }
      } else {
        // No se encontró la cuenta (o error): se queda en el diálogo y muestra el mensaje
        showToast('error', 'Error', response?.ErrorMessage || 'No se pudo procesar la solicitud', 5000, 'top')
      }
    } catch {
      showToast('error', 'Error', 'Ocurrió un error inesperado', 5000, 'top')
    } finally {
      setReactivating(false)
    }
  }

  // Paso 2 (solo AD): valida la contraseña de dominio y reactiva.
  const handleReactivateDomain = async () => {
    if (!reactivatePassword) {
      showToast('error', 'Error', 'Ingresa tu contraseña de dominio', 4000, 'top')
      return
    }
    setReactivating(true)
    try {
      const response = await securityService.reactivateAD({
        Identifier: reactivateInput.trim(),
        Password: reactivatePassword,
      })
      if (response?.Success) {
        setOpenReactivate(false)
        showToast('success', 'Cuenta reactivada', response?.SuccessMessage || 'Tu cuenta fue reactivada. Inicia sesión con tus credenciales de dominio.', 6000, 'top')
        reset({ Code: reactivateInput.trim(), password: '' })
      } else {
        showToast('error', 'Error', response?.ErrorMessage || 'No se pudo reactivar la cuenta', 6000, 'top')
      }
    } catch {
      showToast('error', 'Error', 'Ocurrió un error inesperado', 5000, 'top')
    } finally {
      setReactivating(false)
    }
  }

  // En Android (New Arch + edge-to-edge) adjustResize no achica la ventana, así que
  // KeyboardAvoidingView behavior="height" parpadea al cerrar el teclado. En su lugar,
  // al abrir el teclado medimos cuánto queda tapado el botón (su borde inferior vs. el
  // borde superior del teclado, endCoordinates.screenY) y subimos SOLO ese solape.
  // Así el botón queda pegado al teclado y el campo Usuario sigue visible arriba.
  useEffect(() => {
    if (Platform.OS !== 'android') return
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      const kbTop = e.endCoordinates?.screenY ?? 0
      const node = btnRef.current
      if (!kbTop || !node?.measureInWindow) return
      // Delay para que un lift previo ya esté aplicado en el layout antes de medir
      // (algunos teclados de tablet re-disparan keyboardDidShow al cambiar de campo).
      setTimeout(() => {
        node.measureInWindow((_x: number, y: number, _w: number, h: number) => {
          // 'y' incluye el translate y={-lift} actual, así que reconstruimos la
          // posición EN REPOSO (medida + lift actual). Así el cálculo es idempotente:
          // dé una o varias veces, el botón queda 16px por encima del teclado.
          const restingBottom = (y + h) + liftRef.current
          // Margen generoso (uniforme para todos los equipos, no hardcodeado a uno):
          // absorbe posibles desfases de medición entre measureInWindow y screenY en
          // ciertas tablets/teclados. En equipos que ya iban bien solo agrega unos px.
          const newLift = Math.max(0, restingBottom - kbTop + 44)
          liftRef.current = newLift
          setLift(newLift)
        })
      }, 40)
    })
    const hide = Keyboard.addListener('keyboardDidHide', () => { liftRef.current = 0; setLift(0) })
    return () => { show.remove(); hide.remove() }
  }, [])

  useEffect(() => {
    const params = route.params as any

    if (params?.Code) {
      reset({
        Code: params.Code,
        password: '',
      })
    }
  }, [route.params])

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >

      <ImageBackground
        source={require('../../assets/bg-intermoda-entrada.png')}
        resizeMode="cover"
        style={{ flex: 1 }}
      >
        <YStack
          flex={1}
          justifyContent="flex-end"
          alignItems="center"
          paddingBottom="$10"
          y={-lift}
          backgroundColor="#1e3a5fc7"
        >
          {/* LOGO */}
          <YStack position="absolute" top={120} alignItems="center" width="100%">
            <Image
              source={require('../../assets/logo.png')}
              style={{
                width: 300,
                height: 220,
                resizeMode: 'contain',
                tintColor: 'white',
              }}
            />
          </YStack>

          <Card
            width="100%"
            borderRadius={30}
            overflow="hidden"
            backgroundColor="white"
            borderWidth={1}
            borderColor="rgba(0,0,0,0.08)"
            shadowColor="#000"
            shadowRadius={20}
            elevation={8}
            marginBottom={-80}
          >
            <YStack paddingBottom="$5" paddingVertical="$8" paddingHorizontal="$6">
              
              <Text
                fontSize={22}
                fontWeight="900"
                textAlign="center"
                color="#1e3a5f"
                letterSpacing={1}
              >
                Bienvenido
              </Text>

              <Text
                fontSize={14}
                textAlign="center"
                marginBottom="$5"
                color="#6b7280"
              >
                Inicia sesión para continuar a IMCore
              </Text>

              <Controller
                control={control}
                name="Code"
                rules={{
                  required: 'El usuario es obligatorio',
                  minLength: {
                    value: 3,
                    message: 'Mínimo 3 caracteres',
                  },
                }}
                render={({ field: { onChange, value } }) => (
                  <XStack
                    alignItems="center"
                    backgroundColor="#f5f5f5"
                    borderRadius={6}
                    marginBottom="$3"
                    paddingHorizontal="$2"
                    borderWidth={1}
                    borderColor={errors.Code ? '#ef4444' : '#e5e5e5'}
                  >
                    <User size={20} color="#777" />

                    <Input
                      flex={1}
                      placeholder="Usuario"
                      value={value}
                      onChangeText={(t) => onChange(t.replace(/\s/g, ''))}
                      size="$4"
                      color="$black"
                      placeholderTextColor="$gray"
                      borderWidth={0}
                      backgroundColor="transparent"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="off"
                    />
                  </XStack>
                )}
              />

              <Controller
                control={control}
                name="password"
                rules={{
                  required: 'La contraseña es obligatoria',
                  minLength: {
                    value: 4,
                    message: 'Mínimo 4 caracteres',
                  },
                }}
                render={({ field: { onChange, value } }) => (
                  <XStack
                    alignItems="center"
                    backgroundColor="#f5f5f5"
                    borderRadius={6}
                    marginBottom="$4"
                    borderWidth={1}
                    paddingHorizontal="$2"
                    borderColor={errors.password ? '#ef4444' : '#e5e5e5'}
                  >
                    <Lock size={20} color="#777" />
                    <Input
                      flex={1}
                      placeholder="Contraseña"
                      secureTextEntry={!showPassword}
                      value={value}
                      onChangeText={onChange}
                      size="$4"
                      borderWidth={0}
                      color="$black"
                      placeholderTextColor='$gray'
                      backgroundColor="transparent"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="off"
                      textContentType="password"
                    />

                    <Pressable onPress={() => setShowPassword(!showPassword)}>
                      {showPassword ? (
                        <EyeOff size={20} color="#777" />
                      ) : (
                        <Eye size={20} color="#777" />
                      )}
                    </Pressable>
                  </XStack>
                )}
              />

              <XStack
                justifyContent="center"
                alignItems="center"
                marginBottom="$4"
                gap="$1"
              >
                <Text
                  fontSize={13}
                  color="#94A3B8"
                >
                  ¿No tienes cuenta?
                </Text>

                <Text
                  fontSize={13}
                  fontWeight="700"
                  color="$primary"
                  marginLeft="$2"
                  onPress={() => navigation.navigate('Register' as never)}
                >
                  Crear una
                </Text>
              </XStack>

              <XStack justifyContent="center" alignItems="center" marginBottom="$4">
                <Text
                  fontSize={13}
                  fontWeight="700"
                  color="$primary"
                  onPress={openReactivateDialog}
                >
                  ¿Tu cuenta está inactiva? Reactívala
                </Text>
              </XStack>

                <View ref={btnRef} collapsable={false}>
                  <Button
                    backgroundColor="$primary"
                    height={45}
                    disabled={loading}
                    opacity={loading ? 0.7 : 1}
                    onPress={handleSubmit(loginUser)}
                  >
                    {loading ? (
                      <XStack alignItems="center" gap="$2">
                        <Spinner color="white" />
                        <Text color="white" fontWeight="700">
                          Iniciando...
                        </Text>
                      </XStack>
                    ) : (
                      <>
                        <LogIn size={18} color="white" />

                        <Text color="white" fontWeight="700" marginLeft="$2">
                          Iniciar Sesión
                        </Text>
                      </>
                    )}
                  </Button>
                </View>

            </YStack>
          </Card>
        </YStack>

        {/* Diálogo: reactivar cuenta (ingresar usuario o correo) */}
        <AlertDialog
          open={openReactivate}
          onOpenChange={(v) => { if (!reactivating) setOpenReactivate(v) }}
        >
          <AlertDialog.Portal>
            <AlertDialog.Overlay opacity={0.6} backgroundColor="black" />
            <AlertDialog.Content
              elevate
              width="85%"
              alignSelf="center"
              backgroundColor="white"
              borderRadius="$6"
              padding="$5"
              x={0} y={0} scale={1} opacity={1}
              {...shadows.lg}
            >
              <YStack alignItems="center" gap="$3">
                <YStack
                  width={60} height={60} borderRadius={30}
                  backgroundColor="rgba(255,85,26,.12)"
                  justifyContent="center" alignItems="center"
                >
                  <KeyRound size={28} color="#FF551A" />
                </YStack>

                <Text fontSize={18} fontWeight="700" color="#1e3a5f" textAlign="center">
                  Reactivar cuenta
                </Text>

                {reactivateStep === 'id' ? (
                  <>
                    <Text fontSize={14} color="#6b7280" textAlign="center" lineHeight={20}>
                      Ingresa tu usuario o correo para continuar con la reactivación de tu cuenta.
                    </Text>

                    <XStack
                      alignItems="center"
                      width="100%"
                      backgroundColor="#f5f5f5"
                      borderRadius={6}
                      paddingHorizontal="$2"
                      borderWidth={1}
                      borderColor="#e5e5e5"
                    >
                      <User size={20} color="#777" />
                      <Input
                        flex={1}
                        placeholder="Usuario o correo"
                        value={reactivateInput}
                        onChangeText={setReactivateInput}
                        size="$4"
                        color="$black"
                        placeholderTextColor="$gray"
                        borderWidth={0}
                        backgroundColor="transparent"
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="off"
                      />
                    </XStack>
                  </>
                ) : (
                  <>
                    <Text fontSize={14} color="#6b7280" textAlign="center" lineHeight={20}>
                      Tu cuenta usa tu contraseña de dominio (Active Directory). Ingrésala para
                      reactivar tu cuenta; no se cambiará tu contraseña.
                    </Text>

                    <XStack
                      alignItems="center"
                      width="100%"
                      backgroundColor="#f5f5f5"
                      borderRadius={6}
                      paddingHorizontal="$2"
                      borderWidth={1}
                      borderColor="#e5e5e5"
                    >
                      <Lock size={20} color="#777" />
                      <Input
                        flex={1}
                        placeholder="Contraseña de dominio"
                        secureTextEntry={!showReactivatePassword}
                        value={reactivatePassword}
                        onChangeText={setReactivatePassword}
                        size="$4"
                        color="$black"
                        placeholderTextColor="$gray"
                        borderWidth={0}
                        backgroundColor="transparent"
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="off"
                        textContentType="password"
                      />
                      <Pressable onPress={() => setShowReactivatePassword(!showReactivatePassword)}>
                        {showReactivatePassword ? (
                          <EyeOff size={20} color="#777" />
                        ) : (
                          <Eye size={20} color="#777" />
                        )}
                      </Pressable>
                    </XStack>
                  </>
                )}

                <XStack width="100%" gap="$3" marginTop="$1">
                  <Button
                    flex={1}
                    backgroundColor="#e5e7eb"
                    disabled={reactivating}
                    opacity={reactivating ? 0.6 : 1}
                    onPress={() => { if (!reactivating) setOpenReactivate(false) }}
                  >
                    <Text color="#1e3a5f">Cancelar</Text>
                  </Button>

                  <Button
                    flex={1}
                    backgroundColor="$primary"
                    disabled={reactivating}
                    opacity={reactivating ? 0.8 : 1}
                    onPress={reactivateStep === 'id' ? handleReactivateContinue : handleReactivateDomain}
                  >
                    <XStack gap="$2" alignItems="center">
                      {reactivating && <Spinner size="small" color="white" />}
                      <Text color="white" fontWeight="700">
                        {reactivating
                          ? 'Procesando...'
                          : reactivateStep === 'id' ? 'Continuar' : 'Reactivar'}
                      </Text>
                    </XStack>
                  </Button>
                </XStack>
              </YStack>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        </AlertDialog>

        {/* Diálogo: correo enviado */}
        <AlertDialog open={openReactivateSent}>
          <AlertDialog.Portal>
            <AlertDialog.Overlay opacity={0.6} backgroundColor="black" />
            <AlertDialog.Content
              elevate
              width="85%"
              alignSelf="center"
              backgroundColor="white"
              borderRadius="$6"
              padding="$5"
              x={0} y={0} scale={1} opacity={1}
              {...shadows.lg}
            >
              <YStack alignItems="center" gap="$3">
                <YStack
                  width={60} height={60} borderRadius={30}
                  backgroundColor="rgba(34,197,94,.15)"
                  justifyContent="center" alignItems="center"
                >
                  <MailCheck size={30} color="#22c55e" />
                </YStack>

                <Text fontSize={18} fontWeight="700" color="#1e3a5f" textAlign="center">
                  Revisa tu correo
                </Text>

                <Text fontSize={14} color="#6b7280" textAlign="center" lineHeight={20}>
                  Te enviamos un correo{reactivateMasked ? ` a ${reactivateMasked}` : ''} con un enlace
                  para crear tu nueva contraseña y reactivar tu cuenta. Revisa también tu carpeta de spam.
                </Text>

                <Button
                  width="100%"
                  backgroundColor="$primary"
                  onPress={() => { setOpenReactivateSent(false); setReactivateInput('') }}
                >
                  <Text color="white" fontWeight="700">Entendido</Text>
                </Button>
              </YStack>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        </AlertDialog>
      </ImageBackground>
    </KeyboardAvoidingView>
  )
}
