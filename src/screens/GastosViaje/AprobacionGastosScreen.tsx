import React, { useCallback, useEffect, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { FlatList, Pressable, RefreshControl } from 'react-native'
import { YStack, XStack, Text, Card, View, useTheme } from 'tamagui'
import { Badge, CheckCircle2, ChevronRight, Image as ImageIcon, RefreshCw, XCircle } from 'lucide-react-native'
import dayjs from 'dayjs'

import { useAuth } from '../../context/AuthContext'
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
import { IGastoHistorialDetail } from '../../api/modules/GastosViaje/gastosViaje.types'
import { formatCurrency, getIconFromFa } from './GastosViaje.utils'

export default function AprobacionGastosScreen({ navigation }: any) {
  const { user, defaultCompany } = useAuth()
  const loader = useLoader()
  const [data, setData] = useState<IGastoHistorialDetail[]>([])
  const [filtered, setFiltered] = useState<IGastoHistorialDetail[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<AppError | null>(null)
  const [dateFrom, setDateFrom] = useState<string | null>(dayjs().subtract(14, 'day').format('YYYY-MM-DD'))
  const [dateTo, setDateTo]     = useState<string | null>(dayjs().format('YYYY-MM-DD'))

  usePageHeader({
    center: <Text fontSize={16} fontWeight="700" color="$text">Aprobación de Gastos</Text>,
    right: <CountryFlag countryCode={defaultCompany?.CodeIcon ?? 'HN'} width={28} height={20} />,
  })

  const loadData = useCallback(async (silent = false) => {
    try {
      if (silent) { setRefreshing(true) } else { loader.show(); setLoading(true) }
      setError(null)
      const from = dateFrom ?? dayjs().subtract(14, 'day').format('YYYY-MM-DD')
      const to   = dateTo   ?? dayjs().format('YYYY-MM-DD')
      const res = await gastosViajeService.getHistoryRevision(
        defaultCompany?.Code ?? '',
        from,
        to,
        0,
      )
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
  }, [user?.Code, defaultCompany?.Code, dateFrom, dateTo])

  useFocusEffect(useCallback(() => { loadData() }, [loadData]))
  useEffect(() => { loadData() }, [dateFrom, dateTo])

  if (loading) return <SkeletonList />
  if (error) return <ErrorState title={error.title} message={error.message} onRetry={loadData} />

  return (
    <View flex={1} backgroundColor="$backgroundPage">
      <YStack paddingHorizontal="$4" paddingTop="$3" paddingBottom={0} gap="$1">
        <SearchInput
          data={data}
          searchKeys={['InvoiceId', 'PersonalCode', 'Name', 'ExpenseTypeName']}
          onResults={setFiltered}
          placeholder="Buscar por factura, empleado o tipo de gasto"
        />
      </YStack>
      
      {(filtered?.length ?? 0) === 0 ? (
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

function ApprovalCard({ item, onPress }: { item: IGastoHistorialDetail; onPress: () => void }) {
  const theme = useTheme()
  const TypeIcon = getIconFromFa(item.Icon)
  const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; Icon: any }> = {
    Aprobado:  { label: 'Aprobado',  bg: `${theme.success?.val}1f`, color: theme.success?.val as string, Icon: CheckCircle2 },
    Pendiente: { label: 'Pendiente', bg: `${theme.gray?.val}1f`, color: theme.warning?.val as string, Icon: RefreshCw },
    PendienteAX: { label: 'PendienteAX', bg: `${theme.warning?.val}1f`, color: theme.warning?.val as string, Icon: RefreshCw },
    Rechazado: { label: 'Rechazado', bg: `${theme.error?.val}1f`,   color: theme.error?.val as string,   Icon: XCircle },
  }
  const status = STATUS_CONFIG[item.StatusName] ?? STATUS_CONFIG['Pendiente']

  return (
    <Pressable onPress={onPress}>
      <Card
        backgroundColor="$backgroundElevated"
        borderRadius={14}
        padding="$3"
        borderWidth={1}
        borderColor="$border"
      >
        <XStack gap="$3">
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
                {item.Currency + ' ' + formatCurrency(item.InvoiceAmount)}
              </Text>
            </XStack>

            <Text fontSize={12} marginBottom="$2" numberOfLines={1}>
              {item.InvoiceId}
            </Text>

            <XStack
              paddingHorizontal={8}
              paddingVertical={3}
              borderRadius={20}
              alignItems="center"
              alignSelf="flex-start"
              gap="$1"
              style={{ backgroundColor: status.bg }}
            >
              <Text fontSize={11} fontWeight="600" style={{ color: status.color }} >{item.StatusName}</Text>
            </XStack>

            <Text fontSize={12} color="$textMuted" numberOfLines={1}>
              {item.ExpenseCategoryName} · {item.VendAccount}
            </Text>
            
            <XStack
              paddingVertical={3} borderRadius={20}
              alignItems="center" gap="$1" width='fitContent'
            >
              <Text fontSize={11} fontWeight="600" color="$textMuted">{item.PersonalCode}</Text>
              {!!item.Name && (
                <Text fontSize={11} color="$textMuted">· {item.Name}</Text>
              )}
            </XStack>

            <XStack alignItems="center" gap="$1">
              {!!item.ImagePath && <ImageIcon size={12} color={theme.textMuted?.val as string} />}
              <Text fontSize={12} color="$textMuted">{dayjs(item.InvoiceDate).format('DD/MM/YYYY')}</Text>
            </XStack>

          </YStack>

        </XStack>
      </Card>
    </Pressable>
  )
}
