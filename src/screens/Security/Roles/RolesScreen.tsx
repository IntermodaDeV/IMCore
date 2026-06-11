import React, { useEffect, useState } from 'react'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { Plus, RotateCw, Pencil } from 'lucide-react-native'
import { YStack, Text, ScrollView, Card, XStack, View, useTheme } from 'tamagui'
import { securityService } from '../../../api/modules/security/security.service'
import { RolesDTO } from '../../../api/modules/security/security.types'
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
  roles_form: { Id?: number };
};

type NavProps = NativeStackNavigationProp<RootStackParamList>;

export default function RolesScreen() {
  const navigation = useNavigation<NavProps>();
  const theme = useTheme()
  const [loading, setLoading] = useState(false)
  const [filtered, setFiltered] = useState<RolesDTO[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<RolesDTO | null>(null)
  const [error, setError] = useState<AppError | null>(null)
  const [data, setData] = useState<RolesDTO[]>([])
  const { user } = useAuth()
  const { showToast } = useShowToast()

  const getInfo = React.useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response: ExecutionResponse<RolesDTO[]> = await securityService.getRoles()
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

  useFocusEffect(
    React.useCallback(() => {
      getInfo()
    }, [getInfo])
  )

  const openForm = (Id?: number) => {
    navigation.navigate('roles_form', { Id })
  }

  const toggleStatus = async () => {
    if (!selectedItem) return

    try {
      const newStatus = selectedItem.Status_Id === 1 ? 2 : 1

      let Data: RolesDTO = {
        ...selectedItem,
        Status_Id: newStatus,
        Modified_By: user?.Code as string,
      }
      const response: ExecutionResponse<RolesDTO[]> = await securityService.changeStatusRoles([Data])
      if (response.Success) {
        setData(prev =>
          prev.map(item =>
            item.Id === selectedItem.Id
              ? {
                  ...item,
                  Status_Id: newStatus,
                  StatusName: newStatus === 1 ? 'Activo' : 'Inactivo',
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
    setFiltered(data)
  }, [data])

  useEffect(() => {
    getInfo()
  }, [])

  usePageHeader({
      center: (
      <Text fontSize={16} fontWeight="700" color="$text">
          Roles
      </Text>
      ),
      right: (
        <XStack gap="$2">
          <View onPress={() => getInfo()}>
            <RotateCw size={18} />
          </View>

          <View onPress={() => openForm()}>
            <Plus size={18} />
          </View>
        </XStack>
      )
  })


  return (
    <Page>
      <YStack
        flex={1}
        backgroundColor="$card2"
        padding="$3"
      >
        {loading ? (
          <SkeletonList />
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
            searchKeys={['RoleName', 'Description']}
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
                const isActive = item.StatusName === 'Activo'

                return (
                  <Card
                    key={item.Id}
                    backgroundColor="$backgroundPage"
                    borderRadius={10}
                    padding="$3"
                    marginBottom="$2"
                  >
                    <XStack justifyContent="space-between" alignItems="flex-start">
                      <YStack flex={1}>
                        <Text
                          fontSize={14}
                          fontWeight="800"
                          color="$text"
                        >
                          {item.RoleName}
                        </Text>

                        <Text
                          fontSize={11}
                          color="$text"
                        >
                          {item.Description || 'Sin descripción'}
                        </Text>

                        <Text
                          fontSize={10}
                          color="$text"
                        >
                          Fecha creación:{' '}
                          {new Date(item.Creation_Date).toLocaleDateString()}
                        </Text>
                      </YStack>

                      <XStack alignItems="flex-start" gap="$2">
                        <View
                          borderRadius={999}
                          backgroundColor={
                            isActive ? '#22c55e' : '#ef4444'
                          }
                          paddingHorizontal={8}
                          paddingVertical={2}
                          pressStyle={{ opacity: 0.7 }}
                          onPress={() => {
                            setSelectedItem(item)
                            setDialogOpen(true)
                          }}
                        >
                          <Text
                            fontSize={10}
                            color="white"
                            fontWeight="700"
                          >
                            {item.StatusName}
                          </Text>
                        </View>

                        {item.Status_Id === 1 && (
                          <View
                            borderRadius={8}
                            pressStyle={{ opacity: 0.6 }}
                            onPress={() => openForm(item.Id)}
                          >
                            <Pencil
                              size={16}
                              color={theme.primary?.val}
                            />
                          </View>
                        )}
                      </XStack>
                    </XStack>
                  </Card>
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
        title={selectedItem?.Status_Id === 1 ? 'Desactivar rol' : 'Activar rol'}
        message={ selectedItem?.Status_Id === 1
                ? `¿Deseas desactivar el rol "${selectedItem?.RoleName}"? Los usuarios con este rol asignado no podrán utilizarlo.`
                : `¿Deseas activar el rol "${selectedItem?.RoleName}"?`
        }
        confirmLabel={selectedItem?.Status_Id === 1? 'Desactivar' : 'Activar'}
        confirmColor={selectedItem?.Status_Id === 1 ? '#ef4444' : '#22c55e'}
        onConfirm={toggleStatus}
      />
    </Page>
  )
}
