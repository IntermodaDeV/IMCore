// components/commons/AccordionSection.tsx
import React, { useState } from 'react'
import { XStack, YStack, Text, View } from 'tamagui'
import { ChevronDown, ChevronUp } from 'lucide-react-native'

interface AccordionSectionProps {
    title: string
    subtitle?: string
    subtitleError?: string
    children: React.ReactNode
    defaultOpen?: boolean
}

export default function AccordionSection({
    title,
    subtitle,
    subtitleError,
    children,
    defaultOpen = false,
}: AccordionSectionProps) {
    const [open, setOpen] = useState(defaultOpen)

    return (
        <YStack
            backgroundColor="$backgroundElevated"
            borderRadius="$5"
            borderWidth={1}
            borderColor="$border"
            overflow="hidden"
            marginTop="$3"
        >
            {/* Header */}
            <XStack
                paddingHorizontal="$4"
                paddingVertical="$3"
                alignItems="center"
                gap="$3"
                pressStyle={{ opacity: 0.7 }}
                onPress={() => setOpen((prev) => !prev)}
            >
                <YStack flex={1} gap="$0.5">
                    <Text fontSize={14} fontWeight="700" color="$text">
                        {title}
                    </Text>
                    {subtitle && (
                        <Text fontSize={12} color="$textMuted">
                            {subtitle}
                        </Text>
                    )}

                    {subtitleError && (
                        <Text fontSize={12} color="$error">
                            {subtitleError}
                        </Text>
                    )}
                </YStack>

                <View
                    width={28}
                    height={28}
                    borderRadius={14}
                    backgroundColor="$backgroundSurface"
                    justifyContent="center"
                    alignItems="center"
                >
                    {open
                        ? <ChevronUp size={16} color="#94A3B8" />
                        : <ChevronDown size={16} color="#94A3B8" />
                    }
                </View>
            </XStack>

            {/* Divider */}
            {open && (
                <View height={1} backgroundColor="$border" />
            )}

            {/* Content */}
            {open && (
                <YStack padding="$3" gap="$2">
                    {children}
                </YStack>
            )}
        </YStack>
    )
}