import React from 'react'
import { ScrollView, YStack, XStack } from 'tamagui'
import { SkeletonBox } from './SkeletonList'

export default function SkeletonForm() {
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      padding="$4"
    >
      <YStack gap="$4">

        {Array.from({ length: 9 }).map((_, index) => (
          <YStack key={index} gap="$1">
            <SkeletonBox width={100} height={12} />
            <SkeletonBox width="100%" height={32} radius={8} />
          </YStack>
        ))}

        {/* Footer */}
        <XStack
          paddingTop="$2"
          paddingBottom="$4"
          gap="$3"
          marginBottom="$3"
        >
          <SkeletonBox
            width="48%"
            height={45}
            radius={8}
          />

          <SkeletonBox
            width="48%"
            height={45}
            radius={8}
          />
        </XStack>

      </YStack>
    </ScrollView>
  )
}