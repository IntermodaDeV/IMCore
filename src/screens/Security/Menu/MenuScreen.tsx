import React, { useEffect, useState } from 'react'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { Pencil, Plus, RotateCw, ChevronDown, ChevronRight, SquareMenu } from 'lucide-react-native'
import * as LucideIcons from 'lucide-react-native'
import { YStack, Text, ScrollView, useTheme, XStack, View, styled} from 'tamagui'
import { securityService } from '../../../api/modules/security/security.service'
import { MenuDTO } from '../../../api/modules/security/security.types'
import Page from '../../../components/commons/Page'
import { useAuth } from '../../../context/AuthContext'
import { useShowToast } from '../../../utils/useShowToast'
import SkeletonList from '../../../components/Skeletons/SkeletonList'
import { ExecutionResponse } from '../../../api/modules/response.type'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import SearchInput from '../../../components/commons/SearchInput'
import ConfirmDialog from '../../../components/commons/ConfirmDialog'
import { AppError, handleError } from '../../../utils/errorHandler'
import ErrorState from '../../AdmSys/ErrorState'
import EmptyState from '../../AdmSys/EmptyState'
import { usePageHeader } from '../../../hooks/usePageHeader'

export type RootStackParamList = {
  home: undefined;
  menu_form: { Id?: number };
};
type NavProps = NativeStackNavigationProp<RootStackParamList>;

export default function MenuScreen() {
  const navigation = useNavigation<NavProps>();
  
  const theme = useTheme();
  const RotateCwStyled = styled(RotateCw, { color: '$text' });
  const PlusStyled = styled(Plus, { color: '$text' });

  const [loading, setLoading] = useState(false)
  const [filtered, setFiltered] = useState<MenuDTO[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<MenuDTO | null>(null)
  const [error, setError] = useState<AppError | null>(null)
  const { user } = useAuth()
  const { showToast } = useShowToast()
  const [data, setData] = useState<MenuDTO[]>([])

  const getInfo = React.useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response: ExecutionResponse<MenuDTO[]> = await securityService.getMenus()
      if (response.Success) {
        setData(response.Data)
        setFiltered(response.Data)
      }
    } catch (err) {
      setError(handleError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    getInfo()
  }, [])

  useFocusEffect(
    React.useCallback(() => {
      getInfo()
    }, [getInfo])
  )

  useEffect(() => {
    setFiltered(data)
  }, [data])

  const createMenu = (Id?: number) => {
    navigation.navigate('menu_form', { Id })
  }

  const toggleStatus = async () => {
    if (!selectedItem) return

    try {
      const newStatus = selectedItem.Status_Id === 1 ? 2 : 1

      let Data: MenuDTO = {
        ...selectedItem,
        Status_Id: newStatus,
        Modified_By: user?.Code as string,
      }
      const response: ExecutionResponse<MenuDTO[]> = await securityService.changeStatusMenu([Data])
      if (response.Success) {
        setData(prev =>
          prev.map(item =>
            item.Id === selectedItem.Id
              ? {
                  ...item,
                  Status_Id: newStatus,
                  Status_Name: newStatus === 1 ? 'Activo' : 'Inactivo',
                }
              : item
          )
        )
        showToast('success', 'Éxito', response.SuccessMessage || 'Estado actualizado correctamente', 5000, 'bottom')
      }
    } finally {
      setDialogOpen(false)
    }
  }

  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const toggleExpand = (id: number) =>
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // Arma el árbol (padre → hijos) por ParentMenu_Id, ordenado por MenuOrder.
  const buildTree = (items: MenuDTO[]) => {
    const map = new Map<number, MenuDTO & { children: MenuDTO[] }>()
    const roots: (MenuDTO & { children: MenuDTO[] })[] = []
    items.forEach(i => map.set(i.Id, { ...i, children: [] }))
    items.forEach(i => {
      const node = map.get(i.Id)!
      const parent = i.ParentMenu_Id ? map.get(i.ParentMenu_Id) : null
      if (parent) parent.children.push(node)
      else roots.push(node)
    })
    const sort = (ns: (MenuDTO & { children: MenuDTO[] })[]) => {
      ns.sort((a, b) => (a.MenuOrder ?? 0) - (b.MenuOrder ?? 0))
      ns.forEach(n => sort(n.children as (MenuDTO & { children: MenuDTO[] })[]))
    }
    sort(roots)
    return roots
  }

  const renderCard = (item: MenuDTO, depth = 0, hasChildren = false, isOpen = false) => {
    const isChild = depth > 0
    const isActive = Number(item.Status_Id) === 1
    const IconComp = ((LucideIcons as any)[item.Icon as string] ?? SquareMenu) as any
    return (
      <XStack
        key={item.Id}
        backgroundColor={isChild ? '$backgroundSurface' : '$backgroundElevated'}
        borderRadius="$4"
        paddingVertical="$3"
        paddingHorizontal="$4"
        marginLeft={isChild ? '$6' : 0}
        marginBottom="$2"
        alignItems="center"
        overflow="hidden"
        gap="$3"
        shadowColor="#000"
        shadowOffset={{ width: 0, height: 2 }}
        shadowOpacity={0.07}
        shadowRadius={6}
        elevation={2}
        onPress={() => { if (hasChildren) toggleExpand(item.Id) }}
        pressStyle={hasChildren ? { opacity: 0.85, scale: 0.99 } : {}}
      >
        {/* Franja izquierda */}
        <View
          position="absolute"
          left={0}
          top={0}
          bottom={0}
          width={4}
          backgroundColor={isActive ? '$primary' : 'transparent'}
        />

        {/* Ícono */}
        <View
          width={isChild ? 34 : 40}
          height={isChild ? 34 : 40}
          borderRadius={20}
          backgroundColor={isActive ? 'rgba(255, 85, 26, 0.12)' : '$backgroundSurface'}
          justifyContent="center"
          alignItems="center"
        >
          <IconComp size={isChild ? 17 : 20} color={isActive ? '#FF551A' : '#94A3B8'} />
        </View>

        {/* Info */}
        <YStack flex={1} gap="$0.5">
          <Text fontWeight="700" fontSize={isChild ? 13 : 14} color="$text">{item.Name}</Text>
          <Text fontSize={12} color="$textMuted">{item.Description || item.Route}</Text>
        </YStack>

        {/* Estado + Editar + Chevron */}
        <XStack alignItems="center" gap="$2">
          <View
            backgroundColor={isActive ? 'rgba(255, 85, 26, 0.12)' : 'rgba(239, 68, 68, 0.12)'}
            paddingHorizontal="$2"
            paddingVertical={3}
            borderRadius="$10"
            pressStyle={{ opacity: 0.7 }}
            onPress={(e: any) => { e?.stopPropagation?.(); setSelectedItem(item); setDialogOpen(true) }}
          >
            <Text fontSize={10} fontWeight="700" color={isActive ? '$primary' : '#ef4444'}>
              {isActive ? 'Activo' : 'Inactivo'}
            </Text>
          </View>

          {isActive && (
            <View
              onPress={(e: any) => { e?.stopPropagation?.(); createMenu(item.Id) }}
              pressStyle={{ opacity: 0.6 }}
              padding="$1.5"
              hitSlop={6}
            >
              <Pencil size={16} color={theme.primary?.val} />
            </View>
          )}

          {hasChildren && (
            <View
              onPress={(e: any) => { e?.stopPropagation?.(); toggleExpand(item.Id) }}
              pressStyle={{ opacity: 0.6 }}
              padding="$2"
              hitSlop={8}
            >
              {isOpen ? <ChevronDown size={20} color="#94A3B8" /> : <ChevronRight size={20} color="#94A3B8" />}
            </View>
          )}
        </XStack>
      </XStack>
    )
  }

  const renderNode = (node: MenuDTO & { children: MenuDTO[] }, depth = 0): React.ReactNode => {
    const hasChildren = (node.children?.length ?? 0) > 0
    const isOpen = expanded.has(node.Id)
    return (
      <React.Fragment key={node.Id}>
        {renderCard(node, depth, hasChildren, isOpen)}
        {hasChildren && isOpen &&
          node.children.map((c) => renderNode(c as MenuDTO & { children: MenuDTO[] }, depth + 1))}
      </React.Fragment>
    )
  }

  usePageHeader({
      center: (
      <Text fontSize={16} fontWeight="700" color="$text">
          Menu
      </Text>
      ),
      right: (
        <XStack gap="$2">
          <View onPress={() => getInfo()}>
            <RotateCwStyled size={18} />
          </View>

          <View onPress={() => createMenu()}>
            <PlusStyled size={18} />
          </View>
        </XStack>
      )
  })


  return (
    <Page>
      <YStack
        flex={1}
        backgroundColor="$backgroundPage"
        padding="$3"
      >
        {loading ? (
          <SkeletonList/>
        ) : error ? (
            <ErrorState
              type="server"
              title={error.title}
              message={error.message}
              errorCode={error.status}
              onRetry={getInfo}
            />
          ) : (

          <>
            <SearchInput
              data={data}
              searchKeys={['Name', 'Route', 'Description']}
              onResults={setFiltered}
              placeholder="Buscar..."
            />

            <ScrollView showsVerticalScrollIndicator={false} marginBottom="$3">
              {(filtered?.length ?? 0) === 0 ? (
                <EmptyState onAction={() => getInfo()} />
              ) : (filtered?.length ?? 0) !== (data?.length ?? 0) ? (
                // Buscando: lista plana de resultados.
                (filtered ?? []).map((item) => renderCard(item, 0, false, false))
              ) : (
                // Sin búsqueda: árbol colapsable padre → hijos.
                buildTree(filtered ?? []).map((node) => renderNode(node, 0))
              )}
            </ScrollView>
          </>
        )}
      </YStack>

      <ConfirmDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={selectedItem?.Status_Name === 'Activo' ? 'Desactivar menú' : 'Activar menú'}
        message={ selectedItem?.Status_Name === 'Activo'
                ? `¿Desea desactivar el menú "${selectedItem?.Name}"? Los usuarios con este menú no podrán utilizarlo.`
                : `¿Desea activar el acceso "${selectedItem?.Name}"?`
        }
        confirmLabel={selectedItem?.Status_Name === 'Activo' ? 'Desactivar' : 'Activar'}
        confirmColor={selectedItem?.Status_Name === 'Activo' ? '#ef4444' : '#22c55e'}
        onConfirm={toggleStatus}
      />
    </Page>
  )
}
