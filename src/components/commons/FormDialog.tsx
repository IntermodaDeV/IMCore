import React from 'react'
import { ScrollView, useWindowDimensions } from 'react-native'
import { Dialog, YStack, XStack, Text, View, Button, Spinner } from 'tamagui'
import { useKeyboardInset } from '../../hooks/useKeyboardInset'

interface FormDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    description?: string
    /** Campos del formulario. Se muestran en un ScrollView por si no caben con el teclado abierto. */
    children: React.ReactNode
    /** Botonera propia. Si no se pasa, se dibujan Cancelar / confirmLabel. */
    footer?: React.ReactNode
    confirmLabel?: string
    cancelLabel?: string
    onConfirm?: () => void
    onCancel?: () => void
    confirmDisabled?: boolean
    loading?: boolean
    width?: number | string
    /**
     * Tope de alto en puntos. Opcional: sin él, el diálogo crece hasta lo que
     * deje la pantalla (que es lo que quiere un formulario). Un diálogo con
     * lista larga adentro sí lo necesita, o se estira de borde a borde y deja
     * de parecer un diálogo. Igual nunca pasa del alto disponible.
     */
    maxHeight?: number
}

/**
 * Diálogo para formularios: mismo look que los Dialog que ya usamos, pero el contenido
 * se reacomoda cuando aparece el teclado en lugar de quedar tapado.
 *
 * Cómo funciona:
 *  - `paddingBottom` en el Portal (que es un contenedor full-screen centrado) reduce el
 *    área donde se centra el diálogo, así que sube solo lo necesario. No hay medición de
 *    nodos ni translate acumulado: es idempotente si el teclado vuelve a avisar.
 *  - `maxHeight` + ScrollView para que un formulario alto siga siendo alcanzable cuando
 *    el teclado se come media pantalla.
 */
export default function FormDialog({
    open,
    onOpenChange,
    title,
    description,
    children,
    footer,
    confirmLabel = 'Aceptar',
    cancelLabel = 'Cancelar',
    onConfirm,
    onCancel,
    confirmDisabled = false,
    loading = false,
    width = '90%',
    maxHeight,
}: FormDialogProps) {
    const { inset: keyboardInset, onLayout } = useKeyboardInset()
    const { height: windowHeight } = useWindowDimensions()

    // El Portal ya descuenta el teclado, así que el contenido no debe pasar de lo que queda.
    const disponible = Math.max(240, windowHeight - keyboardInset - 48)
    const maxContentHeight = maxHeight ? Math.min(maxHeight, disponible) : disponible

    const handleCancel = () => {
        if (loading) return
        onCancel?.()
        onOpenChange(false)
    }

    return (
        <Dialog
            modal
            open={open}
            onOpenChange={(value) => { if (!loading) onOpenChange(value) }}
        >
            <Dialog.Portal paddingBottom={keyboardInset} onLayout={onLayout}>
                <Dialog.Overlay
                    key="overlay"
                    backgroundColor="rgba(0,0,0,0.5)"
                    enterStyle={{ opacity: 0 }}
                    exitStyle={{ opacity: 0 }}
                />

                <Dialog.Content
                    key="content"
                    width={width as any}
                    maxHeight={maxContentHeight}
                    bordered
                    elevate
                    padding={0}
                    overflow="hidden"
                    enterStyle={{ opacity: 0, scale: 0.95, y: 20 }}
                    exitStyle={{ opacity: 0, scale: 0.95, y: 10 }}
                >
                    {/* Overlay de guardado */}
                    {loading && (
                        <View
                            position="absolute"
                            top={0} left={0} right={0} bottom={0}
                            backgroundColor="rgba(0,0,0,0.45)"
                            justifyContent="center"
                            alignItems="center"
                            zIndex={999}
                        >
                            <Spinner size="large" color="$primary" />
                        </View>
                    )}

                    <YStack padding="$4" flexShrink={1}>
                        <Dialog.Title fontSize={18} fontWeight="700" color="$text">
                            {title}
                        </Dialog.Title>

                        {description ? (
                            <Dialog.Description fontSize={14} marginBottom="$2" color="$textMuted">
                                {description}
                            </Dialog.Description>
                        ) : null}

                        <ScrollView
                            style={{ flexShrink: 1, flexGrow: 0 }}
                            contentContainerStyle={{ paddingTop: 4, paddingBottom: 4 }}
                            keyboardShouldPersistTaps="handled"
                            showsVerticalScrollIndicator={false}
                        >
                            {children}
                        </ScrollView>

                        {footer ?? (
                            <XStack gap="$2" marginTop="$4" flexShrink={0}>
                                <Button
                                    flex={1}
                                    backgroundColor="$buttonSecondary"
                                    height={45}
                                    borderRadius="$3"
                                    justifyContent="center"
                                    alignItems="center"
                                    pressStyle={{ opacity: 0.7 }}
                                    disabled={loading}
                                    opacity={loading ? 0.5 : 1}
                                    onPress={handleCancel}
                                >
                                    <Text color="$text" fontWeight="700">{cancelLabel}</Text>
                                </Button>

                                <Button
                                    flex={1}
                                    backgroundColor="$primary"
                                    height={45}
                                    borderRadius="$3"
                                    justifyContent="center"
                                    alignItems="center"
                                    pressStyle={{ opacity: 0.7 }}
                                    disabled={loading || confirmDisabled}
                                    opacity={loading || confirmDisabled ? 0.5 : 1}
                                    onPress={() => { if (!loading) onConfirm?.() }}
                                >
                                    <Text color="$white" fontWeight="700">{confirmLabel}</Text>
                                </Button>
                            </XStack>
                        )}
                    </YStack>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog>
    )
}
