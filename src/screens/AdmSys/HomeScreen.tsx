import React, { useEffect, useState } from 'react'
import { YStack, Text, XStack } from 'tamagui'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from 'tamagui'
import { AppError, handleError } from '../../utils/errorHandler'
import { IQuickActions } from '../../api/modules/security/security.types'
import { ExecutionResponse } from '../../api/modules/response.type'
import { securityService } from '../../api/modules/security/security.service'
import { ScrollView, ImageBackground } from 'react-native'
import { useNavigation, useFocusEffect } from '@react-navigation/native'
import * as Icons from 'lucide-react-native'
import { Pressable } from 'react-native'
import { useWindowDimensions } from 'react-native'
import { useMenu } from '../../context/MenuContext'
import { shadows } from '../../theme/shadows'
import { TouchableOpacity, Animated, Easing, StyleSheet, View as RNView, Image as RNImage } from 'react-native'
import { usePageHeader } from '../../hooks/usePageHeader'
import { useLoader } from '../../providers/LoaderProvider'

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'BUENOS DÍAS'
  if (hour < 19) return 'BUENAS TARDES'
  return 'BUENAS NOCHES'
}

export default function HomeScreen() {
  const loader = useLoader();


  const { user } = useAuth()
  const theme = useTheme()
  const greeting = getGreeting()
  const navigation = useNavigation<any>()
  const { height } = useWindowDimensions()
  const { menu } = useMenu()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<AppError | null>(null)
  const [data, setData] = useState<IQuickActions[]>([])
  const [menus, setMenus] = useState<any[]>([])

  usePageHeader({
    center: (
      <RNImage
        source={require('../../assets/LOGOMODINTER.png')}
        style={{
          width: 50,
          height: 30,
        }}
      />
    ),

    right: <Icons.Bell size={20} color={theme.textWelcome?.val} />,
  })

  const getInfo = React.useCallback(async () => {
    try {
      loader.show();
      setError(null)
      setMenus(menu?.filter((i) => i?.ParentMenu_Id !== null).slice(0, 6))
      const response: ExecutionResponse<IQuickActions[]> = await securityService.getQuickActions(user?.User_Code)
      if (response.Success) {
        setData(response.Data.filter((i: IQuickActions) => i?.Status_Id === 1))
        
      }

      loader.hide();
    } catch (err) {
      setError(handleError(err))
    } finally {
      loader.hide();
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

        <ImageBackground
          source={require('../../assets/Banner.png')}
          style={{ width: '100%', borderRadius: 16, overflow: 'hidden' }}
          imageStyle={{ borderRadius: 16 }}
          resizeMode="cover"
        >
          <YStack padding={20}>
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
          </YStack>
        </ImageBackground>

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
                    {...shadows.sm}
                  >
                    <IconComponent size={26} color="#FF551A" />
                  </YStack>
                  {/* label */}
                  <Text
                    marginTop="$2"
                    fontSize={12}
                    fontWeight="600"
                    textAlign="center"
                    color="$textBlack"
                  >
                    {item.Name}
                  </Text>
                </Pressable>
              )
            })}
          </XStack>
        </YStack>

        <YStack width="100%" marginTop="$4">
          <Text fontSize={18} fontWeight="700" color="$text" marginBottom="$1">
            ¿Qué quieres hacer hoy?
          </Text>
          <Text fontSize={13} color="$textMuted" marginBottom="$6">
            Accede rápido a lo que necesitas
          </Text>
          
          <XStack flexWrap="wrap" gap="$2">
            {menus?.map((item) => {
              const IconComponent = (Icons as any)[item.Icon ?? ''] || Icons.FileText

              return (
                <Pressable
                  key={item.Id}
                  onPress={() => navigation.navigate(item.Route as never)}
                  style={({ pressed }) => [{
                    width: '31.5%',
                    opacity: pressed ? 0.75 : 1,
                    transform: [{ scale: pressed ? 0.96 : 1 }],
                  }]}
                >
                  <YStack
                    {...shadows.sm}
                    backgroundColor="$card2"
                    borderRadius={16}
                    padding={12}
                    height={100}
                    justifyContent="space-between"
                    
                    
                  >
                    <YStack
                      width={36}
                      height={36}
                      borderRadius={10}
                      backgroundColor="rgba(255,85,26,0.15)"
                      justifyContent="center"
                      alignItems="center"
                    >
                      <IconComponent size={18} color="#FF551A" />
                    </YStack>

                    <Text fontSize={11} fontWeight="700" color="$text" numberOfLines={2} lineHeight={16}>
                      {item.Name}
                    </Text>
                  </YStack>
                </Pressable>
              )
            })}
          </XStack>
        </YStack>

      </YStack>
    </ScrollView>
  )
}