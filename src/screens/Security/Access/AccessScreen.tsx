import React, { useEffect, useState } from 'react'
import { useNavigation } from '@react-navigation/native'
import { Pencil, Plus, RotateCw } from 'lucide-react-native'
import { YStack, Text, ScrollView, useTheme, XStack, View } from 'tamagui'
import { securityService } from '../../../api/modules/security/security.service'
import { AccessDTO } from '../../../api/modules/security/security.types'
import Page from '../../../components/commons/Page'
import { useAuth } from '../../../context/AuthContext'
import SkeletonList from '../../../components/Skeletons/SkeletonList'
import { ExecutionResponse } from '../../../api/modules/response.type'

export default function AccessScreen() {
  const navigation = useNavigation()
  const theme = useTheme()
  const [loading, setLoading] = useState(false)
  const { user } = useAuth()

  const [data, setData] = useState<AccessDTO[]>([])

  const getInfo = React.useCallback(async () => {
    try {
      setLoading(true)
      const response: ExecutionResponse<AccessDTO[]> = await securityService.getAccess()
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
                <YStack
                  key={item.Id}
                  backgroundColor="$backgroundPage"
                  padding="$3"
                  borderRadius={10}
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

                      <Text fontSize={10} color="$text" marginTop="$1">
                        Llave única: {item.KeyVar}
                      </Text>
                    </YStack>

                    {/* STATUS + EDIT (TOP RIGHT HORIZONTAL) */}
                    <XStack alignItems="flex-start" gap="$3">

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
                </YStack>
              )
            })}

          </ScrollView>
        )}
      </YStack>
    </Page>
  )
}