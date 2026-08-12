import React, { useEffect, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { RotateCw, Check, X, Mail, Phone, Clock, Store, ChevronDown, ChevronUp, Hash } from 'lucide-react-native'
import { YStack, Text, ScrollView, Card, XStack, View, useTheme, Button, styled } from 'tamagui'
import { registrationService } from '../../../api/modules/pepeB2B/registration.service'
import { IRegistrationRequestItem } from '../../../api/modules/pepeB2B/registration.types'
import Page from '../../../components/commons/Page'
import { useAuth } from '../../../context/AuthContext'
import SkeletonList from '../../../components/Skeletons/SkeletonList'
import { ExecutionResponse } from '../../../api/modules/response.type'
import ConfirmDialog from '../../../components/commons/ConfirmDialog'
import SearchInput from '../../../components/commons/SearchInput'
import { AppError, handleError } from '../../../utils/errorHandler'
import ErrorState from '../../AdmSys/ErrorState'
import EmptyState from '../../AdmSys/EmptyState'
import { useShowToast } from '../../../utils/useShowToast'
import { usePageHeader } from '../../../hooks/usePageHeader'

type ActionMode = 'approve' | 'reject'

export default function RequestUserScreen() {
  const theme = useTheme()
  const RotateCwStyled = styled(RotateCw, { color: '$text' })

  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [data, setData] = useState<IRegistrationRequestItem[]>([])
  const [filtered, setFiltered] = useState<IRegistrationRequestItem[]>([])
  const [selected, setSelected] = useState<IRegistrationRequestItem | null>(null)
  const [mode, setMode] = useState<ActionMode>('approve')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [error, setError] = useState<AppError | null>(null)
  // Qué solicitudes tienen sus sucursales desplegadas.
  const [openDir, setOpenDir] = useState<Record<number, boolean>>({})

  const toggleDir = (id: number) => setOpenDir((prev) => ({ ...prev, [id]: !prev[id] }))

  // Nombre a mostrar: el del primer cliente asociado, o el del usuario.
  const displayName = (it: IRegistrationRequestItem) =>
    it.Clientes?.[0]?.Nombre || it.Name || it.Code

  const { user } = useAuth()
  const { showToast } = useShowToast()

  const getInfo = React.useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response: ExecutionResponse<IRegistrationRequestItem[]> = await registrationService.getRegistrationRequests()
      if (response.Success) {
        setData(response.Data || [])
        setFiltered(response.Data || [])
      }
    } catch (err) {
      setError(handleError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  usePageHeader({
    center: (
      <Text fontSize={16} fontWeight="700" color="$text">
        Solicitudes de cuenta
      </Text>
    ),
    right: (
      <XStack gap="$2">
        <View onPress={() => getInfo()}>
          <RotateCwStyled size={18} />
        </View>
      </XStack>
    ),
  })

  const askAction = (item: IRegistrationRequestItem, action: ActionMode) => {
    setSelected(item)
    setMode(action)
    setDialogOpen(true)
  }

  const confirmAction = async () => {
    if (!selected) return
    setProcessing(true)
    try {
      const response =
        mode === 'approve'
          ? await registrationService.approveRegistration({ User_Code: selected.Code, Approved_By: user?.Code })
          : await registrationService.rejectRegistration({ User_Code: selected.Code, Rejected_By: user?.Code })

      if (response.Success) {
        // Quita la solicitud de la lista (ya no está pendiente).
        setData((prev) => prev.filter((x) => x.Code !== selected.Code))
        setFiltered((prev) => prev.filter((x) => x.Code !== selected.Code))
        showToast(
          'success',
          mode === 'approve' ? 'Solicitud aprobada' : 'Solicitud rechazada',
          response.SuccessMessage,
          5000,
          'bottom',
        )
        setDialogOpen(false)
      } else {
        showToast('error', 'Error', response.ErrorMessage || 'No se pudo procesar la solicitud', 5000, 'top')
      }
    } catch {
      showToast('error', 'Error', 'Ocurrió un error inesperado', 5000, 'bottom')
    } finally {
      setProcessing(false)
    }
  }

  useFocusEffect(
    React.useCallback(() => {
      getInfo()
    }, [getInfo]),
  )

  useEffect(() => {
    setFiltered(data)
  }, [data])

  const formatDate = (value?: string | Date | null) => {
    if (!value) return ''
    try {
      const d = new Date(value)
      return d.toLocaleDateString()
    } catch {
      return ''
    }
  }

  return (
    <Page>
      <YStack flex={1} backgroundColor="$backgroundPage" padding="$3">
        {loading ? (
          <SkeletonList />
        ) : error ? (
          <ErrorState
            type="server"
            title={error.title}
            message={error.message}
            errorCode={error.status}
            onRetry={getInfo}
          />
        ) : (
          <>
            <SearchInput
              data={data}
              searchKeys={['Name', 'Email', 'Code']}
              onResults={setFiltered}
              placeholder="Buscar solicitud..."
            />

            <ScrollView showsVerticalScrollIndicator={false} marginBottom="$3">
              {(filtered?.length ?? 0) === 0 ? (
                <EmptyState onAction={() => getInfo()} />
              ) : (
                (filtered ?? []).map((item) => (
                  <Card
                    key={item.Id}
                    backgroundColor="$backgroundElevated"
                    borderRadius={12}
                    marginBottom="$2.5"
                    overflow="hidden"
                  >
                    <YStack padding="$3.5" gap="$2.5">
                      {/* Encabezado */}
                      <XStack justifyContent="space-between" alignItems="flex-start">
                        <YStack flex={1} gap="$1">
                          <Text fontSize={15} fontWeight="800" color="$text">
                            {displayName(item)}
                          </Text>
                          <Text fontSize={11} color="$textMuted">
                            Usuario: {item.Code}
                          </Text>
                        </YStack>

                        <View
                          borderRadius={999}
                          backgroundColor="#F59E0B"
                          paddingHorizontal={8}
                          paddingVertical={2}
                        >
                          <Text fontSize={10} color="white" fontWeight="700">
                            Pendiente
                          </Text>
                        </View>
                      </XStack>

                      {/* Datos */}
                      <YStack gap="$1.5">
                        {!!item.Email && (
                          <XStack alignItems="center" gap="$2">
                            <Mail size={14} color={theme.textMuted?.val} />
                            <Text fontSize={12} color="$textSecondary" flex={1} numberOfLines={1}>
                              {item.Email}
                            </Text>
                          </XStack>
                        )}
                        {!!item.Creation_Date && (
                          <XStack alignItems="center" gap="$2">
                            <Clock size={14} color={theme.textMuted?.val} />
                            <Text fontSize={12} color="$textMuted" flex={1} numberOfLines={1}>
                              {formatDate(item.Creation_Date)}
                            </Text>
                          </XStack>
                        )}
                      </YStack>

                      {/* Sucursales del cliente (colapsable) */}
                      {(item.Clientes?.length ?? 0) > 0 && (
                        <YStack borderTopWidth={1} borderColor="$border" paddingTop="$2.5">
                          <XStack
                            alignItems="center"
                            gap="$2"
                            pressStyle={{ opacity: 0.6 }}
                            onPress={() => toggleDir(item.Id)}
                          >
                            <Store size={15} color={theme.primary?.val} />
                            <Text fontSize={13} fontWeight="700" color="$text" flex={1}>
                              Sucursales ({item.Clientes!.length})
                            </Text>
                            {openDir[item.Id] ? (
                              <ChevronUp size={18} color={theme.textMuted?.val} />
                            ) : (
                              <ChevronDown size={18} color={theme.textMuted?.val} />
                            )}
                          </XStack>

                          {openDir[item.Id] && (
                            <YStack gap="$2" marginTop="$2.5">
                              {item.Clientes!.map((cli, idx) => (
                                <YStack
                                  key={cli.ClienteId ?? idx}
                                  backgroundColor="$backgroundSurface"
                                  borderRadius={10}
                                  padding="$2.5"
                                  gap="$1"
                                >
                                  <Text fontSize={12} fontWeight="700" color="$text" numberOfLines={2}>
                                    {cli.Nombre || 'Cliente'}
                                  </Text>
                                  {!!cli.Codigo && (
                                    <XStack alignItems="center" gap="$2">
                                      <Hash size={12} color={theme.textMuted?.val} />
                                      <Text fontSize={11} color="$textSecondary" flex={1} numberOfLines={1}>
                                        {cli.Codigo}
                                      </Text>
                                    </XStack>
                                  )}
                                  {!!cli.Telefono && (
                                    <XStack alignItems="center" gap="$2">
                                      <Phone size={12} color={theme.textMuted?.val} />
                                      <Text fontSize={11} color="$textSecondary" flex={1} numberOfLines={1}>
                                        {cli.Telefono}
                                      </Text>
                                    </XStack>
                                  )}
                                </YStack>
                              ))}
                            </YStack>
                          )}
                        </YStack>
                      )}

                      {/* Acciones */}
                      <XStack gap="$2.5" marginTop="$1">
                        <Button
                          flex={1}
                          height={40}
                          backgroundColor="rgba(239,68,68,0.12)"
                          borderRadius="$4"
                          pressStyle={{ opacity: 0.7 }}
                          onPress={() => askAction(item, 'reject')}
                        >
                          <XStack alignItems="center" gap="$1.5">
                            <X size={16} color="#EF4444" />
                            <Text fontSize={13} fontWeight="700" color="#EF4444">
                              Rechazar
                            </Text>
                          </XStack>
                        </Button>

                        <Button
                          flex={1}
                          height={40}
                          backgroundColor="#22C55E"
                          borderRadius="$4"
                          pressStyle={{ opacity: 0.8 }}
                          onPress={() => askAction(item, 'approve')}
                        >
                          <XStack alignItems="center" gap="$1.5">
                            <Check size={16} color="white" />
                            <Text fontSize={13} fontWeight="700" color="white">
                              Aprobar
                            </Text>
                          </XStack>
                        </Button>
                      </XStack>
                    </YStack>
                  </Card>
                ))
              )}
            </ScrollView>
          </>
        )}
      </YStack>

      <ConfirmDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        loading={processing}
        title={mode === 'approve' ? 'Aprobar solicitud' : 'Rechazar solicitud'}
        message={
          mode === 'approve'
            ? `¿Aprobar la cuenta de "${selected ? displayName(selected) : ''}"? Se enviará un correo para que defina su contraseña e inicie sesión con su correo.`
            : `¿Rechazar la solicitud de "${selected ? displayName(selected) : ''}"? La cuenta pendiente se eliminará.`
        }
        confirmLabel={mode === 'approve' ? 'Aprobar' : 'Rechazar'}
        confirmColor={mode === 'approve' ? '#22C55E' : '#EF4444'}
        onConfirm={confirmAction}
      />
    </Page>
  )
}
