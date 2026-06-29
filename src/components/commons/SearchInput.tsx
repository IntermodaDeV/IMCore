import React, { useState, useMemo } from 'react'
import { XStack, Input, Text, YStack } from 'tamagui'
import { Search, X } from 'lucide-react-native'
import { useTheme } from 'tamagui'

interface SearchInputProps<T extends Record<string, any>> {
    data: T[]
    searchKeys: (keyof T)[]
    onResults: (filtered: T[]) => void
    placeholder?: string
}

export default function SearchInput<T extends Record<string, any>>({
    data,
    searchKeys,
    onResults,
    placeholder = 'Buscar...',
}: SearchInputProps<T>) {
    const [query, setQuery] = useState('')
    const [isFocused, setIsFocused] = useState(false)
    const theme = useTheme()

    const handleChange = (text: string) => {
        setQuery(text)
        if (!text.trim()) {
            onResults(data)
            return
        }
        const lower = text.toLowerCase()
        const filtered = data.filter((item) =>
            searchKeys.some((key) => {
                const val = item[key]
                return val != null && String(val).toLowerCase().includes(lower)
            })
        )
        onResults(filtered)
    }

    const clear = () => {
        setQuery('')
        onResults(data)
    }

    return (
        <XStack
            backgroundColor="$backgroundElevated"
            borderRadius="$3"
            paddingHorizontal="$3"
            alignItems="center"
            gap="$2"
            borderWidth={1}
            borderColor={isFocused ? '$primary' : '$border'}
            marginBottom="$3"
            height={42}
        >
            <Search size={16} color={isFocused ? theme.primary?.val : theme.textMuted?.val} />
            <Input
                flex={1}
                value={query}
                onChangeText={handleChange}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder={placeholder}
                placeholderTextColor={theme.textMuted?.val}
                borderWidth={0}
                backgroundColor="transparent"
                fontSize={13}
                color="$text"
                padding={0}
                focusStyle={{ borderWidth: 0, outlineWidth: 0 }}
            />
            {query.length > 0 && (
                <X
                    size={16}
                    color={theme.textMuted?.val}
                    onPress={clear}
                />
            )}
        </XStack>
    )
}