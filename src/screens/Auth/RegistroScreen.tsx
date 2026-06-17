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
import { CircleCheckBig, Eye, EyeOff } from 'lucide-react-native'

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
        }else{
            showToast('error','Error',response?.ErrorMessage,5000,'top')
        }
    } catch {
        showToast('error','Error','Ocurrió un error inesperado',5000,'bottom')
    } finally {
        setLoadingSave(false)
    }
    })

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
    </Page>
  )
}