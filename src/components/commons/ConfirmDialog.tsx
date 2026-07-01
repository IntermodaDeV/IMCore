import React from 'react'
import { AlertDialog, Button, XStack, YStack, Text, Spinner  } from 'tamagui'
import { TriangleAlert } from 'lucide-react-native'
import { shadows } from '../../theme/shadows'

interface ConfirmDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    message: string
    confirmColor?: string
    confirmLabel?: string
    onConfirm: () => void
    onCancel?: () => void
    loading?: boolean
    // Acción secundaria opcional: si se define, se muestra un segundo botón de
    // acción (y los botones se acomodan en columna).
    secondaryLabel?: string
    secondaryColor?: string
    onSecondary?: () => void
}

export default function ConfirmDialog({
    open,
    onOpenChange,
    title,
    message,
    confirmColor = '#FF551A',
    onConfirm,
    onCancel,
    confirmLabel = 'Aceptar',
    loading,
    secondaryLabel,
    secondaryColor,
    onSecondary,
}: ConfirmDialogProps) {
    return (
        <AlertDialog 
            open={open}   
            onOpenChange={(value) => {
            if (!loading) {
                onOpenChange(value)
            }
        }}>
            <AlertDialog.Portal>
                <AlertDialog.Overlay
                    key="overlay"
                    enterStyle={{ opacity: 0 }}
                    exitStyle={{ opacity: 0 }}
                    opacity={0.6}
                    backgroundColor="black"
                />
                    <AlertDialog.Content
                        elevate
                        key="content"
                        width="85%"
                        alignSelf="center"
                        enterStyle={{ y: -12, opacity: 0, scale: 0.94 }}
                        exitStyle={{ y: 8, opacity: 0, scale: 0.96 }}
                        backgroundColor="$backgroundElevated"
                        borderRadius="$6"
                        paddingHorizontal="$5"
                        paddingVertical="$5"
                        marginHorizontal="$5"
                        x={0} y={0} scale={1} opacity={1}
                        {...shadows.lg}
                    >
                    <YStack gap="$2" alignItems="center">

                        {/* Ícono */}
                        <YStack
                            width={56}
                            height={56}
                            borderRadius={28}
                            backgroundColor={`${confirmColor}18`}
                            justifyContent="center"
                            alignItems="center"
                        >
                            <TriangleAlert size={26} color={confirmColor} />
                        </YStack>

                        {/* Texto */}
                        <YStack gap="$1.5" alignItems="center">
                            <AlertDialog.Title>
                                <Text
                                    fontSize={16}
                                    fontWeight="700"
                                    color="$text"
                                    textAlign="center"
                                >
                                    {title}
                                </Text>
                            </AlertDialog.Title>

                            <AlertDialog.Description>
                                <Text
                                    fontSize={13}
                                    color="$textMuted"
                                    lineHeight={20}
                                    textAlign="center"
                                >
                                    {message}
                                </Text>
                            </AlertDialog.Description>
                        </YStack>

                        {/* Botones */}
                        {onSecondary ? (
                          // Con acción secundaria: botones en columna.
                          <YStack gap="$3" width="100%" marginTop="$1">
                            <Button
                                height={42}
                                borderRadius="$4"
                                backgroundColor={confirmColor}
                                borderWidth={0}
                                disabled={loading}
                                opacity={loading ? 0.8 : 1}
                                pressStyle={{ opacity: 0.7 }}
                                onPress={() => { if (!loading) onConfirm() }}
                            >
                                <XStack gap="$2" alignItems="center">
                                {loading && <Spinner size="small" color="white" />}
                                <Text fontSize={14} fontWeight="600" color="white">
                                    {confirmLabel}
                                </Text>
                                </XStack>
                            </Button>

                            <Button
                                height={42}
                                borderRadius="$4"
                                backgroundColor={secondaryColor ?? confirmColor}
                                borderWidth={0}
                                disabled={loading}
                                opacity={loading ? 0.8 : 1}
                                pressStyle={{ opacity: 0.7 }}
                                onPress={() => { if (!loading) onSecondary() }}
                            >
                                <XStack gap="$2" alignItems="center">
                                {loading && <Spinner size="small" color="white" />}
                                <Text fontSize={14} fontWeight="600" color="white">
                                    {secondaryLabel}
                                </Text>
                                </XStack>
                            </Button>

                            <AlertDialog.Cancel asChild>
                                <Button
                                    height={42}
                                    borderRadius="$4"
                                    backgroundColor="$buttonSecondary"
                                    borderWidth={0}
                                    disabled={loading}
                                    opacity={loading ? 0.6 : 1}
                                    pressStyle={{ opacity: 0.7 }}
                                    onPress={() => {
                                    if (loading) return
                                        onCancel?.()
                                        onOpenChange(false)
                                    }}
                                >
                                    <Text fontSize={14} fontWeight="600" color="$text">
                                    Cancelar
                                    </Text>
                                </Button>
                            </AlertDialog.Cancel>
                          </YStack>
                        ) : (
                          <XStack gap="$3" width="100%" marginTop="$1">
                          <AlertDialog.Cancel asChild>
                            <Button
                                flex={1}
                                height={42}
                                borderRadius="$4"
                                backgroundColor="$buttonSecondary"
                                borderWidth={0}
                                disabled={loading}
                                opacity={loading ? 0.6 : 1}
                                pressStyle={{ opacity: 0.7 }}
                                onPress={() => {
                                if (loading) return
                                    onCancel?.()
                                    onOpenChange(false)
                                }}
                            >
                                <Text fontSize={14} fontWeight="600" color="$text">
                                Cancelar
                                </Text>
                            </Button>
                        </AlertDialog.Cancel>

                        {/* <AlertDialog.Action asChild> */}
                        <Button
                            flex={1}
                            height={42}
                            borderRadius="$4"
                            backgroundColor="$primary"
                            borderWidth={0}
                            disabled={loading}
                            opacity={loading ? 0.8 : 1}
                            pressStyle={{ opacity: 0.7 }}
                            onPress={() => {
                            if (loading) return
                                onConfirm()
                            }}
                        >
                            <XStack gap="$2" alignItems="center">
                            {loading && <Spinner size="small" color="white" />}

                            <Text fontSize={14} fontWeight="600" color="white">
                                {loading ? 'Guardando...' : confirmLabel}
                            </Text>
                            </XStack>
                        </Button>
                        {/* </AlertDialog.Action> */}
                        </XStack>
                        )}

                    </YStack>
                </AlertDialog.Content>
            </AlertDialog.Portal>
        </AlertDialog>
    )
}