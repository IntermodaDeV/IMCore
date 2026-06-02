import React, { useEffect, useState } from 'react'
import { useNavigation } from '@react-navigation/native'
import { Pencil, Plus, RotateCw } from 'lucide-react-native'
import { YStack, Text, ScrollView, useTheme, Card, XStack, View } from 'tamagui'
import { securityService } from '../../../api/modules/security/security.service'
import { MenuDTO } from '../../../api/modules/security/security.types'
import Page from '../../../components/commons/Page'
import { useAuth } from '../../../context/AuthContext'
import SkeletonList from '../../../components/Skeletons/SkeletonList'
import { ExecutionResponse } from '../../../api/modules/response.type'

export default function MenuScreen() {
  const navigation = useNavigation()
  const theme = useTheme()
  const [loading, setLoading] = useState(false)
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

                      <Text fontSize={10} color="$text" marginTop="$1">
                        Fecha creación:{' '}
                        {new Date(item.Creation_Date).toLocaleDateString()}
                      </Text>
                    </YStack>

                    {/* TOP RIGHT ACTIONS (HORIZONTAL) */}
                    <XStack alignItems="flex-start" gap="$2">

                      <View
                        borderRadius={999}
                        backgroundColor={isActive ? '#22c55e' : '#ef4444'}
                        paddingHorizontal={8}
                        paddingVertical={2}
                      >
                        <Text fontSize={10} color="white" fontWeight="700">
                          {item.Status_Name}
                        </Text>
                      </View>

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