import React, { useCallback, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { FlatList, Pressable, ScrollView } from 'react-native'
import { YStack, XStack, Text, Card, View, Button, useTheme } from 'tamagui'
import {
  Utensils, Fuel, BedDouble, Receipt, RefreshCw, CheckCircle2, XCircle,
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
import { Company, ExpenseStatus, IExpenseType, IGastoViaje } from '../../api/modules/GastosViaje/gastosViaje.types'

// TODO: derive from user context
const COMPANY: Company = 'IMHN'

const STATUS_OPTIONS = [
  { label: 'Todos', value: 'Todos' },
  { label: 'Sincronizado', value: 'Sincronizado' },
  { label: 'Pendiente', value: 'Pendiente' },
  { label: 'Rechazado', value: 'Rechazado' },
]


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

export default function HistorialGastosScreen({ navigation }: any) {
  const theme = useTheme()
  const { user } = useAuth()
  const loader = useLoader()
  const { showToast } = useShowToast()
  const [data, setData] = useState<IGastoViaje[]>([])
  const [filtered, setFiltered] = useState<IGastoViaje[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<AppError | null>(null)
  const [statusFilter, setStatusFilter] = useState('Todos')
  const [typeFilter, setTypeFilter] = useState('Todos')
  const [dateFrom, setDateFrom] = useState<string | null>(dayjs().subtract(14, 'day').format('YYYY-MM-DD'))
  const [dateTo, setDateTo] = useState<string | null>(dayjs().format('YYYY-MM-DD'))
  const [expenseTypes, setExpenseTypes] = useState<IExpenseType[]>([])
  const [syncing, setSyncing] = useState(false)
  const { openDrawer } = useRightDrawer()

  usePageHeader({
      center: (<Text fontSize={16} fontWeight="700" color="$text" > Historial de Gastos</Text>),
      right: <CountryFlag countryCode="HN" width={28} height={20} />,
    })

  const pendingCount = data.filter(g => g.Status === 'Pendiente').length

  const loadData = useCallback(async () => {
    try {
      loader.show()
      setLoading(true)
      setError(null)
      const [histRes, typesRes] = await Promise.all([
        gastosViajeService.getHistory(user?.Code ?? '', COMPANY),
        gastosViajeService.getExpenseTypes(COMPANY),
      ])
      if (histRes.Success) { setData(histRes.Data); setFiltered(histRes.Data) }
      if (typesRes.Success) setExpenseTypes(typesRes.Data)
    } catch (err) {
      setError(handleError(err))
    } finally {
      setLoading(false)
      loader.hide()
    }
  }, [user?.Code])

  useFocusEffect(useCallback(() => { loadData() }, [loadData]))

  const handleSync = async () => {
    try {
      setSyncing(true)
      const res = await gastosViajeService.syncGastos(user?.Code ?? '', COMPANY)
      if (res.Success) {
        setData(res.Data)
        showToast('success', 'Sincronización', 'Gastos actualizados correctamente', 3000, 'top')
      }
    } catch {
      showToast('error', 'Error', 'No se pudo sincronizar', 4000, 'top')
    } finally {
      setSyncing(false)
    }
  }

  const baseFiltered = React.useMemo(() => {
    let result = data
    if (statusFilter !== 'Todos') result = result.filter(g => g.Status === statusFilter)
    if (typeFilter !== 'Todos') result = result.filter(g => g.ExpenseTypeName === typeFilter)
    if (dateFrom) result = result.filter(g => g.InvoiceDate >= dateFrom)
    if (dateTo)   result = result.filter(g => g.InvoiceDate <= dateTo)
    return result
  }, [data, statusFilter, typeFilter, dateFrom, dateTo])

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
              <RefreshCw size={18} color={theme.warning?.val as string} />
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
              searchKeys={['ProviderName', 'InvoiceNumber', 'CategoryName']}
              onResults={setFiltered}
              placeholder="Buscar por proveedor o factura"
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

function GastoCard({ item, onPress }: { item: IGastoViaje; onPress: () => void }) {
  const theme = useTheme()

  const STATUS_CONFIG: Record<ExpenseStatus, { label: string; bg: string; color: string; Icon: any }> = {
    Sincronizado: { label: 'Sincronizado', bg: `${theme.success?.val}1f`, color: theme.success?.val as string, Icon: CheckCircle2 },
    Pendiente:    { label: 'Pendiente',    bg: `${theme.warning?.val}1f`, color: theme.warning?.val as string, Icon: RefreshCw },
    Rechazado:    { label: 'Rechazado',    bg: `${theme.error?.val}1f`,   color: theme.error?.val as string,   Icon: XCircle },
  }

  const status = STATUS_CONFIG[item.Status]
  const StatusIcon = status.Icon
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
                {formatCurrency(item.Total, item.CurrencyCode)}
              </Text>
            </XStack>

            <Text fontSize={12} color="$textMuted" numberOfLines={1}>{item.InvoiceNumber ?? item.ProviderName}</Text>

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
                {item.HasImage && <ImageIcon size={12} color="#999" />}
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

function FiltrosPanel({
  initialStatus, onStatusChange,
  initialType, onTypeChange,
  expenseTypes,
}: {
  initialStatus: string
  onStatusChange: (v: string) => void
  initialType: string
  onTypeChange: (v: string) => void
  expenseTypes: IExpenseType[]
}) {
  const [status, setStatus] = useState(initialStatus)
  const [type, setType] = useState(initialType)

  const typeOptions = [
    { label: 'Todos', value: 'Todos' },
    ...expenseTypes.map(t => ({ label: t.Name, value: t.Name })),
  ]

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
          label="Tipo de gasto"
          value={type}
          onValueChange={v => setType(String(v))}
          options={typeOptions}
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
