import { useShowToast } from '../../../utils/useShowToast'
import React, { useEffect, useState } from 'react'
import { YStack, Button, Text, XStack, View, ScrollView, Spinner, Checkbox } from 'tamagui'
import { useNavigation, useRoute } from '@react-navigation/native'
import Page from '../../../components/commons/Page'
import { Controller, useForm } from 'react-hook-form'
import AppInput from '../../../components/commons/AppInput'
import { AccessDTO, IAccessControl, RolesDTO, UsersDTO } from '../../../api/modules/security/security.types'
import { securityService } from '../../../api/modules/security/security.service'
import { ExecutionResponse } from '../../../api/modules/response.type'
import { useAuth } from '../../../context/AuthContext'
import SkeletonForm from '../../../components/Skeletons/SkeletonForm'
import { Shield, User } from 'lucide-react-native'
import SearchInput from '../../../components/commons/SearchInput'
import { handleError } from '../../../utils/errorHandler'

type TabType = 'general' | 'usuarios' | 'roles'

export default function AccessForm() {
    const navigation = useNavigation()
    const route = useRoute()
    const { Id } = route.params as { Id?: number }
    const [loading, setLoading] = useState(false)
    const [users, setUsers] = useState<UsersDTO[]>([])
    const [roles, setRoles] = useState<RolesDTO[]>([])
    const [accessControl, setAccessControl] = useState<IAccessControl[]>([])
    const [loadingSave, setLoadingSave] = useState(false)
    const [activeTab, setActiveTab] = useState<TabType>('general')
    const [filteredUsers, setFilteredUsers] = useState<UsersDTO[]>([])
    const [filteredRoles, setFilteredRoles] = useState<RolesDTO[]>([])
    const [loadingToggle, setLoadingToggle] = useState<string | number |  null>(null)
    const { user } = useAuth()
    const { showToast } = useShowToast()
    const isEdit = !!Id

    const defaultValues: AccessDTO = {
        Id: -1,
        Name: '',
        KeyVar: '',
        Description: '',
        Status_Id: 1,
        Create_By: '',
        Creation_Date: '',
        Modified_By: null,
        Modification_Date: null,
        Status_Name: ''
    }

    const { control, handleSubmit, formState: { errors }, reset, getValues } = useForm<AccessDTO>({ defaultValues, mode: 'onTouched' })

    const save = handleSubmit(async (data: AccessDTO) => {
        setLoadingSave(true)
        try {
            let info: AccessDTO = {
                Id: data.Id,
                Name: data.Name,
                KeyVar: data.KeyVar,
                Description: data.Description,
                Create_By: user?.Code ?? '',
                Status_Id: data.Status_Id,
                Status_Name: '',
                Modified_By: user?.Code ?? '',
                Creation_Date: data.Creation_Date || new Date().toISOString(),
                Modification_Date: new Date().toISOString(),
            }

            const response: ExecutionResponse<AccessDTO[]> = await securityService.saveAccess([info])
            if (response.Success) {
                showToast('success', 'Éxito', response.SuccessMessage || 'Registro guardado correctamente', 5000, 'bottom')
                navigation.goBack()
            } else {
                showToast('error', 'Error', response.ErrorMessage || 'Error al guardar', 5000, 'bottom')
            }
        } catch (error) {
            setLoadingSave(false)
        }
        setLoadingSave(false)
    }, () => {
        showToast('error', 'Error', 'Complete los campos requeridos', 5000, 'bottom')
        setLoadingSave(false)
    })

    const getInfo = async () => {
        setLoading(true)

        try {
            if(activeTab === 'general'){
                if (Id) {
                    const response: ExecutionResponse<AccessDTO[]> = await securityService.getAccessById(Id)
                    if (response.Success) {
                        reset(response.Data[0])
                        navigation.setOptions({ title: isEdit ? `Editar acceso: ${getValues('Name')}` : 'Nuevo acceso' })
                    } else {
                        showToast('error', 'Error', response?.ErrorMessage || 'Error al obtener la información', 5000, 'bottom')
                        setLoading(false)
                    }
                }
            }else if(activeTab === 'usuarios'){
                const response: ExecutionResponse<UsersDTO[]> = await securityService.getUsers()
                if (response.Success) {
                    setUsers(response.Data?.filter(u => u.Status_Id === 1) ?? [])
                    const resp: ExecutionResponse<IAccessControl[]> = await securityService.getAccessControl(6, Id as number)
                    setAccessControl(resp.Data ?? []) 
                } else {
                    showToast('error', 'Error', response?.ErrorMessage || 'Error al obtener la información', 5000, 'bottom')
                    setLoading(false)
                }
            }else{
                const response: ExecutionResponse<RolesDTO[]> = await securityService.getRoles()
                if (response.Success) {
                    setRoles(response.Data?.filter(r => r.Status_Id === 1) ?? [])
                    const resp: ExecutionResponse<IAccessControl[]> = await securityService.getAccessControl(7, Id as number)
                    setAccessControl(resp.Data ?? []) 
                } else {
                    showToast('error', 'Error', response?.ErrorMessage || 'Error al obtener la información', 5000, 'bottom')
                    setLoading(false)
                }
            }
        }catch (err) {
            const error = handleError(err)
            showToast('error', 'Error', error.message, 5000, 'bottom')
            if (navigation.canGoBack()) {
                navigation.goBack()
            }
        } finally {
            setLoading(false)
        }
        setLoading(false)
    }

    const getInfoSinLonuding = async () => {
        if(activeTab === 'usuarios'){
            const resp: ExecutionResponse<IAccessControl[]> = await securityService.getAccessControl(6, Id as number)
            setAccessControl(resp.Data ?? []) 
            
        }else{
            const resp: ExecutionResponse<IAccessControl[]> = await securityService.getAccessControl(7, Id as number)
            setAccessControl(resp.Data ?? []) 
        }
    }

    const toggleUserAccess = async (selectedUser: UsersDTO) => {
        const existing = accessControl.find((ac) => ac.User_Code === selectedUser.Code)
        let payload: IAccessControl

        setLoadingToggle(selectedUser.Code)
        if (!existing) {
            payload = {
                Id: -1,
                User_Code: selectedUser.Code,
                Access_Id: Id as number,
                Rol_Id: null,
                Status_Id: 1,
                Type_Id: 6,
                Create_By: user?.Code ?? '',
            }
        } else if (existing.Status_Id === 1) {
            payload = { ...existing, Status_Id: 2, Type_Id: 6, Create_By: user?.Code as string}
        } else {
            payload = { ...existing, Status_Id: 1, Type_Id: 6, Create_By: user?.Code as string}
        }
        try {
            const response = await securityService.saveAccessControl([payload])
            if (response.Success) {
                if (!existing) {
                    // setAccessControl((prev) => [...prev, { ...payload, Id: response.Data?.Id ?? -1 }])
                    setAccessControl((prev) => [...prev, { ...payload, Id: response.Data?.[0]?.Id ?? -1 }])
                } else {
                    setAccessControl((prev) =>
                        prev.map((ac) =>
                            ac.User_Code === selectedUser.Code
                                ? { ...ac, Status_Id: payload.Status_Id }
                                : ac
                        )
                    )
                }
                getInfoSinLonuding()
                showToast('success', 'Éxito', response.SuccessMessage || 'Operación realizada correctamente', 5000, 'bottom')
            } else {
                showToast('error', 'Error', response.ErrorMessage || 'Error al actualizar', 5000, 'bottom')
            }
        } catch {
            showToast('error', 'Error', 'Ocurrió un error inesperado', 5000, 'bottom')
        }
        setLoadingToggle(null)
    }

    const toggleRolAccess = async (selectedUser: RolesDTO) => {
        const existing = accessControl.find((ac) => ac.Rol_Id === selectedUser.Id)
        let payload: IAccessControl

        setLoadingToggle(selectedUser.Id)
        if (!existing) {
            payload = {
                Id: -1,
                User_Code: null,
                Access_Id: Id as number,
                Rol_Id: selectedUser.Id,
                Status_Id: 1,
                Type_Id: 7,
                Create_By: user?.Code ?? '',
            }
        } else if (existing.Status_Id === 1) {
            payload = { ...existing, Status_Id: 2, Type_Id: 7, Create_By: user?.Code as string}
        } else {
            payload = { ...existing, Status_Id: 1, Type_Id: 7, Create_By: user?.Code as string}
        }
        try {
            const response = await securityService.saveAccessControl([payload])
            if (response.Success) {
                if (!existing) {
                    setAccessControl((prev) => [...prev, { ...payload, Id: response.Data?.[0]?.Id ?? -1 }])
                } else {
                    setAccessControl((prev) =>
                        prev.map((ac) =>
                            ac.Rol_Id === selectedUser.Id
                                ? { ...ac, Status_Id: payload.Status_Id }
                                : ac
                        )
                    )
                }
                getInfoSinLonuding()
                showToast('success', 'Éxito', response.SuccessMessage || 'Operación realizada correctamente', 5000, 'bottom')
            } else {
                showToast('error', 'Error', response.ErrorMessage || 'Error al actualizar', 5000, 'bottom')
            }
        } catch {
            showToast('error', 'Error', 'Ocurrió un error inesperado', 5000, 'bottom')
        }
        setLoadingToggle(null)
    }

    useEffect(() => { getInfo() }, [])
    useEffect(() => {                               
        navigation.setOptions({ title: isEdit ? `Editar acceso: ${getValues('Name')}` : 'Nuevo acceso' })
    }, [isEdit])

    useEffect(() => {
        getInfo()
    }, [activeTab])

    useEffect(() => {
        setFilteredUsers(users)
    }, [users])

    
    useEffect(() => {
        setFilteredRoles(roles)
    }, [roles])

    
    const tabs: { key: TabType; label: string }[] = [
        { key: 'general', label: 'General' },
        { key: 'usuarios', label: 'Usuarios' },
        { key: 'roles', label: 'Roles' },
    ]

    return (
        <Page>
            <YStack backgroundColor="$white" flex={1}>

                {loading ? (
                    <SkeletonForm />
                ) : (
                    <>
                        {/* TABS */}
                        {Id && (
                            <XStack
                                backgroundColor="$gray3"
                                borderRadius="$3"
                                marginHorizontal="$4"
                                marginTop="$3"
                                marginBottom="$2"
                                padding="$2"
                            >
                                {tabs.map((tab) => {
                                    const isActive = activeTab === tab.key
                                    return (
                                        <Button
                                            key={tab.key}
                                            flex={1}
                                            height={36}
                                            borderRadius="$3"
                                            backgroundColor={isActive ? '$primary' : 'transparent'}
                                            pressStyle={{ opacity: 0.8 }}
                                            onPress={() => setActiveTab(tab.key)}
                                            borderWidth={0}
                                            shadowColor={isActive ? 'rgba(0,0,0,0.15)' : 'transparent'}
                                            shadowOffset={isActive ? { width: 0, height: 1 } : { width: 0, height: 0 }}
                                            shadowOpacity={isActive ? 1 : 0}
                                            shadowRadius={isActive ? 3 : 0}
                                        >
                                            <Text
                                                fontSize={13}
                                                fontWeight={isActive ? '700' : '400'}
                                                color={isActive ? '$white' : '$gray10'}
                                            >
                                                {tab.label}
                                            </Text>
                                        </Button>
                                    )
                                })}
                            </XStack>
                        )}

                        {/* CONTENIDO POR TAB */}
                        {activeTab === 'general' && (
                            <>
                                <ScrollView flex={1} showsVerticalScrollIndicator={false}>
                                    <YStack flex={1} padding="$4" gap="$1">
                                        <Controller
                                            control={control}
                                            name="Name"
                                            rules={{ required: 'Campo requerido' }}
                                            render={({ field: { onChange, value } }) => (
                                                <AppInput
                                                    label="Nombre"
                                                    value={value}
                                                    onChangeText={onChange}
                                                    error={errors.Name?.message}
                                                />
                                            )}
                                        />
                                        <Controller
                                            control={control}
                                            name="KeyVar"
                                            rules={{ required: 'Campo requerido' }}
                                            render={({ field: { onChange, value } }) => (
                                                <AppInput
                                                    label="Identificador único"
                                                    value={value}
                                                    onChangeText={onChange}
                                                    error={errors.KeyVar?.message}
                                                />
                                            )}
                                        />
                                        <Controller
                                            control={control}
                                            name="Description"
                                            render={({ field: { onChange, value } }) => (
                                                <AppInput
                                                    label="Descripción"
                                                    value={value}
                                                    onChangeText={onChange}
                                                />
                                            )}
                                        />
                                    </YStack>
                                </ScrollView>

                                {/* BOTONES solo en tab General */}
                                <XStack
                                    paddingTop="$2"
                                    paddingBottom="$4"
                                    paddingHorizontal="$4"
                                    gap="$3"
                                    marginBottom="$3"
                                    style={{ zIndex: 12 }}
                                >
                                    <Button
                                        flex={1}
                                        backgroundColor="$buttonCancel"
                                        height={45}
                                        borderRadius="$3"
                                        justifyContent="center"
                                        alignItems="center"
                                        pressStyle={{ opacity: 0.7 }}
                                        onPress={() => navigation.goBack()}
                                        disabled={loadingSave}
                                        opacity={loadingSave ? 0.5 : 1}
                                    >
                                        <Text color="black" fontWeight="700">Cancelar</Text>
                                    </Button>

                                    <Button
                                        flex={1}
                                        backgroundColor="$primary"
                                        height={45}
                                        borderRadius="$3"
                                        justifyContent="center"
                                        alignItems="center"
                                        pressStyle={{ opacity: 0.7 }}
                                        onPress={save}
                                        disabled={loadingSave}
                                        opacity={loadingSave ? 0.5 : 1}
                                    >
                                        <Text color="$white" fontWeight="700">Guardar</Text>
                                    </Button>
                                </XStack>
                            </>
                        )}

                        {activeTab === 'usuarios' && (

                            <>
                                <View paddingHorizontal="$4" paddingTop="$2">
                                    <SearchInput
                                        data={users}
                                        searchKeys={['Name', 'LastName', 'Code']}
                                        onResults={setFilteredUsers}
                                        placeholder="Buscar..."
                                    />
                                </View>
                                <ScrollView flex={1} showsVerticalScrollIndicator={false}>
                                    <YStack paddingHorizontal="$4" paddingBottom="$4" gap="$3">
                                        {filteredUsers.map((user) => {
                                            const hasAccess = (accessControl ?? []).some(
                                                (ac) => ac.User_Code === user.Code && ac.Status_Id === 1
                                            )
                                            const id = `checkbox-user-${user.Id}`

                                            const isLoadingThis = loadingToggle === user.Code
                                            const isDisabled = loadingToggle !== null && !isLoadingThis

                                            return (
                                                <XStack
                                                    key={user.Id}
                                                    backgroundColor="$card2"
                                                    borderRadius="$4"
                                                    paddingVertical="$3"
                                                    paddingHorizontal="$4"
                                                    alignItems="center"
                                                    borderWidth={0}
                                                    overflow="hidden"
                                                    gap="$3"
                                                    shadowColor="#000"
                                                    shadowOffset={{ width: 0, height: 2 }}
                                                    shadowOpacity={0.07}
                                                    shadowRadius={6}
                                                    elevation={2}
                                                    onPress={() => !isDisabled && !isLoadingThis && toggleUserAccess(user)}
                                                    opacity={isDisabled ? 0.4 : 1}
                                                    pressStyle={isDisabled || isLoadingThis ? {} : { opacity: 0.75, scale: 0.99 }}
                                                >
                                                    {/* Franja izquierda */}
                                                    <View
                                                        position="absolute"
                                                        left={0}
                                                        top={0}
                                                        bottom={0}
                                                        width={4}
                                                        backgroundColor={hasAccess ? '$primary' : 'transparent'}
                                                    />

                                                    {/* Ícono usuario */}
                                                    <View
                                                        width={40}
                                                        height={40}
                                                        borderRadius={20}
                                                        backgroundColor={hasAccess ? 'rgba(255, 85, 26, 0.12)' : '$card'}
                                                        justifyContent="center"
                                                        alignItems="center"
                                                    >
                                                        {isLoadingThis ? (
                                                            <Spinner size="small" color="$primary" />
                                                        ) : (
                                                            <User size={20} color={hasAccess ? '#FF551A' : '#94A3B8'} />
                                                        )}
                                                    </View>

                                                    {/* Info */}
                                                    <YStack flex={1} gap="$0.5">
                                                        <Text fontWeight="700" fontSize={14} color="$text">
                                                            {user.Name} {user.LastName}
                                                        </Text>
                                                        <Text fontSize={12} color="$textMuted">
                                                            {user.Code}
                                                        </Text>
                                                    </YStack>

                                                    {/* Badge + Checkbox */}
                                                    <XStack alignItems="center" gap="$2">
                                                        {hasAccess && (
                                                            <View
                                                                backgroundColor="rgba(255, 85, 26, 0.12)"
                                                                paddingHorizontal="$2"
                                                                paddingVertical={3}
                                                                borderRadius="$10"
                                                            >
                                                                <Text fontSize={10} color="$primary" fontWeight="700">
                                                                    Activo
                                                                </Text>
                                                            </View>
                                                        )}
                                                    </XStack>
                                                </XStack>
                                            )
                                        })}
                                    </YStack>
                                </ScrollView>
                            </>
                        )}

                        {activeTab === 'roles' && (
                            <>
                                <View paddingHorizontal="$4" paddingTop="$2">
                                    <SearchInput
                                        data={users}
                                        searchKeys={['RolName', 'Description']}
                                        onResults={setFilteredUsers}
                                        placeholder="Buscar..."
                                    />
                                </View>
                                <ScrollView flex={1} showsVerticalScrollIndicator={false}>
                                    <YStack padding="$4" gap="$3">
                                        {filteredRoles.map((item) => {
                                            const hasAccess = (accessControl ?? []).some((ac) => ac.Rol_Id === item.Id && ac.Status_Id === 1)
                                            const id = `checkbox-user-${item.Id}`
                                            
                                            const isLoadingThis = loadingToggle === item.Id
                                            const isDisabled = loadingToggle !== null && !isLoadingThis

                                            return (
                                                <XStack
                                                    key={item.Id}
                                                    backgroundColor="$card2"
                                                    borderRadius="$4"
                                                    paddingVertical="$3"
                                                    paddingHorizontal="$4"
                                                    alignItems="center"
                                                    borderWidth={0}
                                                    overflow="hidden"
                                                    onPress={() => !isDisabled && !isLoadingThis && toggleRolAccess(item)}
                                                    opacity={isDisabled ? 0.4 : 1}
                                                    pressStyle={isDisabled || isLoadingThis ? {} : { opacity: 0.75, scale: 0.99 }}
                                                    gap="$3"
                                                    shadowColor="#000"
                                                    shadowOffset={{ width: 0, height: 2 }}
                                                    shadowOpacity={0.07}
                                                    shadowRadius={6}
                                                    elevation={2}
                                                >
                                                    {/* Franja izquierda */}
                                                    <View
                                                        position="absolute"
                                                        left={0}
                                                        top={0}
                                                        bottom={0}
                                                        width={4}
                                                        backgroundColor={hasAccess ? '$primary' : 'transparent'}
                                                    />

                                                    {/* Ícono usuario */}
                                                    <View
                                                        width={40}
                                                        height={40}
                                                        borderRadius={20}
                                                        backgroundColor={hasAccess ? 'rgba(255, 85, 26, 0.12)' : '$card'}
                                                        justifyContent="center"
                                                        alignItems="center"
                                                    >
                                                        {isLoadingThis ? (
                                                            <Spinner size="small" color="$primary" />
                                                        ) : (
                                                            <Shield size={20} color={hasAccess ? '#FF551A' : '#94A3B8'}/>
                                                        )}
                                                    </View>

                                                    {/* Info */}
                                                    <YStack flex={1} gap="$0.5">
                                                        <Text fontWeight="700" fontSize={14} color="$text">
                                                            {item.RoleName} 
                                                        </Text>
                                                        <Text fontSize={12} color="$textMuted">
                                                            {item.Description}
                                                        </Text>
                                                    </YStack>

                                                    {/* Badge + Checkbox */}
                                                    <XStack alignItems="center" gap="$2">
                                                        {hasAccess && (
                                                            <View
                                                                backgroundColor="rgba(255, 85, 26, 0.12)"
                                                                paddingHorizontal="$2"
                                                                paddingVertical={3}
                                                                borderRadius="$10"
                                                            >
                                                                <Text fontSize={10} color="$primary" fontWeight="700">
                                                                    Activo
                                                                </Text>
                                                            </View>
                                                        )}
                                                    </XStack>
                                                </XStack>
                                            )
                                        })}
                                    </YStack>
                                </ScrollView>
                            </>
                        )}

                        {loadingSave && (
                            <View
                                position="absolute"
                                top={0} left={0} right={0} bottom={0}
                                justifyContent="center"
                                alignItems="center"
                                backgroundColor="rgba(0,0,0,0.2)"
                            >
                                <Spinner size="large" color="$primary" />
                            </View>
                        )}
                    </>
                )}
            </YStack>
        </Page>
    )
}
