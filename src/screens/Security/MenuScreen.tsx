import React, { useEffect, useState } from 'react'
import { useNavigation } from '@react-navigation/native'
import { Plus, RotateCw } from 'lucide-react-native'
import { YStack, Text, ScrollView, useTheme } from 'tamagui'
import { securityService } from '../../api/modules/security/security.service'
import { MenuDTO } from '../../api/modules/security/security.types'
import Page from '../../components/commons/Page'
import { useAuth } from '../../context/AuthContext'
import SkeletonList from '../../components/Skeletons/SkeletonList'
import { ExecutionResponse } from '../../api/modules/response.type'

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
      console.log(response?.Data);
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
            <Text>hOLA</Text>

          </ScrollView>
        )}
      </YStack>
    </Page>
  )
}