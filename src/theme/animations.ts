import { createAnimations } from '@tamagui/animations-react-native'

export const animations = createAnimations({
  fast: {
    type: 'timing',
    duration: 150,
  },
  medium: {
    type: 'timing',
    duration: 250,
  },
  slow: {
    type: 'timing',
    duration: 400,
  },
})