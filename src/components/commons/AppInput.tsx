import React, { useState } from 'react'
import { Input, YStack, Text, View, useTheme } from 'tamagui'
import { CheckCircle2, AlertCircle, AlertTriangle } from 'lucide-react-native'

export type InputStatus = 'default' | 'error' | 'success' | 'warning'

const STATUS_BORDER_TOKEN: Record<InputStatus, string> = {
  default: '$border',
  error:   '$error',
  success: '$success',
  warning: '$warning',
}

const STATUS_ICON: Partial<Record<InputStatus, React.ComponentType<any>>> = {
  error:   AlertCircle,
  success: CheckCircle2,
  warning: AlertTriangle,
}

const LINE_HEIGHT = 22

type Props = {
  label: string
  status?: InputStatus
  statusMessage?: string
  error?: string
  prefix?: React.ReactNode
  suffix?: React.ReactNode
  rightElement?: React.ReactNode
  multiline?: boolean
  minLines?: number
  maxLines?: number
  format?: 'text' | 'integer' | 'decimal-pad'
  disabled?: boolean
  placeholder?: string
} & Omit<React.ComponentProps<typeof Input>, 'prefix' | 'multiline' | 'disabled' | 'placeholder'>

export default function AppInput({
  label,
  status,
  statusMessage,
  error,
  value,
  onFocus,
  onBlur,
  prefix,
  suffix,
  rightElement,
  multiline = false,
  minLines = 3,
  maxLines,
  format = 'text',
  disabled = false,
  placeholder,
  ...props
}: Props) {
  const theme = useTheme()
  const [focused, setFocused]         = useState(false)
  const [inputHeight, setInputHeight] = useState(minLines * LINE_HEIGHT + 24)

  const hasValue  = value !== undefined && value !== null && value !== ''
  const hasPrefix = prefix !== undefined && prefix !== null
  const hasSuffix = suffix !== undefined || rightElement !== undefined
  // Force float when there's a prefix — label at center would overlap the prefix area
  const floating  = focused || hasValue || hasPrefix

  const isDecimal = props.keyboardType === 'decimal-pad'
  const isInteger = props.keyboardType === 'numeric'

  const resolvedStatus: InputStatus = error ? 'error' : (status ?? 'default')
  const resolvedMessage             = statusMessage ?? error

  const borderColor = disabled
    ? '$border'
    : resolvedStatus !== 'default'
      ? STATUS_BORDER_TOKEN[resolvedStatus]
      : focused ? '$primary' : '$border'

  const labelColor: string = disabled
    ? '$textMuted'
    : resolvedStatus !== 'default' && floating
      ? `$${resolvedStatus}`
      : floating ? '$text' : '$textMuted'

  const iconColorMap: Partial<Record<InputStatus, string>> = {
    error:   theme.error?.val,
    success: theme.success?.val,
    warning: theme.warning?.val,
  }
  const statusIconColor = iconColorMap[resolvedStatus] ?? theme.error?.val

  const formatValue = (v: string | number | readonly string[]) => {
    if (v === '' || v === null || v === undefined) return ''
    const text = String(v)
    if (!isDecimal && !isInteger) return text
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

  const minHeight       = minLines * LINE_HEIGHT + 24
  const maxHeight       = maxLines ? maxLines * LINE_HEIGHT + 24 : undefined
  // When no maxLines is given, cap at minHeight so the textarea stays fixed and scrolls.
  // If maxLines > minLines, the input grows up to maxLines and then scrolls.
  const effectiveCap    = multiline ? (maxHeight ?? minHeight) : undefined

  const handleContentSizeChange = (e: any) => {
    if (!multiline) return
    const contentH = e.nativeEvent.contentSize.height
    const newH     = Math.max(minHeight, contentH + 24)
    setInputHeight(effectiveCap ? Math.min(newH, effectiveCap) : newH)
  }

  // Single-line: View has paddingTop=8 so the floating label (top=0) sits on the Input border.
  // Unfloated label (top=20) sits visually centered inside the 44px Input.
  const labelTop = floating
    ? (multiline ? -8 : 0)
    : (multiline ? 24 : 20)

  const renderSlot = (content: React.ReactNode) => {
    if (typeof content === 'string' || typeof content === 'number') {
      return <Text fontSize={14} color={disabled ? '$textDisabled' : '$text'}>{content}</Text>
    }
    return <>{content}</>
  }

  const MessageIcon = resolvedStatus !== 'default' ? STATUS_ICON[resolvedStatus] : null

  // Only show the placeholder prop text when the label is already floating;
  // when unfloated the label itself acts as the visual placeholder.
  const visiblePlaceholder = floating ? (placeholder ?? '') : ''

  return (
    <YStack gap="$1" marginBottom="$2">
      <View
        position="relative"
        // paddingTop=8 creates space above the Input border for the floating label.
        // No fixed height or justifyContent — avoids the iOS unequal top/bottom padding bug.
        paddingTop={multiline ? undefined : 8}
        minHeight={multiline ? minHeight : undefined}
        paddingBottom={multiline ? '$1' : undefined}
      >
        <Input
          {...props}
          value={displayValue}
          placeholder={visiblePlaceholder}
          placeholderTextColor={theme.textMuted?.val as any}
          multiline={multiline}
          scrollEnabled={multiline}
          showsVerticalScrollIndicator={multiline}
          textAlignVertical={multiline ? 'top' : 'auto'}
          {...({ editable: !disabled } as any)}
          onFocus={e => { if (!disabled) { setFocused(true); onFocus?.(e) } }}
          onBlur={e  => { setFocused(false); onBlur?.(e) }}
          onContentSizeChange={handleContentSizeChange}
          height={multiline ? inputHeight : 44}
          paddingLeft={hasPrefix ? 44 : '$3'}
          paddingRight={hasSuffix ? 44 : '$3'}
          paddingTop={multiline ? 22 : undefined}
          borderWidth={1}
          borderColor={borderColor}
          backgroundColor={disabled ? '$backgroundSurface' : '$backgroundElevated'}
          borderRadius={6}
          color={disabled ? '$textDisabled' : '$text'}
          fontSize={13}
          textAlign={'left' }
        />

        {/* Prefix slot */}
        {hasPrefix && (
          <View
            position="absolute"
            left={10}
            top={multiline && floating ? 22 : 8}
            bottom={multiline ? undefined : 0}
            justifyContent="center"
          >
            {renderSlot(prefix)}
          </View>
        )}

        {/* Suffix slot */}
        {hasSuffix && (
          <View
            position="absolute"
            right={4}
            top={multiline && floating ? 22 : 8}
            bottom={multiline ? undefined : 0}
            justifyContent="center"
          >
            {renderSlot(suffix ?? rightElement)}
          </View>
        )}

        {/* Floating label */}
        <Text
          pointerEvents="none"
          position="absolute"
          left={12}
          top={labelTop}
          fontSize={floating ? 11 : 14}
          color={labelColor}
          // Background only needed when floating to cut through the Input border
          backgroundColor={floating ? (disabled ? '$backgroundSurface' : '$backgroundElevated') : 'transparent'}
          paddingHorizontal={floating ? 6 : 0}
          paddingVertical={floating ? 2 : 0}
          borderRadius={floating ? 6 : 0}
          style={{ zIndex: 10 }}
        >
          {label}
        </Text>
      </View>

      {resolvedMessage ? (
        <View flexDirection="row" alignItems="center" gap={4} marginTop={-2}>
          {MessageIcon && <MessageIcon size={12} color={statusIconColor} />}
          <Text fontSize={11} color={`$${resolvedStatus}` as any}>
            {resolvedMessage}
          </Text>
        </View>
      ) : null}
    </YStack>
  )
}
