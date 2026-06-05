import React from 'react'
import { TamaguiProvider, Text, Theme, View } from 'tamagui'
import { config } from './src/theme/tamagui.config'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import LoginScreen from './src/screens/AdmSys/LoginScreen'
import DrawerNavigator from './src/navigation/DrawerNavigator'
import { AuthProvider, useAuth } from './src/context/AuthContext'
import { MenuProvider } from './src/context/MenuContext'
import LoadingScreen from './src/components/Skeletons/LoadingScreen'
import AccessForm from './src/screens/Security/Access/AccessForm'
import MenuForm from './src/screens/Security/Menu/MenuForm'
import RolesForm from './src/screens/Security/Roles/RolesForm'
import UsersForm from './src/screens/Security/Users/UsersForm,'

function Root() {
  const { theme, loading, user } = useAuth()
  const Stack = createNativeStackNavigator()
  
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
  // if (loading) return null

  if (loading) {
    return <LoadingScreen text="Iniciando sesión..." />
  }
  return (
    <TamaguiProvider config={config} defaultTheme={theme}>
      <Theme name={theme}>
        <NavigationContainer>
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
    
                <Stack.Screen
                  name="access_form"
                  component={AccessForm}
                  options={{
                    headerShown: true,
                    title: 'Nuevo acceso',
                    headerStyle: {
                      backgroundColor: navColors.background,
                    },
                    headerTitleStyle: {
                      fontSize: 16,
                      fontWeight: '600',
                    },
                    headerTintColor: navColors.text,
                  }}
                />

                <Stack.Screen
                  name="menu_form"
                  component={MenuForm}
                  options={{
                    headerShown: true,
                    title: 'Nuevo menú',
                    headerStyle: {
                      backgroundColor: navColors.background,
                    },
                    headerTitleStyle: {
                      fontSize: 16,
                      fontWeight: '600',
                    },
                    headerTintColor: navColors.text,
                  }}
                />

                <Stack.Screen
                  name="users_form"
                  component={UsersForm}
                  options={{
                    headerShown: true,
                    title: 'Nuevo usuario',
                    headerStyle: {
                      backgroundColor: navColors.background,
                    },
                    headerTitleStyle: {
                      fontSize: 16,
                      fontWeight: '600',
                    },
                    headerTintColor: navColors.text,
                  }}
                />

                
                <Stack.Screen
                  name="rolls_form"
                  component={RolesForm}
                  options={{
                    headerShown: true,
                    title: 'Nuevo rol',
                    headerStyle: {
                      backgroundColor: navColors.background,
                    },
                    headerTitleStyle: {
                      fontSize: 16,
                      fontWeight: '600',
                    },
                    headerTintColor: navColors.text,
                  }}
                />
              </>
            ) : (
              <Stack.Screen name="Login" component={LoginScreen} />
            )
            }
          </Stack.Navigator>

          <View
            position="absolute"
            bottom={10}
            right={12}
            pointerEvents="none"
          >
            <Text color="$textMuted" fontSize={11}>
              IMCore v1.0
            </Text>
          </View>

        </NavigationContainer>
      </Theme>
    </TamaguiProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <MenuProvider>
        <Root />
      </MenuProvider>
    </AuthProvider>
  )
}