import React from 'react'
import { ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native'
import { YStack, XStack, Text, Button, View, styled } from 'tamagui'
import { ArrowLeft } from 'lucide-react-native'
import { useForm, Controller } from 'react-hook-form'
import { useAuth } from '../../context/AuthContext'
import { usePageHeader } from '../../hooks/usePageHeader'
import { useLoader } from '../../providers/LoaderProvider'
import { useShowToast } from '../../utils/useShowToast'
import AppInput from '../../components/commons/AppInput'
import CountryFlag from '../../components/commons/CountryFlag'
import { gastosViajeService } from '../../api/modules/GastosViaje/gastosViaje.service'
import { useNavigation } from '@react-navigation/native'

type FormData = {
  providerName: string
  providerRtn: string
  justification: string
}



export default function SolicitarProveedorScreen() {
  const { user, defaultCompany } = useAuth()
  const loader = useLoader()
  const { showToast } = useShowToast()
  const navigation = useNavigation();

  const ArrowLeftStyled = styled(ArrowLeft, { color: '$text' });

  const { control, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      providerName: '',
      providerRtn: '',
      justification: '',
    },
  })


  usePageHeader({
    center: (<Text fontSize={16} fontWeight="700" color="$text" > Solicitar proveedor </Text>),
    left: (
      <View onPress={() => navigation.goBack()}>
        <ArrowLeftStyled  />
      </View>
    ),
    right: <CountryFlag countryCode="HN" width={28} height={20} />,
  })

  const onSubmit = async (data: FormData) => {
    try {
      loader.show()
      const res = await gastosViajeService.solicitarProveedor({
        PersonalCode:      user?.Finansi ?? '',
        VendName:  data.providerName,
        VatNum:   data.providerRtn || undefined,
        CompanyCode: defaultCompany?.Code ?? '',
        Justification: data.justification,
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
                  placeholder={defaultCompany?.Code === "IMHN" ?  "0801-1985-00012": "080119850001K"}
                  keyboardType="numbers-and-punctuation"
                  value={field.value}
                  onChangeText={field.onChange}
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
