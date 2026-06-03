import React from 'react'
import { AlertDialog, Button, XStack, YStack, Text, Sheet  } from 'tamagui'
import { TriangleAlert } from 'lucide-react-native'

interface ConfirmDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    message: string
    confirmColor?: string
    confirmLabel?: string
    onConfirm: () => void
    onCancel?: () => void
}

export default function ConfirmDialog({
    open,
    onOpenChange,
    title,
    message,
    confirmColor = '#FF551A',
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
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
                        width="80%"
                        alignSelf="center"
                        enterStyle={{ y: -12, opacity: 0, scale: 0.94 }}
                        exitStyle={{ y: 8, opacity: 0, scale: 0.96 }}
                        backgroundColor="$card2"
                        borderRadius="$6"
                        paddingHorizontal="$5"
                        paddingVertical="$5"
                        marginHorizontal="$5"
                        x={0} y={0} scale={1} opacity={1}
                        shadowColor="#000"
                        shadowOffset={{ width: 0, height: 8 }}
                        shadowOpacity={0.15}
                        shadowRadius={24}
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
                        <XStack gap="$3" width="100%" marginTop="$1">
                            <AlertDialog.Cancel asChild>
                                <Button
                                    flex={1}
                                    height={42}
                                    borderRadius="$4"
                                    backgroundColor="$buttonCancel"
                                    borderWidth={0}
                                    pressStyle={{ opacity: 0.7 }}
                                    onPress={() => {
                                        onCancel?.()
                                        onOpenChange(false)
                                    }}
                                >
                                    <Text fontSize={14} fontWeight="600" color="$buttonCancelText">
                                        Cancelar
                                    </Text>
                                </Button>
                            </AlertDialog.Cancel>

                            <AlertDialog.Action asChild>
                                <Button
                                    flex={1}
                                    height={42}
                                    borderRadius="$4"
                                    backgroundColor={'$primary'}
                                    borderWidth={0}
                                    pressStyle={{ opacity: 0.7 }}
                                    onPress={() => {
                                        onConfirm()
                                        onOpenChange(false)
                                    }}
                                >
                                    <Text fontSize={14} fontWeight="600" color="white">
                                        Aceptar
                                    </Text>
                                </Button>
                            </AlertDialog.Action>
                        </XStack>

                    </YStack>
                </AlertDialog.Content>
            </AlertDialog.Portal>
        </AlertDialog>
    )
}