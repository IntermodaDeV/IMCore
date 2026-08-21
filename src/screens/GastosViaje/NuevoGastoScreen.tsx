import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native'
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
  IExpenseType, IExpenseCategory,
  IAlimentacionSubtype, IFuelType,
  IGiraVendorResponse
} from '../../api/modules/GastosViaje/gastosViaje.types'

type FormData = {
  imageUri: string
  imageBase64: string
  expenseTypeId: number
  ExpenseCategoryId: number
  MealId: number
  FuelTypeId: number
  useCustomProvider: string
  providerName: string
  VendAccount: string
  vatnnum: string
  // IMHN
  InvoiceId: string
  Description: string
  GravadoAmount: string
  ExemptAmount: string
  InvoiceDate: string
  // IMGT / IMCR
  SeriesNum: string
  InvoiceAmount: string
  gallons: string
}


const toNum = (s: string) => parseFloat(s.replace(/,/g, '') || '0') || 0

const formatAmount = (text: string) => {
  const cleaned = text.replace(/[^0-9.]/g, '')
  const parts = cleaned.split('.')
  if (parts.length > 2) return parts[0] + '.' + parts.slice(1).join('')
  if (parts[1]?.length > 2) return parts[0] + '.' + parts[1].slice(0, 2)
  return cleaned
}

const formatInvoiceIMHN = (text: string) => {
  const digits = text.replace(/\D/g, '').slice(0, 16)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  if (digits.length <= 8) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`
}

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
  const { user, defaultCompany } = useAuth()
  const loader = useLoader()
  const { showToast } = useShowToast()
  const navigation = useNavigation<any>()
  const [expenseTypes, setExpenseTypes]               = useState<IExpenseType[]>([])
  const [categories, setCategories]                   = useState<IExpenseCategory[]>([])
  const [alimentacionSubtypes, setAlimentacionSubtypes] = useState<IAlimentacionSubtype[]>([])
  const [fuelTypes, setFuelTypes]                     = useState<IFuelType[]>([])
  const [taxRate, setTaxRate]                         = useState(0)
  const today     = dayjs()
  const daysToMon = today.day() === 0 ? 6 : today.day() - 1
  const weekStart = today.subtract(daysToMon, 'day').format('YYYY-MM-DD')
  const weekEnd   = today.subtract(daysToMon, 'day').add(6, 'day').format('YYYY-MM-DD')
  const [allProviders, setAllProviders]               = useState<IGiraVendorResponse[]>([])
  const [selectedProviderId, setSelectedProviderId]   = useState('')
  const [providerCurrency, setProviderCurrency]       = useState('')
  const [computedTotal, setComputedTotal]             = useState(0)
  const skipProviderSearchRef                         = useRef(false)
  const [isSearchingProviders, setIsSearchingProviders] = useState(false)
  const [isSubmitting, setIsSubmitting]               = useState(false)


  const ArrowLeftStyled = styled(ArrowLeft, { color: '$text' });
  const SearchStyled = styled(Search, { color: '$textMuted', height: 12, marginEnd: 6});

  const { control, handleSubmit, watch, getValues, setValue, reset, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      imageUri: '', imageBase64: '', expenseTypeId: 0, ExpenseCategoryId: 0,
      MealId: 0, FuelTypeId: 0, useCustomProvider: 'false',
      providerName: '', vatnnum: '', VendAccount: '',
      InvoiceId: '', Description: '', GravadoAmount: '', ExemptAmount: '',
      InvoiceDate: dayjs().format('YYYY-MM-DD'), SeriesNum: '',
      InvoiceAmount: '', gallons: '',
    },
  })

  const watchedTypeId                = watch('expenseTypeId')
  const watchedCatId                 = watch('ExpenseCategoryId')
  const watchedGraved                = watch('GravadoAmount')
  const watchedExempt                = watch('ExemptAmount')
  const watchedCustom                = watch('useCustomProvider')
  const watchedAlimentacionSubtypeId = watch('MealId')
  const watchedFuelTypeId            = watch('FuelTypeId')
  const watchedProviderName          = watch('providerName')
  const watchedVatnum                = watch('vatnnum')
  const watchedImageUri              = watch('imageUri')

  const selectedCategory = categories.find(c => c.Id === watchedCatId)
  const selectedTypeName = expenseTypes.find(t => t.Id === watchedTypeId)?.Name ?? ''
  const isAlimentacion   = selectedCategory?.Name?.toLowerCase().includes('alimentaci') ?? false
  const isCombustible    = selectedCategory?.Name?.toLowerCase().includes('combustible') && defaultCompany?.Code === 'IMGT'
  const isHospedaje      = selectedCategory?.Name?.toLowerCase() === 'hospedaje'
  const isIMHN           = defaultCompany?.Code === 'IMHN'
  const isIMGT           = defaultCompany?.Code === 'IMGT'
  const isIMCR           = defaultCompany?.Code === 'IMCR'
  const hasPredefined    = !!selectedCategory?.VendAccount

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
    center: (
      <TouchableOpacity onPress={() => console.log('Nuevo Gasto de Viaje form:', getValues())} activeOpacity={0.7}>
        <Text fontSize={16} fontWeight="700" color="$text"> Nuevo Gasto de Viaje </Text>
      </TouchableOpacity>
    ),
    left: (
      <View onPress={() => navigation.goBack()}>
        <ArrowLeftStyled  />
      </View>
    ),
    right: (<CountryFlag countryCode={defaultCompany?.CodeIcon ?? 'HN'} width={28} height={20} />)
  })

  useFocusEffect(useCallback(() => {
    const load = async () => {
      try {
        
        const typesRes = await gastosViajeService.getExpenseTypes(defaultCompany?.Code ?? '')
        if (typesRes.Success) setExpenseTypes(typesRes.Data)
        
          const taxRes = await gastosViajeService.getTaxConfig(defaultCompany?.Code ?? '')
        if (taxRes.Success) setTaxRate(taxRes.Data.Rate)

      } catch(error:any) {
        let responseData;

        try {
          responseData =
            typeof error.response === 'string'
              ? JSON.parse(error.response)
              : error.response?.data;
        } catch {
          responseData = null;
        }

        showToast(
          'info',
          'Informacion',
          responseData?.Message ?? 'Ocurrió un error inesperado',
          8000,
          'top'
        );
      }
    }
    load()
  }, []))

  useEffect(() => {
    if (!watchedTypeId) { setCategories([]); setValue('ExpenseCategoryId', 0); return }
    const load = async () => {
      const res = await gastosViajeService.getCategories(watchedTypeId, defaultCompany?.Code ?? '')
      if (res.Success) setCategories(res.Data)
      setValue('ExpenseCategoryId', 0)
      setValue('MealId', 0)
      setValue('FuelTypeId', 0)
    }
    load()
  }, [watchedTypeId])

  useEffect(() => {
    if (!watchedCatId) return
    setValue('MealId', 0)
    setValue('FuelTypeId', 0)
    setValue('useCustomProvider', hasPredefined ? 'false' : 'true')
    setSelectedProviderId('')
    setProviderCurrency('')

    if (hasPredefined) {
      setValue('providerName', '')
      setValue('vatnnum', '')
      setValue('VendAccount', selectedCategory?.VendAccount ?? '')
      setProviderCurrency(selectedCategory?.VendCurrency ?? '')
    } else {
      setValue('providerName', '')
      setValue('vatnnum', '')
      setValue('VendAccount', '')
      setProviderCurrency('')
    }

    if (isAlimentacion) {
      gastosViajeService.getAlimentacionSubtypes().then(r => {
        if (r.Success) setAlimentacionSubtypes(r.Data)
      })
    }
    if (isCombustible) {
      gastosViajeService.getFuelTypes(defaultCompany?.Code ?? '').then(r => {
        if (r.Success) setFuelTypes(r.Data)
      })
    }
  }, [watchedCatId])

  useEffect(() => {
    const q = watchedVatnum.trim()
    if (skipProviderSearchRef.current) { skipProviderSearchRef.current = false; return }
    if (q.length < 3) { setAllProviders([]); setIsSearchingProviders(false); return }
    const timer = setTimeout(async () => {
      try {
        setIsSearchingProviders(true)
        const res = await gastosViajeService.searchProvider(q, defaultCompany?.Code ?? '')
        if (res.Success) {
          setAllProviders(res.Data)
        }
      } catch {} finally {
        setIsSearchingProviders(false)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [watchedVatnum])

  useEffect(() => {
    if (!isIMHN) return
    const graved = toNum(watchedGraved)
    const exempt = toNum(watchedExempt)
    setComputedTotal(graved + graved * taxRate + exempt)
  }, [watchedGraved, watchedExempt, taxRate, isIMHN])

  const onSubmit = async (data: FormData) => {
    try {
      setIsSubmitting(true)
      loader.show()
      const graved = toNum(data.GravadoAmount)
      const gallons = toNum(data.gallons);
      const exempt = gallons > 0
        ? gallons
        : toNum(data.ExemptAmount);
      const total  = isIMHN ? computedTotal : toNum(data.InvoiceAmount)

      const res = await gastosViajeService.createGasto({
        id:                0,
        expenseCategoryId: data.ExpenseCategoryId,
        mealId:            data.MealId || null,
        fuelTypeId:        data.FuelTypeId || null,
        statusId:          0,
        personalCode:      user?.Payweb ?? '',
        vendAccount:       data.VendAccount,
        description:       data.Description || '',
        invoiceId:         data.InvoiceId || '',
        seriesNum:         data.SeriesNum || null,
        exemptAmount:      exempt,
        gravadoAmount:     graved,
        invoiceAmount:     total,
        invoiceDate:       data.InvoiceDate,
        imagePath:         data.imageBase64 ?? '',
        personalCodeAdmin: null,
        rejectionMotive:   null,
        journalNum:        null,
        companyCode:       defaultCompany?.Code ?? '',
        axMessage:         null,
        inUse:             true,
        taxAmount:         ((Number(taxRate )) * 100)
      }, user?.Code ?? '')
      
      if (res.Succeeded === true) {
        showToast('success', 'Gasto registrado', 'Tu gasto fue enviado correctamente', 3000, 'top')
        reset()
        navigation.goBack()
      } else {
        showToast('error', 'Error' ,'No se pudo registrar el gasto', 8000, 'top')
      }
      
    } catch(error:any) {
      let responseData;

      try {
        responseData =
          typeof error.response === 'string'
            ? JSON.parse(error.response)
            : error.response?.data;
      } catch {
        responseData = null;
      }

      showToast(
        'error',
        'Error',
        responseData?.Message ?? 'Ocurrió un error inesperado',
        8000,
        'top'
      );
    } finally {
      loader.hide()
      setIsSubmitting(false)
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
                    onValueChange={v => field.onChange(Number(v))}
                    options={expenseTypes.map(t => ({ label: t.Name, value: String(t.Id) }))}
                    error={errors.expenseTypeId?.message}
                  />
                )}
              />

              {!!watchedTypeId && (
                <Controller
                  control={control}
                  name="ExpenseCategoryId"
                  rules={{ required: 'Selecciona la categoría' }}
                  render={({ field }) => (
                    <AppSelect
                      label="Categoría"
                      value={field.value}
                      onValueChange={v => field.onChange(Number(v))}
                      options={categories.map(c => ({ label: String(c.Name), value: String(c.Id) }))}
                      error={errors.ExpenseCategoryId?.message}
                    />
                  )}
                />
              )}

              {isAlimentacion && watchedCatId && (
                <Controller
                  control={control}
                  name="MealId"
                  rules={{ validate: v => v > 0 || 'Selecciona el tipo de alimentación' }}
                  render={({ field }) => (
                    <AppSelect
                      label="Tipo de alimentación *"
                      value={field.value}
                      onValueChange={v => field.onChange(Number(v))}
                      options={alimentacionSubtypes.map(s => ({ label: s.Name, value: String(s.Id) }))}
                      error={errors.MealId?.message}
                    />
                  )}
                />
              )}

              {isCombustible && watchedCatId && (
                <Controller
                  control={control}
                  name="FuelTypeId"
                  rules={{ validate: v => v > 0 || 'Selecciona el tipo de combustible' }}
                  render={({ field }) => (
                    <AppSelect
                      label="Tipo de combustible *"
                      value={field.value}
                      onValueChange={v => field.onChange(Number(v))}
                      options={fuelTypes.map(f => ({ label: f.Name, value: String(f.Id) }))}
                      error={errors.FuelTypeId?.message}
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
                    <TouchableOpacity onPress={() => {
                      setValue('useCustomProvider', 'true')
                      setSelectedProviderId('')
                    }}>
                      <Text fontSize={13} color="$primary" fontWeight="600" marginTop="$1">
                        Cambiar
                      </Text>
                    </TouchableOpacity>
                  </Card>
                ) : (
                  <YStack gap="$2">
                    <Controller
                      control={control}
                      name="vatnnum"
                      render={({ field }) => (
                        <AppInput
                          label={defaultCompany?.Code === 'IMHN' ? 'RTN' : 'NIT'}
                          placeholder={defaultCompany?.Code === "IMHN" ?  "0801-1985-00012": "080119850001K"}
                          keyboardType="numbers-and-punctuation"
                          value={field.value}
                          onChangeText={v => field.onChange(v)}
                          suffix={isSearchingProviders
                            ? <ActivityIndicator size="small" style={{ marginEnd: 6 }} />
                            : <SearchStyled />}
                        />
                      )}
                    />

                    <AppSelect
                      label="Seleccionar proveedor"
                      value={selectedProviderId}
                      onValueChange={(v) => {
                        const id = String(v)
                        const p = allProviders.find(r => String(r.VATNUM) === id)
                        if (p) {
                          skipProviderSearchRef.current = true
                          setSelectedProviderId(id)
                          setProviderCurrency(p.CURRENCY)
                          setValue('providerName', p.NAME)
                          setValue('vatnnum', p.VATNUM)
                          setValue('VendAccount', p.ACCOUNTNUM)
                        }
                      }}
                      options={allProviders.map((r,i) => ({
                        label: `(${r.VATNUM}) ${r.NAME} `,
                        value: String(r.VATNUM),
                        key: `${r.VATNUM}-${i}`
                      }))}
                    />

                  </YStack>
                )}

                <TouchableOpacity
                  disabled={!!selectedProviderId}
                  onPress={() => navigation.navigate('solicitarProveedor')}
                >
                  <Text
                    fontSize={13}
                    color={selectedProviderId ? '$textMuted' : '$primary'}
                    fontWeight="600"
                    marginTop="$1"
                    opacity={selectedProviderId ? 0.4 : 1}
                  >
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
                    
                    <Controller
                      control={control}
                      name="InvoiceId"
                      rules={selectedCategory?.IsInvoiceRequired ? { required: 'El número de factura es requerido' } : {}}
                      render={({ field }) => (
                        <AppInput
                          label="No. de factura"
                          placeholder="000-001-01-00000000"
                          value={field.value}
                          onChangeText={v => field.onChange(formatInvoiceIMHN(v))}
                          keyboardType="numeric"
                          error={errors.InvoiceId?.message}
                        />
                      )}
                    />

                    <Controller
                      control={control}
                      name="Description"
                      rules={selectedCategory?.IsDescriptionRequired ? { required: 'La descripción es requerida', maxLength: { value: 250, message: 'Máximo 250 caracteres' } } : { maxLength: { value: 250, message: 'Máximo 250 caracteres' } }}
                      render={({ field }) => (
                        <AppInput
                          label={`Descripción${selectedCategory?.IsDescriptionRequired ? '' : ' (Opcional)'}`}
                          placeholder="Ej. Gastos de viaje semana 43"
                          value={field.value}
                          onChangeText={field.onChange}
                          multiline
                          numberOfLines={3}
                          maxLength={250}
                          error={errors.Description?.message}
                          style={{ height: 80}}
                        />
                      )}
                    />

                    <XStack gap="$3">
                      <YStack flex={1}>
                        <Controller
                          control={control}
                          name="GravadoAmount"

                          render={({ field }) => (
                            <AppInput
                              label="Importe gravado"
                              value={field.value}
                              onChangeText={v => field.onChange(formatAmount(v))}
                              keyboardType="decimal-pad"
                              prefix={<Text color="$text" >{providerCurrency}</Text>}
                              error={errors.GravadoAmount?.message}
                            />
                          )}
                        />
                      </YStack>
                      <YStack flex={1}>
                        <Controller
                          control={control}
                          name="ExemptAmount"
                          render={({ field }) => (
                            <AppInput
                              label="Importe exento"
                              value={field.value}
                              onChangeText={v => field.onChange(formatAmount(v))}
                              keyboardType="decimal-pad"
                              prefix={<Text color="$text" >{providerCurrency}</Text>}
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
                      {!isIMCR && (
                        <YStack flex={1}>
                          <Controller
                            control={control}
                            name="SeriesNum"
                            render={({ field }) => (
                              <AppInput
                                label="No. de serie"
                                value={field.value}
                                keyboardType="numbers-and-punctuation"
                                onChangeText={field.onChange}
                              />
                            )}
                          />
                        </YStack>
                      )}

                      <YStack flex={1}>
                        <Controller
                          control={control}
                          name="InvoiceId"
                          rules={{ required: 'Requerido' }}
                          render={({ field }) => (
                            <AppInput
                              label="No. de factura"
                              value={field.value}
                              keyboardType="numbers-and-punctuation"
                              onChangeText={field.onChange}
                              error={errors.InvoiceId?.message}
                            />
                          )}
                        />
                      </YStack>
                    </XStack>

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
                    
                     <Controller
                      control={control}
                      name="Description"
                      rules={selectedCategory?.IsDescriptionRequired ? { required: 'La descripción es requerida', maxLength: { value: 250, message: 'Máximo 250 caracteres' } } : { maxLength: { value: 250, message: 'Máximo 250 caracteres' } }}
                      render={({ field }) => (
                        <AppInput
                          label={`Descripción${selectedCategory?.IsDescriptionRequired ? '' : ' (Opcional)'}`}
                          placeholder="Ej. Gastos de viaje semana 43"
                          value={field.value}
                          onChangeText={field.onChange}
                          multiline
                          numberOfLines={3}
                          maxLength={250}
                          error={errors.Description?.message}
                          style={{ height: 80}}
                        />
                      )}
                    />

                    {isHospedaje && isIMGT && (
                      <Controller
                        control={control}
                        name="ExemptAmount"
                        render={({ field }) => (
                          <AppInput
                            label="Importe exento"
                            value={field.value}
                            onChangeText={v => field.onChange(formatAmount(v))}
                            keyboardType="decimal-pad"
                          />
                        )}
                      />
                    )}

                    <Controller
                      control={control}
                      name="InvoiceAmount"
                      rules={{ required: 'El total es requerido' }}
                      render={({ field }) => (
                        <AppInput
                          label="Total"
                          value={field.value}
                          onChangeText={v => field.onChange(formatAmount(v))}
                          keyboardType="decimal-pad"
                          prefix={providerCurrency ? <Text color="$text" >{providerCurrency}</Text> : <Text>-</Text>}
                          error={errors.InvoiceAmount?.message}
                        />
                      )}
                    />
                  </>
                )}

                {(isIMHN &&(
                  <XStack alignItems="center" gap="$1" paddingVertical="$1" borderWidth={1} marginBottom="$2" borderColor="$border" padding="$3" backgroundColor="$backgroundElevated" borderRadius={10}>
                    <Text fontSize={12} color="$textMuted">
                      ISV ({(taxRate * 100).toFixed(0)}%):
                    </Text>
                    <Text fontSize={12} fontWeight="700" color="$primary">
                      {( providerCurrency + ' ' + (Number(getValues('GravadoAmount') ?? 0) * (taxRate)).toFixed(2)) }
                    </Text>
                  </XStack>
                ))}


                {/* Fecha de factura — siempre */}
                <Controller
                  control={control}
                  name="InvoiceDate"
                  rules={{ required: 'La fecha es requerida' }}
                  render={({ field }) => (
                    <AppDatePicker
                      label="Fecha de factura"
                      value={field.value || null}
                      onChange={v => field.onChange(v ?? '')}
                      displayFormat="DD/MM/YYYY"
                      minDate={weekStart}
                      maxDate={weekEnd}
                      error={errors.InvoiceDate?.message}
                    />
                  )}
                />

                {/* Total IMHN — calculado */}
                {isIMHN && (
                  <Card backgroundColor="$primary" borderRadius={12} padding="$4" marginTop="$2">
                    <XStack justifyContent="space-between" alignItems="center">
                      <Text color="white" fontSize={14} fontWeight="600">Total de la factura</Text>
                      <Text color="white" fontSize={20} fontWeight="800">
                        {providerCurrency + ' '+ computedTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
              disabled={isSubmitting}
              opacity={isSubmitting ? 0.5 : 1}
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
              disabled={isSubmitting}
              opacity={isSubmitting ? 0.5 : 1}
            >
              <Text color="white" fontWeight="700">
                {isSubmitting ? 'Enviando...' : 'Enviar gasto'}
              </Text>
            </Button>
          </XStack>
        </ScrollView>
      </YStack>
    </KeyboardAvoidingView>
  )
}
