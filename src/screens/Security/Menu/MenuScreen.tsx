import React, { useEffect, useState } from 'react'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { Pencil, Plus, RotateCw, ChevronDown, ChevronRight } from 'lucide-react-native'
import { YStack, Text, ScrollView, useTheme, Card, XStack, View, styled} from 'tamagui'
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

  // Editar la plataforma (App / Web / Ambos) de una opción de menú.
  const savePlatform = async (item: MenuDTO, platform: 'Both' | 'App' | 'Web') => {
    try {
      const res: ExecutionResponse<MenuDTO[]> = await securityService.saveMenu([
        { ...item, Platform: platform, Modified_By: user?.Code as string },
      ])
      if (res.Success) {
        setData(prev => prev.map(m => (m.Id === item.Id ? { ...m, Platform: platform } : m)))
        showToast('success', 'Éxito', 'Plataforma actualizada', 3000, 'bottom')
      } else {
        showToast('error', 'Error', res.ErrorMessage || 'No se pudo actualizar', 4000, 'bottom')
      }
    } catch {
      showToast('error', 'Error', 'Ocurrió un error inesperado', 4000, 'bottom')
    }
  }

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

  const PLATFORMS: { label: string; value: 'Both' | 'App' | 'Web' }[] = [
    { label: 'Ambos', value: 'Both' },
    { label: 'App', value: 'App' },
    { label: 'Web', value: 'Web' },
  ]

  const renderCard = (item: MenuDTO, depth = 0, hasChildren = false, isOpen = false) => {
    const isActive = Number(item.Status_Id) === 1
    const platform = (item.Platform ?? 'Both') as 'Both' | 'App' | 'Web'
    return (
      <Card
        key={item.Id}
        backgroundColor={depth > 0 ? '$backgroundSurface' : '$backgroundElevated'}
        borderRadius={10}
        padding="$3"
        marginBottom="$2"
        marginLeft={depth * 14}
      >
        <XStack justifyContent="space-between" alignItems="flex-start">
          <XStack flex={1} alignItems="flex-start" gap="$2">
            {hasChildren ? (
              <View onPress={() => toggleExpand(item.Id)} pressStyle={{ opacity: 0.6 }} paddingTop={2}>
                {isOpen ? (
                  <ChevronDown size={18} color={theme.primary?.val} />
                ) : (
                  <ChevronRight size={18} color={theme.primary?.val} />
                )}
              </View>
            ) : (
              <View width={18} />
            )}

            <YStack flex={1}>
              <Text fontSize={14} fontWeight="800" color="$text">{item.Name}</Text>
              <Text fontSize={11} color="$text">{item.Description || 'Sin descripción'}</Text>
              <Text fontSize={10} color="$text">Identificador: {item.Route}</Text>

              {/* Plataforma: Ambos / App / Web */}
              <XStack marginTop="$2" gap="$1.5" flexWrap="wrap">
                {PLATFORMS.map((p) => {
                  const sel = platform === p.value
                  return (
                    <View
                      key={p.value}
                      onPress={() => { if (!sel) savePlatform(item, p.value) }}
                      backgroundColor={sel ? '$primary' : '$backgroundElevated'}
                      borderWidth={1}
                      borderColor={sel ? '$primary' : '$border'}
                      borderRadius={999}
                      paddingHorizontal={10}
                      paddingVertical={3}
                      pressStyle={{ opacity: 0.7 }}
                    >
                      <Text fontSize={10} fontWeight="700" color={sel ? 'white' : '$textMuted'}>{p.label}</Text>
                    </View>
                  )
                })}
              </XStack>
            </YStack>
          </XStack>

          <XStack alignItems="flex-start" gap="$2">
            <View
              borderRadius={999}
              backgroundColor={isActive ? '#22c55e' : '#ef4444'}
              paddingHorizontal={8}
              paddingVertical={2}
              pressStyle={{ opacity: 0.7 }}
              onPress={() => { setSelectedItem(item); setDialogOpen(true) }}
            >
              <Text fontSize={10} color="white" fontWeight="700">{isActive ? 'Activo' : 'Inactivo'}</Text>
            </View>

            {isActive && (
              <View borderRadius={8} pressStyle={{ opacity: 0.6 }} onPress={() => createMenu(item.Id)}>
                <Pencil size={16} color={theme.primary?.val} />
              </View>
            )}
          </XStack>
        </XStack>
      </Card>
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
