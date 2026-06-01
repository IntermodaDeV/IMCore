import React, { useState, useMemo } from 'react'
import { YStack, Text, View, Input, XStack } from 'tamagui'
import { Pressable } from 'react-native'
import DatePicker from 'react-native-date-picker'
import { Calendar } from 'lucide-react-native'

type Props = {
  label: string
  value?: string | Date
  onChangeText: (value: string) => void
  error?: string
}

export default function AppDateInput({
  label,
  value,
  onChangeText,
  error,
}: Props) {
  const [open, setOpen] = useState(false)

  const date = useMemo(() => {
    return value ? new Date(value) : new Date()
  }, [value])

  const displayValue = value
    ? new Date(value).toLocaleDateString('es-HN')
    : ''

  const floating = open || !!value

  const handleConfirm = (d: Date) => {
    const iso = d.toISOString().split('T')[0]
    onChangeText(iso)
    setOpen(false)
  }

  return (
    <YStack gap="$1">

      <View position="relative" height={56} justifyContent="center">

        {/* TRIGGER */}
        <Pressable onPress={() => setOpen(true)}>
            <View pointerEvents="none">
                <Input
                value={displayValue}
                height={46}
                paddingHorizontal="$3"
                borderWidth={1}
                borderColor={error ? 'red' : '$border'}
                backgroundColor="$background"
                borderRadius={6}
                color="$text"
                />
            </View>

            {/* ICON */}
            <View
            position="absolute"
            right={12}
            top={0}
            bottom={0}
            justifyContent="center"
            >
            <Calendar size={18} color="#666" />
            </View>
        </Pressable>

        {/* LABEL */}
        <Text
          pointerEvents="none"
          position="absolute"
          left={12}
          top={floating ? -6 : 14}
          fontSize={floating ? 11 : 14}
          color="$textMuted"
          backgroundColor="$background"
          paddingHorizontal={floating ? 6 : 0}
          borderRadius={floating ? 6 : 0}
          zIndex={10}
        >
          {label}
        </Text>

      </View>

      {error && (
        <Text fontSize={11} color="red">
          {error}
        </Text>
      )}

      {/* MODAL DATE PICKER */}
      <DatePicker
        modal
        open={open}
        date={date}
        mode="date"
        onConfirm={handleConfirm}
        onCancel={() => setOpen(false)}
      />

    </YStack>
  )
}