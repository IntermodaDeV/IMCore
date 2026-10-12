import React from 'react'
import { useWindowDimensions } from 'react-native'
import { AlertDialog, Button, XStack, YStack, Text, Spinner  } from 'tamagui'
import { TriangleAlert } from 'lucide-react-native'
import { shadows } from '../../theme/shadows'
import { useKeyboardInset } from '../../hooks/useKeyboardInset'

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
    /**
     * Contenido libre entre el mensaje y los botones.
     *
     * Existe para lo que no cabe en una línea de texto: un desglose, un
     * impacto, una advertencia con números. Sin esto habría que armar un modal
     * aparte y duplicar el diálogo entero.
     */
    extra?: React.ReactNode
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
    extra,
}: ConfirmDialogProps) {
    /* ── El teclado y el diálogo ──────────────────────────────────────────
       `extra` admite un input —el motivo de un rechazo, el de un cierre con
       faltante— y este diálogo vive centrado en la pantalla COMPLETA, así que
       al abrirse el teclado la mitad de abajo deja de verse.

       Se resuelve como en FormDialog y en el rechazo de gastos: `paddingBottom`
       en el Portal, que es el contenedor full-screen donde el diálogo se
       centra. Reducir esa área lo sube SOLO LO NECESARIO, sin medir nodos ni
       acumular translates — y es idempotente si el teclado vuelve a avisar.

       POR QUÉ NO SE CALCULA A MANO. Subir «la mitad del teclado» parece
       equivalente y no lo es: en los equipos donde el sistema YA achica la
       ventana, eso compensa dos veces y el diálogo se va de más. `useKeyboardInset`
       mide el contenedor y descuenta lo que el sistema ya subió por su cuenta.

       SIN INPUT NO HAY TECLADO, así que para los diálogos que no pasan `extra`
       —la mayoría— el inset es 0 y nada se mueve. */
    const { inset: keyboardInset, onLayout } = useKeyboardInset()
    const { height: windowHeight } = useWindowDimensions()

    // El Portal ya descuenta el teclado, así que el contenido no debe pasar de
    // lo que queda: con un campo de varios renglones, si no se acota, el
    // diálogo crece hasta tapar lo que acabamos de destapar.
    const maxContentHeight = Math.max(240, windowHeight - keyboardInset - 48)

    return (
        <AlertDialog 
            open={open}   
            onOpenChange={(value) => {
            if (!loading) {
                onOpenChange(value)
            }
        }}>
            <AlertDialog.Portal paddingBottom={keyboardInset} onLayout={onLayout}>
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
                        maxHeight={maxContentHeight}
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

                        {/* Texto. Ocupa todo el ancho para que el bloque de
                            `extra` no quede encogido al ancho del título. */}
                        <YStack gap="$1.5" alignItems="center" width="100%">
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

                            {!!extra && (
                                <YStack width="100%" alignSelf="stretch" paddingTop="$2">
                                    {extra}
                                </YStack>
                            )}
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