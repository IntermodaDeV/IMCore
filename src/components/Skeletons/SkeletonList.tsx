import React, { useEffect, useRef } from 'react'
import { ScrollView, View, XStack, YStack } from 'tamagui'
import { Animated, Easing } from 'react-native'

export function SkeletonBox({
  width = '100%',
  height = 12,
  radius = 6,
}: {
  width?: any
  height?: number
  radius?: number
}) {
  const shimmer = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start()
  }, [])

  const translateX = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-100, 300],
  })

  return (
    <View
      width={width}
      height={height}
      borderRadius={radius}
      backgroundColor="$card"
      overflow="hidden"
    >
      <Animated.View
        style={{
          position: 'absolute',
          width: 60,
          height: '100%',
          backgroundColor: 'rgba(255,255,255,0.15)',
          transform: [{ translateX }],
        }}
      />
    </View>
  )
}

export default function SkeletonList() {
  return (
    <ScrollView
        showsVerticalScrollIndicator={false}
        marginBottom="$3"
        >
        <YStack gap="$2" paddingBottom="$4">

        {Array.from({ length: 6 }).map((_, i) => (
          <View
            key={i}
            backgroundColor="$backgroundPage"
            borderRadius={10}
            padding="$3"
            marginBottom="$2"
            >
            <YStack gap="$3">

                {/* HEADER */}
                <XStack justifyContent="space-between" alignItems="center">
                <YStack gap="$2">
                    <SkeletonBox width={140} height={26} />
                    {/* <SkeletonBox width={90} height={10} /> */}
                </YStack>

                <XStack gap="$2" alignItems="center">
                    <SkeletonBox width={60} height={18} radius={999} />
                </XStack>
                </XStack>

                {/* BODY */}
                <YStack gap="$2">
  

                <XStack justifyContent="space-between">
                    <SkeletonBox width={150} height={10} />
                </XStack>
                </YStack>

                {/* FOOTER */}
                <SkeletonBox width={180} height={10} />
            </YStack>
            </View>
        ))}

        </YStack>
    </ScrollView>
  )
}