import React, { useEffect, useRef } from 'react'
import { Animated, Easing } from 'react-native'
import { XStack } from 'tamagui'

const BALL_SIZE = 20
const WAVE_HEIGHT = 20
const DURATION = 900

export function PullLoader() {
  const anims = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current

  useEffect(() => {
    const animations = anims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 120),
          Animated.timing(anim, {
            toValue: -WAVE_HEIGHT,
            duration: DURATION / 2,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: DURATION / 2,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      )
    )

    animations.forEach(a => a.start())
    return () => animations.forEach(a => a.stop())
  }, [])

  const colors = ['#FF551A', '#9E9E9E', '#0D1C32']

  return (
    <XStack gap={6} justifyContent="center" alignItems="center" paddingVertical={10} marginTop="$5">
      {anims.map((anim, i) => (
        <Animated.View
          key={i}
          style={{
            width: BALL_SIZE,
            height: BALL_SIZE,
            borderRadius: BALL_SIZE / 2,
            backgroundColor: colors[i],
            transform: [{ translateY: anim }],
          }}
        />
      ))}
    </XStack>
  )
}