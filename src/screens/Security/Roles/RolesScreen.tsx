import React, { useEffect, useState } from 'react'
import { useNavigation } from '@react-navigation/native'
import { Plus, RotateCw, Pencil } from 'lucide-react-native'
import { YStack, Text, ScrollView, Card, XStack, View, useTheme } from 'tamagui'
import { securityService } from '../../../api/modules/security/security.service'
import { RolesDTO } from '../../../api/modules/security/security.types'
import Page from '../../../components/commons/Page'
import { useAuth } from '../../../context/AuthContext'
import SkeletonList from '../../../components/Skeletons/SkeletonList'
import { ExecutionResponse } from '../../../api/modules/response.type'

export default function RolesScreen() {
  const navigation = useNavigation()
  const theme = useTheme()
  const [loading, setLoading] = useState(false)
  const { user } = useAuth()

  const [data, setData] = useState<RolesDTO[]>([])

  const getInfo = React.useCallback(async () => {
    try {
      setLoading(true)
      const response: ExecutionResponse<RolesDTO[]> = await securityService.getRoles()
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

  const headerActions = React.useMemo(() => [
    {
      icon: RotateCw,
      onPress: getInfo,
    },
    {
      icon: Plus,
      onPress: () => {},
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
          <ScrollView
            showsVerticalScrollIndicator={false}
            marginBottom="$3"
          >

            {data.map((item) => {
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

                        {/* INFO */}
                        <YStack flex={1}>
                        <Text fontSize={14} fontWeight="800" color="$text">
                            {item.RoleName}
                        </Text>

                        <Text fontSize={11} color="$text">
                            {item.Description || 'Sin descripción'}
                        </Text>

                        <Text fontSize={10} color="$text">
                            Fecha creación:{' '}
                            {new Date(item.Creation_Date).toLocaleDateString()}
                        </Text>
                        </YStack>

                        {/* TOP RIGHT ACTIONS */}
                        <XStack alignItems="flex-start" gap="$2">

                        {/* STATUS */}
                        <View
                            borderRadius={999}
                            backgroundColor={isActive ? '#22c55e' : '#ef4444'}
                            paddingHorizontal={8}
                            paddingVertical={2}
                        >
                            <Text fontSize={10} color="white" fontWeight="700">
                                {item.StatusName}
                            </Text>
                        </View>

                        {/* EDIT */}
                        <View
                            borderRadius={8}
                            pressStyle={{ opacity: 0.6 }}
                            onPress={() => console.log('Editar:', item)}
                        >
                            <Pencil size={16} color={theme.primary?.val} />
                        </View>

                        </XStack>

                    </XStack>
                    </Card>
                )
            })}
      
          </ScrollView>
        )}
      </YStack>
    </Page>
  )
}