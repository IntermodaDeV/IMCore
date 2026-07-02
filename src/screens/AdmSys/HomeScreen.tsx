import React, { useEffect, useState } from 'react'
import { YStack, Text, XStack, View, useThemeName, styled } from 'tamagui'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from 'tamagui'
import { AppError, handleError } from '../../utils/errorHandler'
import { IQuickActions } from '../../api/modules/security/security.types'
import { ExecutionResponse } from '../../api/modules/response.type'
import { securityService } from '../../api/modules/security/security.service'
import { ScrollView, ImageBackground, RefreshControl } from 'react-native'
import { useNavigation, useFocusEffect } from '@react-navigation/native'
import * as Icons from 'lucide-react-native'
import { Pressable } from 'react-native'
import { useWindowDimensions } from 'react-native'
import { useMenu } from '../../context/MenuContext'
import { shadows } from '../../theme/shadows'
import { TouchableOpacity, Animated, Easing, StyleSheet, View as RNView, Image as RNImage } from 'react-native'
import { usePageHeader } from '../../hooks/usePageHeader'
import { useLoader } from '../../providers/LoaderProvider'
import { NotificationBell } from '../../components/notifications/NotificationBell'

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'BUENOS DÍAS'
  if (hour < 19) return 'BUENAS TARDES'
  return 'BUENAS NOCHES'
}

export default function HomeScreen() {
  const loader = useLoader();

  const UserRoundStyled = styled(Icons.UserRound, {
    color: '$text',
  })
  const { user } = useAuth()
  const theme = useTheme()
  const themeName = useThemeName();
  const greeting = getGreeting()
  const navigation = useNavigation<any>()
  const { height } = useWindowDimensions()
  const { menu } = useMenu()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<AppError | null>(null)
  const [data, setData] = useState<IQuickActions[]>([])
  const [menus, setMenus] = useState<any[]>([])
  const [urlBanner, setUrlBanner] = useState(require('../../assets/Banner.png'))

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

    right: (
      <XStack gap="$3">
        <View>
          <UserRoundStyled onPress={() => navigation.navigate('Perfil')} size={20} />
        </View>
        <NotificationBell size={20} />
      </XStack>
    ),
  })

  // silent = true (pull-to-refresh): no muestra el loader global, usa el spinner del gesto.
  const getInfo = React.useCallback(async (silent = false) => {
    try {
      if (!silent) loader.show();
      setError(null)
      setMenus(menu?.filter((i) => i?.ParentMenu_Id !== null).slice(0, 6))
      const response: ExecutionResponse<IQuickActions[]> = await securityService.getQuickActions(user?.User_Code)
      if (response.Success) {
        setData(response.Data.filter((i: IQuickActions) => i?.Status_Id === 1))

      }

      if (!silent) loader.hide();
    } catch (err) {
      setError(handleError(err))
    } finally {
      if (!silent) loader.hide();
    }
  }, [user?.User_Code])

  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = React.useCallback(async () => {
    setRefreshing(true)
    try {
      await getInfo(true)
    } finally {
      setRefreshing(false)
    }
  }, [getInfo])

  useFocusEffect(
    React.useCallback(() => {
      getInfo()
    }, [getInfo])
  )

  useEffect(() => {
    if (themeName === 'dark') {
      setUrlBanner(require('../../assets/banner-dark.png'))
    } else {
      setUrlBanner(require('../../assets/Banner.png'))
    }
  }, [themeName])


  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background?.val }}
      contentContainerStyle={{ flexGrow: 1 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[theme.primary?.val ?? '#FF551A']}
          tintColor={theme.primary?.val ?? '#FF551A'}
        />
      }
    >
      <YStack
        flex={1}
        padding="$4"
        backgroundColor="$backgroundPage"
        justifyContent="flex-start"
        alignItems="center"
      >

        <ImageBackground
          source={urlBanner}
          style={{ width: '100%', borderRadius: 16, overflow: 'hidden' }}
          imageStyle={{ borderRadius: 16 }}
          resizeMode="cover"
        >
          <YStack padding={20}>

            <Text
              fontSize={16}
              fontWeight="700"
              color={theme.primary?.val}
              letterSpacing={1.2}
              textTransform="uppercase"
              marginBottom="$1"
            >
              {greeting},
            </Text>

            <XStack alignItems="center" marginBottom="$2">
              <Text fontSize={25} fontWeight="700" color={theme.text?.val}>
                Hola, {user?.Name ?? 'Usuario'}
              </Text>
              <Text fontSize={22} marginLeft="$2">👋</Text>
            </XStack>

            <Text fontSize={14} color={theme.textMuted?.val} lineHeight={22}>
              Tu centro de operaciones IMCORE está listo. Aquí tienes lo más importante para hoy.
            </Text>
          </YStack>
        </ImageBackground>

        <YStack width="100%" marginTop="$4">
          <Text fontSize={18} fontWeight="700" marginBottom="$3" color={theme.text?.val}>
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
                    backgroundColor="$backgroundElevated"
                    justifyContent="center"
                    alignItems="center"
                    {...shadows.sm}
                  >
                    <IconComponent size={26} color={theme.primary?.val} />
                  </YStack>
                  {/* label */}
                  <Text
                    marginTop="$2"
                    fontSize={12}
                    fontWeight="600"
                    textAlign="center"
                    color="$text"
                  >
                    {item.Name}
                  </Text>
                </Pressable>
              )
            })}
          </XStack>
        </YStack>

        <YStack width="100%" marginTop="$4">
          <Text fontSize={18} fontWeight="700" color={theme.text?.val} marginBottom="$1">
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
                    backgroundColor="$backgroundElevated"
                    borderRadius={16}
                    padding={12}
                    height={100}
                    justifyContent="space-between"
                    
                    
                  >
                    <YStack
                      width={36}
                      height={36}
                      borderRadius={10}
                      backgroundColor="$primaryOpacity"
                      justifyContent="center"
                      alignItems="center"
                    >
                      <IconComponent size={18} color={theme.primary?.val} />
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