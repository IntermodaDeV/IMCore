import * as Burnt from 'burnt'
import React, { useEffect, useState } from 'react'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { Plus, RotateCw, Pencil, KeyRound, Eye, EyeOff } from 'lucide-react-native'
import { YStack, Text, ScrollView, Card, XStack, View, useTheme, Popover, Button, Dialog, Spinner } from 'tamagui'
import { securityService } from '../../../api/modules/security/security.service'
import { UsersDTO } from '../../../api/modules/security/security.types'
import Page from '../../../components/commons/Page'
import { useAuth } from '../../../context/AuthContext'
import SkeletonList from '../../../components/Skeletons/SkeletonList'
import { ExecutionResponse } from '../../../api/modules/response.type'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import ConfirmDialog from '../../../components/commons/ConfirmDialog'
import SearchInput from '../../../components/commons/SearchInput'
import { Controller, useForm } from 'react-hook-form'
import AppInput from '../../../components/commons/AppInput'

type ChangePasswordForm = {
  CurrentPassword: string
  NewPassword: string
  ConfirmPassword: string
  ValidateAD: boolean
}

export type RootStackParamList = {
  home: undefined;
  users_form: { Id?: number };
};
type NavProps = NativeStackNavigationProp<RootStackParamList>;

export default function UsersScreen() {
  const navigation = useNavigation<NavProps>();
  const theme = useTheme()
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
  const { user } = useAuth()

  const defaultValues: ChangePasswordForm = {
    CurrentPassword: '',
    NewPassword: '',
    ConfirmPassword: '',
    ValidateAD: false,
  }

  const { control, handleSubmit, formState: { errors }, reset, watch, clearErrors, setValue } = useForm<ChangePasswordForm>({defaultValues,mode: 'onTouched'})
  const validateAD = watch('ValidateAD')


  const getInfo = React.useCallback(async () => {
    try {
      setLoading(true)
      const response: ExecutionResponse<UsersDTO[]> = await securityService.getUsers()
      if(response.Success){
        setData(response?.Data)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const openForm = (Id?: number) => {
    navigation.navigate('users_form', { Id })
  }

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
        Burnt.toast({ title: response.SuccessMessage, message: '', preset: 'done'})
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
        Burnt.toast({ title: response.SuccessMessage || 'Registro guardado correctamente', message: '', preset: 'done' })
        setPasswordDialogOpen(false)
        reset(defaultValues)
        getInfo()
      } else {
        Burnt.toast({ title: response.ErrorMessage || 'Error al guardar', message: '', preset: 'error' })
      }
    } catch (error) {
      Burnt.toast({ title: 'Ocurrió un error inesperado', message: '', preset: 'error' })
    }
    setLoadingSave(false)
  }


  const getInfoDialog = async (item: UsersDTO) => {
    setValue('ValidateAD', item.ValidateAD ?? false)
    setSelectedItem(item)
    setPasswordDialogOpen(true)
  }

  useFocusEffect(
    React.useCallback(() => {
      getInfo()
    }, [getInfo])
  )

  useEffect(() => {
    getInfo()
  }, [])

  const headerActions = React.useMemo(() => [
    {
      icon: RotateCw,
      onPress: () => getInfo(),
    },
    {
      icon: Plus,
      onPress: () => openForm(),
    },
  ], [getInfo])

  useEffect(() => {
    setFiltered(data)
  }, [data])

  return (
    <Page headerActions={headerActions}>
      <YStack
        flex={1}
        backgroundColor="$card2"
        padding="$3"
      >
        {loading ? (
          <SkeletonList/>
        ) : (

          <>
            <SearchInput
              data={data}
              searchKeys={['Name', 'LastName', 'Code','Roles']}
              onResults={setFiltered}
              placeholder="Buscar..."
            />
            <ScrollView
              showsVerticalScrollIndicator={false}
              marginBottom="$3"
            >
              {filtered.map((item) => {
                const initials = `${item.Name?.charAt(0) ?? ''}${item.LastName?.charAt(0) ?? ''}`.toUpperCase()
                const roles = item.Roles ? item.Roles.split(',').map(r => r.trim()) : []
                const visibleRoles = roles.slice(0, 4)
                const remainingRoles = roles.length - 4

                return (
                  <Card
                    key={item.Id}
                    backgroundColor="$backgroundPage"
                    borderRadius={10}
                    padding="$3"
                    marginBottom="$2"
                  >
                    <YStack gap="$2">
                      <XStack
                        justifyContent="space-between"
                        alignItems="flex-start"
                      >
                        <XStack gap="$3" flex={1}>
                          {/* Avatar */}
                          <View
                            width={40}
                            height={40}
                            borderRadius={25}
                            borderWidth={2.5}
                            borderColor="$primary"
                            justifyContent="center"
                            alignItems="center"
                            padding={2}
                          >
                            <View
                              width={32}
                              height={32}
                              borderRadius={21}
                              backgroundColor="$secondary"
                              justifyContent="center"
                              alignItems="center"
                            >
                              <Text
                                color="white"
                                fontSize={16}
                                fontWeight="700"
                              >
                                {initials}
                              </Text>
                            </View>
                          </View>

                          {/* Información */}
                          <YStack flex={1}>
                            <Text
                              fontSize={14}
                              fontWeight="800"
                              color="$text"
                            >
                              {item.Name} {item.LastName}
                            </Text>

                            <Text
                              fontSize={11}
                              color="$text"
                            >
                              {item.Code}
                            </Text>

                          </YStack>
                        </XStack>

                        {/* Acciones */}
                        <XStack
                          alignItems="center"
                          gap="$3"
                        >
                          <View
                              borderRadius={999}
                              backgroundColor={item?.Status_Id === 1 ? '#22c55e' : '#ef4444'}
                              paddingHorizontal={8}
                              paddingVertical={2}
                              pressStyle={{ opacity: 0.7 }}
                              onPress={() => {
                                setSelectedItem(item)
                                setDialogOpen(true)
                              }}
                            >
                              <Text fontSize={10} color="white" fontWeight="700">
                                {item?.Status_Id === 1 ? 'Activo' : 'Inactivo'}
                              </Text>
                          </View>

                          {item?.Status_Id === 1 && (
                            <XStack gap="$3" alignItems="center">

                              {/* Edit */}
                              <View
                                borderRadius={8}
                                pressStyle={{ opacity: 0.6, scale: 0.95 }}
                                onPress={() => openForm(item?.Id)}
                              >
                                <Pencil size={16} color={theme.primary?.val} />
                              </View>

                              {/* Password */}
                              <View
                                pressStyle={{ opacity: 0.6, scale: 0.95 }}
                                onPress={() => {
                                  getInfoDialog(item)
                                }}
                              >
                                <KeyRound size={16} color={theme.primary?.val} />
                              </View>

                            </XStack>
                          )}
                        </XStack>
                      </XStack>


                      <YStack gap="$4">
                        {roles.length > 0 && (
                          <XStack
                            flexWrap="wrap"
                            gap="$1"
                            paddingTop="$1"
                          >
                            {visibleRoles.map((role, index) => (
                              <View
                                key={`${role}-${index}`}
                                backgroundColor="#bcbcbc"
                                paddingHorizontal={8}
                                paddingVertical={3}
                                borderRadius={999}
                              >
                                <Text
                                  fontSize={10}
                                  fontWeight="600"
                                >
                                  {role}
                                </Text>
                              </View>
                            ))}

                            {remainingRoles > 0 && (
                              <View
                                backgroundColor="#bcbcbc"
                                paddingHorizontal={8}
                                paddingVertical={3}
                                borderRadius={999}
                              >
                                <Text
                                  fontSize={10}
                                  fontWeight="600"
                                >
                                  +{remainingRoles}
                                </Text>
                              </View>
                            )}
                          </XStack>
                        )}
                      </YStack>
                    </YStack>
                  </Card>
                )
              })}
            </ScrollView>
          </>
        )}
      </YStack>

      <ConfirmDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={selectedItem?.Status_Id === 1 ? 'Desactivar usuario' : 'Activar usuario'}
        message={ selectedItem?.Status_Id === 1
                ? `¿Deseas desactivar el usuario "${selectedItem?.Name}"?`
                : `¿Deseas activar el usuario "${selectedItem?.Name}"?`
        }
        confirmLabel={selectedItem?.Status_Id === 1? 'Desactivar' : 'Activar'}
        confirmColor={selectedItem?.Status_Id === 1 ? '#ef4444' : '#22c55e'}
        onConfirm={toggleStatus}
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
                                    backgroundColor={value ? 'rgba(255, 85, 26, 0.06)' : '$card2'}
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
                                        backgroundColor={value ? '$primary' : '$buttonCancel'}
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
                                backgroundColor="$buttonCancel"
                                height={45}
                                borderRadius="$3"
                                justifyContent="center"
                                alignItems="center"
                                pressStyle={{ opacity: 0.7 }}
                                disabled={loadingSave}
                                opacity={loadingSave ? 0.5 : 1}
                                onPress={() => reset(defaultValues)}
                            >
                                <Text color="black" fontWeight="700">Cancelar</Text>
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
    </Page>
  )
}