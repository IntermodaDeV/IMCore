import React from 'react'
import { createStaticNavigation } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'

import LoginScreen from '../screens/LoginScreen'
import HomeScreen from '../screens/HomeScreen'
import AprobacionSolicitudCompra from '../screens/CadenaSuministro/AprobacionSolicitudCompra'
const RootStack = createNativeStackNavigator({
  screens: {
    Login: {
      screen: LoginScreen,
      options: {
        headerShown: false,
      },
    },
    Home: {
      screen: HomeScreen,
      options: {
        headerShown: false,
      },
    },
    aprobacionSC:{
      screen: AprobacionSolicitudCompra
    }
  },
})

const Navigation = createStaticNavigation(RootStack)

export default function AppNavigator() {
  return <Navigation />
}