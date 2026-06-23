import React, { useCallback, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { FlatList, Pressable } from 'react-native'
import { YStack, XStack, Text, Card, View, useTheme } from 'tamagui'
import {
  Utensils, Fuel, BedDouble, Receipt, ChevronRight, Image as ImageIcon,
} from 'lucide-react-native'
import dayjs from 'dayjs'

import { usePageHeader } from '../../hooks/usePageHeader'
import { useLoader } from '../../providers/LoaderProvider'
import { handleError, AppError } from '../../utils/errorHandler'
import ErrorState from '../AdmSys/ErrorState'
import EmptyState from '../AdmSys/EmptyState'
import SkeletonList from '../../components/Skeletons/SkeletonList'
import SearchInput from '../../components/commons/SearchInput'
import AppDatePicker from '../../components/commons/AppDatePicker'
import CountryFlag from '../../components/commons/CountryFlag'
import { gastosViajeService } from '../../api/modules/GastosViaje/gastosViaje.service'
import { Company, IGastoViaje } from '../../api/modules/GastosViaje/gastosViaje.types'

const COMPANY: Company = 'IMHN'

const TYPE_ICONS: Record<string, any> = {
  Alimentación: Utensils,
  Combustible:  Fuel,
  Hospedaje:    BedDouble,
  Otros:        Receipt,
}

const formatCurrency = (amount: number, code = 'HNL') => {
  const prefix = code === 'USD' ? '$' : code === 'GTQ' ? 'Q' : 'Lps.'
  return `${prefix} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const formatDate = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export default function AprobacionGastosScreen({ navigation }: any) {
  const loader = useLoader()
  const [data, setData] = useState<IGastoViaje[]>([])
  const [filtered, setFiltered] = useState<IGastoViaje[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<AppError | null>(null)
  const [dateFrom, setDateFrom] = useState<string | null>(dayjs().subtract(14, 'day').format('YYYY-MM-DD'))
  const [dateTo, setDateTo]     = useState<string | null>(dayjs().format('YYYY-MM-DD'))

  usePageHeader({
    center: <Text fontSize={16} fontWeight="700" color="$text">Aprobación de Gastos</Text>,
    right: <CountryFlag countryCode="HN" width={28} height={20} />,
  })

  const loadData = useCallback(async () => {
    try {
      loader.show()
      setLoading(true)
      setError(null)
      const res = await gastosViajeService.getPendingApprovals(COMPANY)
      if (res.Success) {
        setData(res.Data)
        setFiltered(res.Data)
      }
    } catch (err) {
      setError(handleError(err))
    } finally {
      setLoading(false)
      loader.hide()
    }
  }, [])

  useFocusEffect(useCallback(() => { loadData() }, [loadData]))

  const baseFiltered = React.useMemo(() => {
    let result = data
    if (dateFrom) result = result.filter(g => g.InvoiceDate >= dateFrom)
    if (dateTo)   result = result.filter(g => g.InvoiceDate <= dateTo)
    return result
  }, [data, dateFrom, dateTo])

  if (loading) return <SkeletonList />
  if (error) return <ErrorState title={error.title} message={error.message} onRetry={loadData} />

  return (
    <View flex={1} backgroundColor="$backgroundPage">
      <YStack paddingHorizontal="$4" paddingTop="$3" paddingBottom={0} gap="$1">
        <AppDatePicker
          mode="range"
          label="Rango de fechas"
          startDate={dateFrom}
          endDate={dateTo}
          onRangeChange={(s, e) => { setDateFrom(s); setDateTo(e) }}
          direction="past"
        />
        <SearchInput
          data={baseFiltered}
          searchKeys={['ProviderName', 'InvoiceNumber', 'UserName', 'UserCode', 'ExpenseTypeName']}
          onResults={setFiltered}
          placeholder="Buscar por proveedor, empleado o factura"
        />
      </YStack>

      {filtered.length === 0 ? (
        <EmptyState
          title="Sin solicitudes"
          message="No hay gastos pendientes de aprobación"
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => String(item.Id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40, gap: 10 }}
          renderItem={({ item }) => (
            <ApprovalCard
              item={item}
              onPress={() => navigation.navigate('detalleGasto', { gasto: item, mode: 'approval' })}
            />
          )}
        />
      )}
    </View>
  )
}

function ApprovalCard({ item, onPress }: { item: IGastoViaje; onPress: () => void }) {
  const theme = useTheme()
  const TypeIcon = TYPE_ICONS[item.ExpenseTypeName] ?? Receipt

  return (
    <Pressable onPress={onPress}>
      <Card
        backgroundColor="$backgroundElevated"
        borderRadius={14}
        padding="$3"
        borderWidth={1}
        borderColor="$border"
      >
        <XStack alignItems="center" gap="$3">
          <View
            width={44} height={44} borderRadius={12}
            backgroundColor={`${theme.success?.val}1f`}
            justifyContent="center" alignItems="center"
          >
            <TypeIcon size={22} color={theme.success?.val as string} />
          </View>

          <YStack flex={1} gap="$1">
            <XStack justifyContent="space-between" alignItems="flex-start">
              <Text fontSize={15} fontWeight="700" color="$text">{item.ExpenseTypeName}</Text>
              <Text fontSize={15} fontWeight="700" color="$text">
                {formatCurrency(item.Total, item.CurrencyCode)}
              </Text>
            </XStack>

            <Text fontSize={12} color="$textMuted" numberOfLines={1}>
              {item.CategoryName} · {item.ProviderName}
            </Text>

            <XStack justifyContent="space-between" alignItems="center" marginTop="$1">
              <XStack
                paddingHorizontal={8} paddingVertical={3} borderRadius={20}
                backgroundColor="$backgroundSurface" alignItems="center" gap="$1"
              >
                <Text fontSize={11} fontWeight="600" color="$textMuted">{item.UserCode}</Text>
                {item.UserName && (
                  <Text fontSize={11} color="$textMuted">· {item.UserName}</Text>
                )}
              </XStack>

              <XStack alignItems="center" gap="$1">
                {item.HasImage && <ImageIcon size={12} color={theme.textMuted?.val as string} />}
                <Text fontSize={12} color="$textMuted">{formatDate(item.InvoiceDate)}</Text>
              </XStack>
            </XStack>
          </YStack>

          <ChevronRight size={16} color={theme.textMuted?.val as string} />
        </XStack>
      </Card>
    </Pressable>
  )
}
