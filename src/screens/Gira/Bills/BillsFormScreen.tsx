import React, { useEffect } from 'react'
import { YStack, Button, Text, XStack, View, ScrollView, Select, Adapt, Sheet } from 'tamagui'
import { useNavigation, useRoute } from '@react-navigation/native'
import Page from '../../../components/commons/Page'
import { Controller, useForm } from 'react-hook-form'
import AppInput from '../../../components/commons/AppInput'
import AppSelect from '../../../components/commons/AppSelect'
import AppDateInput from '../../../components/commons/AppDateInput'
import { ImageUploader } from '../../../components/commons/ImageUploader'

type FormData = {
  invoiceNumber: string
  provider: string
  total: string
  expenseType: string
  taxableAmount: string
  date:Date
}

export default function BillFormScreen() {
    const navigation = useNavigation()
    const route = useRoute()
    const { id } = route.params as { id?: number }

    const defaultValues: FormData = {
        invoiceNumber: '',
        provider: '',
        total: '',
        expenseType: '',
        taxableAmount: '',
        date: new Date(),
    }

    const { control, handleSubmit, formState: { errors } } = useForm<FormData>({ defaultValues, mode: 'onTouched'})

    const save = () => {
        console.log('Guardar factura')
        navigation.goBack()
    }
    
    const getInfo = async () => {
        console.log(id);
    
    }

    useEffect(() => {
        getInfo()
    }, [])

  return (
    <Page>
      <YStack backgroundColor="$backgroundPage" flex={1}>

        <ScrollView
            flex={1}
            showsVerticalScrollIndicator={false}
        >
            <YStack flex={1} padding="$4" gap="$3">
                <YStack
                    backgroundColor="$card2"
                    padding="$4"
                    borderRadius={12}
                    borderWidth={1}
                    gap="$2"
                    borderColor="$border"
                >
                    <XStack alignItems="center" gap="$2" paddingBottom={15}>

                        <View
                            width={4}
                            height={18}
                            backgroundColor="$primary"
                            borderRadius={999}
                        />

                        <Text fontSize={14} fontWeight="800" color="$text">
                            General
                        </Text>

                    </XStack>

                    {/* INPUTS */}
                    <Controller
                        control={control}
                        name="invoiceNumber"
                        rules={{ required: 'Número de factura obligatorio' }}
                        render={({ field: { onChange, value } }) => (
                        <AppInput
                            label="Gasto de viaje"
                            value={value}
                            onChangeText={onChange}
                            error={errors.invoiceNumber?.message}
                        />
                        )}
                    />

                    <Controller
                        control={control}
                        name="expenseType"
                        rules={{
                            required: 'Tipo de gasto obligatorio',
                        }}
                        render={({ field: { onChange, value } }) => (
                            <AppSelect
                                label="Tipo de gasto"
                                value={value}
                                onValueChange={onChange}
                                error={errors.expenseType?.message}
                                options={[
                                    {
                                    label: 'Alimentación',
                                    value: 'ALIMENTACION',
                                    },
                                    {
                                    label: 'Hospedaje',
                                    value: 'HOSPEDAJE',
                                    },
                                    {
                                    label: 'Transporte',
                                    value: 'TRANSPORTE',
                                    },
                                    {
                                    label: 'Combustible',
                                    value: 'COMBUSTIBLE',
                                    },
                                    {
                                    label: 'Otros',
                                    value: 'OTROS',
                                    },
                                                                   {
                                    label: 'Alimentación',
                                    value: 'ALIMENTACIONN',
                                    },
                                    {
                                    label: 'Hospedaje',
                                    value: 'HOSPEDAJJE',
                                    },
                                    {
                                    label: 'Transporte',
                                    value: 'TRANSPORTTE',
                                    },
                                    {
                                    label: 'Combustible',
                                    value: 'COMBUSTIBLRE',
                                    },
                                    {
                                    label: 'Otros',
                                    value: 'OTROS',
                                    },
                                ]}
                            />
                        )}
                    />
                </YStack>

                <YStack
                    backgroundColor="$card2"
                    padding="$4"
                    borderRadius={12}
                    borderWidth={1}
                    gap="$2"
                    borderColor="$border"
                >
                    <XStack alignItems="center" gap="$2" paddingBottom={15}>

                        <View
                            width={4}
                            height={18}
                            backgroundColor="$primary"
                            borderRadius={999}
                        />

                        <Text fontSize={14} fontWeight="800" color="$text">
                            Datos del proveedor
                        </Text>

                    </XStack>

                    {/* INPUTS */}
                    <Controller
                        control={control}
                        name="invoiceNumber"
                        rules={{ required: 'Número de factura obligatorio' }}
                        render={({ field: { onChange, value } }) => (
                        <AppInput
                            label="RTN / NIT"
                            value={value}
                            onChangeText={onChange}
                            error={errors.invoiceNumber?.message}
                        />
                        )}
                    />

                <Controller
                    control={control}
                    name="provider"
                    rules={{ required: 'Proveedor obligatorio' }}
                    render={({ field: { onChange, value } }) => (
                    <AppInput
                        label="Proveedor"
                        value={value}
                        onChangeText={onChange}
                        error={errors.provider?.message}
                    />
                    )}
                />
                </YStack>

                <YStack
                    backgroundColor="$card2"
                    padding="$4"
                    borderRadius={12}
                    borderWidth={1}
                    gap="$2"
                    borderColor="$border"
                >
                <XStack alignItems="center" gap="$3" paddingBottom={15}>

                    <View
                        width={4}
                        height={18}
                        backgroundColor="$primary"
                        borderRadius={999}
                    />

                    <Text fontSize={14} fontWeight="800" color="$text">
                        Datos de factura
                    </Text>

                </XStack>

                {/* INPUTS */}
                <Controller
                    control={control}
                    name="invoiceNumber"
                    rules={{ required: 'Número de factura obligatorio' }}
                    render={({ field: { onChange, value } }) => (
                        <AppInput
                            label="No. Factura"
                            value={value}
                            onChangeText={onChange}
                            error={errors.invoiceNumber?.message}
                        />
                    )}
                />

                <Controller
                    control={control}
                    name="provider"
                    rules={{ required: 'Proveedor obligatorio' }}
                    render={({ field: { onChange, value } }) => (
                        <AppInput
                            label="Descripción"
                            value={value}
                            onChangeText={onChange}
                            error={errors.provider?.message}
                        />
                    )}
                />

                <Controller
                    control={control}
                    name="taxableAmount"
                    rules={{ required: 'Proveedor obligatorio' }}
                    render={({ field: { onChange, value } }) => (
                        <AppInput
                            label="Importe gravado"
                            value={value}
                            onChangeText={onChange}
                            error={errors.taxableAmount?.message}
                            keyboardType="decimal-pad"
                            prefix="L. "
                        />
                    )}
                />

                <Controller
                    control={control}
                    name="provider"
                    rules={{ required: 'Proveedor obligatorio' }}
                    render={({ field: { onChange, value } }) => (
                    <AppInput
                        label="Importe exento"
                        value={value}
                        onChangeText={onChange}
                        error={errors.provider?.message}
                    />
                    )}
                />

                <Controller
                    control={control}
                    name="provider"
                    rules={{ required: 'Proveedor obligatorio' }}
                    render={({ field: { onChange, value } }) => (
                    <AppInput
                        label="Total"
                        value={value}
                        onChangeText={onChange}
                        error={errors.provider?.message}
                    />
                    )}
                />

                <Controller
                    control={control}
                    name="date"
                    rules={{ required: 'Fecha obligatoria' }}
                    render={({ field: { onChange, value } }) => (
                        <AppDateInput
                            label="Fecha"
                            value={value}
                            onChangeText={onChange}
                            error={errors.date?.message}
                        />
                    )}
                />

                <ImageUploader
                    onChange={(uri: any) => {
                        console.log('Imagen seleccionada:', uri)
                    }}
                />


                </YStack>

            </YStack>        
        </ScrollView>
        
        {/* Footer */}
        <XStack
          paddingTop="$2"
          paddingBottom="$4"
          paddingHorizontal="$4"
          gap="$3"
          marginBottom="$3"
          style={{
            zIndex: 12,
          }}
        >

          <Button
            flex={1}
            backgroundColor="$buttonCancel"
            height={45}
            borderRadius="$3"
            justifyContent="center"
            alignItems="center"
            pressStyle={{ opacity: 0.7 }}
            onPress={() => navigation.goBack()}
          >
            <Text
              color="black"
              fontWeight="700"
            >
              Cancelar
            </Text>
          </Button>

          {/* GUARDAR */}
          <Button
            flex={1}
            backgroundColor="$primary"
            height={45}
            borderRadius="$3"
            justifyContent="center"
            alignItems="center"
            pressStyle={{ opacity: 0.7 }}
            onPress={save}
          >
            <Text
              color="$white"
              fontWeight="700"
            >
              Guardar
            </Text>
          </Button>

        </XStack>

      </YStack>
    </Page>
  )
}