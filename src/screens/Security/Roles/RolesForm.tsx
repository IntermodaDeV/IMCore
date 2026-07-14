import { useShowToast } from '../../../utils/useShowToast'
import React, { useEffect, useState } from 'react'
import { YStack, Button, Text, XStack, View, ScrollView, Spinner, styled } from 'tamagui'
import { useNavigation, useRoute } from '@react-navigation/native'
import Page from '../../../components/commons/Page'
import { Controller, useForm } from 'react-hook-form'
import AppInput from '../../../components/commons/AppInput'
import { AccessDTO, IAccessControl, IMenuControl, MenuDTO, RolesDTO } from '../../../api/modules/security/security.types'
import { securityService } from '../../../api/modules/security/security.service'
import { computeMenuCascade, buildMenuControlPayloads } from '../menuCascade'
import { ExecutionResponse } from '../../../api/modules/response.type'
import { useAuth } from '../../../context/AuthContext'
import SkeletonForm from '../../../components/Skeletons/SkeletonForm'
import { ArrowLeft, User, ChevronDown, ChevronRight } from 'lucide-react-native'
import SearchInput from '../../../components/commons/SearchInput'
import { handleError } from '../../../utils/errorHandler'
import { usePageHeader } from '../../../hooks/usePageHeader'
import { useUpdatePageHeader } from '../../../hooks/useUpdatePageHeader'
import { shadows } from '../../../theme/shadows'

type TabType = 'general' | 'accesos' | 'permisos'

export default function RolesForm() {

    const { updateHeader } = useUpdatePageHeader()
    const navigation = useNavigation()
    
    const route = useRoute()
    const { Id } = route.params as { Id?: number }
    const [loading, setLoading] = useState(false)
    const [loadingSave, setLoadingSave] = useState(false)
    const [activeTab, setActiveTab] = useState<TabType>('general')
    const [access, setAccess] = useState<AccessDTO[]>([])
    const [permisos, setPermisos] = useState<MenuDTO[]>([])
    const [filteredAccess, setFilteredAccess] = useState<AccessDTO[]>([])
    const [filteredPermisos, setFilteredPermisos] = useState<MenuDTO[]>([])
    const [accessControl, setAccessControl] = useState<IAccessControl[]>([])
    const [menuControl, setMenuControl] = useState<IMenuControl[]>([])
    const [loadingToggle, setLoadingToggle] = useState<string | number |  null>(null)
    const [expandedParents, setExpandedParents] = useState<Record<number, boolean>>({})
    const { user } = useAuth()
    const { showToast } = useShowToast()
    const isEdit = !!Id;

    const ArrowLeftStyled = styled(ArrowLeft, { color: '$text' });

    const defaultValues: RolesDTO = {
        Id: -1,
        RoleName: '',
        Description: '',
        Status_Id: 1,
        Create_By: '',
        Creation_Date: '',
        Modified_By: null,
        Modification_Date: null,
        StatusName: ''
    }

    const { control, handleSubmit, formState: { errors }, reset, getValues } = useForm<RolesDTO>({ defaultValues, mode: 'onTouched' })

    const save = handleSubmit(async (data: RolesDTO) => {
        setLoadingSave(true)
        try {
            let info: RolesDTO = {
                Id: data.Id,
                RoleName: data.RoleName,
                Description: data.Description,
                Status_Id: data.Status_Id,
                Create_By: user?.Code ?? '',
                StatusName: '',
                Modified_By: user?.Code ?? '',
                Creation_Date: data.Creation_Date || new Date().toISOString(),
                Modification_Date: new Date().toISOString(),
            }

            const response: ExecutionResponse<RolesDTO[]> = await securityService.saveRoles([info])
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

    const getInfo = async () => {
        setLoading(true)
        try{
            if(activeTab === 'general'){
                if (Id) {
                    const response: ExecutionResponse<RolesDTO[]> = await securityService.getRolById(Id)
                    if (response.Success) {
                        reset(response.Data[0])
                        navigation.setOptions({ title: isEdit ? `Editar rol: ${getValues('RoleName')}` : 'Nuevo rol' })
                    } else {
                        showToast('error', 'Error', response?.ErrorMessage || 'Error al obtener la información', 5000, 'bottom')
                        setLoading(false)
                    }
                }
            }else if(activeTab === 'accesos'){
                const response: ExecutionResponse<AccessDTO[]> = await securityService.getAccess()
                if (response.Success) {
                    setAccess(response.Data?.filter(u => u.Status_Id === 1) ?? [])
                    const resp: ExecutionResponse<IAccessControl[]> = await securityService.getAccessControlByRol(Id as number)
                    setAccessControl(resp.Data ?? []) 
                } else {
                    showToast('error', 'Error', response?.ErrorMessage || 'Error al obtener la información', 5000, 'bottom')
                    setLoading(false)
                }
            } else{
                const response: ExecutionResponse<MenuDTO[]> = await securityService.getMenus()
                if (response.Success) {
                    setPermisos(response.Data?.filter(r => r.Status_Id === 1) ?? [])
                    const resp: ExecutionResponse<IMenuControl[]> = await securityService.getMenuControlByRol(Id as number)
                    setMenuControl(resp.Data ?? []) 
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

    const getInfoSinLoading = async () => {
        if(activeTab === 'accesos'){
            const resp: ExecutionResponse<IAccessControl[]> = await securityService.getAccessControlByRol(Id as number)
            setAccessControl(resp.Data ?? []) 
        } else{
            const resp: ExecutionResponse<IMenuControl[]> = await securityService.getMenuControlByRol(Id as number)
            setMenuControl(resp.Data ?? []) 
        }
    }

    const toggleRolAccess = async (selectedAccess: AccessDTO) => {
        const existing = accessControl.find((ac) => ac.Access_Id === selectedAccess.Id)
        let payload: IAccessControl
        setLoadingToggle(selectedAccess.Id)
        if (!existing) {
            payload = {
                Id: -1,
                Access_Id: selectedAccess.Id,
                User_Code: null,
                Rol_Id: Id as number,
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
                            ac.Access_Id === selectedAccess.Id
                                ? { ...ac, Status_Id: payload.Status_Id }
                                : ac
                        )
                    )
                }
                getInfoSinLoading()
                showToast('success', 'Éxito', response.SuccessMessage || 'Operación realizada correctamente', 5000, 'bottom')
            } else {
                showToast('error', 'Error', response.ErrorMessage || 'Error al actualizar', 5000, 'bottom')
            }
        } catch {
            showToast('error', 'Error', 'Ocurrió un error inesperado', 5000, 'bottom')
        }
        setLoadingToggle(null)
    }

    const toggleRolMenu = async (selectedPermiso: MenuDTO) => {
        const existing = menuControl.find((ac) => ac.Menu_Id === selectedPermiso.Id)
        const base = user?.Code ?? ''
        const newStatus: 1 | 2 = !existing ? 1 : (existing.Status_Id === 1 ? 2 : 1)
        setLoadingToggle(selectedPermiso.Id)

        // Cascada en ambas direcciones (padre↔hijos), igual que en el web.
        const changes = computeMenuCascade(permisos, menuControl, selectedPermiso.Id, newStatus)
        const payloads = buildMenuControlPayloads(changes, menuControl, {
            typeId: 7,
            createBy: base,
            rolId: Id as number,
        })

        try {
            let response
            for (const payload of payloads) {
                response = await securityService.saveMenuControl([payload])
                if (!response.Success) {
                    showToast('error', 'Error', response.ErrorMessage || 'Error al actualizar', 5000, 'bottom')
                    setLoadingToggle(null)
                    return
                }
            }
            if (response) {
                // Recarga el control real (refleja también los cambios en cascada).
                getInfoSinLoading()
                showToast('success', 'Éxito', response.SuccessMessage || 'Operación realizada correctamente', 5000, 'bottom')
            }
        } catch {
            showToast('error', 'Error', 'Ocurrió un error inesperado', 5000, 'bottom')
        }
        setLoadingToggle(null)
    }

    const renderPermisoRow = (
        i: MenuDTO,
        opts?: { isChild?: boolean; hasChildren?: boolean; isExpanded?: boolean; onToggleExpand?: () => void }
    ) => {
        const isChild = !!opts?.isChild
        const hasChildren = !!opts?.hasChildren
        const hasAccess = (menuControl ?? []).some(
            (ac) => ac.Menu_Id === i?.Id && ac.Status_Id === 1
        )
        const isLoadingThis = loadingToggle === i.Id
        const isDisabled = loadingToggle !== null && !isLoadingThis

        return (
            <XStack
                key={i.Id}
                backgroundColor={isChild ? '$backgroundSurface' : '$backgroundElevated'}
                borderRadius="$4"
                paddingVertical="$3"
                paddingHorizontal="$4"
                marginLeft={isChild ? '$6' : 0}
                alignItems="center"
                borderWidth={0}
                overflow="hidden"
                gap="$3"
                shadowColor="#000"
                shadowOffset={{ width: 0, height: 2 }}
                shadowOpacity={0.07}
                shadowRadius={6}
                elevation={2}
                onPress={() => !isDisabled && !isLoadingThis && toggleRolMenu(i)}
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

                {/* Ícono */}
                <View
                    width={isChild ? 34 : 40}
                    height={isChild ? 34 : 40}
                    borderRadius={20}
                    backgroundColor={hasAccess ? 'rgba(255, 85, 26, 0.12)' : '$backgroundSurface'}
                    justifyContent="center"
                    alignItems="center"
                >
                    {isLoadingThis ? (
                        <Spinner size="small" color="$primary" />
                    ) : (
                        <User size={isChild ? 17 : 20} color={hasAccess ? '#FF551A' : '#94A3B8'} />
                    )}
                </View>

                {/* Info */}
                <YStack flex={1} gap="$0.5">
                    <Text fontWeight="700" fontSize={isChild ? 13 : 14} color="$text">
                        {i.Name}
                    </Text>
                    <Text fontSize={12} color="$textMuted">
                        {i.Description}
                    </Text>
                </YStack>

                {/* Badge + Chevron */}
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
                    {hasChildren && (
                        <View
                            onPress={(e: any) => {
                                e?.stopPropagation?.()
                                opts?.onToggleExpand?.()
                            }}
                            pressStyle={{ opacity: 0.6 }}
                            padding="$2"
                            hitSlop={8}
                        >
                            {opts?.isExpanded ? (
                                <ChevronDown size={20} color="#94A3B8" />
                            ) : (
                                <ChevronRight size={20} color="#94A3B8" />
                            )}
                        </View>
                    )}
                </XStack>
            </XStack>
        )
    }

    useEffect(() => { getInfo() }, [])
    useEffect(() => {                               
        navigation.setOptions({ title: isEdit ? `Editar rol: ${getValues('RoleName')}` : 'Nuevo rol' })
    }, [isEdit])

    usePageHeader({
        left:(
                <ArrowLeftStyled onPress={() => navigation.goBack()} />   
                ),
        center: 
            <Text color="$text" >Nuevo rol</Text>
        ,

        right: <></>,
    })

    useEffect(() => {  
        if(isEdit){
            updateHeader({
                center: 
                    <Text color="$text" >
                        Editar rol
                    </Text>
                ,
            })
        }                             
    }, [isEdit])

    useEffect(() => {
        getInfo()
    }, [activeTab])

    
    useEffect(() => {
        setFilteredAccess(access)
    }, [access])

    
    useEffect(() => {
        setFilteredPermisos(permisos)
    }, [permisos])

    
    const tabs: { key: TabType; label: string }[] = [
        { key: 'general', label: 'General' },
        { key: 'accesos', label: 'Accesos' },
        { key: 'permisos', label: 'Permisos' },
    ]

    return (
        <Page>
            <YStack backgroundColor="$backgroundPage" flex={1}>

                {loading ? (
                    <SkeletonForm />
                ) : (
                    <>
                        {/* TABS */}
                        {Id && (
                            <XStack
                                backgroundColor="$backgroundSurface"
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
                                            {...(isActive ? shadows.sm : {})}
                                        >
                                            <Text
                                                fontSize={13}
                                                fontWeight={isActive ? '700' : '400'}
                                                color={isActive ? '$white' : '$textMuted'}
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
                                            name="RoleName"
                                            rules={{ required: 'Campo requerido' }}
                                            render={({ field: { onChange, value } }) => (
                                                <AppInput
                                                    label="Nombre"
                                                    value={value}
                                                    onChangeText={onChange}
                                                    error={errors.RoleName?.message}
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
                                        backgroundColor="$buttonSecondary"
                                        height={45}
                                        borderRadius="$3"
                                        justifyContent="center"
                                        alignItems="center"
                                        pressStyle={{ opacity: 0.7 }}
                                        onPress={() => navigation.goBack()}
                                        disabled={loadingSave}
                                        opacity={loadingSave ? 0.5 : 1}
                                    >
                                        <Text color="$text" fontWeight="700">Cancelar</Text>
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

                        {activeTab === 'accesos' && (
                            <>
                                <View paddingHorizontal="$4" paddingTop="$2">
                                    <SearchInput
                                        data={access}
                                        searchKeys={['Name', 'KeyVar', 'Description']}
                                        onResults={setFilteredAccess}
                                        placeholder="Buscar..."
                                    />
                                </View>
                                <ScrollView flex={1} showsVerticalScrollIndicator={false}>
                                    <YStack paddingHorizontal="$4" paddingBottom="$4" gap="$3">
                                        {filteredAccess.map((i) => {
                                            const hasAccess = (accessControl ?? []).some(
                                                (ac) => ac.Access_Id === i?.Id && ac.Status_Id === 1
                                            )
                                            const id = `checkbox-user-${i.Id}`

                                            const isLoadingThis = loadingToggle === i.Id
                                            const isDisabled = loadingToggle !== null && !isLoadingThis

                                            return (
                                                <XStack
                                                    key={i.Id}
                                                    backgroundColor="$backgroundElevated"
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
                                                    onPress={() => !isDisabled && !isLoadingThis && toggleRolAccess(i)}
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
                                                        backgroundColor={hasAccess ? 'rgba(255, 85, 26, 0.12)' : '$backgroundSurface'}
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
                                                            {i.Name}
                                                        </Text>
                                                        <Text fontSize={12} color="$textMuted">
                                                           {i.KeyVar} - {i.Description}
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

                        {activeTab === 'permisos' && (
                            <>
                                <View paddingHorizontal="$4" paddingTop="$2">
                                    <SearchInput
                                        data={permisos}
                                        searchKeys={['Name', 'Route', 'Description']}
                                        onResults={setFilteredPermisos}
                                        placeholder="Buscar..."
                                    />
                                </View>
                                <ScrollView flex={1} showsVerticalScrollIndicator={false}>
                                    <YStack paddingHorizontal="$4" paddingBottom="$4" gap="$3">
                                        {(() => {
                                            const parents = filteredPermisos.filter((m) => !m.ParentMenu_Id)
                                            const parentIds = new Set(parents.map((p) => p.Id))
                                            const orphanChildren = filteredPermisos.filter(
                                                (m) => m.ParentMenu_Id && !parentIds.has(m.ParentMenu_Id)
                                            )
                                            const rows: React.ReactNode[] = []

                                            parents.forEach((parent) => {
                                                const children = filteredPermisos.filter((m) => m.ParentMenu_Id === parent.Id)
                                                const hasChildren = children.length > 0
                                                // Los menús padre arrancan siempre colapsados; se expanden con el chevron.
                                                const isExpanded = expandedParents[parent.Id] ?? false

                                                rows.push(
                                                    renderPermisoRow(parent, {
                                                        hasChildren,
                                                        isExpanded,
                                                        onToggleExpand: () =>
                                                            setExpandedParents((prev) => ({ ...prev, [parent.Id]: !isExpanded })),
                                                    })
                                                )

                                                if (hasChildren && isExpanded) {
                                                    children.forEach((child) =>
                                                        rows.push(renderPermisoRow(child, { isChild: true }))
                                                    )
                                                }
                                            })

                                            orphanChildren.forEach((child) =>
                                                rows.push(renderPermisoRow(child, { isChild: true }))
                                            )

                                            return rows
                                        })()}
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
