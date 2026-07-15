import React, { useState, useEffect } from 'react'
import { Button, TamaguiProvider, Text, Theme, View } from 'tamagui'
import { config } from './src/theme/tamagui.config'
import { NavigationContainer } from '@react-navigation/native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import { navigationRef } from './src/navigation/navigationRef'
import { setupNotificationOpenHandlers } from './src/services/pushNotifications'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import LoginScreen from './src/screens/AdmSys/LoginScreen'
import DrawerNavigator from './src/navigation/DrawerNavigator'
import { AuthProvider, useAuth } from './src/context/AuthContext'
import { MenuProvider } from './src/context/MenuContext'
import LoadingScreen from './src/components/Skeletons/LoadingScreen'
import { ToastProvider, ToastViewport } from '@tamagui/toast'
import { CustomToast } from './src/components/commons/CustomToast'
import { ToastPositionProvider } from './src/context/ToastPositionContext'
import { useToastPosition } from './src/context/ToastPositionContext'
import { LoaderProvider } from './src/providers/LoaderProvider'
import { RightDrawerProvider } from './src/providers/RightDrawerProvider'
import { NotificationsProvider } from './src/context/NotificationsContext'
import AccessForm from './src/screens/Security/Access/AccessForm'
import RolesForm from './src/screens/Security/Roles/RolesForm'
import { HeaderProvider } from './src/context/HeaderContext'
import { AppHeader } from './src/components/commons/AppHeader'
import { SCREENS } from './src/screens/screens'
import { rootSecurity } from './src/screens/Security/rootSecurity'
import SessionExpiredScreen from './src/navigation/SessionExpiredScreen'
import RegisterScreen from './src/screens/Auth/RegistroScreen'

function Root() {
  const { theme, loading, user, transitioning, setTransitioning, transitionMessage, setTransitionMessage, sessionExpired } = useAuth()
  const Stack = createNativeStackNavigator()
  const { position: toastPosition } = useToastPosition()
  const insets = useSafeAreaInsets()
  // Fix edge-to-edge (New Arch): reserva el alto de la barra de navegación del
  // sistema en TODOS los dispositivos. insets.bottom es auto-adaptativo: 0 donde
  // no hay barra (equipos con gestos) → sin cambio; >0 donde sí la hay (3 botones
  // Android, home indicator) → sube el contenido sobre la barra. Evita que
  // FABs/botones anclados abajo queden ocultos tras la barra del sistema.
  const bottomInset = insets.bottom

  // Engancha el tap de notificaciones (deep-link al detalle) una sola vez.
  useEffect(() => { setupNotificationOpenHandlers() }, [])
  
  const navigationTheme = {
    light: {
      background: '#dcd6d6',
      text: '#0F172A',
      primary: '#FF551A',
    },
    dark: {
      background: '#0d1c32',
      text: '#ffffff',
      primary: '#FF551A',
    },
  }

  const navColors = navigationTheme[theme]
  if (loading) {
    return (
      <TamaguiProvider config={config} defaultTheme={theme}>
        <Theme name={theme}>
          <LoadingScreen text="Cargando sesión..." duration={1000000} />
        </Theme>
      </TamaguiProvider>
    )
  }

  if (transitioning) {
    return (
      <TamaguiProvider config={config} defaultTheme={theme}>
        <Theme name={theme}>
          <LoadingScreen
            text={transitionMessage ?? 'Iniciando sesión...'}
            duration={transitionMessage === 'Cerrando sesión...' ? 800 : 1200}
            onFinish={() => {
              setTransitioning(false)
              setTransitionMessage(null)
            }}
          />
        </Theme>
      </TamaguiProvider>
    )
  }

  if (sessionExpired) {
    return (
      <TamaguiProvider config={config} defaultTheme={theme}>
        <Theme name={theme}>
          <SessionExpiredScreen />
        </Theme>
      </TamaguiProvider>
    )
  }

  return (
    <TamaguiProvider config={config} defaultTheme={theme}>
      <LoaderProvider>
        <RightDrawerProvider>
        <HeaderProvider>

          <Theme name={theme}>

            <ToastProvider swipeDirection="horizontal">
              
              
              {/* backgroundColor evita la franja blanca en la zona del inset
                  (home indicator iOS / barra Android): la tiñe del fondo del tema. */}
              <View flex={1} paddingBottom={bottomInset} backgroundColor="$background">
              <NavigationContainer ref={navigationRef}>
                <RightDrawerProvider>
                <Stack.Navigator screenOptions={{ headerShown: false }}>
                  {user ? (
                    <>
                      <Stack.Screen name="Main">
                        {() => <DrawerNavigator />}
                      </Stack.Screen>
                      <Stack.Screen name="Loading">
                        {({ route, navigation }) => (
                          <LoadingScreen
                            text="Iniciando sesión..."
                            duration={1000}
                            onFinish={() => {
                              const next = (route.params as any)?.next || 'Main'
                              navigation.reset({
                                index: 0,
                                routes: [{ name: next }],
                              })
                            }}
                          />
                        )}
                      </Stack.Screen>


                      {Object.values(SCREENS)
                        .filter(
                          (route): route is { Screen: any; Childs: Record<string, any> } =>
                            typeof route === 'object' &&
                            route !== null &&
                            'Childs' in route
                        )
                        .flatMap(route => Object.entries(route.Childs))
                        .map(([Name, Component]) => (
                          <Stack.Screen
                            key={Name}
                            name={Name}
                            component={Component}
                            options={{
                              header: ({ route, options }) => (
                                <AppHeader route={route} options={options} />
                              ),
                              headerShown: true,
                            }}
                          />
                        ))}

                    </>
                  ) : (
                    <>                    
                      <Stack.Screen name="Login" component={LoginScreen} />
                      <Stack.Screen name="Register" component={RegisterScreen} />
                    </>
                  )
                  }
                </Stack.Navigator>

                <View
                  position="absolute"
                  bottom={10}
                  right={12}
                  pointerEvents="none"
                >

                </View>

                </RightDrawerProvider>
              </NavigationContainer>
              </View>

              <CustomToast />

              <ToastViewport
                top={toastPosition === 'top' ? 50 : undefined}
                bottom={toastPosition === 'bottom' ? 20 : undefined}
                right={20}
              />
            </ToastProvider>
          </Theme>
        </HeaderProvider>
        </RightDrawerProvider>
      </LoaderProvider>
    </TamaguiProvider>
  )
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <MenuProvider>
            <ToastPositionProvider>
              <NotificationsProvider>
                <Root />
              </NotificationsProvider>
            </ToastPositionProvider>
          </MenuProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}