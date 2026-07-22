import React, { useState, useEffect } from 'react'
import { Modal, Pressable } from 'react-native'
import { YStack, Text, View, XStack, useTheme, Button } from 'tamagui'
import { CalendarDays, X } from 'lucide-react-native'
import DateTimePicker from 'react-native-ui-datepicker'
import dayjs from 'dayjs'
import 'dayjs/locale/es'

type BaseProps = {
  label: string
  displayFormat?: string
  direction?: 'past' | 'future'
  minDate?: string
  maxDate?: string
  error?: string
  disabled?: boolean
}

type SingleProps = BaseProps & {
  mode?: 'single'
  value?: string | null
  onChange: (date: string | null) => void
  startDate?: never
  endDate?: never
  onRangeChange?: never
}

type RangeProps = BaseProps & {
  mode: 'range'
  value?: never
  onChange?: never
  startDate?: string | null
  endDate?: string | null
  onRangeChange: (start: string | null, end: string | null) => void
}

type Props = SingleProps | RangeProps

function buildRangeDisplay(start?: string | null, end?: string | null): string {
  if (!start && !end) return ''
  const s = start ? dayjs(start).format('DD/MM/YYYY') : '...'
  const e = end   ? dayjs(end).format('DD/MM/YYYY')   : '...'
  return `${s} – ${e}`
}

export default function AppDatePicker(props: Props) {
  const { label, displayFormat = 'DD/MM/YYYY', direction, minDate: minDateProp, maxDate: maxDateProp, error, disabled = false } = props
  const theme = useTheme()
  const [open, setOpen] = useState(false)

  const isRange = props.mode === 'range'

  // Temp state para range — solo se confirma al presionar "Aplicar"
  const [tempStart, setTempStart] = useState<string | null>(null)
  const [tempEnd,   setTempEnd]   = useState<string | null>(null)

  useEffect(() => {
    if (open && isRange) {
      setTempStart(props.startDate ?? null)
      setTempEnd(props.endDate ?? null)
    }
  }, [open])

  const today = dayjs()

  const displayValue = isRange
    ? buildRangeDisplay(props.startDate, props.endDate)
    : (() => {
        const raw = props.value ? dayjs(props.value).locale('es').format(displayFormat) : ''
        return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : ''
      })()

  const hasValue = isRange
    ? !!(props.startDate || props.endDate)
    : !!props.value

  const floating = open || hasValue

  const borderColor = disabled ? '$border'
    : error ? '$error'
    : open   ? '$primary'
    :          '$border'

  const labelColor: string = disabled         ? '$textMuted'
    : error && floating ? '$error'
    : open || floating  ? '$text'
    :                     '$textMuted'

  const primaryVal = theme.primary?.val as string

  const calendarStyles = {
    selected:             { backgroundColor: primaryVal, borderRadius: 8 },
    selected_label:       { color: '#ffffff' },
    range_fill:           { backgroundColor: `${primaryVal}28` },
    range_fill_label:     { color: primaryVal },
    today_label:          { color: primaryVal, fontWeight: '600' as const },
    day_label:            { color: theme.text?.val as string },
    disabled_label:       { color: theme.textMuted?.val as string, opacity: 0.4 },
    outside_label:        { color: theme.textMuted?.val as string, opacity: 0.3 },
    month_selector_label: { color: theme.text?.val as string, textTransform: 'capitalize' as const },
    year_selector_label:  { color: theme.text?.val as string },
    weekdays:             { marginTop: 8 },
    weekday_label:        { color: theme.textMuted?.val as string },
    header:               { backgroundColor: 'transparent', borderBottomWidth: 1, borderBottomColor: `${theme.border?.val}80`, paddingHorizontal: 8, paddingVertical: 10 },
    button_next_image:    { tintColor: theme.text?.val as string },
    button_prev_image:    { tintColor: theme.text?.val as string },
  }

  function handleClear() {
    if (isRange) {
      props.onRangeChange(null, null)
    } else {
      props.onChange(null)
    }
  }

  function handleApplyRange() {
    if (isRange) {
      props.onRangeChange(tempStart, tempEnd)
    }
    setOpen(false)
  }

  return (
    <>
      <YStack gap="$1" marginBottom="$2">
        <View position="relative" paddingTop={8}>
          <Pressable onPress={() => { if (!disabled) setOpen(true) }}>
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
                <Text fontSize={13} color={displayValue ? '$text' : '$textMuted'}>
                  {displayValue}
                </Text>
                {hasValue ? (
                  <Pressable onPress={handleClear}>
                    <X size={16} color={theme.textMuted?.val as string} />
                  </Pressable>
                ) : (
                  <CalendarDays size={18} color={open ? primaryVal : theme.textMuted?.val as string} />
                )}
              </XStack>
            </View>
          </Pressable>

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

        {error && (
          <Text fontSize={11} color="$error">{error}</Text>
        )}
      </YStack>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 }}
          onPress={() => setOpen(false)}
        >
          <Pressable onPress={() => {}} style={{ width: '100%' }}>
            <View
              backgroundColor="$backgroundElevated"
              borderRadius={16}
              borderWidth={1}
              borderColor="$border"
              overflow="hidden"
            >
              {isRange ? (
                <>
                  <DateTimePicker
                    mode="range"
                    locale="es"
                    startDate={tempStart ? dayjs(tempStart) : undefined}
                    endDate={tempEnd ? dayjs(tempEnd) : undefined}
                    maxDate={maxDateProp ? dayjs(maxDateProp) : direction === 'past' ? today : undefined}
                    minDate={minDateProp ? dayjs(minDateProp) : direction === 'future' ? today : undefined}
                    onChange={({ startDate, endDate }: any) => {
                      setTempStart(startDate ? dayjs(startDate).format('YYYY-MM-DD') : null)
                      setTempEnd(endDate     ? dayjs(endDate).format('YYYY-MM-DD')   : null)
                    }}
                    styles={calendarStyles}
                    containerStyle={{ backgroundColor: 'transparent' }}
                  />
                  <XStack
                    paddingHorizontal="$4"
                    paddingBottom="$4"
                    paddingTop="$2"
                    borderTopWidth={1}
                    borderTopColor="$border"
                    gap="$3"
                  >
                    <Text fontSize={12} color="$textMuted" flex={1} alignSelf="center">
                      {tempStart && tempEnd
                        ? `${dayjs(tempStart).format('DD/MM')} – ${dayjs(tempEnd).format('DD/MM/YYYY')}`
                        : tempStart
                        ? `Desde ${dayjs(tempStart).format('DD/MM/YYYY')}`
                        : 'Selecciona las fechas'}
                    </Text>
                    <Button
                      height={40}
                      paddingHorizontal="$4"
                      borderRadius={10}
                      backgroundColor="$primary"
                      pressStyle={{ opacity: 0.8 }}
                      onPress={handleApplyRange}
                      disabled={!tempStart && !tempEnd}
                    >
                      <Text color="white" fontWeight="700" fontSize={13}>Aplicar</Text>
                    </Button>
                  </XStack>
                </>
              ) : (
                <DateTimePicker
                  mode="single"
                  locale="es"
                  date={props.value ? dayjs(props.value) : undefined}
                  maxDate={maxDateProp ? dayjs(maxDateProp) : direction === 'past' ? today : undefined}
                  minDate={minDateProp ? dayjs(minDateProp) : direction === 'future' ? today : undefined}
                  onChange={({ date }: any) => {
                    if (date) {
                      props.onChange(dayjs(date).format('YYYY-MM-DD'))
                      setOpen(false)
                    }
                  }}
                  styles={calendarStyles}
                  containerStyle={{ backgroundColor: 'transparent' }}
                />
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}
