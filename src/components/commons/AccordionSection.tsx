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
    /**
     * Avisa cuando se abre o se cierra.
     *
     * El estado sigue siendo de la sección: esto es solo para que quien la usa
     * pueda cargar su contenido al abrirla, en vez de consultarlo siempre por
     * si acaso. Es opcional, así que las pantallas que ya la usan no cambian.
     */
    onOpenChange?: (open: boolean) => void
    /**
     * El aire que deja arriba. Por defecto "$3", como venía.
     *
     * Se puede bajar porque en una pantalla cuyo contenedor ya separa con
     * `gap`, este margen SE SUMA a esa separación y la sección queda despegada
     * del resto del formulario.
     */
    marginTop?: string
}

export default function AccordionSection({
    title,
    subtitle,
    subtitleError,
    children,
    defaultOpen = false,
    onOpenChange,
    marginTop = '$3',
}: AccordionSectionProps) {
    const [open, setOpen] = useState(defaultOpen)

    return (
        <YStack
            backgroundColor="$backgroundElevated"
            borderRadius="$5"
            borderWidth={1}
            borderColor="$border"
            overflow="hidden"
            marginTop={marginTop}
        >
            {/* Header */}
            <XStack
                paddingHorizontal="$4"
                paddingVertical="$3"
                alignItems="center"
                gap="$3"
                pressStyle={{ opacity: 0.7 }}
                onPress={() => setOpen((prev) => {
                    const siguiente = !prev
                    onOpenChange?.(siguiente)
                    return siguiente
                })}
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