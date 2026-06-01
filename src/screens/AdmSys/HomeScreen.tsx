import React from 'react'
import { YStack, Image, Text } from 'tamagui'
import { useNavigation } from '@react-navigation/native'
import { ImageBackground } from 'react-native'

export default function HomeScreen() {
  const navigation = useNavigation()

  return (
    <ImageBackground
      source={require('../../assets/bg-intermoda-entrada.png')}
      resizeMode="cover"
      style={{ flex: 1 }}
    >
      <YStack
        flex={1}
        justifyContent="flex-end"
        alignItems="center"
        paddingBottom="$10"
        backgroundColor="#1e3a5fc7"
      >
        <YStack position="absolute" top={120} alignItems="center" width="100%">
          <Image
            source={require('../../assets/logo.png')}
            style={{
              width: 300,
              height: 220,
              resizeMode: 'contain',
              tintColor: 'white',
            }}
          />
        </YStack>
      </YStack>
    </ImageBackground>
  )
}