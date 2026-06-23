import React, { useCallback, useEffect, useState } from 'react'
import { ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native'
import { YStack, XStack, Text, Button, View, Card, styled } from 'tamagui'
import { ArrowLeft, Check, Search } from 'lucide-react-native'
import { useForm, Controller } from 'react-hook-form'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { useAuth } from '../../context/AuthContext'
import { usePageHeader } from '../../hooks/usePageHeader'
import { useLoader } from '../../providers/LoaderProvider'
import { useShowToast } from '../../utils/useShowToast'
import AppInput from '../../components/commons/AppInput'
import AppSelect from '../../components/commons/AppSelect'
import AppDatePicker from '../../components/commons/AppDatePicker'
import CountryFlag from '../../components/commons/CountryFlag'
import dayjs from 'dayjs'
import { ImageUploader } from '../../components/commons/ImageUploader'
import { gastosViajeService } from '../../api/modules/GastosViaje/gastosViaje.service'
import {
  Company, IExpenseType, IExpenseCategory,
  IAlimentacionSubtype, IFuelType, ICurrency, IProviderSearchResult,
} from '../../api/modules/GastosViaje/gastosViaje.types'

// TODO: derive from user context
const COMPANY: Company = 'IMHN'

type FormData = {
  imageUri: string
  imageBase64: string
  expenseTypeId: string
  categoryId: string
  alimentacionSubtypeId: string
  fuelTypeId: string
  useCustomProvider: string
  providerName: string
  providerRtn: string
  // IMHN
  invoiceNumber: string
  description: string
  gravedAmount: string
  exemptAmount: string
  invoiceDate: string
  // IMGT / IMCR
  serialNumber: string
  invoiceNumberFree: string
  currencyId: string
  total: string
  gallons: string
}


const toNum = (s: string) => parseFloat(s.replace(/,/g, '') || '0') || 0

type SectionState = 'locked' | 'active' | 'completed'

function SectionHeader({ number, title, state }: { number: number; title: string; state: SectionState }) {
  const isLocked    = state === 'locked'
  const isCompleted = state === 'completed'
  return (
    <XStack alignItems="center" gap="$2" marginBottom="$2">
      <View
        width={26}
        height={26}
        borderRadius={999}
        backgroundColor={isCompleted ? '$success' : isLocked ? 'transparent' : '$primary'}
        justifyContent="center"
        alignItems="center"
        borderWidth={isLocked ? 1.5 : 0}
        borderColor="$border"
      >
        {isCompleted
          ? <Check size={14} color="white" />
          : <Text color={isLocked ? '$textMuted' : 'white'} fontSize={13} fontWeight="700">{number}</Text>
        }
      </View>
      <Text fontSize={15} fontWeight="700" color={isLocked ? '$textMuted' : '$text'}>{title}</Text>
    </XStack>
  )
}

export default function NuevoGastoScreen() {
  const { user } = useAuth()
  const loader = useLoader()
  const { showToast } = useShowToast()
  const navigation = useNavigation<any>()
  const [expenseTypes, setExpenseTypes]               = useState<IExpenseType[]>([])
  const [categories, setCategories]                   = useState<IExpenseCategory[]>([])
  const [alimentacionSubtypes, setAlimentacionSubtypes] = useState<IAlimentacionSubtype[]>([])
  const [fuelTypes, setFuelTypes]                     = useState<IFuelType[]>([])
  const [currencies, setCurrencies]                   = useState<ICurrency[]>([])
  const [taxRate, setTaxRate]                         = useState(0.15)
  const [allProviders, setAllProviders]               = useState<IProviderSearchResult[]>([])
  const [selectedProviderId, setSelectedProviderId]   = useState('')
  const [computedTotal, setComputedTotal]             = useState(0)

  const ArrowLeftStyled = styled(ArrowLeft, { color: '$text' });
  const SearchStyled = styled(Search, { color: '$textMuted', height: 12, marginEnd: 6});

  const { control, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      imageUri: '', imageBase64: '', expenseTypeId: '', categoryId: '',
      alimentacionSubtypeId: '', fuelTypeId: '', useCustomProvider: 'false',
      providerName: '', providerRtn: '',
      invoiceNumber: '', description: '', gravedAmount: '', exemptAmount: '',
      invoiceDate: dayjs().format('YYYY-MM-DD'), serialNumber: '', invoiceNumberFree: '', currencyId: '',
      total: '', gallons: '',
    },
  })

  const watchedTypeId                = watch('expenseTypeId')
  const watchedCatId                 = watch('categoryId')
  const watchedGraved                = watch('gravedAmount')
  const watchedExempt                = watch('exemptAmount')
  const watchedCustom                = watch('useCustomProvider')
  const watchedAlimentacionSubtypeId = watch('alimentacionSubtypeId')
  const watchedFuelTypeId            = watch('fuelTypeId')
  const watchedProviderName          = watch('providerName')
  const watchedImageUri              = watch('imageUri')

  const selectedCategory = categories.find(c => String(c.Id) === watchedCatId)
  const selectedTypeName = expenseTypes.find(t => String(t.Id) === watchedTypeId)?.Name ?? ''
  const isAlimentacion   = selectedCategory?.Name?.toLowerCase().includes('alimentaci') ?? false
  const isCombustible    = selectedTypeName === 'Combustible' && COMPANY === 'IMGT'
  const isHospedaje      = selectedTypeName === 'Hospedaje'
  const isIMHN           = COMPANY === 'IMHN'
  const hasPredefined    = !!selectedCategory?.VendAccount

  // ── Estados de secciones (nuevo orden: Tipo → Proveedor → Factura → Imagen) ──
  const section1Complete = !!watchedTypeId && !!watchedCatId &&
    (!isAlimentacion || !!watchedAlimentacionSubtypeId) &&
    (!isCombustible  || !!watchedFuelTypeId)

  const section2Complete = !!watchedCatId && (
    (hasPredefined && watchedCustom === 'false') ||
    watchedProviderName !== ''
  )

  const section1State: SectionState = section1Complete ? 'completed' : 'active'
  const section2State: SectionState = !section1Complete ? 'locked' : section2Complete ? 'completed' : 'active'
  const section3State: SectionState = !section2Complete ? 'locked' : 'active'
  const section4State: SectionState = watchedImageUri !== '' ? 'completed' : 'active'

  usePageHeader({
    center: (<Text fontSize={16} fontWeight="700" color="$text" > Nuevo Gasto de Viaje </Text>),
    left: (
      <View onPress={() => navigation.goBack()}>
        <ArrowLeftStyled  />
      </View>
    ),
    right: <CountryFlag countryCode="HN" width={28} height={20} />,
  })

  

  useFocusEffect(useCallback(() => {
    const load = async () => {
      try {
        const [typesRes, taxRes, providersRes] = await Promise.all([
          gastosViajeService.getExpenseTypes(COMPANY),
          gastosViajeService.getTaxConfig(COMPANY),
          gastosViajeService.getProviders(COMPANY),
        ])
        if (typesRes.Success) setExpenseTypes(typesRes.Data)
        if (taxRes.Success) setTaxRate(taxRes.Data.Rate)
        if (providersRes.Success) setAllProviders(providersRes.Data)
        if (COMPANY !== 'IMHN') {
          const curRes = await gastosViajeService.getCurrencies(COMPANY)
          if (curRes.Success) setCurrencies(curRes.Data)
        }
      } catch {}
    }
    load()
  }, []))

  useEffect(() => {
    if (!watchedTypeId) { setCategories([]); setValue('categoryId', ''); return }
    const load = async () => {
      const res = await gastosViajeService.getCategories(parseInt(watchedTypeId), COMPANY)
      if (res.Success) setCategories(res.Data)
      setValue('categoryId', '')
      setValue('alimentacionSubtypeId', '')
      setValue('fuelTypeId', '')
    }
    load()
  }, [watchedTypeId])

  useEffect(() => {
    if (!watchedCatId) return
    setValue('useCustomProvider', hasPredefined ? 'false' : 'true')
    setSelectedProviderId('')

    if (hasPredefined) {
      setValue('providerName', selectedCategory?.VendAccount ?? '')
      setValue('providerRtn', '')
    } else {
      setValue('providerName', '')
      setValue('providerRtn', '')
    }

    if (isAlimentacion) {
      gastosViajeService.getAlimentacionSubtypes().then(r => {
        if (r.Success) setAlimentacionSubtypes(r.Data)
      })
    }
    if (isCombustible) {
      gastosViajeService.getFuelTypes().then(r => {
        if (r.Success) setFuelTypes(r.Data)
      })
    }
  }, [watchedCatId])

  useEffect(() => {
    if (!isIMHN) return
    const graved = toNum(watchedGraved)
    const exempt = toNum(watchedExempt)
    setComputedTotal(graved + graved * taxRate + exempt)
  }, [watchedGraved, watchedExempt, taxRate, isIMHN])

  const onSubmit = async (data: FormData) => {
    try {
      loader.show()
      const graved = toNum(data.gravedAmount)
      const exempt = toNum(data.exemptAmount)
      const total  = isIMHN ? computedTotal : toNum(data.total)

      const invoiceDate = data.invoiceDate

      const res = await gastosViajeService.createGasto({
        UserCode:      user?.Code ?? '',
        Company:       COMPANY,
        CategoryId:    parseInt(data.categoryId),
        InvoiceNumber: isIMHN ? data.invoiceNumber : data.invoiceNumberFree || undefined,
        SerialNumber:  !isIMHN ? data.serialNumber || undefined : undefined,
        Description:   data.description || undefined,
        GravedAmount:  graved,
        ExemptAmount:  exempt,
        Total:         total,
        CurrencyId:    !isIMHN && data.currencyId ? parseInt(data.currencyId) : undefined,
        InvoiceDate:   invoiceDate,
        ProviderName:  data.providerName,
        ProviderRtn:   data.providerRtn || undefined,
        ImageBase64:   data.imageBase64 || undefined,
        FuelTypeId:    data.fuelTypeId ? parseInt(data.fuelTypeId) : undefined,
        Gallons:       data.gallons ? toNum(data.gallons) : undefined,
      })

      if (res.Success) {
        showToast('success', 'Gasto registrado', 'Tu gasto fue enviado correctamente', 3000, 'top')
        reset()
        navigation.goBack()
      } else {
        showToast('error', 'Error', res.ErrorMessage || 'No se pudo registrar el gasto', 4000, 'top')
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
      <YStack style={{ flex: 1 }}  backgroundColor="$backgroundPage" >
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

          {/* ── Sección 1: Tipo de gasto ── */}
          <YStack gap="$2" marginBottom="$5">
            <SectionHeader number={1} title="Tipo de gasto" state={section1State} />
            <YStack gap="$2">
              <Controller
                control={control}
                name="expenseTypeId"
                rules={{ required: 'Selecciona el tipo de gasto' }}
                render={({ field }) => (
                  <AppSelect
                    label="Selecciona el tipo de gasto"
                    value={field.value}
                    onValueChange={v => field.onChange(String(v))}
                    options={expenseTypes.map(t => ({ label: t.Name, value: String(t.Id) }))}
                    error={errors.expenseTypeId?.message}
                  />
                )}
              />

              {watchedTypeId && (
                <Controller
                  control={control}
                  name="categoryId"
                  rules={{ required: 'Selecciona la categoría' }}
                  render={({ field }) => (
                    <AppSelect
                      label="Categoría"
                      value={field.value}
                      onValueChange={v => field.onChange(String(v))}
                      options={categories.map(c => ({ label: c.Name, value: String(c.Id) }))}
                      error={errors.categoryId?.message}
                    />
                  )}
                />
              )}

              {isAlimentacion && watchedCatId && (
                <Controller
                  control={control}
                  name="alimentacionSubtypeId"
                  rules={{ required: 'Selecciona el tipo de alimentación' }}
                  render={({ field }) => (
                    <AppSelect
                      label="Tipo de alimentación"
                      value={field.value}
                      onValueChange={v => field.onChange(String(v))}
                      options={alimentacionSubtypes.map(s => ({ label: s.Name, value: String(s.Id) }))}
                      error={errors.alimentacionSubtypeId?.message}
                    />
                  )}
                />
              )}

              {isCombustible && watchedCatId && (
                <Controller
                  control={control}
                  name="fuelTypeId"
                  rules={{ required: 'Selecciona el tipo de combustible' }}
                  render={({ field }) => (
                    <AppSelect
                      label="Tipo de combustible"
                      value={field.value}
                      onValueChange={v => field.onChange(String(v))}
                      options={fuelTypes.map(f => ({ label: f.Name, value: String(f.Id) }))}
                      error={errors.fuelTypeId?.message}
                    />
                  )}
                />
              )}
            </YStack>
          </YStack>

          {/* ── Sección 2: Proveedor ── */}
          <YStack gap="$2" marginBottom="$5">
            <SectionHeader number={2} title="Proveedor" state={section2State} />
            <View pointerEvents={section2State === 'locked' ? 'none' : 'box-none'} opacity={section2State === 'locked' ? 0.35 : 1}>
              <YStack gap="$2">
                {hasPredefined && watchedCustom === 'false' ? (
                  <Card backgroundColor="$backgroundElevated" borderRadius={10} padding="$3" borderWidth={1} borderColor="$border">
                    <YStack gap="$1">
                      <Text fontSize={12} color="$textMuted">Proveedor asignado</Text>
                      <Text fontSize={14} fontWeight="700" color="$text">{selectedCategory?.VendAccount}</Text>
                    </YStack>
                  </Card>
                ) : (
                  <YStack gap="$2">
                    <Controller
                      control={control}
                      name="providerRtn"
                      render={({ field }) => (
                        <AppInput
                          label="RTN / NIT"
                          placeholder="0801-1985-00012"
                          value={field.value}
                          onChangeText={field.onChange}
                          suffix={<SearchStyled />}
                        />
                      )}
                    />

                    <AppSelect
                      label="Seleccionar proveedor"
                      value={selectedProviderId}
                      onValueChange={(v) => {
                        const id = String(v)
                        const p = allProviders.find(r => String(r.Id) === id)
                        if (p) {
                          setSelectedProviderId(id)
                          setValue('providerName', p.Name)
                          setValue('providerRtn', p.Rtn)
                        }
                      }}
                      options={allProviders.map(r => ({
                        label: `${r.Name} (${r.Rtn})`,
                        value: String(r.Id),
                      }))}
                    />

                  </YStack>
                )}

                <TouchableOpacity onPress={() => navigation.navigate('solicitarProveedor')}>
                  <Text fontSize={13} color="$primary" fontWeight="600" marginTop="$1">
                    + Solicitar crear nuevo proveedor
                  </Text>
                </TouchableOpacity>
              </YStack>
            </View>
          </YStack>

          {/* ── Sección 3: Datos de la factura ── */}
          <YStack gap="$2" marginBottom="$5">
            <SectionHeader number={3} title="Datos de la factura" state={section3State} />
            <View pointerEvents={section3State === 'locked' ? 'none' : 'box-none'} opacity={section3State === 'locked' ? 0.35 : 1}>
              <YStack gap="$2">
                {/* IMHN */}
                {isIMHN && (
                  <>
                    {selectedCategory?.IsInvoiceRequired && (
                      <Controller
                        control={control}
                        name="invoiceNumber"
                        rules={{ required: 'El número de factura es requerido' }}
                        render={({ field }) => (
                          <AppInput
                            label="No. de factura"
                            placeholder="000-001-01-00000000"
                            value={field.value}
                            onChangeText={field.onChange}
                            keyboardType="numeric"
                            error={errors.invoiceNumber?.message}
                          />
                        )}
                      />
                    )}

                    <Controller
                      control={control}
                      name="description"
                      rules={selectedCategory?.IsDescriptionRequired ? { required: 'La descripción es requerida' } : {}}
                      render={({ field }) => (
                        <AppInput
                          label={`Descripción${selectedCategory?.IsDescriptionRequired ? '' : ' (Opcional)'}`}
                          placeholder="Ej. Gastos de viaje semana 43"
                          value={field.value}
                          onChangeText={field.onChange}
                          multiline
                          numberOfLines={3}
                          error={errors.description?.message}
                          style={{ height: 80}}
                        />
                      )}
                    />

                    <XStack gap="$3">
                      <YStack flex={1}>
                        <Controller
                          control={control}
                          name="gravedAmount"
                          rules={{ required: 'Requerido' }}
                          render={({ field }) => (
                            <AppInput
                              label="Importe gravado"
                              value={field.value}
                              onChangeText={field.onChange}
                              keyboardType="decimal-pad"
                              prefix="Lps."
                              error={errors.gravedAmount?.message}
                            />
                          )}
                        />
                      </YStack>
                      <YStack flex={1}>
                        <Controller
                          control={control}
                          name="exemptAmount"
                          render={({ field }) => (
                            <AppInput
                              label="Importe exento"
                              value={field.value}
                              onChangeText={field.onChange}
                              keyboardType="decimal-pad"
                              prefix="Lps."
                            />
                          )}
                        />
                      </YStack>
                    </XStack>
                  </>
                )}

                {/* IMGT / IMCR */}
                {!isIMHN && (
                  <>
                    <XStack gap="$3">
                      <YStack flex={1}>
                        <Controller
                          control={control}
                          name="serialNumber"
                          render={({ field }) => (
                            <AppInput
                              label="No. de serie"
                              value={field.value}
                              onChangeText={field.onChange}
                            />
                          )}
                        />
                      </YStack>
                      <YStack flex={1}>
                        <Controller
                          control={control}
                          name="invoiceNumberFree"
                          rules={{ required: 'Requerido' }}
                          render={({ field }) => (
                            <AppInput
                              label="No. de factura"
                              value={field.value}
                              onChangeText={field.onChange}
                              error={errors.invoiceNumberFree?.message}
                            />
                          )}
                        />
                      </YStack>
                    </XStack>

                    <Controller
                      control={control}
                      name="currencyId"
                      rules={{ required: 'Selecciona la moneda' }}
                      render={({ field }) => (
                        <AppSelect
                          label="Moneda"
                          value={field.value}
                          onValueChange={v => field.onChange(String(v))}
                          options={currencies.map(c => ({ label: `${c.Name} (${c.Code})`, value: String(c.Id) }))}
                          error={errors.currencyId?.message}
                        />
                      )}
                    />

                    {isCombustible && (
                      <Controller
                        control={control}
                        name="gallons"
                        render={({ field }) => (
                          <AppInput
                            label="Galones"
                            value={field.value}
                            onChangeText={field.onChange}
                            keyboardType="decimal-pad"
                          />
                        )}
                      />
                    )}

                    {isHospedaje && (
                      <Controller
                        control={control}
                        name="exemptAmount"
                        render={({ field }) => (
                          <AppInput
                            label="Importe exento"
                            value={field.value}
                            onChangeText={field.onChange}
                            keyboardType="decimal-pad"
                          />
                        )}
                      />
                    )}

                    <Controller
                      control={control}
                      name="total"
                      rules={{ required: 'El total es requerido' }}
                      render={({ field }) => (
                        <AppInput
                          label="Total"
                          value={field.value}
                          onChangeText={field.onChange}
                          keyboardType="decimal-pad"
                          error={errors.total?.message}
                        />
                      )}
                    />
                  </>
                )}

                {/* Fecha de factura — siempre */}
                <Controller
                  control={control}
                  name="invoiceDate"
                  rules={{ required: 'La fecha es requerida' }}
                  render={({ field }) => (
                    <AppDatePicker
                      label="Fecha de factura"
                      value={field.value || null}
                      onChange={v => field.onChange(v ?? '')}
                      displayFormat="DD/MM/YYYY"
                      direction="past"
                      error={errors.invoiceDate?.message}
                    />
                  )}
                />

                {/* Total IMHN — calculado */}
                {isIMHN && (
                  <Card backgroundColor="$primary" borderRadius={12} padding="$4" marginTop="$2">
                    <XStack justifyContent="space-between" alignItems="center">
                      <Text color="white" fontSize={14} fontWeight="600">Total de la factura</Text>
                      <Text color="white" fontSize={20} fontWeight="800">
                        Lps. {computedTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </XStack>
                  </Card>
                )}
              </YStack>
            </View>
          </YStack>

          {/* ── Sección 4: Imagen de factura ── */}
          <YStack gap="$2" marginBottom="$5">
            <SectionHeader number={4} title="Imagen de factura" state={section4State} />
            <Controller
              control={control}
              name="imageUri"
              rules={selectedCategory?.IsImageRequired ? { required: 'La imagen de la factura es requerida' } : {}}
              render={({ field }) => (
                <ImageUploader
                  onChangeWithBase64={(uri, base64) => {
                    setValue('imageUri', uri ?? '')
                    setValue('imageBase64', base64 ?? '')
                    field.onChange(uri ?? '')
                  }}
                />
              )}
            />
            {errors.imageUri && <Text fontSize={11} color="red">* {errors.imageUri.message}</Text>}
          </YStack>

          {/* ── Botones ── */}
          <XStack gap="$3" marginTop="$2">
            <Button
              flex={1}
              height={48}
              borderRadius={12}
              backgroundColor="$backgroundElevated"
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
              <Text color="white" fontWeight="700">Enviar gasto</Text>
            </Button>
          </XStack>
        </ScrollView>
      </YStack>
    </KeyboardAvoidingView>
  )
}
