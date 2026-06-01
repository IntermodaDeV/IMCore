import React, { ReactNode, useLayoutEffect } from 'react'
import { TouchableOpacity } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { XStack, useTheme } from 'tamagui'

export interface HeaderAction {
  icon: React.ComponentType<any>
  onPress: () => void
}

interface PageProps {
  children: ReactNode
  headerActions?: HeaderAction[]
}

interface HeaderActionsProps {
  actions: HeaderAction[]
  color: string
}

function HeaderActions({ actions, color }: HeaderActionsProps) {
  return (
    <XStack
      gap="$5"
      paddingRight="$5"
      alignItems="center"
    >
      {actions.map((action, index) => {
        const Icon = action.icon

        return (
          <TouchableOpacity
            key={index}
            onPress={action.onPress}
            activeOpacity={0.7}
          >
            <Icon
              size={24}
              color={color}
            />
          </TouchableOpacity>
        )
      })}
    </XStack>
  )
}

export default function Page({ children, headerActions = [] }: PageProps) {
  const navigation = useNavigation()
  const theme = useTheme()
  const primaryColor = theme.primary?.val ?? '#FF551A'

  useLayoutEffect(() => {
    navigation.setOptions({
      // eslint-disable-next-line react/no-unstable-nested-components
      headerRight: () => (
        <HeaderActions
          actions={headerActions}
          color={primaryColor}
        />
      ),
    })
  }, [ navigation, headerActions, primaryColor])

  return <>{children}</>
}