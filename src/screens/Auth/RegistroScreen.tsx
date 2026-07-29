import React, { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { AlertDialog, Button, ScrollView, Spinner, Text, XStack, YStack } from 'tamagui'
import Page from '../../components/commons/Page'
import AppInput from '../../components/commons/AppInput'
import { useNavigation } from '@react-navigation/native'
import { useShowToast } from '../../utils/useShowToast'
import { Image, Pressable } from 'react-native'
import { shadows } from '../../theme/shadows'
import { ExecutionResponse } from '../../api/modules/response.type'
import { IRegister } from '../../api/modules/security/security.types'
import { securityService } from '../../api/modules/security/security.service'
import { useKeyboardInset } from '../../hooks/useKeyboardInset'
import { CircleCheckBig, Eye, EyeOff, KeyRound, MailCheck, Lock } from 'lucide-react-native'

type RegisterForm = {
  Code: string
  Name: string
  LastName: string
  Email: string
  Password: string
  ConfirmPassword: string
}

export default function RegisterScreen() {
  const navigation = useNavigation()
  const { showToast } = useShowToast()
  const [loadingSave, setLoadingSave] = useState(false)
  const [openSuccess, setOpenSuccess] = useState(false)
  const [userCode, setUserCode] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Recuperación de cuenta (cuando el usuario/correo ya existe)
  const [openRecover, setOpenRecover] = useState(false)
  const [openRecoverSent, setOpenRecoverSent] = useState(false)
  const [recovering, setRecovering] = useState(false)
  const [recoverEmail, setRecoverEmail] = useState('')
  const [recoverUserCode, setRecoverUserCode] = useState('')
  // Cuenta de Active Directory: se reactiva validando la contraseña de dominio
  const [recoverIsAD, setRecoverIsAD] = useState(false)
  const [recoverPassword, setRecoverPassword] = useState('')
  const [showRecoverPassword, setShowRecoverPassword] = useState(false)
  // El diálogo vive en un Portal, así que subimos su contenedor lo que tape el teclado.
  const { inset: keyboardInset, onLayout: onRecoverDialogLayout } = useKeyboardInset()

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({
    mode: 'onTouched',
    defaultValues: {
    Code: '',
    Name: '',
    LastName: '',
    Email: '',
    Password: '',
    ConfirmPassword: '',
    }
  })

    const save = handleSubmit(async (data) => {

    if (data.Password !== data.ConfirmPassword) {
        showToast('error','Error','Las contraseñas no coinciden',5000,'top')
        return
    }

    try {
        setLoadingSave(true)
        const info = {
            Code: data.Code.trim(),
            Name: data.Name,
            LastName: data.LastName,
            Email: data.Email.trim().toLowerCase(),
            PasswordHash: data.Password,
            ConfirmPassword: data.ConfirmPassword,
        }
        console.log(info)

        const response: ExecutionResponse<IRegister[]> = await securityService.saveUsersRegister([info])

        console.log(response)
        if(response?.Success){
            setUserCode(info?.Code)
            setOpenSuccess(true)
            // showToast('success','Éxito',response?.SuccessMessage,5000,'top')
        } else if (response?.extras?.AccountInactive) {
            // La cuenta existe pero está inactiva (Status_Id = 2) -> ofrecer reactivarla
            setRecoverUserCode(response.extras?.User_Code || info.Code)
            setRecoverEmail(response.extras?.Email || '')
            setRecoverIsAD(!!response.extras?.ValidateAD)
            setRecoverPassword('')
            setShowRecoverPassword(false)
            setOpenRecover(true)
        } else {
            showToast('error','Error',response?.ErrorMessage,5000,'top')
        }
    } catch {
        showToast('error','Error','Ocurrió un error inesperado',5000,'bottom')
    } finally {
        setLoadingSave(false)
    }
    })

    const handleRecover = async () => {
        setRecovering(true)
        try {
            const response = await securityService.recoverAccount({ Identifier: recoverUserCode })
            setOpenRecover(false)
            if (response?.Success) {
                setOpenRecoverSent(true)
            } else {
                showToast('error', 'Error', response?.ErrorMessage || 'No se pudo enviar el correo', 5000, 'top')
            }
        } catch {
            showToast('error', 'Error', 'Ocurrió un error inesperado', 5000, 'top')
        } finally {
            setRecovering(false)
        }
    }

    // Cuenta AD: valida la contraseña de dominio y reactiva (no se envía correo ni se cambia clave)
    const handleReactivateAD = async () => {
        if (!recoverPassword) {
            showToast('error', 'Error', 'Ingresa tu contraseña de dominio', 4000, 'top')
            return
        }
        setRecovering(true)
        try {
            const response = await securityService.reactivateAD({
                Identifier: recoverUserCode,
                Password: recoverPassword,
            })
            if (response?.Success) {
                setOpenRecover(false)
                showToast('success', 'Cuenta reactivada', response?.SuccessMessage || 'Tu cuenta fue reactivada. Inicia sesión con tus credenciales de dominio.', 6000, 'top')
                navigation.navigate('Login' as never, { Code: recoverUserCode } as never)
            } else {
                showToast('error', 'Error', response?.ErrorMessage || 'No se pudo reactivar la cuenta', 6000, 'top')
            }
        } catch {
            showToast('error', 'Error', 'Ocurrió un error inesperado', 5000, 'top')
        } finally {
            setRecovering(false)
        }
    }

  return (
    <Page>
        <ScrollView>
            <YStack flex={1} backgroundColor="$backgroundPage">

                {/* HEADER */}
                <YStack
                    alignItems="center"
                    padding="$5"
                    marginTop="$5"
                >
                    <Text
                        fontSize={30}
                        fontWeight="800"
                        color="$text"
                    >
                        Crear cuenta
                    </Text>
                    <Text
                        color="$textMuted"
                        textAlign="center"
                        marginTop="$2"
                    >
                        Completa la información para crear tu cuenta y comenzar a disfrutar de la experiencia IMCore.
                    </Text>

                    <Image
                        source={require('../../assets/LOGOMODINTER.png')}
                        style={{
                            width: 200,
                            height: 100,
                            resizeMode: 'contain',
                        }}
                    />

                </YStack>

                {/* CARD */}
                <YStack
                    backgroundColor="$backgroundElevated"
                    marginHorizontal="$4"
                    borderRadius={20}
                    padding="$4"
                    gap="$1"
                    {...shadows.md}
                >

                    <Controller
                        control={control}
                        name="Code"
                        rules={{
                            required: 'Campo requerido',
                            minLength: {
                            value: 3,
                            message: 'Mínimo 3 caracteres'
                            }
                        }}
                        render={({ field: { value, onChange } }) => (
                            <AppInput
                            label="Usuario"
                            value={value}
                            autoCapitalize="none"
                            onChangeText={onChange}
                            error={errors.Code?.message}
                            />
                        )}
                        />

                    <Controller
                    control={control}
                    name="Name"
                    rules={{ required: 'Campo requerido' }}
                    render={({ field: { value, onChange } }) => (
                        <AppInput
                        label="Nombre"
                        value={value}
                        onChangeText={onChange}
                        error={errors.Name?.message}
                        />
                    )}
                    />

                    <Controller
                    control={control}
                    name="LastName"
                    rules={{ required: 'Campo requerido' }}
                    render={({ field: { value, onChange } }) => (
                        <AppInput
                        label="Apellido"
                        value={value}
                        onChangeText={onChange}
                        error={errors.LastName?.message}
                        />
                    )}
                    />

                    <Controller
                    control={control}
                    name="Email"
                    rules={{
                        required: 'Campo requerido',
                        pattern: {
                        value: /\S+@\S+\.\S+/,
                        message: 'Correo inválido',
                        },
                    }}
                    render={({ field: { value, onChange } }) => (
                        <AppInput
                        label="Correo electrónico"
                        value={value}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        onChangeText={onChange}
                        error={errors.Email?.message}
                        />
                    )}
                    />

                    <Controller
                    control={control}
                    name="Password"
                    rules={{ required: 'Campo requerido' }}
                    render={({ field: { value, onChange } }) => (
                        <AppInput
                        label="Contraseña"
                        value={value}
                        secureTextEntry={!showPassword}
                        onChangeText={onChange}
                        error={errors.Password?.message}
                        rightElement={
                            <Pressable onPress={() => setShowPassword(!showPassword)}>
                            {showPassword ? (
                                <EyeOff size={20} color="#777" />
                            ) : (
                                <Eye size={20} color="#777" />
                            )}
                            </Pressable>
                        }
                        />
                    )}
                    />

                    <Controller
                    control={control}
                    name="ConfirmPassword"
                    rules={{ required: 'Campo requerido' }}
                    render={({ field: { value, onChange } }) => (
                        <AppInput
                        label="Confirmar contraseña"
                        value={value}
                        secureTextEntry={!showConfirmPassword}
                        onChangeText={onChange}
                        error={errors.ConfirmPassword?.message}
                        rightElement={
                            <Pressable onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                            {showConfirmPassword ? (
                                <EyeOff size={20} color="#777" />
                            ) : (
                                <Eye size={20} color="#777" />
                            )}
                            </Pressable>
                        }
                        />
                    )}
                    />

                </YStack>

            </YStack>
        </ScrollView>

        {/* BOTONES */}
        <XStack
            padding="$4"
            gap="$3"
            backgroundColor="$backgroundPage"
        >
            <Button
                flex={1}
                backgroundColor="$buttonSecondary"
                onPress={() => navigation.goBack()}
            >
                <Text>Cancelar</Text>
            </Button>

            <Button
                flex={1}
                backgroundColor="$primary"
                onPress={save}
                disabled={loadingSave}
            >
                {loadingSave ? (
                    <Spinner color="$white" />
                ) : (
                    <Text color="$white">
                        Registrarse
                    </Text>
                )}
            </Button>
        </XStack>

        <AlertDialog open={openSuccess}>
            <AlertDialog.Portal>

                <AlertDialog.Overlay
                    opacity={0.6}
                    backgroundColor="black"
                />

                <AlertDialog.Content
                    elevate
                    width="85%"
                    alignSelf="center"
                    backgroundColor="$backgroundElevated"
                    borderRadius="$6"
                    padding="$5"
                    x={0}
                    y={0}
                    scale={1}
                    opacity={1}
                    {...shadows.lg}
                >

                    <YStack alignItems="center" gap="$3">

                        <YStack
                            width={60}
                            height={60}
                            borderRadius={30}
                            backgroundColor="rgba(34,197,94,.15)"
                            justifyContent="center"
                            alignItems="center"
                        >
                            <CircleCheckBig
                                size={30}
                                color="#22c55e"
                            />
                        </YStack>

                        <Text
                            fontSize={18}
                            fontWeight="700"
                            color="$text"
                        >
                            ¡Registro exitoso!
                        </Text>

                        <Text
                            color="$textMuted"
                            textAlign="center"
                            lineHeight={22}
                        >
                            Tu cuenta ha sido creada correctamente.
                        </Text>

                        <YStack
                            width="100%"
                            backgroundColor="$backgroundSurface"
                            borderRadius="$4"
                            padding="$3"
                            gap="$2"
                        >
                            <Text
                                textAlign="center"
                                color="$textMuted"
                            >
                                Para ingresar a IMCore utiliza:
                            </Text>

                            <Text
                                textAlign="center"
                                fontSize={20}
                                fontWeight="800"
                                color="$primary"
                            >
                                {userCode}
                            </Text>

                            <Text
                                textAlign="center"
                                color="$textMuted"
                            >
                                e ingresa la contraseña que acabas de registrar.
                            </Text>
                        </YStack>

                        <Button
                            width="100%"
                            backgroundColor="$primary"
                            onPress={() => {
                                setOpenSuccess(false)
                                navigation.navigate('Login' as never,{Code: userCode} as never)
                            }}
                        >
                            <Text color="white">
                                Ir a inicio de sesión
                            </Text>
                        </Button>

                    </YStack>

                </AlertDialog.Content>

            </AlertDialog.Portal>
        </AlertDialog>

        {/* Diálogo: la cuenta ya existe -> ofrecer recuperarla por correo */}
        <AlertDialog
            open={openRecover}
            onOpenChange={(v) => { if (!recovering) setOpenRecover(v) }}
        >
            <AlertDialog.Portal paddingBottom={keyboardInset} onLayout={onRecoverDialogLayout}>
                <AlertDialog.Overlay opacity={0.6} backgroundColor="black" />
                <AlertDialog.Content
                    elevate
                    width="85%"
                    alignSelf="center"
                    backgroundColor="$backgroundElevated"
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

                        <Text fontSize={18} fontWeight="700" color="$text" textAlign="center">
                            Esta cuenta está inactiva
                        </Text>

                        {recoverIsAD ? (
                            <>
                                <Text color="$textMuted" textAlign="center" lineHeight={22}>
                                    Esta cuenta usa tu contraseña de dominio (Active Directory).
                                    Ingrésala para reactivarla; no se cambiará tu contraseña.
                                </Text>

                                <AppInput
                                    label="Contraseña de dominio"
                                    value={recoverPassword}
                                    onChangeText={setRecoverPassword}
                                    secureTextEntry={!showRecoverPassword}
                                    autoCapitalize="none"
                                    rightElement={
                                        <Pressable onPress={() => setShowRecoverPassword(!showRecoverPassword)}>
                                            {showRecoverPassword
                                                ? <EyeOff size={20} color="#777" />
                                                : <Eye size={20} color="#777" />}
                                        </Pressable>
                                    }
                                />
                            </>
                        ) : (
                            <Text color="$textMuted" textAlign="center" lineHeight={22}>
                                Ya existe una cuenta con este usuario o correo
                                {recoverEmail ? ` (${recoverEmail})` : ''}, pero está inactiva.
                                ¿Quieres que te enviemos un correo para reactivarla y crear una nueva contraseña?
                            </Text>
                        )}

                        <XStack width="100%" gap="$3" marginTop="$1">
                            <Button
                                flex={1}
                                backgroundColor="$buttonSecondary"
                                disabled={recovering}
                                opacity={recovering ? 0.6 : 1}
                                onPress={() => { if (!recovering) setOpenRecover(false) }}
                            >
                                <Text color="$text">Cancelar</Text>
                            </Button>

                            <Button
                                flex={1}
                                backgroundColor="$primary"
                                disabled={recovering}
                                opacity={recovering ? 0.8 : 1}
                                onPress={recoverIsAD ? handleReactivateAD : handleRecover}
                            >
                                <XStack gap="$2" alignItems="center">
                                    {recovering && <Spinner size="small" color="white" />}
                                    <Text color="white">
                                        {recovering
                                            ? 'Procesando...'
                                            : recoverIsAD ? 'Reactivar' : 'Enviar correo'}
                                    </Text>
                                </XStack>
                            </Button>
                        </XStack>
                    </YStack>
                </AlertDialog.Content>
            </AlertDialog.Portal>
        </AlertDialog>

        {/* Diálogo: correo de recuperación enviado */}
        <AlertDialog open={openRecoverSent}>
            <AlertDialog.Portal>
                <AlertDialog.Overlay opacity={0.6} backgroundColor="black" />
                <AlertDialog.Content
                    elevate
                    width="85%"
                    alignSelf="center"
                    backgroundColor="$backgroundElevated"
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

                        <Text fontSize={18} fontWeight="700" color="$text" textAlign="center">
                            Revisa tu correo
                        </Text>

                        <Text color="$textMuted" textAlign="center" lineHeight={22}>
                            Si la cuenta existe, te enviamos un correo
                            {recoverEmail ? ` a ${recoverEmail}` : ''} con un enlace para crear tu
                            nueva contraseña y reactivar tu cuenta. Revisa también tu carpeta de spam.
                        </Text>

                        <Button
                            width="100%"
                            backgroundColor="$primary"
                            onPress={() => {
                                setOpenRecoverSent(false)
                                navigation.navigate('Login' as never, { Code: recoverUserCode } as never)
                            }}
                        >
                            <Text color="white">Ir a inicio de sesión</Text>
                        </Button>
                    </YStack>
                </AlertDialog.Content>
            </AlertDialog.Portal>
        </AlertDialog>
    </Page>
  )
}