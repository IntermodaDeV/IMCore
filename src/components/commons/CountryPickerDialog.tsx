import { Check } from 'lucide-react-native'
import React from 'react'
import { YStack, XStack, Text, AlertDialog, Button } from 'tamagui'
import { IUserCompanies } from '../../api/modules/security/security.types'
import CountryFlag from './CountryFlag'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  companies: IUserCompanies[]
  selectedId: number | null
  onSelect: (id: number) => void
  title?: string
}

// Diálogo para cambiar de país/empresa (entre las que el usuario tiene acceso).
export default function CountryPickerDialog({
  open,
  onOpenChange,
  companies,
  selectedId,
  onSelect,
  title = 'Selecciona el país',
}: Props) {
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
          width="85%"
          alignSelf="center"
          enterStyle={{ y: -12, opacity: 0, scale: 0.94 }}
          exitStyle={{ y: 8, opacity: 0, scale: 0.96 }}
          backgroundColor="$backgroundElevated"
          borderRadius="$6"
          paddingHorizontal="$5"
          paddingVertical="$5"
          x={0}
          y={0}
          scale={1}
          opacity={1}
        >
          <YStack gap="$3">
            <AlertDialog.Title>
              <Text fontSize={16} fontWeight="700" color="$text" textAlign="center">
                {title}
              </Text>
            </AlertDialog.Title>

            <YStack gap="$2">
              {companies.map(c => {
                const companyId = Number(c.Company_Id)
                const sel = companyId === selectedId
                return (
                  <XStack
                    key={c.Id}
                    onPress={() => {
                      onSelect(companyId)
                      onOpenChange(false)
                    }}
                    alignItems="center"
                    gap="$3"
                    padding="$3"
                    borderRadius="$3"
                    backgroundColor={sel ? '$primaryOpacity' : '$backgroundSurface'}
                    pressStyle={{ opacity: 0.7 }}
                  >
                    <CountryFlag countryCode={c.CodeIcon || c.Code || ''} width={28} height={20} />
                    <Text flex={1} fontSize={14} fontWeight={sel ? '700' : '600'} color="$text" numberOfLines={1}>
                      {c.Name}
                    </Text>
                    {sel && <Check size={16} color="#FF551A" />}
                  </XStack>
                )
              })}
            </YStack>

            <AlertDialog.Cancel asChild>
              <Button
                height={42}
                borderRadius="$4"
                backgroundColor="transparent"
                pressStyle={{ opacity: 0.6 }}
                onPress={() => onOpenChange(false)}
              >
                <Text fontSize={14} fontWeight="600" color="$textMuted">
                  Cancelar
                </Text>
              </Button>
            </AlertDialog.Cancel>
          </YStack>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog>
  )
}
