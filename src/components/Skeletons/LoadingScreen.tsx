import React, { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet } from 'react-native'
import { View, Text, YStack } from 'tamagui'

type Props = {
  text?: string
  duration?: number
  onFinish?: () => void
}

const BALL_SIZE = 32
const WAVE_HEIGHT = 18
const DURATION = 1100

export default function LoadingScreen({
  text = 'Cargando...',
  duration = 2000,
  onFinish,
}: Props) {
  useEffect(() => {
    if (!onFinish) return

    const timer = setTimeout(() => {
      onFinish()
    }, duration)

    return () => clearTimeout(timer)
  }, [onFinish, duration])
  const anims = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current

  useEffect(() => {
    const animations = anims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 180),
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

  const balls = [
    { color: '#FF5722' },
    { color: '#9E9E9E' },
    { color: '#1A2F4E' },
  ]

  return (
    <View style={styles.container}>
      <YStack alignItems="center" gap="$4">
        {/* Loader */}
        <View style={styles.row}>
          {balls.map((ball, i) => (
            <Animated.View
              key={i}
              style={[
                styles.ball,
                { backgroundColor: ball.color },
                { transform: [{ translateY: anims[i] }] },
              ]}
            />
          ))}
        </View>

        {/* Texto */}
        <Text style={styles.text}>{text}</Text>

        {/* Subtexto opcional */}
        <Text style={styles.subtext}>IMCore</Text>
      </YStack>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1c32', // 🔵 azul oscuro base IMCore
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: BALL_SIZE + WAVE_HEIGHT,
  },
  ball: {
    width: BALL_SIZE,
    height: BALL_SIZE,
    borderRadius: BALL_SIZE / 2,
  },
  text: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  subtext: {
    color: '#FF551A', // naranja marca
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
})