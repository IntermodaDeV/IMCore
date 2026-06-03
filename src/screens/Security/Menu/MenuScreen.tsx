import * as Burnt from 'burnt'
import React, { useEffect, useState } from 'react'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { Pencil, Plus, RotateCw } from 'lucide-react-native'
import { YStack, Text, ScrollView, useTheme, Card, XStack, View } from 'tamagui'
import { securityService } from '../../../api/modules/security/security.service'
import { MenuDTO } from '../../../api/modules/security/security.types'
import Page from '../../../components/commons/Page'
import { useAuth } from '../../../context/AuthContext'
import SkeletonList from '../../../components/Skeletons/SkeletonList'
import { ExecutionResponse } from '../../../api/modules/response.type'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import SearchInput from '../../../components/commons/SearchInput'
import ConfirmDialog from '../../../components/commons/ConfirmDialog'

export type RootStackParamList = {
  home: undefined;
  menu_form: { Id?: number };
};
type NavProps = NativeStackNavigationProp<RootStackParamList>;

export default function MenuScreen() {
  const navigation = useNavigation<NavProps>();
  const theme = useTheme()
  const [loading, setLoading] = useState(false)
  const [filtered, setFiltered] = useState<MenuDTO[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<MenuDTO | null>(null)
  const { user } = useAuth()
  const [data, setData] = useState<MenuDTO[]>([])

  const getInfo = React.useCallback(async () => {
    try {
      setLoading(true)
      const response: ExecutionResponse<MenuDTO[]> = await securityService.getMenus()
      if(response.Success){
        setData(response?.Data)
      }
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
        Burnt.toast({ title: response.SuccessMessage, message: '', preset: 'done'})
      }
    } finally {
      setDialogOpen(false)
    }
  }

  const headerActions = React.useMemo(() => [
    {
      icon: RotateCw,
      onPress: () => getInfo(),
    },
    {
      icon: Plus,
      onPress: () => createMenu(),
    },
  ], [getInfo])

  return (
    <Page headerActions={headerActions}>
      <YStack
        flex={1}
        backgroundColor="$card2"
        padding="$3"
      >
        {loading ? (
          <SkeletonList/>
        ) : (

          <>
            <SearchInput
              data={data}
              searchKeys={['Name', 'Route', 'Description']}
              onResults={setFiltered}
              placeholder="Buscar..."
            />
            <ScrollView
              showsVerticalScrollIndicator={false}
              marginBottom="$3"
            >
              {filtered.map((item) => {
                const isActive = item.Status_Name === 'Activo'

                return (
                  <Card
                    key={item.Id}
                    backgroundColor="$backgroundPage"
                    borderRadius={10}
                    padding="$3"
                    marginBottom="$2"
                  >
                    <XStack justifyContent="space-between" alignItems="flex-start">

                      {/* INFO */}
                      <YStack flex={1}>
                        <Text fontSize={14} fontWeight="800" color="$text">
                          {item.Name}
                        </Text>

                        <Text fontSize={11} color="$text">
                          {item.Description || 'Sin descripción'}
                        </Text>

                        <Text fontSize={10} color="$text">
                          Indentificador: {item.Route}
                        </Text>

                      </YStack>

                      {/* TOP RIGHT ACTIONS (HORIZONTAL) */}
                      <XStack alignItems="flex-start" gap="$2">

                        <View
                          borderRadius={999}
                          backgroundColor={isActive ? '#22c55e' : '#ef4444'}
                          paddingHorizontal={8}
                          paddingVertical={2}
                          pressStyle={{ opacity: 0.7 }}
                          onPress={() => {
                            setSelectedItem(item)
                            setDialogOpen(true)
                          }}
                        >
                            <Text fontSize={10} color="white" fontWeight="700">
                              {item.Status_Name}
                            </Text>
                        </View>

                        {item?.Status_Id === 1 && (
                          <View
                            borderRadius={8}
                            pressStyle={{ opacity: 0.6 }}
                            onPress={() => createMenu(item.Id)}
                          >
                            <Pencil size={16} color={theme.primary?.val} />
                          </View>
                        )}

                      </XStack>

                    </XStack>
                  </Card>
                )
              })}
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