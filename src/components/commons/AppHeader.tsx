// AppHeader.tsx

import { Text, XStack, View, useTheme } from 'tamagui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useHeader } from '../../context/HeaderContext'
import { MenuButton } from './MenuBotton'
import { shadows } from '../../theme/shadows';

export function AppHeader({ route, options }: { route: any; options: any }) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { header } = useHeader()

  return (
    <View
      paddingTop={insets.top}
      backgroundColor={theme.background?.val}
      {...shadows.xl}
      position="relative"
      zIndex={100}
    >
      <XStack
        height={50}
        alignItems="center"
        justifyContent="space-between"
        paddingHorizontal={16}
      >
        {/* LEFT */}
        <XStack
          width={60}
          alignItems="center"
          justifyContent="flex-start"
        >
          {header?.left ?? <MenuButton />}
        </XStack>

        {/* CENTER */}
        <XStack
          flex={1}
          alignItems="center"
          justifyContent="center"
        >
          {header?.center ? ( header.center ) : (
            <Text
              color={theme.text?.val}
              fontSize={18}
              fontWeight="700"
              numberOfLines={1}
            >
              {header?.title ?? options.title ?? route.name}
            </Text>
          )}
        </XStack>

        {/* RIGHT */}
        <XStack
          width={60}
          alignItems="center"
          justifyContent="flex-end"
        >
          {typeof header?.right === 'string'
            ? <Text>{header.right}</Text>
            : header?.right ?? <Text></Text>}
        </XStack>
      </XStack>
    </View>
  )
}