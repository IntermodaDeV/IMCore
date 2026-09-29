import React from 'react'
import { ImageBackground } from 'react-native'
import { XStack, YStack, Text, useTheme, useThemeName } from 'tamagui'
import { useAuth } from '../../context/AuthContext'

/**
 * La card de bienvenida del inicio.
 *
 * Vive aparte porque la comparten DOS inicios: el general y el de seguridad.
 * Duplicarla habría hecho que el saludo se desincronizara en cuanto alguien
 * tocara uno de los dos — y el saludo es lo primero que ve cualquiera al abrir
 * la app.
 *
 * Lo único que cambia entre los dos es la línea de abajo: a un jefe de área se
 * le habla de su centro de operaciones; a un guardia parado en el portón, de lo
 * que tiene que hacer ahí. Por eso `mensaje` es una prop y no está escrito
 * adentro.
 */
export default function CardSaludo({ mensaje }: { mensaje: string }) {
  const { user } = useAuth()
  const theme = useTheme()
  const themeName = useThemeName()

  /* El banner sigue al tema. Se resuelve en el render y no en un efecto: es una
     constante derivada del tema, y un efecto solo agregaría un parpadeo con el
     banner equivocado en el primer cuadro. */
  const banner = themeName === 'dark'
    ? require('../../assets/banner-dark.png')
    : require('../../assets/Banner.png')

  const hora = new Date().getHours()
  const saludo = hora < 12 ? 'BUENOS DÍAS' : hora < 19 ? 'BUENAS TARDES' : 'BUENAS NOCHES'

  return (
    <ImageBackground
      source={banner}
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
          {saludo},
        </Text>

        <XStack alignItems="center" marginBottom="$2">
          <Text fontSize={25} fontWeight="700" color={theme.text?.val}>
            Hola, {user?.Name ?? 'Usuario'}
          </Text>
          <Text fontSize={22} marginLeft="$2">👋</Text>
        </XStack>

        <Text fontSize={14} color={theme.textMuted?.val} lineHeight={22}>
          {mensaje}
        </Text>
      </YStack>
    </ImageBackground>
  )
}
