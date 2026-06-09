import React, { useEffect, useState } from 'react'
import { YStack, Text, XStack } from 'tamagui'
import { useAuth } from '../../context/AuthContext'
import LinearGradient from 'react-native-linear-gradient'
import { useTheme } from 'tamagui'
import { AppError, handleError } from '../../utils/errorHandler'
import { IQuickActions } from '../../api/modules/security/security.types'
import { ExecutionResponse } from '../../api/modules/response.type'
import { securityService } from '../../api/modules/security/security.service'
import { ScrollView, RefreshControl } from 'react-native'
import { useNavigation, useFocusEffect } from '@react-navigation/native'
import * as Icons from 'lucide-react-native'
import { Pressable } from 'react-native'
import { useWindowDimensions } from 'react-native'
import { PullLoader } from '../../components/Skeletons/PullLoader'
import { useMenu } from '../../context/MenuContext'

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'BUENOS DÍAS'
  if (hour < 19) return 'BUENAS TARDES'
  return 'BUENAS NOCHES'
}

export default function HomeScreen() {
  const { user } = useAuth()
  const theme = useTheme()
  const greeting = getGreeting()
  const navigation = useNavigation<any>()
  const { height } = useWindowDimensions()
  const { menu } = useMenu()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<AppError | null>(null)
  const [data, setData] = useState<IQuickActions[]>([])

  const getInfo = React.useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const response: ExecutionResponse<IQuickActions[]> = await securityService.getQuickActions(user?.User_Code)
      if (response.Success) {
        setData(response.Data.filter((i: IQuickActions) => i?.Status_Id === 1))
      }
    } catch (err) {
      setError(handleError(err))
    } finally {
      setLoading(false)
    }
  }, [user?.User_Code])

  useFocusEffect(
    React.useCallback(() => {
      getInfo()
    }, [getInfo])
  )

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background?.val }}
      contentContainerStyle={{ flexGrow: 1 }}
    >
      <YStack
        flex={1}
        padding="$4"
        backgroundColor="$background"
        justifyContent="flex-start"
        alignItems="center"
      >
        {loading && <PullLoader />}

        <LinearGradient
          colors={[theme.colorGradient1?.val, theme.colorGradient2?.val]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ width: '100%', borderRadius: 16, padding: 20 }}
        >

          <Pressable
            onPress={() => navigation.navigate('Perfil')}
            style={({ pressed }) => [{ position: 'absolute', top: 14, right: 14 }, pressed && { opacity: 0.7, transform: [{ scale: 0.96 }] }]}
          >
            <Icons.Settings size={20} color={theme.textWelcome?.val} />
          </Pressable>
          <Text
            fontSize={16}
            fontWeight="700"
            color="$textWelcome"
            letterSpacing={1.2}
            textTransform="uppercase"
            marginBottom="$1"
          >
            {greeting},
          </Text>

          <XStack alignItems="center" marginBottom="$2">
            <Text fontSize={25} fontWeight="700" color="$text">
              Hola, {user?.Name ?? 'Usuario'}
            </Text>
            <Text fontSize={22} marginLeft="$2">👋</Text>
          </XStack>

          <Text fontSize={14} color="$textMuted" lineHeight={22}>
            Tu centro de operaciones IMCORE está listo. Aquí tienes lo más importante para hoy.
          </Text>
        </LinearGradient>

        <YStack width="100%" marginTop="$4">
          <Text fontSize={18} fontWeight="700" marginBottom="$3" color="$text">
            Acciones Rápidas
          </Text>
          
          <XStack flexWrap="wrap" justifyContent="space-between">
            {data.map((item) => {
              const IconComponent = (Icons as any)[item.Icon ?? ''] || Icons.FileText
              return (
                <Pressable
                  key={item.Id}
                  onPress={() => navigation.navigate(item.Route as never)}
                  style={({ pressed }) => [
                    {
                      width: '25%',
                      alignItems: 'center',
                      marginBottom: 20,
                    },
                    pressed && {
                      opacity: 0.75,
                      transform: [{ scale: 0.96 }],
                    },
                  ]}
                >
                  {/* círculo */}
                  <YStack
                    width={55}
                    height={55}
                    borderRadius={32}
                    backgroundColor="$card2"
                    justifyContent="center"
                    alignItems="center"
                    shadowOpacity={0.15}
                    elevation={6}
                  >
                    <IconComponent size={26} color="#FF551A" />
                  </YStack>
                  {/* label */}
                  <Text
                    marginTop="$2"
                    fontSize={12}
                    fontWeight="600"
                    textAlign="center"
                    color="$textWelcome"
                  >
                    {item.Name}
                  </Text>
                </Pressable>
              )
            })}
          </XStack>
        </YStack>
      </YStack>
    </ScrollView>
  )
}