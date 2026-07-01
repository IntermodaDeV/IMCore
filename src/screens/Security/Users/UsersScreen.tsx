import React, { useEffect, useState } from 'react'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { Plus, RotateCw, Pencil, KeyRound, Eye, EyeOff, ChevronDown, ChevronUp, Trash2, LogOut  } from 'lucide-react-native'
import { YStack, Text, ScrollView, Card, XStack, View, useTheme, Button, Dialog, Spinner, styled } from 'tamagui'
import { securityService } from '../../../api/modules/security/security.service'
import { IUserExternalCodes, UsersDTO } from '../../../api/modules/security/security.types'
import Page from '../../../components/commons/Page'
import { useAuth } from '../../../context/AuthContext'
import SkeletonList from '../../../components/Skeletons/SkeletonList'
import { ExecutionResponse } from '../../../api/modules/response.type'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import ConfirmDialog from '../../../components/commons/ConfirmDialog'
import SearchInput from '../../../components/commons/SearchInput'
import { Controller, useForm } from 'react-hook-form'
import AppInput from '../../../components/commons/AppInput'
import { AppError, handleError } from '../../../utils/errorHandler'
import ErrorState from '../../AdmSys/ErrorState'
import EmptyState from '../../AdmSys/EmptyState'
import { useShowToast } from '../../../utils/useShowToast'
import { usePageHeader } from '../../../hooks/usePageHeader'

type ChangePasswordForm = {
  CurrentPassword: string
  NewPassword: string
  ConfirmPassword: string
  ValidateAD: boolean
}

export type RootStackParamList = {
  home: undefined;
  usuario_form: { Id?: number };
};
type NavProps = NativeStackNavigationProp<RootStackParamList>;

export default function UsersScreen() {
  const navigation = useNavigation<NavProps>();
  const theme = useTheme()

  const RotateCwStyled = styled(RotateCw, { color: '$text' });
  const PlusStyled = styled(Plus, { color: '$text' });

  const [loading, setLoading] = useState(false)
  const [loadingSave, setLoadingSave] = useState(false)
  const [data, setData] = useState<UsersDTO[]>([])
  const [filtered, setFiltered] = useState<UsersDTO[]>([])
  const [selectedItem, setSelectedItem] = useState<UsersDTO | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [openExternalCodes, setOpenExternalCodes] = useState<number | null>(null)
  const [externalCodeDialog, setExternalCodeDialog] = useState(false)
  const [selectedUserForCode, setSelectedUserForCode] = useState<UsersDTO | null>(null)
  const [editingCode, setEditingCode] = useState<{ keyVar: string; externalCode: string } | null>(null)
  const [newKeyVar, setNewKeyVar] = useState('')
  const [newExternalCode, setNewExternalCode] = useState('')
  const [deleteCodeDialog, setDeleteCodeDialog] = useState(false)
  const [error, setError] = useState<AppError | null>(null)
  const [deletingCode, setDeletingCode] = useState<{ userId: number; keyVar: string } | null>(null) 
  const { user, companyId } = useAuth()
  const { showToast } = useShowToast()

  const canForceLogout = (user?.Access ?? '').split(',').map(s => s.trim()).includes('logoutUser')
  const [forceLogoutTarget, setForceLogoutTarget] = useState<UsersDTO | null>(null)
  const [forceLogoutOpen, setForceLogoutOpen] = useState(false)
  const [forceLogoutLoading, setForceLogoutLoading] = useState(false)

  const confirmForceLogout = async () => {
    if (!forceLogoutTarget?.Code) return
    try {
      setForceLogoutLoading(true)
      const resp = await securityService.forceLogout({ TargetUserCode: forceLogoutTarget.Code })
      if (resp?.Success) {
        showToast('success', 'Éxito', resp.SuccessMessage || 'Sesión cerrada', 5000, 'bottom')
      } else {
        showToast('error', 'Error', resp?.ErrorMessage || 'No se pudo cerrar la sesión', 5000, 'bottom')
      }
    } catch {
      showToast('error', 'Error', 'Ocurrió un error inesperado', 5000, 'bottom')
    } finally {
      setForceLogoutLoading(false)
      setForceLogoutOpen(false)
      setForceLogoutTarget(null)
    }
  }

  const confirmForceLogoutAndDeactivate = async () => {
    if (!forceLogoutTarget?.Code) return
    const target = forceLogoutTarget
    try {
      setForceLogoutLoading(true)

      const deact = await securityService.saveUsersSettings([{
        Id: target.Id,
        Code: target.Code ?? '',
        Theme: '',
        Status_Id: 2,
        Modified_By: user?.Code as string,
        Options: 2,
      }])

      const resp = await securityService.forceLogout({ TargetUserCode: target.Code })

      if (deact?.Success && resp?.Success) {
        showToast('success', 'Éxito', 'Sesión cerrada y usuario desactivado', 5000, 'bottom')
        setData(prev => prev.map(it =>
          it.Id === target.Id ? { ...it, Status_Id: 2, StatusName: 'Inactivo' } : it
        ))
      } else {
        showToast('error', 'Error', resp?.ErrorMessage || deact?.ErrorMessage || 'No se pudo completar la acción', 5000, 'bottom')
      }
    } catch {
      showToast('error', 'Error', 'Ocurrió un error inesperado', 5000, 'bottom')
    } finally {
      setForceLogoutLoading(false)
      setForceLogoutOpen(false)
      setForceLogoutTarget(null)
    }
  }

  const defaultValues: ChangePasswordForm = {
    CurrentPassword: '',
    NewPassword: '',
    ConfirmPassword: '',
    ValidateAD: false,
  }

  const { control, handleSubmit, formState: { errors }, reset, watch, clearErrors, setValue } = useForm<ChangePasswordForm>({ defaultValues, mode: 'onTouched' })
  const validateAD = watch('ValidateAD')

  const getInfo = React.useCallback(async () => {
    try {
      setLoading(true)
      const response: ExecutionResponse<UsersDTO[]> = await securityService.getUsers()
      if (response.Success) {
        const sortedData = [...(response.Data || [])].sort((a, b) => a.Status_Id - b.Status_Id)
        setData(sortedData)
        setFiltered(sortedData)
      }
    } catch (err) {
      setError(handleError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  const openForm = (Id?: number) => {
    navigation.navigate('usuario_form', { Id })
  }

  usePageHeader({
      center: (
      <Text fontSize={16} fontWeight="700" color="$text">
          Usuarios
      </Text>
      ),

      right: (
        <XStack gap="$2">
          <View onPress={() => getInfo()}>
            <RotateCwStyled size={18}  />
          </View>

          <View onPress={() => openForm()}  >
            <PlusStyled size={18}  />
          </View>
        </XStack>
      )
  })

  const toggleStatus = async () => {
    if (!selectedItem) return

    try {
      const newStatus = selectedItem.Status_Id === 1 ? 2 : 1

      let Data = {
        Id: selectedItem?.Id,
        Code: selectedItem?.Code ?? '',
        Theme: '',
        Status_Id: newStatus,
        Modified_By: user?.Code as string,
        Options: 2,
      }
      const response = await securityService.saveUsersSettings([Data])
      if (response.Success) {
        setData(prev =>
          prev.map(item =>
            item.Id === selectedItem.Id
              ? {
                ...item,
                Status_Id: newStatus,
                StatusName: newStatus === 1 ? 'Activo' : 'Inactivo',
              }
              : item
          )
        )
        showToast('success', 'Éxito', response.SuccessMessage, 5000, 'bottom')
      }
    } finally {
      setDialogOpen(false)
    }
  }

  const savePassword = async (data: ChangePasswordForm) => {
    setLoadingSave(true)
    try {
      let info = {
        Id: selectedItem?.Id,
        Code: selectedItem?.Code,
        CurrentPassword: data?.CurrentPassword,
        NewPassword: data?.NewPassword,
        ValidateAD: data?.ValidateAD,
        Modified_By: user?.Code,
      }

      const response: ExecutionResponse<any[]> = await securityService.changePassword(info)
      if (true) {
        showToast('success', 'Éxito', response.SuccessMessage || 'Registro guardado correctamente', 5000, 'bottom')
        setPasswordDialogOpen(false)
        reset(defaultValues)
        getInfo()
      } else {
        showToast('error', 'Error', response.ErrorMessage || 'Error al guardar', 5000, 'bottom')
      }
    } catch (error) {
      showToast('error', 'Error', 'Ocurrió un error inesperado', 5000, 'bottom')
    }
    setLoadingSave(false)
  }

  const getInfoDialog = async (item: UsersDTO) => {
    setValue('ValidateAD', item.ValidateAD ?? false)
    setSelectedItem(item)
    setPasswordDialogOpen(true)
  }

  const saveExternalCode = async () => {
    if (!selectedUserForCode || !newKeyVar.trim() || !newExternalCode.trim()) return
    setLoadingSave(true)
    try {
      const data: IUserExternalCodes = {
        Id: selectedUserForCode.Id,
        User_Code: selectedUserForCode.Code,
        KeyVar: newKeyVar.trim(),
        ExternalCode: newExternalCode.trim(),
        Status_Id: 1,
        Create_By: user?.Code as string,
      }
      const response = await securityService.saveUserExternalCodes([data])

      if (response.Success) {
        showToast('success', 'Éxito', response.SuccessMessage || 'Registro guardado correctamente', 5000, 'bottom')
        setExternalCodeDialog(false)
        setData(prev =>
          prev.map(u =>
            u.Id === selectedUserForCode.Id
              ? {
                  ...u,
                  DynamicColumns: {
                    ...u.DynamicColumns,
                    [newKeyVar.trim()]: newExternalCode.trim(),
                  },
                }
              : u
          )
        )
      } else {
        showToast('error', 'Error', response.ErrorMessage || 'Error al guardar', 5000, 'bottom')
      }
    } catch (error) {
      showToast('error', 'Error', 'Ocurrió un error inesperado', 5000, 'bottom')
    }
    setLoadingSave(false)
  }

  const eliminarCodigo = async () => {
    if (!deletingCode) return

    try {
      const data: IUserExternalCodes = {
        Id: selectedItem.Id,
        User_Code: selectedItem.Code,
        KeyVar: deletingCode?.keyVar,
        ExternalCode: newExternalCode.trim(),
        Status_Id: 2,
        Create_By: user?.Code as string,
      }
      const response = await securityService.saveUserExternalCodes([data])

      if (response.Success) {
        showToast('success', 'Éxito', response.SuccessMessage || 'Eliminado correctamente', 5000, 'bottom')
        setExternalCodeDialog(false)
        setData(prev =>
          prev.map(u =>
            u.Id === deletingCode.userId
              ? {
                  ...u,
                  DynamicColumns: {
                    ...u.DynamicColumns,
                    [deletingCode.keyVar]: '',
                  },
                }
              : u
          )
        )
      } else {
        showToast('error', 'Error', response.ErrorMessage || 'Error al guardar', 5000, 'bottom')
      }
    } catch (error) {
      showToast('error', 'Error', 'Ocurrió un error inesperado', 5000, 'bottom')
    }
    setDeleteCodeDialog(false)
    setDeletingCode(null)
  }

  useFocusEffect(
    React.useCallback(() => {
      getInfo()
    }, [getInfo])
  )

  useEffect(() => {
    getInfo()
  }, [])

  useEffect(() => {
    setFiltered(data)
  }, [data])

  return (
    <Page >
      <YStack
        flex={1}
        backgroundColor="$backgroundPage"
        padding="$3"
      >
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
              searchKeys={['Name', 'LastName', 'Code', 'Roles']}
              onResults={setFiltered}
              placeholder="Buscar..."
            />
            <ScrollView showsVerticalScrollIndicator={false} marginBottom="$3">

              {(filtered?.length ?? 0) === 0 ? (
                <EmptyState onAction={() => getInfo()} />
              ) : (
                (filtered ?? []).map((item) => {
                  const roles = item.Roles ? item.Roles.split(',').map(r => r.trim()) : []
                  const visibleRoles = roles.slice(0, 3)
                  const remainingRoles = roles.length - 3

                  const dynamicCodes = item.DynamicColumns
                    ? Object.entries(item.DynamicColumns).filter(([key]) => key !== 'RoleIds')
                    : []
                  const isExternalOpen = openExternalCodes === item.Id
                  const isActive = item?.Status_Id === 1

                  return (
                    <Card
                      key={item.Id}
                      backgroundColor="$backgroundElevated"
                      borderRadius={10}
                      marginBottom="$2"
                      overflow="hidden"
                    >
                      <XStack padding="$3" justifyContent="space-between" alignItems="flex-start">

                        {/* INFO */}
                        <YStack flex={1} gap="$1">
                          <Text fontSize={14} fontWeight="800" color="$text">
                            {item.Name} {item.LastName}
                          </Text>
                          <Text fontSize={11} color="$textMuted">
                            {item.Code}
                          </Text>

                          {/* Roles como chips — solo si existen */}
                          {roles.length > 0 && (
                            <XStack flexWrap="wrap" gap="$1" paddingTop="$1">
                              {visibleRoles.map((role, index) => (
                                <View
                                  key={`${role}-${index}`}
                                  backgroundColor="$backgroundSurface"
                                  paddingHorizontal={7}
                                  paddingVertical={2}
                                  borderRadius={999}
                                >
                                  <Text fontSize={10} color="$textMuted" fontWeight="600">{role}</Text>
                                </View>
                              ))}
                              {remainingRoles > 0 && (
                                <View
                                  backgroundColor="$backgroundSurface"
                                  paddingHorizontal={7}
                                  paddingVertical={2}
                                  borderRadius={999}
                                >
                                  <Text fontSize={10} color="$textMuted" fontWeight="600">+{remainingRoles}</Text>
                                </View>
                              )}
                            </XStack>
                          )}
                        </YStack>

                        {/* ACCIONES */}
                        <YStack alignItems="flex-end" gap="$2">
                          {/* Badge status */}
                          <View
                            borderRadius={999}
                            backgroundColor={isActive ? '#22c55e' : '#ef4444'}
                            paddingHorizontal={8}
                            paddingVertical={2}
                            pressStyle={{ opacity: 0.7 }}
                            onPress={() => {
                              setSelectedItem(item)
                              setDialogOpen(true)
                            }}
                          >
                            <Text fontSize={10} color="white" fontWeight="700">
                              {isActive ? 'Activo' : 'Inactivo'}
                            </Text>
                          </View>

                          {/* Iconos de acción — solo si está activo */}
                          {isActive && (
                            <XStack gap="$3" alignItems="center">
                              <View
                                borderRadius={8}
                                pressStyle={{ opacity: 0.6, scale: 0.95 }}
                                onPress={() => openForm(item?.Id)}
                              >
                                <Pencil size={15} color={theme.primary?.val} />
                              </View>

                              <View
                                pressStyle={{ opacity: 0.6, scale: 0.95 }}
                                onPress={() => getInfoDialog(item)}
                              >
                                <KeyRound size={15} color={theme.primary?.val} />
                              </View>

                              {canForceLogout  && (
                                <View
                                  pressStyle={{ opacity: 0.6, scale: 0.95 }}
                                  onPress={() => { setForceLogoutTarget(item); setForceLogoutOpen(true) }}
                                >
                                  <LogOut size={15} color={theme.error?.val ?? '#EF4444'} />
                                </View>
                              )}
                            </XStack>
                          )}
                        </YStack>

                      </XStack>

                      {/* SECCIÓN CÓDIGOS EXTERNOS — solo si hay y está activo */}
                      {dynamicCodes.length > 0 && isActive && (
                        <>
                          {/* Trigger del acordeón */}
                          <XStack
                            borderTopWidth={1}
                            borderTopColor="$border"
                            paddingHorizontal="$3"
                            paddingVertical="$2"
                            alignItems="center"
                            justifyContent="space-between"
                            pressStyle={{ opacity: 0.7 }}
                            onPress={() => setOpenExternalCodes(isExternalOpen ? null : item.Id)}
                          >
                            <XStack alignItems="center" gap="$2">
                              <KeyRound size={14} color={isExternalOpen ? '#FF551A' : '#94A3B8'} />
                              <Text
                                fontSize={13}
                                fontWeight="600"
                                color={isExternalOpen ? '$primary' : '$textMuted'}
                              >
                                Códigos externos · {dynamicCodes.length}
                              </Text>
                              {isExternalOpen
                                ? <ChevronUp size={12} color="#94A3B8" />
                                : <ChevronDown size={12} color="#94A3B8" />
                              }
                            </XStack>

                            {/* Botón agregar */}
                            <View
                              width={22}
                              height={22}
                              borderRadius={8}
                              backgroundColor="rgba(255,85,26,0.12)"
                              justifyContent="center"
                              alignItems="center"
                              pressStyle={{ opacity: 0.6 }}
                              onPress={() => {
                                setSelectedUserForCode(item)
                                setEditingCode(null)
                                setNewKeyVar('')
                                setNewExternalCode('')
                                setExternalCodeDialog(true)
                              }}
                            >
                              <Plus size={14} color="#FF551A" />
                            </View>
                          </XStack>

                          {/* Lista de códigos expandida */}
                          {isExternalOpen && (
                            <YStack
                              paddingHorizontal="$3"
                              paddingBottom="$3"
                              paddingTop="$1"
                              gap="$1.5"
                            >
                              {dynamicCodes.map(([keyVar, externalCode]) => (
                                <XStack
                                  key={keyVar}
                                  alignItems="center"
                                  gap="$2"
                                  backgroundColor="$backgroundSurface"
                                  borderRadius="$2"
                                  paddingHorizontal="$2.5"
                                  paddingVertical="$1.5"
                                >
                                  {/* Key */}
                                  <View
                                    backgroundColor="rgba(255,85,26,0.10)"
                                    paddingHorizontal="$2"
                                    paddingVertical={2}
                                    borderRadius="$2"
                                    minWidth={55}
                                    alignItems="center"
                                  >
                                    <Text fontSize={12} color="$primary" fontWeight="700">
                                      {keyVar}
                                    </Text>
                                  </View>

                                  <Text fontSize={12} color="$textMuted">→</Text>

                                  {/* Valor */}
                                  <Text
                                    fontSize={13}
                                    color={externalCode ? '$text' : '$textMuted'}
                                    fontWeight={externalCode ? '600' : '400'}
                                    flex={1}
                                  >
                                    {externalCode ? String(externalCode) : 'Sin asignar'}
                                  </Text>

                                  {/* Acciones por fila — solo si no es IMCore */}
                                  {keyVar !== 'IMCore' && (
                                    <XStack gap="$2">
                                      <View
                                        pressStyle={{ opacity: 0.6 }}
                                        padding="$1"
                                        onPress={() => {
                                          setSelectedUserForCode(item)
                                          setEditingCode({ keyVar, externalCode: String(externalCode) })
                                          setNewKeyVar(keyVar)
                                          setNewExternalCode(String(externalCode))
                                          setExternalCodeDialog(true)
                                        }}
                                      >
                                        <Pencil size={16} color="#132902" />
                                      </View>

                                      {externalCode && (
                                        <View
                                          pressStyle={{ opacity: 0.6 }}
                                          padding="$1"
                                          onPress={() => {
                                            setSelectedItem(item)
                                            setDeletingCode({ userId: item.Id, keyVar })
                                            setDeleteCodeDialog(true)
                                          }}
                                        >
                                          <Trash2 size={16} color="#ef4444" />
                                        </View>
                                      )}
                                    </XStack>
                                  )}
                                </XStack>
                              ))}
                            </YStack>
                          )}
                        </>
                      )}
                    </Card>
                  )
                })
              )}
            </ScrollView>
          </>
        )}
      </YStack>

      <ConfirmDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={selectedItem?.Status_Id === 1 ? 'Desactivar usuario' : 'Activar usuario'}
        message={selectedItem?.Status_Id === 1
          ? `¿Deseas desactivar el usuario "${selectedItem?.Name}"?`
          : `¿Deseas activar el usuario "${selectedItem?.Name}"?`
        }
        confirmLabel={selectedItem?.Status_Id === 1 ? 'Desactivar' : 'Activar'}
        confirmColor={selectedItem?.Status_Id === 1 ? '#ef4444' : '#22c55e'}
        onConfirm={toggleStatus}
      />

      <ConfirmDialog
        open={forceLogoutOpen}
        onOpenChange={() => setForceLogoutOpen(false)}
        title="Cerrar sesión del usuario"
        message={`¿Deseas cerrar la sesión de "${forceLogoutTarget?.Name ?? ''} ${forceLogoutTarget?.LastName ?? ''}" (${forceLogoutTarget?.Code ?? ''})?`}
        confirmLabel="Cerrar sesión"
        confirmColor="$secondary"
        onConfirm={confirmForceLogout}
        secondaryLabel="Cerrar sesión y desactivar"
        secondaryColor="$primary"
        onSecondary={confirmForceLogoutAndDeactivate}
        onCancel={() => { setForceLogoutOpen(false); setForceLogoutTarget(null) }}
        loading={forceLogoutLoading}
      />

      <ConfirmDialog
        open={deleteCodeDialog}
        onOpenChange={setDeleteCodeDialog}
        title="Eliminar código externo"
        message={`¿Deseas eliminar el código externo "${deletingCode?.keyVar}" del usuario "${selectedItem?.Code}"?`}
        confirmLabel="Eliminar"
        confirmColor="#ef4444"
        onConfirm={() => {
          eliminarCodigo()
        }}
      />

      <Dialog
        modal
        open={passwordDialogOpen}
        onOpenChange={setPasswordDialogOpen}
      >
        <Dialog.Portal>
          <Dialog.Overlay
            bg="rgba(0,0,0,0.5)"
            animation="quick"
            enterStyle={{ opacity: 0 }}
            exitStyle={{ opacity: 0 }}
          />

          <Dialog.Content
            width="90%"
            bordered
            elevate
            padding={0}
            enterStyle={{ opacity: 0, scale: 0.95, y: 20 }}
            exitStyle={{ opacity: 0, scale: 0.95, y: 10 }}
          >
            <View position="relative" padding="$4" borderRadius="$4" overflow="hidden">

              {/* Overlay loading */}
              {loadingSave && (
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

              <Dialog.Title fontSize={18} fontWeight="700">
                Cambiar contraseña
              </Dialog.Title>

              <Dialog.Description fontSize={14} marginBottom="$2">
                Usuario: {selectedItem?.Name} {selectedItem?.LastName}
              </Dialog.Description>

              <YStack gap="$3">
                <Controller
                  control={control}
                  name="ValidateAD"
                  render={({ field: { value, onChange } }) => (
                    <XStack
                      backgroundColor={value ? 'rgba(255, 85, 26, 0.06)' : '$backgroundElevated'}
                      borderWidth={1.5}
                      borderColor={value ? '$primary' : '$border'}
                      borderRadius="$5"
                      padding="$3"
                      marginTop="$3"
                      alignItems="center"
                      gap="$3"
                      pressStyle={{ opacity: 0.8 }}
                      onPress={() => {
                        onChange(!value)
                        if (!value) {
                          clearErrors(['NewPassword', 'ConfirmPassword'])
                        }
                      }}
                    >
                      <YStack flex={1} gap="$0.5">
                        <Text fontSize={14} fontWeight="700" color="$text">
                          Active Directory
                        </Text>
                        <Text fontSize={12} color="$textMuted" lineHeight={18}>
                          El usuario iniciará sesión utilizando sus credenciales de dominio.
                        </Text>
                      </YStack>

                      <View
                        width={42}
                        height={24}
                        borderRadius={12}
                        backgroundColor={value ? '$primary' : '$textDisabled'}
                        justifyContent="center"
                        paddingHorizontal={3}
                      >
                        <View
                          width={18}
                          height={18}
                          borderRadius={9}
                          backgroundColor="white"
                          alignSelf={value ? 'flex-end' : 'flex-start'}
                          shadowColor="#000"
                          shadowOffset={{ width: 0, height: 1 }}
                          shadowOpacity={0.15}
                          shadowRadius={2}
                        />
                      </View>
                    </XStack>
                  )}
                />

                {!validateAD && (
                  <>
                    <Controller
                      control={control}
                      name="CurrentPassword"
                      rules={{ required: 'La contraseña actual es requerida' }}
                      render={({ field: { onChange, value } }) => (
                        <AppInput
                          label="Contraseña actual"
                          value={value}
                          onChangeText={onChange}
                          secureTextEntry={!showCurrentPassword}
                          error={errors.CurrentPassword?.message}
                          rightElement={
                            <View
                              onPress={() => setShowCurrentPassword((prev) => !prev)}
                              pressStyle={{ opacity: 0.6 }}
                              padding="$2"
                            >
                              {showCurrentPassword
                                ? <EyeOff size={18} color="#94A3B8" />
                                : <Eye size={18} color="#94A3B8" />
                              }
                            </View>
                          }
                        />
                      )}
                    />

                    <Controller
                      control={control}
                      name="NewPassword"
                      rules={{
                        required: 'La nueva contraseña es requerida',
                        minLength: { value: 8, message: 'Debe contener al menos 8 caracteres' },
                      }}
                      render={({ field: { onChange, value } }) => (
                        <AppInput
                          label="Nueva contraseña"
                          value={value}
                          onChangeText={onChange}
                          secureTextEntry={!showNewPassword}
                          error={errors.NewPassword?.message}
                          rightElement={
                            <View
                              onPress={() => setShowNewPassword((prev) => !prev)}
                              pressStyle={{ opacity: 0.6 }}
                              padding="$2"
                            >
                              {showNewPassword
                                ? <EyeOff size={18} color="#94A3B8" />
                                : <Eye size={18} color="#94A3B8" />
                              }
                            </View>
                          }
                        />
                      )}
                    />

                    <Controller
                      control={control}
                      name="ConfirmPassword"
                      rules={{
                        required: 'Debe confirmar la contraseña',
                        validate: (value) =>
                          value === watch('NewPassword') || 'Las contraseñas no coinciden',
                      }}
                      render={({ field: { onChange, value } }) => (
                        <AppInput
                          label="Confirmar contraseña"
                          value={value}
                          onChangeText={onChange}
                          secureTextEntry={!showConfirmPassword}
                          error={errors.ConfirmPassword?.message}
                          rightElement={
                            <View
                              onPress={() => setShowConfirmPassword((prev) => !prev)}
                              pressStyle={{ opacity: 0.6 }}
                              padding="$2"
                            >
                              {showConfirmPassword
                                ? <EyeOff size={18} color="#94A3B8" />
                                : <Eye size={18} color="#94A3B8" />
                              }
                            </View>
                          }
                        />
                      )}
                    />
                  </>
                )}
              </YStack>

              <XStack gap="$2" marginTop="$4">
                <Dialog.Close asChild>
                  <Button
                    flex={1}
                    backgroundColor="$buttonSecondary"
                    height={45}
                    borderRadius="$3"
                    justifyContent="center"
                    alignItems="center"
                    pressStyle={{ opacity: 0.7 }}
                    disabled={loadingSave}
                    opacity={loadingSave ? 0.5 : 1}
                    onPress={() => reset(defaultValues)}
                  >
                    <Text color="$text" fontWeight="700">Cancelar</Text>
                  </Button>
                </Dialog.Close>

                <Button
                  flex={1}
                  backgroundColor="$primary"
                  height={45}
                  borderRadius="$3"
                  justifyContent="center"
                  alignItems="center"
                  pressStyle={{ opacity: 0.7 }}
                  disabled={loadingSave}
                  opacity={loadingSave ? 0.5 : 1}
                  onPress={handleSubmit(savePassword)}
                >
                  <Text color="$white" fontWeight="700">Aceptar</Text>
                </Button>
              </XStack>

            </View>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>


      <Dialog modal open={externalCodeDialog} onOpenChange={setExternalCodeDialog}>
        <Dialog.Portal>
          <Dialog.Overlay bg="rgba(0,0,0,0.5)" animation="quick" enterStyle={{ opacity: 0 }} exitStyle={{ opacity: 0 }} />
          <Dialog.Content width="90%" bordered elevate padding={0} enterStyle={{ opacity: 0, scale: 0.95, y: 20 }} exitStyle={{ opacity: 0, scale: 0.95, y: 10 }}>
            <View padding="$4" borderRadius="$4">

              <Dialog.Title fontSize={16} fontWeight="700">
                {editingCode ? 'Editar código externo' : 'Agregar código externo'}
              </Dialog.Title>
              <Dialog.Description fontSize={13} marginBottom="$3">
                {selectedUserForCode?.Name} {selectedUserForCode?.LastName}
              </Dialog.Description>

              <YStack gap="$3">
                <AppInput
                  label="Clave (KeyVar)"
                  value={newKeyVar}
                  onChangeText={setNewKeyVar}
                  // editable={!editingCode} // si edita, la clave no cambia
                  opacity={editingCode ? 0.5 : 1}
                />
                <AppInput
                  label="Código externo"
                  value={newExternalCode}
                  onChangeText={setNewExternalCode}
                />
              </YStack>

              <XStack gap="$2" marginTop="$4">
                <Dialog.Close asChild>
                  <Button flex={1} backgroundColor="$buttonSecondary" height={45} borderRadius="$3" pressStyle={{ opacity: 0.7 }}>
                    <Text color="$text" fontWeight="700">Cancelar</Text>
                  </Button>
                </Dialog.Close>

                <Button
                  flex={1}
                  backgroundColor="$primary"
                  height={45}
                  borderRadius="$3"
                  pressStyle={{ opacity: 0.7 }}
                  disabled={!newKeyVar.trim() || !newExternalCode.trim()}
                  opacity={!newKeyVar.trim() || !newExternalCode.trim() ? 0.5 : 1}
                  onPress={() => {
                    saveExternalCode()
                  }}
                >
                  <Text color="$white" fontWeight="700">Guardar</Text>
                </Button>
              </XStack>
            </View>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
    </Page>
  )
}