import React from 'react'
import { Toast, useToastState } from '@tamagui/toast'
import { YStack, XStack } from 'tamagui'

const colors = {
  success: '#16a34a',
  error: '#dc2626',
  warning: '#f59e0b',
  info: '#2563eb',
}

export const CustomToast = () => {
  const currentToast = useToastState()
  if (!currentToast) return null

  const type = currentToast.customData?.type as keyof typeof colors
  const color = colors[type] || colors.info

  const title =
    typeof currentToast.title === 'function'
      ? currentToast.title()
      : currentToast.title

  const message =
    typeof currentToast.message === 'function'
      ? currentToast.message()
      : currentToast.message ??
        (typeof currentToast.description === 'function'
          ? currentToast.description()
          : currentToast.description)

  return (
    <Toast
      key={currentToast.id}
      borderLeftWidth={5}
      borderLeftColor={color}
      width={320}
      backgroundColor="$background"
      padding="$3"
      margin="$2"
      borderRadius={10}
    >
      <XStack gap="$2" alignItems="center">
        <YStack flex={1}>
          {title && (
            <Toast.Title color="$text" fontWeight="600" size="$3">
              {title}
            </Toast.Title>
          )}

          {message && (
            <Toast.Description color="$text" size="$2">
              {message}
            </Toast.Description>
          )}

        </YStack>
      </XStack>
    </Toast>
  )
}