import { useShowToast } from '../../../utils/useShowToast'
import React, { useEffect, useState } from 'react'
import { YStack, Button, Text, XStack, View, ScrollView, Spinner, Checkbox } from 'tamagui'
import { useNavigation, useRoute } from '@react-navigation/native'
import Page from '../../../components/commons/Page'
import { Controller, useForm } from 'react-hook-form'
import AppInput from '../../../components/commons/AppInput'
import { IMenuControl, MenuDTO, RolesDTO, UsersDTO } from '../../../api/modules/security/security.types'
import { securityService } from '../../../api/modules/security/security.service'
import { ExecutionResponse } from '../../../api/modules/response.type'
import { useAuth } from '../../../context/AuthContext'
import SkeletonForm from '../../../components/Skeletons/SkeletonForm'
import { ArrowLeft, Shield, User } from 'lucide-react-native'
import SearchInput from '../../../components/commons/SearchInput'
import AppSelect from '../../../components/commons/AppSelect'
import { handleError } from '../../../utils/errorHandler'
import { shadows } from '../../../theme/shadows'
import { usePageHeader } from '../../../hooks/usePageHeader'
import { useUpdatePageHeader } from '../../../hooks/useUpdatePageHeader'

type TabType = 'general' | 'usuarios' | 'roles'

export default function MenuForm() {
    const { updateHeader } = useUpdatePageHeader()
    
    const navigation = useNavigation()
    const route = useRoute()
    const { Id } = route.params as { Id?: number }
    const [loading, setLoading] = useState(false)
    const [users, setUsers] = useState<UsersDTO[]>([])
    const [roles, setRoles] = useState<RolesDTO[]>([])
    const [menusList, setMenusList] = useState<any[]>([])
    const [menuControl, setMenuControl] = useState<IMenuControl[]>([])
    const [loadingSave, setLoadingSave] = useState(false)
    const [activeTab, setActiveTab] = useState<TabType>('general')
    const [filteredUsers, setFilteredUsers] = useState<UsersDTO[]>([])
    const [filteredRoles, setFilteredRoles] = useState<RolesDTO[]>([])
    const [loadingToggle, setLoadingToggle] = useState<string | number |  null>(null)
    const { user } = useAuth()
    const { showToast } = useShowToast()
    const isEdit = !!Id

    const defaultValues: MenuDTO = {
        Id: -1,
        Name: '',
        Description: '',
        Route: '',
        Icon: '',
        ParentMenu_Id: null,
        MenuOrder: null,
        User_Code: '',
        Create_By: '',
        Modified_By: '',
    }

    const { control, handleSubmit, formState: { errors }, reset, getValues } = useForm<MenuDTO>({ defaultValues, mode: 'onTouched' })

    const getInfo = async () => {
        const tab = activeTab
        try {
            setLoading(true)

            const response = await securityService.getMenus()

            setMenusList(
            response.Data?.filter((i) => i.Status_Id === 1).map((i) => ({
                label: i.Name,
                value: Number(i.Id),
            })) ?? []
            )

            if (tab === 'general' && Id) {
            const res = await securityService.getMenuById(Id)

            if (res.Success) {
                reset(res.Data[0])
            }
            }

            if (tab === 'usuarios') {
            const [usersRes, controlRes] = await Promise.all([
                securityService.getUsers(),
                securityService.getMenuControl(6, Id as number),
            ])

            setUsers(usersRes.Data ?? [])
            setMenuControl(controlRes.Data ?? [])
            }

            if (tab === 'roles') {
            const [rolesRes, controlRes] = await Promise.all([
                securityService.getRoles(),
                securityService.getMenuControl(7, Id as number),
            ])

            setRoles(rolesRes.Data ?? [])
            setMenuControl(controlRes.Data ?? [])
            }
        } catch (err) {
            const error = handleError(err)
            showToast('error', 'Error', error.message, 5000, 'bottom')
            if (navigation.canGoBack()) {
                navigation.goBack()
            }
        } finally {
            setLoading(false)
        }
    }

    const getInfoSinLonuding = async () => {
        if(activeTab === 'usuarios'){
            const resp: ExecutionResponse<IMenuControl[]> = await securityService.getMenuControl(6, Id as number)
            setMenuControl(resp.Data ?? []) 
            
        }else{
            const resp: ExecutionResponse<IMenuControl[]> = await securityService.getMenuControl(7, Id as number)
            setMenuControl(resp.Data ?? []) 
        }
    }

    const save = handleSubmit(async (data: MenuDTO) => {
        setLoadingSave(true)
        try {
            let info: MenuDTO = {
                Id: data.Id,
                Name: data.Name,
                Icon: data.Icon,
                Description: data.Description,
                MenuOrder: data.MenuOrder,
                ParentMenu_Id: data.ParentMenu_Id === 0 ? null : data.ParentMenu_Id,
                Route: data.Route,
                Status_Name: '',
                Create_By: user?.Code ?? '',
                Status_Id: data.Status_Id,
                Modified_By: user?.Code ?? '',
                Creation_Date: data.Creation_Date || new Date().toISOString(),
                Modification_Date: new Date().toISOString(),
            }

            const response: ExecutionResponse<MenuDTO[]> = await securityService.saveMenu([info])
            if (response.Success) {
                showToast('success', 'Éxito', response.SuccessMessage || 'Registro guardado correctamente', 5000, 'bottom')
                navigation.goBack()
            } else {
                showToast('error', 'Error', response.ErrorMessage || 'Error al guardar', 5000, 'bottom')
            }
        } catch (error) {
            showToast('error', 'Error', 'Ocurrió un error inesperado', 5000, 'bottom')
            setLoadingSave(false)
        }
        setLoadingSave(false)
    }, () => {
        showToast('error', 'Error', 'Complete los campos requeridos', 5000, 'bottom')
        setLoadingSave(false)
    })

    const toggleUserMenu = async (selectedUser: UsersDTO) => {
        const existing = menuControl.find((ac) => ac.User_Code === selectedUser.Code)
        let payload: IMenuControl
        setLoadingToggle(selectedUser.Code)
        if (!existing) {
            payload = {
                Id: -1,
                User_Code: selectedUser.Code,
                Menu_Id: Id as number,
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
            const response = await securityService.saveMenuControl([payload])
            if (response.Success) {
                if (!existing) {
                    setMenuControl((prev) => [...prev, { ...payload, Id: response.Data?.[0]?.Id ?? -1 }])
                } else {
                    setMenuControl((prev) =>
                        prev.map((ac) =>
                            ac.User_Code === selectedUser.Code
                                ? { ...ac, Status_Id: payload.Status_Id }
                                : ac
                        )
                    )
                }
                const resp: ExecutionResponse<IMenuControl[]> = await securityService.getMenuControl(6, Id as number)
                setMenuControl(resp.Data ?? []) 
                showToast('success', 'Éxito', response.SuccessMessage || 'Operación realizada correctamente', 5000, 'bottom')
            } else {
                showToast('error', 'Error', response.ErrorMessage || 'Error al actualizar', 5000, 'bottom')
            }
        } catch {
            showToast('error', 'Error', 'Ocurrió un error inesperado', 5000, 'bottom')
        }
        setLoadingToggle(null)
    }

    const toggleRolMenu = async (selectedUser: RolesDTO) => {
        const existing = menuControl.find((ac) => ac.Rol_Id === selectedUser.Id)
        let payload: IMenuControl
        setLoadingToggle(selectedUser.Id)
        if (!existing) {
            payload = {
                Id: -1,
                User_Code: null,
                Menu_Id: Id as number,
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
            const response = await securityService.saveMenuControl([payload])
            if (response.Success) {
                if (!existing) {
                    setMenuControl((prev) => [...prev, { ...payload, Id: response.Data?.[0]?.Id ?? -1 }])
                } else {
                    setMenuControl((prev) =>
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

    usePageHeader({
        left:(
                <ArrowLeft onPress={() => navigation.navigate<any>('menu')} />   
                ),
        center: 
            <Text>Nuevo menú</Text>
        ,

        right: <></>,
    })

    useEffect(() => {
        if(isEdit){
            updateHeader({
                center: 
                    <Text>
                        Editar Menú: {getValues('Name')}
                    </Text>
                ,
            })
        }
        console.log('isEdit', isEdit)                               
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
                                            name="ParentMenu_Id"
                                            render={({ field: { onChange, value } }) => (
                                                <AppSelect
                                                    label="Menú padre"
                                                    value={value ?? undefined}
                                                    onValueChange={(val) => onChange(Number(val))}
                                                    options={menusList}
                                                />
                                            )}
                                        />

                                        <Controller
                                            control={control}
                                            name="Route"
                                            rules={{ required: 'Campo requerido' }}
                                            render={({ field: { onChange, value } }) => (
                                                <AppInput
                                                    label="Identificador único"
                                                    value={value}
                                                    onChangeText={onChange}
                                                    error={errors.Route?.message}
                                                />
                                            )}
                                        />
                                        <Controller
                                            control={control}
                                            name="Icon"
                                            rules={{ required: 'Campo requerido' }}
                                            render={({ field: { onChange, value } }) => (
                                                <AppInput
                                                    label="Icono"
                                                    value={value}
                                                    onChangeText={onChange}
                                                    error={errors.Icon?.message}
                                                />
                                            )}
                                        />

                                        <Controller
                                            control={control}
                                            name="MenuOrder"
                                            rules={{ required: 'Campo requerido' }}
                                            render={({ field: { onChange, value } }) => (
                                                <AppInput
                                                    label="Orden"
                                                    value={value ?? ''}
                                                    format="integer"
                                                    keyboardType="numeric"
                                                    onChangeText={(text) => {
                                                        const number = text === '' ? null : Number(text)
                                                        onChange(number)
                                                    }}
                                                    error={errors.MenuOrder?.message}
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
                                            const hasMenu = (menuControl ?? []).some((ac) => ac.User_Code === user.Code && ac.Status_Id === 1)

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
                                                    onPress={() => !isDisabled && !isLoadingThis && toggleUserMenu(user)}
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
                                                        backgroundColor={hasMenu ? '$primary' : 'transparent'}
                                                    />

                                                    {/* Ícono usuario */}
                                                    <View
                                                        width={40}
                                                        height={40}
                                                        borderRadius={20}
                                                        backgroundColor={hasMenu ? 'rgba(255, 85, 26, 0.12)' : '$card'}
                                                        justifyContent="center"
                                                        alignItems="center"
                                                    >
                                                        {isLoadingThis ? (
                                                            <Spinner size="small" color="$primary" />
                                                        ) : (
                                                            <User size={20} color={hasMenu ? '#FF551A' : '#94A3B8'} />
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
                                                        {hasMenu && (
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
                                            const hasMenu = (menuControl ?? []).some((ac) => ac.Rol_Id === item.Id && ac.Status_Id === 1)
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
                                                    onPress={() => !isDisabled && !isLoadingThis && toggleRolMenu(item)}
                                                    opacity={isDisabled ? 0.4 : 1}
                                                    pressStyle={isDisabled || isLoadingThis ? {} : { opacity: 0.75, scale: 0.99 }}
                                                    gap="$3"
                                                    shadowColor="#000"
                                                    shadowOffset={{ width: 0, height: 2 }}
                                                    {...shadows.md}
                                                >
                                                    {/* Franja izquierda */}
                                                    <View
                                                        position="absolute"
                                                        left={0}
                                                        top={0}
                                                        bottom={0}
                                                        width={4}
                                                        backgroundColor={hasMenu ? '$primary' : 'transparent'}
                                                    />

                                                    {/* Ícono usuario */}
                                                    <View
                                                        width={40}
                                                        height={40}
                                                        borderRadius={20}
                                                        backgroundColor={hasMenu ? 'rgba(255, 85, 26, 0.12)' : '$card'}
                                                        justifyContent="center"
                                                        alignItems="center"
                                                    >
                                                        {isLoadingThis ? (
                                                            <Spinner size="small" color="$primary" />
                                                        ) : (
                                                            <Shield size={20} color={hasMenu ? '#FF551A' : '#94A3B8'}/>
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
                                                        {hasMenu && (
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
