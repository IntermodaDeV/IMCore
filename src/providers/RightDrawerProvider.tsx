import React, { createContext, useContext, useState, useCallback } from 'react'
import { Dimensions, Modal, Pressable, StyleSheet, View as RNView } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated'
import { View, Text, XStack, useTheme } from 'tamagui'
import { X } from 'lucide-react-native'

const DRAWER_WIDTH = Math.min(Dimensions.get('window').width * 0.85, 380)

type Options = { title?: string }

type DrawerContextType = {
  openDrawer: (content: React.ReactNode, options?: Options) => void
  closeDrawer: () => void
}

const RightDrawerContext = createContext<DrawerContextType>({
  openDrawer: () => {},
  closeDrawer: () => {},
})

function DrawerPanel({
  title,
  onClose,
  children,
}: {
  title?: string
  onClose: () => void
  children: React.ReactNode
}) {
  const theme = useTheme()

  return (
    <View flex={1} backgroundColor="$backgroundElevated" shadowColor="#000" shadowOpacity={0.2} shadowRadius={16} shadowOffset={{ width: -4, height: 0 }}>
      <XStack
        paddingHorizontal="$4"
        paddingTop={52}
        paddingBottom={14}
        alignItems="center"
        justifyContent="space-between"
        borderBottomWidth={1}
        borderBottomColor="$border"
      >
        <Text fontSize={16} fontWeight="700" color="$text">
          {title ?? ''}
        </Text>
        <Pressable onPress={onClose} hitSlop={12}>
          <X size={20} color={theme.textMuted?.val as string} />
        </Pressable>
      </XStack>

      <View flex={1}>
        {children}
      </View>
    </View>
  )
}

export function RightDrawerProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false)
  const [drawerContent, setDrawerContent] = useState<React.ReactNode>(null)
  const [title, setTitle] = useState<string | undefined>()
  const translateX = useSharedValue(DRAWER_WIDTH)

  const openDrawer = useCallback((content: React.ReactNode, opts?: Options) => {
    setDrawerContent(content)
    setTitle(opts?.title)
    setVisible(true)
    translateX.value = withTiming(0, { duration: 280 })
  }, [translateX])

  const closeDrawer = useCallback(() => {
    translateX.value = withTiming(DRAWER_WIDTH, { duration: 240 }, (finished) => {
      if (finished) runOnJS(setVisible)(false)
    })
  }, [translateX])

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }))

  return (
    <RightDrawerContext.Provider value={{ openDrawer, closeDrawer }}>
      {children}
      <Modal
        visible={visible}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={closeDrawer}
      >
        <RNView style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeDrawer} />
          <Animated.View style={[styles.drawer, animatedStyle]}>
            <DrawerPanel title={title} onClose={closeDrawer}>
              {drawerContent}
            </DrawerPanel>
          </Animated.View>
        </RNView>
      </Modal>
    </RightDrawerContext.Provider>
  )
}

export const useRightDrawer = () => useContext(RightDrawerContext)

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  drawer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
  },
})
