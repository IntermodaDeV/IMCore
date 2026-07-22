import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { Animated, FlatList, Pressable, RefreshControl, ScrollView } from 'react-native'
import { YStack, XStack, Text, Card, View, Button, useTheme } from 'tamagui'
import {
  RefreshCw, CheckCircle2, XCircle,
  ChevronRight, Plus, Image as ImageIcon, SlidersHorizontal,
} from 'lucide-react-native'

import { useAuth } from '../../context/AuthContext'
import { usePageHeader } from '../../hooks/usePageHeader'
import { useLoader } from '../../providers/LoaderProvider'
import { useShowToast } from '../../utils/useShowToast'
import { handleError, AppError } from '../../utils/errorHandler'
import ErrorState from '../AdmSys/ErrorState'
import EmptyState from '../AdmSys/EmptyState'
import SkeletonList from '../../components/Skeletons/SkeletonList'
import SearchInput from '../../components/commons/SearchInput'
import AppDatePicker from '../../components/commons/AppDatePicker'
import CountryFlag from '../../components/commons/CountryFlag'
import { useRightDrawer } from '../../providers/RightDrawerProvider'
import AppSelect from '../../components/commons/AppSelect'
import dayjs from 'dayjs'
import { gastosViajeService } from '../../api/modules/GastosViaje/gastosViaje.service'
import { IExpenseType, IGastoHistorialDetail } from '../../api/modules/GastosViaje/gastosViaje.types'
import { formatCurrency, getIconFromFa } from './GastosViaje.utils'

const STATUS_OPTIONS = [
  { label: 'Todos',     value: 'Todos' },
  { label: 'Aprobado',  value: 'Aprobado' },
  { label: 'Pendiente', value: 'Pendiente' },
  { label: 'PendienteAX', value: 'PendienteAX' },
  { label: 'Rechazado', value: 'Rechazado' },
]



export default function HistorialGastosScreen({ navigation }: any) {
  const theme = useTheme()
  const { user, defaultCompany } = useAuth()
  const loader = useLoader()
  const { showToast } = useShowToast()
  const [data, setData] = useState<IGastoHistorialDetail[]>([])
  const [filtered, setFiltered] = useState<IGastoHistorialDetail[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<AppError | null>(null)
  const [statusFilter, setStatusFilter] = useState('Todos')
  const [typeFilter, setTypeFilter] = useState(0)
  const [dateFrom, setDateFrom] = useState<string | null>(dayjs().subtract(14, 'day').format('YYYY-MM-DD'))
  const [dateTo, setDateTo] = useState<string | null>(dayjs().format('YYYY-MM-DD'))
  const [expenseTypes, setExpenseTypes] = useState<IExpenseType[]>([])
  const [syncing, setSyncing] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const spinAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (syncing) {
      Animated.loop(
        Animated.timing(spinAnim, { toValue: 1, duration: 800, useNativeDriver: true })
      ).start()
    } else {
      spinAnim.stopAnimation()
      spinAnim.setValue(0)
    }
  }, [syncing])

  const spin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })
  const { openDrawer } = useRightDrawer()

  usePageHeader({
      center: (<Text fontSize={16} fontWeight="700" color="$text" > Historial de Gastos</Text>),
      right: <CountryFlag countryCode={defaultCompany?.CodeIcon ?? ''} width={28} height={20} />,
    })

  const [pendingCount, setpendingCount] = useState(0)

  const loadData = useCallback(async (_typeFilter?: number, silent = false) => {
    try {
      if (silent) { setRefreshing(true) } else { loader.show(); setLoading(true) }
      setError(null)
      
      const from = dateFrom ?? dayjs().subtract(14, 'day').format('YYYY-MM-DD');
      const to   = dateTo   ?? dayjs().format('YYYY-MM-DD');
      
      const [histRes, typesRes] = await Promise.all([
        gastosViajeService.getHistory(user?.Payweb ?? '', defaultCompany?.Code ?? '', from, to, _typeFilter ?? typeFilter),
        gastosViajeService.getExpenseTypes(defaultCompany?.Code ?? ''),
      ])
      
      setpendingCount(histRes.Data?.PendingAmount ?? 0);

      if (histRes.Success) { setData(histRes.Data.Details ?? []); setFiltered(histRes.Data.Details ?? []) }
      if (typesRes.Success) setExpenseTypes(typesRes.Data)
    } catch (err) {
      setError(handleError(err))
    } finally {
      setLoading(false)
      setRefreshing(false)
      loader.hide()
    }
  }, [user?.Code, dateFrom, dateTo])

  useFocusEffect(useCallback(() => { loadData() }, [loadData]))

  useEffect(() => { loadData() }, [dateFrom, dateTo])

  const handleSync = async () => {
    try {
      setSyncing(true)
      const res = await gastosViajeService.getPendingApprovals( defaultCompany?.Code ?? '', user?.Payweb ?? '', user?.Code ?? '')
      if (res.Success) {
        loadData(typeFilter);
        showToast('success', 'Sincronización', res.Data ?? 'Gastos actualizados correctamente', 3000, 'top')
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
          'info',
          'Informacion',
          responseData?.Message ?? 'Ocurrió un error inesperado',
          10000,
          'top'
        );
    } finally {
      setSyncing(false)
    }
  }

  const baseFiltered = React.useMemo(() => {
    let result = data
    if (statusFilter !== 'Todos') result = result.filter(g => g.StatusName === statusFilter)
    return result
  }, [data, statusFilter])

  useEffect(()=>{
    loadData(typeFilter);
  },[typeFilter])


  if (loading) return <SkeletonList />
  if (error) return <ErrorState title={error.title} message={error.message} onRetry={loadData} />

  return (
    <View flex={1} backgroundColor="$backgroundPage">
      <YStack paddingHorizontal="$4" paddingTop="$3" paddingBottom={0} gap="$1">
        {/* Banner de sincronización — solo visible cuando hay pendientes */}
        {pendingCount > 0 && (
          <Pressable onPress={handleSync} disabled={syncing}>
            <XStack
              backgroundColor={`${theme.warning?.val}18`}
              borderRadius={12}
              paddingHorizontal="$3"
              paddingVertical={10}
              alignItems="center"
              gap="$3"
              borderWidth={1}
              borderColor={`${theme.warning?.val}40`}
            >
              <Animated.View style={{ transform: [{ rotate: spin }] }}>
                <RefreshCw size={18} color={theme.warning?.val as string} />
              </Animated.View>
              <YStack flex={1} gap={2}>
                <Text fontSize={13} fontWeight="700" color="$warning">
                  {pendingCount} {pendingCount === 1 ? 'gasto pendiente' : 'gastos pendientes'}
                </Text>
                <Text fontSize={11} color="$warning" opacity={0.75}>
                  {syncing ? 'Sincronizando...' : 'Toca para sincronizar'}
                </Text>
              </YStack>
              <ChevronRight size={16} color={theme.warning?.val as string} />
            </XStack>
          </Pressable>
        )}

        {/* Filtro: fecha + botón drawer */}
        <XStack gap="$2" alignItems="center">
          <View flex={1}>
            <AppDatePicker
              mode="range"
              label="Rango de fechas"
              startDate={dateFrom}
              endDate={dateTo}
              onRangeChange={(s, e) => { setDateFrom(s); setDateTo(e) }}
              direction="past"
            />
          </View>
          <Pressable
            onPress={() => openDrawer(
              <FiltrosPanel
                initialStatus={statusFilter}
                onStatusChange={setStatusFilter}
                initialType={typeFilter}
                onTypeChange={setTypeFilter}
                expenseTypes={expenseTypes}
              />,
              { title: 'Filtros' }
            )}
            style={{ padding: 10, borderRadius: 8 }}
          >
            <SlidersHorizontal size={22} color={theme.textMuted?.val as string} />
          </Pressable>
        </XStack>

        <XStack gap="$2" alignItems="center">
          <View flex={1}>
            <SearchInput
              data={baseFiltered}
              searchKeys={['ExpenseTypeName', 'InvoiceId', 'ExpenseCategoryName']}
              onResults={setFiltered}
              placeholder="Buscar por tipo de gasto o factura"
            />
          </View>
        </XStack>

      </YStack>

      {filtered.length === 0 ? (
        <EmptyState
          title="Sin gastos"
          message="Aún no tienes gastos registrados"
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => String(item.Id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100, gap: 10 }}
          renderItem={({ item }) => <GastoCard item={item} onPress={() => navigation.navigate('detalleGasto', { gasto: item })} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { if (!syncing) loadData(typeFilter, true) }} />}
        />
      )}

      {/* FAB */}
      <View position="absolute" bottom={28} right={20}>
        <Button
          width={56}
          height={56}
          borderRadius={999}
          backgroundColor="$primary"
          justifyContent="center"
          alignItems="center"
          pressStyle={{ opacity: 0.8, scale: 0.95 }}
          onPress={() => navigation.navigate('nuevoGasto')}
          elevation={6}
          shadowColor="#000"
          shadowOpacity={0.2}
          shadowRadius={8}
          shadowOffset={{ width: 0, height: 4 }}
        >
          <Plus size={26} color="white" />
        </Button>
      </View>
    </View>
  )
}

function GastoCard({ item, onPress }: { item: IGastoHistorialDetail; onPress: () => void }) {
  const theme = useTheme()

  
   const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; Icon: any }> = {
    Aprobado:  { label: 'Aprobado',  bg: `${theme.success?.val}1f`, color: theme.success?.val as string, Icon: CheckCircle2 },
    Pendiente: { label: 'Pendiente', bg: `${theme.gray?.val}1f`, color: theme.gray?.val as string, Icon: RefreshCw },
    PendienteAX: { label: 'Pendiente AX', bg: `${theme.warning?.val}1f`, color: theme.warning?.val as string, Icon: RefreshCw },
    Rechazado: { label: 'Rechazado', bg: `${theme.error?.val}1f`,   color: theme.error?.val as string,   Icon: XCircle },
  }
  

  const status = STATUS_CONFIG[item.StatusName] ?? STATUS_CONFIG['Pendiente']
  const StatusIcon = status.Icon
  const TypeIcon = getIconFromFa(item.Icon)

  return (
    <Pressable onPress={onPress}>
      <Card
        backgroundColor="$backgroundElevated"
        borderRadius={14}
        padding="$3"
        borderWidth={1}
        borderColor="$border"
      >
        <XStack   gap="$3">
          
          {/* Icono de categoría */}
          <View
            width={44}
            height={44}
            borderRadius={12}
            backgroundColor={`${theme.success?.val}1f`}
            justifyContent="center"
            alignItems="center"
          >
            <TypeIcon size={22} color={theme.success?.val as string} />
          </View>

          {/* Info */}
          <YStack flex={1} gap="$1">
            <XStack justifyContent="space-between" alignItems="flex-start">
              <Text fontSize={15} fontWeight="700" color="$text">{item.ExpenseTypeName}</Text>
              <Text fontSize={15} fontWeight="700" color="$text">
                {item.Currency + ' ' +formatCurrency(item.InvoiceAmount)}
              </Text>
            </XStack>

            <Text fontSize={12} color="$textMuted" numberOfLines={1}>
              {item.ExpenseCategoryName}
            </Text>

            <Text fontSize={12} color="$textMuted" numberOfLines={1} marginBottom="$2" >
              {item.InvoiceId ? `${item.InvoiceId}` : ''}
            </Text>

            <XStack justifyContent="space-between" alignItems="center" marginTop="$1">
              <XStack
                paddingHorizontal={8}
                paddingVertical={3}
                borderRadius={20}
                alignItems="center"
                gap="$1"
                style={{ backgroundColor: status.bg }}
              >
                <StatusIcon size={11} color={status.color} />
                <Text fontSize={11} fontWeight="600" style={{ color: status.color }}>{status.label}</Text>
              </XStack>

              <XStack alignItems="center" gap="$1">
                {!!item.ImagePath && <ImageIcon size={12} color="#999" />}
                <Text fontSize={12} color="$textMuted">{dayjs(item.InvoiceDate).format('DD/MM/YYYY')}</Text>
              </XStack>
            </XStack>
          </YStack>

        </XStack>
      </Card>
    </Pressable>
  )
}

function FiltrosPanel({
  initialStatus, onStatusChange,
  initialType, onTypeChange,
  expenseTypes,
}: {
  initialStatus: string
  onStatusChange: (v: string) => void
  initialType: number
  onTypeChange: (v: number) => void
  expenseTypes: IExpenseType[]
}) {
  const [status, setStatus] = useState(initialStatus)
  const [type, setType] = useState(initialType)

  const { closeDrawer } = useRightDrawer()

  const apply = () => {
    onStatusChange(status)
    onTypeChange(type)
    closeDrawer()
  }

  return (
    <YStack flex={1}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} showsVerticalScrollIndicator={false}>
        <AppSelect
          label="Estado"
          value={status}
          onValueChange={v => setStatus(String(v))}
          options={STATUS_OPTIONS}
        />
        <AppSelect
          label="Selecciona el tipo de gasto"
          value={type}
          onValueChange={v => setType(Number(v))}
          options={expenseTypes.map(t => ({ label: t.Name, value: String(t.Id) }))}
        />
      </ScrollView>
      <View paddingHorizontal="$4" paddingBottom="$6" paddingTop="$2" borderTopWidth={1} borderTopColor="$border">
        <Button
          height={48}
          borderRadius={12}
          backgroundColor="$primary"
          pressStyle={{ opacity: 0.8 }}
          onPress={apply}
        >
          <Text color="white" fontWeight="700">Aplicar filtros</Text>
        </Button>
      </View>
    </YStack>
  )
}
