import React, { useState, useMemo, useRef } from 'react'
import { YStack, Text, View, XStack } from 'tamagui'
import { ScrollView, Modal, Pressable, Dimensions } from 'react-native'
import { Check, ChevronDown } from 'lucide-react-native'

type Option = {
  label: string
  value: string
}

type Props = {
  label: string
  value?: string | number
  onValueChange?: (value: string | number) => void
  options: Option[]
  error?: string
  placeholder?: string
}

const DROPDOWN_MAX_HEIGHT = 220

export default function AppSelect({
  label,
  value,
  onValueChange,
  options,
  error,
  placeholder = '',
}: Props) {
  const [open, setOpen] = useState(false)
  const [layout, setLayout] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const triggerRef = useRef<any>(null)

  const selectedLabel = useMemo(() => {
    return options.find(o => o.value === value)?.label || ''
  }, [value, options])

  const floating = open || !!value

  const openDropdown = () => {
    triggerRef.current?.measureInWindow((x: number, y: number, width: number, height: number) => {
      setLayout({ x, y, width, height })
      setOpen(true)
    })
  }

  const screenHeight = Dimensions.get('window').height
  const estimatedHeight = Math.min(DROPDOWN_MAX_HEIGHT, options.length * 44 + 8)
  const spaceBelow = layout ? screenHeight - (layout.y + layout.height) : 0
  const openUpward = layout ? spaceBelow < estimatedHeight && layout.y > estimatedHeight : false

  return (
    <YStack gap="$1" marginTop="$2">

      {/* LABEL */}
      <Text
        pointerEvents="none"
        position="absolute"
        left={12}
        top={floating ? -6 : 17}
        fontSize={floating ? 11 : 14}
        color="$textMuted"
        backgroundColor="$backgroundElevated"
        paddingHorizontal={floating ? 6 : 0}
        paddingVertical={floating ? 2 : 0}
        borderRadius={floating ? 6 : 0}
        zIndex={10}
      >
        {label}
      </Text>

      {/* INPUT */}
      <Pressable onPress={() => (open ? setOpen(false) : openDropdown())}>
        <View
          ref={triggerRef}
          height={40}
          borderWidth={1}
          borderRadius={6}
          borderColor={error ? 'red' : '$border'}
          backgroundColor="$backgroundElevated"
          justifyContent="center"
          paddingHorizontal="$3"
        >
          <XStack justifyContent="space-between" alignItems="center">
            <Text color={value ? '$text' : '$textMuted'}>
              {selectedLabel || placeholder}
            </Text>
            <ChevronDown size={18} color="#666" />
          </XStack>
        </View>
      </Pressable>

      {/* DROPDOWN — en Modal para que no se corte con overflow del padre */}
      {open && layout && (
        <Modal
          visible
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => setOpen(false)}
        >
          {/* Backdrop: cierra al tocar fuera */}
          <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)} />

          <View
            position="absolute"
            left={layout.x}
            top={
              openUpward
                ? layout.y - estimatedHeight - 4
                : layout.y + layout.height + 4
            }
            width={layout.width}
            backgroundColor="$backgroundElevated"
            borderWidth={1}
            borderColor="$border"
            borderRadius={10}
            maxHeight={DROPDOWN_MAX_HEIGHT}
            overflow="hidden"
            elevation={10}
            shadowColor="#000"
            shadowOpacity={0.15}
            shadowRadius={8}
            shadowOffset={{ width: 0, height: 4 }}
          >
            <ScrollView
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: 4 }}
            >
              {options.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => {
                    onValueChange?.(option.value)
                    setOpen(false)
                  }}
                >
                  <XStack padding="$3" justifyContent="space-between" alignItems="center">
                    <Text color="$text">{option.label}</Text>
                    {value === option.value && <Check size={16} color="green" />}
                  </XStack>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Modal>
      )}

      {/* ERROR */}
      {error && (
        <Text fontSize={11} color="red">
          {error}
        </Text>
      )}

    </YStack>
  )
}