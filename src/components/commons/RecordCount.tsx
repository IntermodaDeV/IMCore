import React from 'react'
import { Platform } from 'react-native'
import { XStack, Text } from 'tamagui'

type RecordCountProps = {
  count: number
  label?: string
}

export default function RecordCount({ count, label = 'Registros' }: RecordCountProps) {
  return (
    <XStack
      alignItems="center"
      justifyContent="space-between"
      paddingTop="$2"
      marginBottom={Platform.OS === 'ios' ? '$2' : 0}
    >
      <Text
        fontSize="$2"
        color="$textMuted"
        fontWeight="500"
      >
        {label}
      </Text>

      <XStack
        backgroundColor="$primaryOpacity"
        borderRadius="$10"
        paddingHorizontal="$3"
        minWidth={32}
        justifyContent="center"
      >
        <Text
          fontSize="$2"
          color="$primary"
          fontWeight="700"
        >
          {count}
        </Text>
      </XStack>
    </XStack>
  )
}