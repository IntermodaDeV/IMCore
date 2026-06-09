import React, { useEffect, useState } from 'react'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { Pencil, Plus, RotateCw } from 'lucide-react-native'
import { YStack, Text, ScrollView, useTheme, XStack, View  } from 'tamagui'
import { securityService } from '../../../api/modules/security/security.service'
import { AccessDTO } from '../../../api/modules/security/security.types'
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
import { PullLoader } from '../../../components/Skeletons/PullLoader'

export type RootStackParamList = {
  home: undefined;
  access_form: { Id?: number };
};
type NavProps = NativeStackNavigationProp<RootStackParamList>;

export default function AccessScreen() {
  const navigation = useNavigation<NavProps>();
  const theme = useTheme()
  const [loading, setLoading] = useState(false)
  const [filtered, setFiltered] = useState<AccessDTO[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<AccessDTO | null>(null)
  const [error, setError] = useState<AppError | null>(null)
  const { user } = useAuth()
  const { showToast } = useShowToast()
  const [data, setData] = useState<AccessDTO[]>([])

  const getInfo = React.useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response: ExecutionResponse<AccessDTO[]> = await securityService.getAccess()
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

  const createAccess = (Id?: number) => {
    navigation.navigate('access_form', { Id })
  }

  const toggleStatus = async () => {
    if (!selectedItem) return

    try {
      const newStatus = selectedItem.Status_Id === 1 ? 2 : 1

      let Data: AccessDTO = {
        ...selectedItem,
        Status_Id: newStatus,
        Modified_By: user?.Code as string,
      }
      const response: ExecutionResponse<AccessDTO[]> = await securityService.changeStatusAccess([Data])
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

  const headerActions = React.useMemo(() => [
    {
      icon: RotateCw,
      onPress: () => getInfo(),
    },
    {
      icon: Plus,
      onPress: () => createAccess(),
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
          <>
            <PullLoader />
            <SkeletonList/>
          </>
        ) : error ? (
          <ErrorState
            type="server"
            title={error.title}
            message={error.message}
            errorCode={error.status}
            onRetry={getInfo}
          />
        ) : 
        (
          <>
            <SearchInput
              data={data}
              searchKeys={['Name', 'KeyVar', 'Description']}
              onResults={setFiltered}
              placeholder="Buscar..."
            />
            <ScrollView
              showsVerticalScrollIndicator={false}
              marginBottom="$3"
            >

              {(filtered?.length ?? 0) === 0 ? (
                  <EmptyState onAction={() => getInfo()} />
                ) : (
                  (filtered ?? []).map((item) => {
                    const isActive = item.Status_Name === 'Activo'

                    return (
                      <YStack
                        key={item.Id}
                        backgroundColor="$backgroundPage"
                        padding="$3"
                        borderRadius={10}
                        marginBottom="$2"
                      >
                        <XStack justifyContent="space-between" alignItems="flex-start">

                          <YStack flex={1}>
                            <Text fontSize={14} fontWeight="800" color="$text">
                              {item.Name}
                            </Text>

                            <Text fontSize={11} color="$text">
                              {item.Description || 'Sin descripción'}
                            </Text>

                            <Text fontSize={10} color="$text" marginTop="$1">
                              Llave única: {item.KeyVar}
                            </Text>
                          </YStack>

                          <XStack alignItems="flex-start" gap="$3">
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
                                onPress={() => createAccess(item.Id)}
                              >
                                <Pencil size={16} color={theme.primary?.val} />
                              </View>
                            )}
                          </XStack>

                        </XStack>
                      </YStack>
                    )
                  })
              )}
            </ScrollView>
          </>
        )}
      </YStack>

      <ConfirmDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={selectedItem?.Status_Name === 'Activo' ? 'Desactivar acceso' : 'Activar acceso'}
        message={ selectedItem?.Status_Name === 'Activo'
                ? `¿Deseas desactivar el acceso "${selectedItem?.Name}"? Los usuarios con este acceso asignado no podrán utilizarlo.`
                : `¿Deseas activar el acceso "${selectedItem?.Name}"?`
        }
        confirmLabel={selectedItem?.Status_Name === 'Activo' ? 'Desactivar' : 'Activar'}
        confirmColor={selectedItem?.Status_Name === 'Activo' ? '#ef4444' : '#22c55e'}
        onConfirm={toggleStatus}
      />
    </Page>
  )
}
