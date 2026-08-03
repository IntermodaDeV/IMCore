import React, { useCallback, useState } from 'react'
import { ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native'
import { YStack, XStack, Text, Button, View, styled } from 'tamagui'
import { ArrowLeft } from 'lucide-react-native'
import { useForm, Controller } from 'react-hook-form'
import { useAuth } from '../../context/AuthContext'
import { usePageHeader } from '../../hooks/usePageHeader'
import { useLoader } from '../../providers/LoaderProvider'
import { useShowToast } from '../../utils/useShowToast'
import AppInput from '../../components/commons/AppInput'
import { ImageUploader } from '../../components/commons/ImageUploader'
import CountryFlag from '../../components/commons/CountryFlag'
import { gastosViajeService } from '../../api/modules/GastosViaje/gastosViaje.service'
import { useFocusEffect, useNavigation } from '@react-navigation/native'

const formatRTN = (text: string) => {
  // IMHN: XXX-XXX-XX-XXXXXXXX (3-3-2-8 = 16 dígitos)
  const digits = text.replace(/\D/g, '').slice(0, 16)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  if (digits.length <= 8) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`
}

const formatNIT = (text: string) => {
  return text;
}

type FormData = {
  providerName: string
  providerRtn: string
  justification: string
  imageUri: string
  imageBase64: string
}



export default function SolicitarProveedorScreen() {
  const { user, defaultCompany } = useAuth()
  const loader = useLoader()
  const { showToast } = useShowToast()
  const navigation = useNavigation();

  const [uploaderKey, setUploaderKey] = useState(0)

  useFocusEffect(useCallback(() => {
    setValue('imageUri', '')
    setValue('imageBase64', '')
    setUploaderKey(k => k + 1)
  }, []))

  const ArrowLeftStyled = styled(ArrowLeft, { color: '$text' });

  const { control, handleSubmit, reset, setValue, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      providerName: '',
      providerRtn: '',
      justification: '',
      imageUri: '',
      imageBase64: '',
    },
  })


  usePageHeader({
    center: (<Text fontSize={16} fontWeight="700" color="$text" > Solicitar proveedor </Text>),
    left: (
      <View onPress={() => navigation.goBack()}>
        <ArrowLeftStyled  />
      </View>
    ),
    right: <CountryFlag countryCode={defaultCompany?.CodeIcon ?? 'HN'} width={28} height={20} />,
  })

  const onSubmit = async (data: FormData) => {
    try {
      loader.show()
      const res = await gastosViajeService.solicitarProveedor(defaultCompany?.Code ?? '',{
        RequesterCode:      user?.Payweb ?? '',
        VendorName:  data.providerName,
        RTN:   data.providerRtn,
        Description: data.justification,
        InvoiceImage: data.imageBase64
      })
      
      if (res.Success) {
        showToast('success', 'Solicitud enviada', 'Tu solicitud fue registrada correctamente', 3000, 'top')
        reset()
        navigation.goBack()
      } else {
        showToast('error', 'Error', 'No se pudo enviar la solicitud', 4000, 'top')
      }
    } catch {
      showToast('error', 'Error', 'Ocurrió un error inesperado', 4000, 'top')
    } finally {
      loader.hide()
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <YStack style={{ flex: 1 }} backgroundColor="$backgroundPage" >
        
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

          <YStack gap="$3">
            <Controller
              control={control}
              name="providerName"
              rules={{ required: 'El nombre del proveedor es requerido' }}
              render={({ field }) => (
                <AppInput
                  label="Nombre del proveedor"
                  placeholder="Ej. Distribuidora Central S.A."
                  value={field.value}
                  onChangeText={field.onChange}
                  error={errors.providerName?.message}
                />
              )}
            />

            <Controller
              control={control}
              name="providerRtn"
              render={({ field }) => (
                <AppInput
                  label={defaultCompany?.Code === 'IMHN' ? 'RTN' : 'NIT'}
                  placeholder={defaultCompany?.Code === 'IMHN' ? '0801-1985-000012' : '12345678-K'}
                  keyboardType={defaultCompany?.Code === 'IMHN' ? 'numeric' : 'default'}
                  value={field.value}
                  onChangeText={v => field.onChange(defaultCompany?.Code === 'IMHN' ? formatRTN(v) : formatNIT(v))}
                />
              )}
            />

            <Controller
              control={control}
              name="justification"
              rules={{
                required: 'La justificación es requerida',
                minLength: { value: 20, message: 'Mínimo 20 caracteres' },
              }}
              render={({ field }) => (
                <AppInput
                  label="Justificación"
                  placeholder="Explica por qué necesitas este proveedor..."
                  value={field.value}
                  onChangeText={field.onChange}
                  multiline
                  numberOfLines={4}
                  error={errors.justification?.message}
                  style={{ height: 100}}
                />
              )}
            />
            <Controller
              control={control}
              name="imageUri"
              rules={{ required: 'La imagen de la factura es requerida' }}
              render={({ field }) => (
                <>
                  <ImageUploader
                    key={uploaderKey}
                    onChangeWithBase64={(uri, base64) => {
                      setValue('imageUri', uri ?? '')
                      setValue('imageBase64', base64 ?? '')
                      field.onChange(uri ?? '')
                    }}
                  />
                  {errors.imageUri && (
                    <Text fontSize={11} color="red">* {errors.imageUri.message}</Text>
                  )}
                </>
              )}
            />
          </YStack>

          <XStack gap="$3" marginTop="$5">
            <Button
              flex={1}
              height={48}
              borderRadius={12}
              backgroundColor="$backgroundSecondary"
              borderWidth={1}
              borderColor="$border"
              pressStyle={{ opacity: 0.7 }}
              onPress={() => navigation.goBack()}
            >
              <Text color="$text" fontWeight="600">Cancelar</Text>
            </Button>
            <Button
              flex={2}
              height={48}
              borderRadius={12}
              backgroundColor="$primary"
              pressStyle={{ opacity: 0.8 }}
              onPress={handleSubmit(onSubmit)}
            >
              <Text color="white" fontWeight="700">Enviar solicitud</Text>
            </Button>
          </XStack>
        </ScrollView>
      </YStack>
    </KeyboardAvoidingView>
  )
}
