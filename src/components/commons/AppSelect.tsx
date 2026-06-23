import React, { useState, useMemo, useRef } from 'react'
import { YStack, Text, View, XStack, useTheme } from 'tamagui'
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
  disabled?: boolean
}

const DROPDOWN_MAX_HEIGHT = 220

export default function AppSelect({
  label,
  value,
  onValueChange,
  options,
  error,
  placeholder = '',
  disabled = false,
}: Props) {
  const theme = useTheme()
  const [open, setOpen] = useState(false)
  const [layout, setLayout] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const triggerRef = useRef<any>(null)

  const selectedLabel = useMemo(
    () => options.find(o => String(o.value) === String(value))?.label ?? '',
    [value, options]
  )

  const floating = open || !!value

  const borderColor = disabled
    ? '$border'
    : error ? '$error'
    : open  ? '$primary'
    :          '$border'

  const labelColor: string = disabled
    ? '$textMuted'
    : error && floating ? '$error'
    : open              ? '$text'
    : floating          ? '$text'
    :                     '$textMuted'

  const openDropdown = () => {
    if (disabled) return
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
    <YStack gap="$1" marginBottom="$2">

      {/* Trigger wrapper — paddingTop creates space for the floating label */}
      <View position="relative" paddingTop={8}>
        <Pressable ref={triggerRef} onPress={() => (open ? setOpen(false) : openDropdown())}>
          <View
            borderWidth={1}
            borderRadius={6}
            borderColor={borderColor}
            backgroundColor={disabled ? '$backgroundSurface' : '$backgroundElevated'}
            justifyContent="center"
            paddingHorizontal="$3"
            height={44}
          >
            <XStack justifyContent="space-between" alignItems="center">
              <Text fontSize={13} color={selectedLabel ? '$text' : '$textMuted'}>
                {selectedLabel || placeholder}
              </Text>
              <ChevronDown size={18} color={open ? theme.primary?.val as string : theme.textMuted?.val as string} />
            </XStack>
          </View>
        </Pressable>

        {/* Floating label */}
        <Text
          pointerEvents="none"
          position="absolute"
          left={12}
          top={floating ? 0 : 20}
          fontSize={floating ? 11 : 14}
          color={labelColor}
          backgroundColor={floating ? (disabled ? '$backgroundSurface' : '$backgroundElevated') : 'transparent'}
          paddingHorizontal={floating ? 6 : 0}
          paddingVertical={floating ? 2 : 0}
          borderRadius={floating ? 6 : 0}
          style={{ zIndex: 10 }}
        >
          {label}
        </Text>
      </View>

      {/* Error message */}
      {error && (
        <View flexDirection="row" alignItems="center" gap={4} marginTop={-2}>
          <Text fontSize={11} color="$error">{error}</Text>
        </View>
      )}

      {/* Dropdown */}
      {open && layout && (
        <Modal
          visible
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => setOpen(false)}
        >
          <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)} />

          <View
            position="absolute"
            left={layout.x}
            top={openUpward ? layout.y - estimatedHeight - 4 : layout.y + layout.height + 4}
            width={layout.width}
            backgroundColor="$backgroundElevated"
            borderWidth={1}
            borderColor="$border"
            borderRadius={10}
            maxHeight={DROPDOWN_MAX_HEIGHT}
            overflow="hidden"
            style={{ elevation: 10, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }}
          >
            <ScrollView
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: 4 }}
            >
              {options.map(option => (
                <Pressable
                  key={option.value}
                  onPress={() => {
                    onValueChange?.(option.value)
                    setOpen(false)
                  }}
                >
                  <XStack padding="$3" justifyContent="space-between" alignItems="center">
                    <Text fontSize={13} color="$text">{option.label}</Text>
                    {String(value) === String(option.value) && (
                      <Check size={16} color={theme.primary?.val as string} />
                    )}
                  </XStack>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Modal>
      )}

    </YStack>
  )
}
