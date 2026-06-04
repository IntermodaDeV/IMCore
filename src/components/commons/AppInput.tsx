import React, { useState } from 'react'
import { Input, YStack, Text, View } from 'tamagui'

type Props = {
  label: string
  error?: string
  suffix?: React.ReactNode
  prefix?: React.ReactNode
  rightElement?: React.ReactNode
  format?: 'text' | 'integer' | 'decimal-pad'
} & React.ComponentProps<typeof Input>

export default function AppInput({
  label,
  error,
  value,
  onFocus,
  onBlur,
  prefix,
  suffix,
  rightElement,
  format = 'text',
  ...props
}: Props) {
  const [focused, setFocused] = useState(false)

  const hasValue = value !== undefined && value !== null && value !== ''
  const floating = focused || hasValue
  const isDecimal = props.keyboardType === 'decimal-pad'
  const isInteger = props.keyboardType === 'numeric'

  const formatValue = (value: string | number | readonly string[]) => {
    if (value === '' || value === null || value === undefined) return ''
    const text = String(value)
    if (props.keyboardType !== 'decimal-pad' && props.keyboardType !== 'numeric') return text
    const number = Number(text.replace(/,/g, ''))
    if (isNaN(number)) return text
    return number.toLocaleString('en-US', {
      minimumFractionDigits: isDecimal ? 2 : 0,
      maximumFractionDigits: isDecimal ? 2 : 0,
    })
  }

  const displayValue = focused
    ? String(value ?? (isDecimal ? '0.00' : ''))
    : formatValue(value ?? (isDecimal ? '0' : ''))

  return (
    <YStack gap="$1">
      <View position="relative" height={56} justifyContent="center">

        <Input
          {...props}
          value={displayValue}
          onFocus={(e) => { setFocused(true); onFocus?.(e) }}
          onBlur={(e) => { setFocused(false); onBlur?.(e) }}
          height={40}
          paddingLeft={prefix ? 35 : '$3'}
          paddingRight={rightElement ? 44 : suffix ? 50 : '$3'}
          borderWidth={1}
          borderColor={error ? 'red' : '$border'}
          backgroundColor="$card2"
          borderRadius={6}
          color="$text"
          fontSize={13}
        />

        {prefix && (
          <View position="absolute" left={20} top={0} bottom={0} justifyContent="center">
            <Text fontSize={17} color="$text">{prefix}</Text>
          </View>
        )}

        {suffix && (
          <View position="absolute" right={12} top={0} bottom={0} justifyContent="center">
            <Text fontSize={17} color="$text">{suffix}</Text>
          </View>
        )}

        {/* rightElement — para íconos interactivos como el ojo */}
        {rightElement && (
          <View position="absolute" right={4} top={0} bottom={0} justifyContent="center">
            {rightElement}
          </View>
        )}

        <Text
          pointerEvents="none"
          position="absolute"
          left={12}
          top={floating ? -2 : 17}
          fontSize={floating ? 11 : 14}
          color="$text"
          backgroundColor="$card2"
          paddingHorizontal={floating ? 6 : 0}
          paddingVertical={floating ? 2 : 0}
          borderRadius={floating ? 6 : 0}
          style={{ zIndex: 10 }}
        >
          {label}
        </Text>

      </View>

      {error && (
        <Text fontSize={10} color="red" marginTop={-5}>
          * {error}
        </Text>
      )}
    </YStack>
  )
}