import React, { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, View, Text } from 'react-native'

type Props = {
  text?: string
}

const BALL_SIZE = 32
const WAVE_HEIGHT = 18
const DURATION = 1100

export default function LoadingScreen({ text = 'Cargando...' }: Props) {
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
    { color: '#FF5722', anim: anims[0] },
    { color: '#9E9E9E', anim: anims[1] },
    { color: '#1A2F4E', anim: anims[2] },
  ]

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {balls.map((ball, i) => (
          <Animated.View
            key={i}
            style={[
              styles.ball,
              { backgroundColor: ball.color },
              { transform: [{ translateY: ball.anim }] },
            ]}
          />
        ))}
      </View>

      {text ? <Text style={styles.label}>{text}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
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
  label: {
    fontSize: 14,
    color: '#888',
    letterSpacing: 0.3,
  },
})