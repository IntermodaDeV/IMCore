import React, { useState, useMemo } from 'react'
import { YStack, Text, View, XStack } from 'tamagui'
import { ScrollView } from 'react-native'
import { Pressable } from 'react-native'
import { Check, ChevronDown } from 'lucide-react-native'

type Option = {
  label: string
  value: string
}

type Props = {
  label: string
  value?: string
  onValueChange?: (value: string) => void
  options: Option[]
  error?: string
  placeholder?: string
}

export default function AppSelect({
  label,
  value,
  onValueChange,
  options,
  error,
  placeholder = 'Seleccionar...',
}: Props) {
  const [open, setOpen] = useState(false)
  const [scrollY, setScrollY] = useState(0)
  const [contentHeight, setContentHeight] = useState(0)
  const [layoutHeight, setLayoutHeight] = useState(0)

  const selectedLabel = useMemo(() => {
    return options.find(o => o.value === value)?.label || ''
  }, [value, options])

  const floating = open || !!value

  return (
    <YStack gap="$1">

      {/* LABEL */}
      <Text
        pointerEvents="none"
        position="absolute"
        left={12}
        top={floating ? -8 : 14}
        fontSize={floating ? 11 : 14}
        color="$textMuted"
        backgroundColor="$background"
        paddingHorizontal={floating ? 6 : 0}
        paddingVertical={floating ? 2 : 0}
        borderRadius={floating ? 6 : 0}
        zIndex={10}
      >
        {label}
      </Text>

      {/* INPUT */}
      <Pressable onPress={() => setOpen(!open)}>
        <View
          height={46}
          borderWidth={1}
          borderRadius={6}
          borderColor={error ? 'red' : '$border'}
          backgroundColor="$background"
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

      {/* DROPDOWN */}
      {open && (
        <View
          position="absolute"
          top={46}
          left={0}
          right={0}
          backgroundColor="$background"
          borderWidth={1}
          borderTopWidth={0}
          borderColor="$border"
          borderBottomLeftRadius={10}
          borderBottomRightRadius={10}
          zIndex={9999}
          elevation={10}
          maxHeight={220}
          overflow="hidden"
        >
          <ScrollView
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            style={{ maxHeight: 220 }}
            contentContainerStyle={{ paddingVertical: 4 }}
            onScroll={(e) => {
              const y = e.nativeEvent.contentOffset.y
              setScrollY(y)
            }}
            onContentSizeChange={(_, h) => {
              setContentHeight(h)
            }}
            onLayout={(e) => {
              setLayoutHeight(e.nativeEvent.layout.height)
            }}
            scrollEventThrottle={16}
          >
            {options.map((option) => (
              <Pressable
                key={option.value}
                onPress={() => {
                  onValueChange?.(option.value)
                  setOpen(false)
                }}
              >
                <XStack
                  padding="$3"
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <Text color="$text">
                    {option.label}
                  </Text>
                  {value === option.value && (
                    <Check size={16} color="green"/>
                  )}
                </XStack>
              </Pressable>
            ))}
          </ScrollView>
        </View>
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