import React, { useState } from 'react'
import { YStack, Text, XStack, View, styled } from 'tamagui'
import { useAuth } from '../../context/AuthContext'
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
import { useMenu } from '../../context/MenuContext'
import { shadows } from '../../theme/shadows'
import { TouchableOpacity, Animated, Easing, StyleSheet, View as RNView, Image as RNImage } from 'react-native'
import { usePageHeader } from '../../hooks/usePageHeader'
import { useLoader } from '../../providers/LoaderProvider'
import { NotificationBell } from '../../components/notifications/NotificationBell'
import CardSaludo from './CardSaludo'
import HomeSeguridadScreen from './HomeSeguridadScreen'

/**
 * Acceso que cambia el inicio por el de seguridad.
 *
 * Se resuelve acá y no en la navegación a propósito: la ruta 'inicio' sigue
 * siendo una sola, así que el menú, el botón de atrás y los enlaces de las
 * notificaciones no tienen que saber nada de esto.
 */
const ACCESO_HOME_SEGURIDAD = 'HomeSeguridad'

export default function HomeScreen() {
  const loader = useLoader();

  const UserRoundStyled = styled(Icons.UserRound, {
    color: '$text',
  })
  const { user } = useAuth()
  const theme = useTheme()
  /* `user.Access` viene como lista separada por comas, igual que en el resto de
     la app. Si el usuario tiene el acceso, esta pantalla cede el paso a la de
     seguridad — más abajo, después de los hooks, para no romper su orden. */
  const esSeguridad = (user?.Access ?? '')
    .split(',').map(s => s.trim()).includes(ACCESO_HOME_SEGURIDAD)
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

    /* El header lo fija SOLO esta pantalla, aunque muestre la de seguridad.
       Las dos llamaban a usePageHeader y los efectos del padre corren DESPUÉS
       de los del hijo, así que el header de acá pisaba al de seguridad y el
       ícono de perfil volvía a aparecer.

       A seguridad no se le ofrece el perfil: el teléfono del portón es
       compartido entre turnos y ahí no hay nada personal que configurar. */
    right: (
      <XStack gap="$3">
        {esSeguridad ? null : (
          <View>
            <UserRoundStyled onPress={() => navigation.navigate('Perfil')} size={20} />
          </View>
        )}
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

  /* El banner y el saludo se fueron a CardSaludo: el efecto que los sincronizaba
     con el tema vive ahí ahora, y acá sobraba. */


  /* Va DESPUÉS de todos los hooks: React exige que se llamen siempre en el
     mismo orden, y una salida temprana arriba los saltearía. */
  if (esSeguridad) return <HomeSeguridadScreen />

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

        {/* La misma card que usa el inicio de seguridad. Compartida para que el
            saludo no se desincronice entre las dos pantallas. */}
        <CardSaludo mensaje="Tu centro de operaciones IMCore está listo. Aquí tienes lo más importante para hoy." />

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