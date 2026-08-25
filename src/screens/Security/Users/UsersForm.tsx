import React, { useEffect, useState } from 'react'
import { KeyboardAvoidingView, Platform, Keyboard, ScrollView as RNScrollView } from 'react-native'
import { YStack, Button, Text, XStack, View, ScrollView, Spinner, Checkbox,styled } from 'tamagui'
import { useNavigation, useRoute } from '@react-navigation/native'
import { Controller, useForm } from 'react-hook-form'
import AppInput from '../../../components/commons/AppInput'
import { AccessDTO, CompaniesDTO, IAccessControl, IEmpresa, IMenuControl, ITypes, IUserCompanies, MenuDTO, RolesDTO, UsersDTO } from '../../../api/modules/security/security.types'
import { securityService } from '../../../api/modules/security/security.service'
import { computeMenuCascade, buildMenuControlPayloads } from '../menuCascade'
import { ExecutionResponse } from '../../../api/modules/response.type'
import { useAuth } from '../../../context/AuthContext'
import { useShowToast } from '../../../utils/useShowToast'
import SkeletonForm from '../../../components/Skeletons/SkeletonForm'
import { Check as CheckIcon, Shield, Eye, EyeOff, User, ArrowLeft, ChevronDown, ChevronRight, Globe, Star} from 'lucide-react-native'
import SearchInput from '../../../components/commons/SearchInput'
import AppSelect from '../../../components/commons/AppSelect'
import AccordionSection from '../../../components/commons/AccordionSection'
import { handleError } from '../../../utils/errorHandler'
import { usePageHeader } from '../../../hooks/usePageHeader'
import { useUpdatePageHeader } from '../../../hooks/useUpdatePageHeader'
import { shadows } from '../../../theme/shadows'

type TabType = 'general' | 'accesos' | 'permisos'

export default function UsersForm() {
    const { updateHeader } = useUpdatePageHeader()
    const navigation = useNavigation()
    const scrollRef = React.useRef<any>(null)
    // Offset actual del scroll (para calcular el scrollTo exacto) y ref a los
    // botones (para medir su posición vs. el teclado y subir solo el solape).
    const scrollY = React.useRef(0)
    const btnRef = React.useRef<any>(null)
    // ¿Hay un campo de contraseña enfocado? Al mostrarse el teclado, bajamos al
    // final para que el campo + botones queden visibles (funciona aunque el teclado
    // se oculte/reabra al pasar de Contraseña a Confirmar).
    const passwordFocused = React.useRef(false)
    // Alto real del teclado. En Android (New Arch + edge-to-edge) el adjustResize
    // no achica la ventana, así que reservamos este alto como paddingBottom en el
    // ScrollView para poder scrollear el contenido por encima del teclado.
    const [kbHeight, setKbHeight] = useState(0)
    const route = useRoute()
    const { Id } = route.params as { Id?: number }
    const [loading, setLoading] = useState(false)
    const [loadingSave, setLoadingSave] = useState(false)
    const [activeTab, setActiveTab] = useState<TabType>('general')
    const [roles, setRoles] = useState<RolesDTO[]>([])
    const [companies, setCompanies] = useState<CompaniesDTO[]>([])
    const [userTypes, setUserTypes] = useState<ITypes[]>([])
    // Empresas del PARQUE (Intermoda, Industrias Chamer). OJO: no confundir con
    // `companies`, que son las compañías de AX por país.
    const [empresas, setEmpresas] = useState<IEmpresa[]>([])
    const [user_Code, setUser_Code] = useState<string>([])
    const [access, setAccess] = useState<AccessDTO[]>([])
    const [permisos, setPermisos] = useState<MenuDTO[]>([])
    const [filteredAccess, setFilteredAccess] = useState<AccessDTO[]>([])
    const [filteredPermisos, setFilteredPermisos] = useState<MenuDTO[]>([])
    const [accessControl, setAccessControl] = useState<IAccessControl[]>([])
    const [menuControl, setMenuControl] = useState<IMenuControl[]>([])
    const [loadingToggle, setLoadingToggle] = useState<string | number |  null>(null)
    const [expandedParents, setExpandedParents] = useState<Record<number, boolean>>({})
    const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({})
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)
    const { user } = useAuth()
    const { showToast } = useShowToast()
    const isEdit = !!Id
    const ArrowLeftStyled = styled(ArrowLeft, { color: '$text' });


    const defaultValues: UsersDTO = {
        Id: -1,
        Name: '',
        Code: '',
        Theme: 'light',
        LastName: '',
        TypeId: null,
        Status_Id: 1,
        Create_By: '',
        Roles: '',
        Companies: '',
        DefaultCompany_Id: null,
        PasswordHash: '',
        ValidateAD: false,
        // Intermoda por omisión, igual que el default de la columna en la BD.
        Empresa_Id: 1,
    }

    const { control, handleSubmit, formState: { errors }, reset, getValues, watch, setValue, clearErrors  } = useForm<UsersDTO>({ defaultValues, mode: 'onTouched' })
    const validateAD = watch('ValidateAD')

    const getInfo = async () => {
        setLoading(true)
        try{
            if(activeTab === 'general'){
                const responseRoles: ExecutionResponse<RolesDTO[]> = await securityService.getRoles()
                setRoles(responseRoles.Data.filter((i: RolesDTO) => i?.Status_Id === 1))
                const responseCompanies: ExecutionResponse<CompaniesDTO[]> = await securityService.getCompanies()
                setCompanies(responseCompanies.Data?.filter((i: CompaniesDTO) => i?.Status_Id === 1) ?? [])

                // Catalogo de tipos de usuario. El Id de General se resuelve por
                // nombre en vez de hardcodearse, igual que en el SP.
                const responseTypes: ExecutionResponse<ITypes[]> = await securityService.getTypesByCategory('TiposUsuario')
                const tipos = responseTypes.Data ?? []
                setUserTypes(tipos)
                const generalId = tipos.find((t: ITypes) => t.Name === 'General')?.Id ?? null

                // Empresas del PARQUE. Catalogo aparte del de tipos: el merge
                // los enfrento porque las dos ramas sumaron aca, pero no se
                // pisan entre si.
                const respEmpresas = await securityService.getEmpresas(true)
                setEmpresas(respEmpresas.Data ?? [])

                if (Id) {
                    const response: ExecutionResponse<UsersDTO[]> = await securityService.getUserById(Id)
                    if (response.Success) {
                        const userData = response.Data[0]
                        reset(userData)
                        setUser_Code(userData?.Code)
                        // Usuario viejo que quedo sin tipo -> General.
                        if (!userData?.TypeId && generalId) setValue('TypeId', generalId)

                        // Cargar los países asignados al usuario y marcar el predeterminado
                        const respCompanies: ExecutionResponse<IUserCompanies[]> = await securityService.getCompaniesByUser(userData?.Code)
                        if (respCompanies.Success) {
                            const userCompanies = (respCompanies.Data ?? []).filter((c) => c.Status_Id === 1)
                            setValue('Companies', userCompanies.map((c) => String(c.Company_Id)).join(','))
                            const defaultCompany = userCompanies.find((c) => c.IsDefault)
                            setValue('DefaultCompany_Id', defaultCompany ? Number(defaultCompany.Company_Id) : null)
                        }
                    } else {
                        showToast('error', 'Error', response?.ErrorMessage || 'Error al obtener la información', 5000, 'bottom')
                        setLoading(false)
                    }
                } else if (generalId) {
                    // Alta nueva: arranca en General.
                    setValue('TypeId', generalId)
                }
            } else if(activeTab === 'accesos'){
                const response: ExecutionResponse<AccessDTO[]> = await securityService.getAccess()
                if (response.Success) {
                    setAccess(response.Data?.filter(u => u.Status_Id === 1) ?? [])
                    const resp: ExecutionResponse<IAccessControl[]> = await securityService.getAccessControlByUser(user_Code as string)
                    setAccessControl(resp.Data ?? []) 
                } else {
                    showToast('error', 'Error', response?.ErrorMessage || 'Error al obtener la información', 5000, 'bottom')
                    setLoading(false)
                }
            } else{
                const response: ExecutionResponse<MenuDTO[]> = await securityService.getMenus()
                if (response.Success) {
                    setPermisos(response.Data?.filter(r => r.Status_Id === 1) ?? [])
                    const resp: ExecutionResponse<IMenuControl[]> = await securityService.getMenuControlByUser(user_Code as string)
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

    const save = handleSubmit(async (data: UsersDTO) => {
        setLoadingSave(true)

        try {
            // El SP espera Companies como un string JSON con [{ Company_Id, IsDefault }]
            const companyIds = (data?.Companies ?? '')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            const companiesPayload = companyIds.map((id) => ({
                Company_Id: Number(id),
                IsDefault: Number(id) === Number(data?.DefaultCompany_Id),
            }))

            let Info: UsersDTO = {
                Id: Id ? Id : -1,
                Code: data?.Code,
                Name: data?.Name,
                LastName: data?.LastName,
                Theme: data?.Theme,
                TypeId: data?.TypeId ?? null,
                Status_Id: 1,
                ValidateAD: data?.ValidateAD,
                PasswordHash: data?.ValidateAD ? '' : data?.PasswordHash,
                Roles: data?.Roles,
                Companies: JSON.stringify(companiesPayload),
                DefaultCompany_Id: data?.DefaultCompany_Id ?? null,
                // A qué empresa del parque pertenece. Define de qué empresa son los
                // pases de visita que genere y cuáles puede ver.
                Empresa_Id: Number(data?.Empresa_Id) || 1,
                Create_By: user?.Code,
            }

            const response: ExecutionResponse<UsersDTO[]> = await securityService.saveUsers([Info])
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

    const getInfoSinLoading = async () => {
        if(activeTab === 'accesos'){
            const resp: ExecutionResponse<IAccessControl[]> = await securityService.getAccessControlByUser(user_Code as string)
            setAccessControl(resp.Data ?? []) 
        } else{
            const resp: ExecutionResponse<IMenuControl[]> = await securityService.getMenuControlByUser(user_Code as string)
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
                User_Code: user_Code,
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

    const isMenuActive = (menuId?: number | null) =>
        (menuControl ?? []).some((ac) => ac.Menu_Id === menuId && ac.Status_Id === 1)


    const toggleRolMenu = async (selectedPermiso: MenuDTO) => {
        const targetStatus: 1 | 2 = isMenuActive(selectedPermiso.Id) ? 2 : 1
        setLoadingToggle(selectedPermiso.Id)
        try {
            // Cascada en ambas direcciones (padre↔hijos), igual que en el web.
            const changes = computeMenuCascade(permisos, menuControl, selectedPermiso.Id, targetStatus)
            const payloads = buildMenuControlPayloads(changes, menuControl, {
                typeId: 6,
                createBy: user?.Code ?? '',
                userCode: user_Code,
            })
            let response
            for (const payload of payloads) {
                response = await securityService.saveMenuControl([payload])
                if (!response.Success) {
                    showToast('error', 'Error', response.ErrorMessage || 'Error al actualizar', 5000, 'bottom')
                    setLoadingToggle(null)
                    return
                }
            }
            if (!response) {
                setLoadingToggle(null)
                return
            }

            await getInfoSinLoading()
            showToast('success', 'Éxito', response.SuccessMessage || 'Operación realizada correctamente', 5000, 'bottom')
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
        const hasAccess = isMenuActive(i.Id)
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

    // Guardar el alto del teclado (para el paddingBottom del ScrollView) y, si hay
    // un campo de contraseña enfocado, bajar al final para dejarlo + los botones
    // por encima del teclado. Se hace en keyboardDidShow (cuando ya conocemos el
    // alto y el padding ya se aplicó) para que el scroll tenga a dónde ir.
    useEffect(() => {
        const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
            setKbHeight(e.endCoordinates?.height ?? 0)
            if (passwordFocused.current) {
                // Medir los botones vs. el borde superior del teclado (screenY) y
                // subir SOLO el solape (+16). Así quedan justo sobre el teclado, sin
                // el hueco enorme que dejaba scrollToEnd (que se iba hasta el final
                // del paddingBottom). Delay para que el paddingBottom ya esté aplicado.
                setTimeout(() => {
                    const kbTop = e.endCoordinates?.screenY ?? 0
                    const node = btnRef.current
                    if (kbTop && node?.measureInWindow) {
                        node.measureInWindow((_x: number, y: number, _w: number, h: number) => {
                            const overlap = (y + h) - kbTop
                            // Margen generoso uniforme (mismo criterio y valor que el login, 80):
                            // absorbe la barra del teclado que ciertos IME no incluyen en screenY
                            // (visto en tablets Honor/Lenovo). No hardcodeado por equipo.
                            if (overlap > -80) {
                                scrollRef.current?.scrollTo({ y: scrollY.current + overlap + 80, animated: true })
                            }
                        })
                    } else {
                        scrollRef.current?.scrollToEnd({ animated: true })
                    }
                }, 80)
            }
        })
        const hideSub = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0))
        return () => { showSub.remove(); hideSub.remove() }
    }, [])
    
    usePageHeader({
        left:(
                <ArrowLeftStyled onPress={() => navigation.goBack()} />   
                ),
        center: 
            <Text color="$text" >Nuevo Usuario</Text>
        ,

        right: <></>,
    })

    useEffect(() => {      
        if(isEdit){
            updateHeader({
                center: 
                    <Text color="$text" >
                        Editar usuario
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
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            // iOS: 'padding' (funciona bien). Android: undefined — el KAV no maneja
            // bien el teclado bajo edge-to-edge/New Arch; ahí lo resuelve el
            // paddingBottom dinámico (= alto del teclado) + scrollToEnd del ScrollView.
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={0}
        >
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

                    {activeTab === 'general' && (
                        <>
                            <RNScrollView
                                ref={scrollRef}
                                style={{ flex: 1 }}
                                showsVerticalScrollIndicator={false}
                                keyboardShouldPersistTaps="handled"
                                keyboardDismissMode="on-drag"
                                // flexGrow: el spacer empuja los botones al fondo cuando el
                                // form es corto. paddingBottom = alto del teclado (Android):
                                // da rango de scroll para subir campo+botones por encima del
                                // teclado. El scroll exacto lo calcula el listener de teclado
                                // (mide los botones vs. el borde del teclado), no scrollToEnd.
                                onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y }}
                                scrollEventThrottle={16}
                                contentContainerStyle={{ flexGrow: 1, paddingBottom: (Platform.OS === 'android' ? kbHeight : 0) + 12 }}
                            >
                                <YStack flex={1} padding="$4" gap="$1">
                                    <Controller
                                        control={control}
                                        name="Code"
                                        rules={{ required: 'Campo requerido' }}
                                        render={({ field: { onChange, value } }) => (
                                            <AppInput
                                                label="Usuario"
                                                value={value}
                                                onChangeText={onChange}
                                                error={errors.Code?.message}
                                                autoCapitalize="none"
                                                autoCorrect={false}
                                            />
                                        )}
                                    />
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
                                        name="LastName"
                                        rules={{ required: 'Campo requerido' }}
                                        render={({ field: { onChange, value } }) => (
                                            <AppInput
                                                label="Apellido"
                                                value={value}
                                                onChangeText={onChange}
                                                error={errors.LastName?.message}
                                            />
                                        )}
                                    />

                                    <Controller
                                        control={control}
                                        name="Theme"
                                        render={({ field: { onChange, value } }) => (
                                            <AppSelect
                                                label="Tema"
                                                value={value}
                                                onValueChange={onChange}
                                                options={[
                                                    {
                                                        label: 'Claro',
                                                        value: 'light',
                                                    },
                                                    {
                                                        label: 'Oscuro',
                                                        value: 'dark',
                                                    }
                                                ]}
                                            />
                                        )}
                                    />

                                    <Controller
                                        control={control}
                                        name="TypeId"
                                        rules={{ required: 'El tipo de usuario es requerido' }}
                                        render={({ field: { onChange, value } }) => (
                                            <AppSelect
                                                label="Tipo de usuario"
                                                value={value ?? undefined}
                                                // AppSelect entrega el value del option (string);
                                                // el SP y el DTO esperan int.
                                                onValueChange={(v) => onChange(Number(v))}
                                                options={userTypes.map((t) => ({
                                                    label: t.Name,
                                                    value: String(t.Id),
                                                }))}
                                                error={errors.TypeId?.message as string | undefined}
                                            />
                                        )}
                                    />

                                    <Controller
                                        control={control}
                                        name="Empresa_Id"
                                        render={({ field: { onChange, value } }) => (
                                            <AppSelect
                                                label="Empresa del parque"
                                                value={value != null ? String(value) : ''}
                                                onValueChange={(v) => onChange(Number(v) || 1)}
                                                options={empresas.map((e) => ({
                                                    label: e.Name,
                                                    value: String(e.Id),
                                                }))}
                                            />
                                        )}
                                    />

                                    <Controller
                                        control={control}
                                        name="Roles"
                                        rules={{
                                            validate: (value) => {
                                                const roles = (value ?? '')
                                                    .split(',')
                                                    .map((r) => r.trim())
                                                    .filter(Boolean)

                                                return roles.length > 0 || 'Debe asignar al menos un rol'
                                            }
                                        }}
                                        render={() => null}
                                    />

                                    <AccordionSection
                                        title="Roles asignados"
                                        subtitle={
                                            roles.filter((r) => {
                                                const assigned = (watch('Roles') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
                                                return assigned.includes(String(r.Id))
                                            }).length + ' roles activos'
                                        }
                                        subtitleError={errors.Roles?.message}
                                    >
                                        {roles.map((rol) => {
                                            const assigned = (watch('Roles') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
                                            const isChecked = assigned.includes(String(rol.Id))

                                            const toggleRol = () => {
                                                let updated: string[]

                                                if (isChecked) {
                                                    updated = assigned.filter((id) => id !== String(rol.Id))
                                                } else {
                                                    updated = [...assigned, String(rol.Id)]
                                                }

                                                setValue('Roles', updated.join(','), {
                                                    shouldValidate: true
                                                })
                                            }

                                            return (
                                                <XStack
                                                    key={rol.Id}
                                                    backgroundColor="$backgroundSurface"
                                                    borderRadius="$4"
                                                    paddingVertical="$3"
                                                    paddingHorizontal="$4"
                                                    alignItems="center"
                                                    borderWidth={0}
                                                    overflow="hidden"
                                                    onPress={toggleRol}
                                                    pressStyle={{ opacity: 0.75, scale: 0.99 }}
                                                    gap="$3"
                                                >
                                                    {/* Franja izquierda */}
                                                    <View
                                                        position="absolute"
                                                        left={0} top={0} bottom={0}
                                                        width={4}
                                                        backgroundColor={isChecked ? '$primary' : 'transparent'}
                                                    />

                                                    {/* Ícono */}
                                                    <View
                                                        width={36}
                                                        height={36}
                                                        borderRadius={18}
                                                        backgroundColor={isChecked ? 'rgba(255, 85, 26, 0.12)' : '$backgroundElevated'}
                                                        justifyContent="center"
                                                        alignItems="center"
                                                    >
                                                        <Shield size={18} color={isChecked ? '#FF551A' : '#94A3B8'} />
                                                    </View>

                                                    {/* Info */}
                                                    <YStack flex={1} gap="$0.5">
                                                        <Text fontSize={13} fontWeight="700" color="$text">
                                                            {rol.RoleName}
                                                        </Text>
                                                        <Text fontSize={11} color="$textMuted" numberOfLines={1}>
                                                            {rol.Description}
                                                        </Text>
                                                    </YStack>

                                                    {/* Checkbox */}
                                                    <Checkbox
                                                        id={`rol-${rol.Id}`}
                                                        size="$4"
                                                        checked={isChecked}
                                                        onCheckedChange={toggleRol}
                                                        backgroundColor={isChecked ? '$primary' : 'transparent'}
                                                        borderColor={isChecked ? '$primary' : '$textMuted'}
                                                    >
                                                        <Checkbox.Indicator>
                                                            <CheckIcon size={13} color="#FF551A" />
                                                        </Checkbox.Indicator>
                                                    </Checkbox>
                                                </XStack>
                                            )
                                        })}
                                    </AccordionSection>

                                    <Controller
                                        control={control}
                                        name="Companies"
                                        rules={{
                                            validate: (value) => {
                                                const list = (value ?? '')
                                                    .split(',')
                                                    .map((r) => r.trim())
                                                    .filter(Boolean)

                                                return list.length > 0 || 'Debe asignar al menos un país'
                                            }
                                        }}
                                        render={() => null}
                                    />

                                    <Controller
                                        control={control}
                                        name="DefaultCompany_Id"
                                        rules={{
                                            validate: (value) => {
                                                const list = (watch('Companies') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
                                                if (list.length === 0) return true
                                                if (value === null || value === undefined) return 'Debe elegir un país por defecto'
                                                return list.includes(String(value)) || 'El país por defecto debe estar entre los asignados'
                                            }
                                        }}
                                        render={() => null}
                                    />

                                    <AccordionSection
                                        title="Países asignados"
                                        subtitle={
                                            (watch('Companies') ?? '').split(',').map((s) => s.trim()).filter(Boolean).length + ' países activos'
                                        }
                                        subtitleError={errors.Companies?.message || errors.DefaultCompany_Id?.message}
                                    >
                                        {companies.map((company) => {
                                            const assigned = (watch('Companies') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
                                            const idStr = String(company.Id)
                                            const isChecked = assigned.includes(idStr)
                                            const defaultId = watch('DefaultCompany_Id')
                                            const isDefault = defaultId !== null && defaultId !== undefined && String(defaultId) === idStr

                                            const toggleCompany = () => {
                                                let updated: string[]

                                                if (isChecked) {
                                                    updated = assigned.filter((id) => id !== idStr)
                                                    if (isDefault) {
                                                        setValue('DefaultCompany_Id', updated.length ? Number(updated[0]) : null, {
                                                            shouldValidate: true
                                                        })
                                                    }
                                                } else {
                                                    updated = [...assigned, idStr]
                                                    if (defaultId === null || defaultId === undefined || (defaultId as any) === '') {
                                                        setValue('DefaultCompany_Id', company.Id, { shouldValidate: true })
                                                    }
                                                }

                                                setValue('Companies', updated.join(','), {
                                                    shouldValidate: true
                                                })
                                            }

                                            const setAsDefault = () => {
                                                if (!isChecked) {
                                                    setValue('Companies', [...assigned, idStr].join(','), {
                                                        shouldValidate: true
                                                    })
                                                }
                                                setValue('DefaultCompany_Id', company.Id, { shouldValidate: true })
                                            }

                                            return (
                                                <XStack
                                                    key={company.Id}
                                                    backgroundColor="$backgroundSurface"
                                                    borderRadius="$4"
                                                    paddingVertical="$3"
                                                    paddingHorizontal="$4"
                                                    alignItems="center"
                                                    borderWidth={0}
                                                    overflow="hidden"
                                                    onPress={toggleCompany}
                                                    pressStyle={{ opacity: 0.75, scale: 0.99 }}
                                                    gap="$3"
                                                >
                                                    {/* Franja izquierda */}
                                                    <View
                                                        position="absolute"
                                                        left={0} top={0} bottom={0}
                                                        width={4}
                                                        backgroundColor={isChecked ? '$primary' : 'transparent'}
                                                    />

                                                    {/* Ícono */}
                                                    <View
                                                        width={36}
                                                        height={36}
                                                        borderRadius={18}
                                                        backgroundColor={isChecked ? 'rgba(255, 85, 26, 0.12)' : '$backgroundElevated'}
                                                        justifyContent="center"
                                                        alignItems="center"
                                                    >
                                                        <Globe size={18} color={isChecked ? '#FF551A' : '#94A3B8'} />
                                                    </View>

                                                    {/* Info */}
                                                    <YStack flex={1} gap="$0.5">
                                                        <Text fontSize={13} fontWeight="700" color="$text">
                                                            {company.Name}
                                                        </Text>
                                                        <XStack alignItems="center" gap="$2">
                                                            <Text fontSize={11} color="$textMuted" numberOfLines={1}>
                                                                {company.Code}
                                                            </Text>
                                                            {isDefault && (
                                                                <View
                                                                    backgroundColor="rgba(255, 85, 26, 0.12)"
                                                                    paddingHorizontal="$2"
                                                                    paddingVertical={2}
                                                                    borderRadius="$10"
                                                                >
                                                                    <Text fontSize={9} color="$primary" fontWeight="700">
                                                                        Predeterminado
                                                                    </Text>
                                                                </View>
                                                            )}
                                                        </XStack>
                                                    </YStack>

                                                    {/* Botón predeterminado */}
                                                    <View
                                                        onPress={(e: any) => {
                                                            e?.stopPropagation?.()
                                                            setAsDefault()
                                                        }}
                                                        pressStyle={{ opacity: 0.6 }}
                                                        padding="$1.5"
                                                        hitSlop={8}
                                                        alignItems="center"
                                                        justifyContent="center"
                                                    >
                                                        <Star
                                                            size={20}
                                                            color={isDefault ? '#FF551A' : '#94A3B8'}
                                                            fill={isDefault ? '#FF551A' : 'transparent'}
                                                        />
                                                    </View>

                                                    {/* Checkbox */}
                                                    <Checkbox
                                                        id={`company-${company.Id}`}
                                                        size="$4"
                                                        checked={isChecked}
                                                        onCheckedChange={toggleCompany}
                                                        backgroundColor={isChecked ? '$primary' : 'transparent'}
                                                        borderColor={isChecked ? '$primary' : '$textMuted'}
                                                    >
                                                        <Checkbox.Indicator>
                                                            <CheckIcon size={13} color="#FF551A" />
                                                        </Checkbox.Indicator>
                                                    </Checkbox>
                                                </XStack>
                                            )
                                        })}
                                    </AccordionSection>



                                    {!Id && (
                                        <>
                                            <Controller
                                                control={control}
                                                name="ValidateAD"
                                                render={({ field: { value, onChange } }) => (
                                                    <XStack
                                                        backgroundColor={value ? 'rgba(255, 85, 26, 0.06)' : '$backgroundElevated'}
                                                        borderWidth={1.5}
                                                        borderColor={value ? '$primary' : '$border'}
                                                        borderRadius="$5"
                                                        padding="$4"
                                                        marginTop="$3"
                                                        alignItems="center"
                                                        gap="$3"
                                                        pressStyle={{ opacity: 0.8 }}
                                                        onPress={() => {
                                                            onChange(!value)
                                                            if (!value) {
                                                                // está activando AD → limpiar errores de password
                                                                clearErrors(['PasswordHash', 'ConfirmPassword'])
                                                            }
                                                        }}
                                                    >
                                                        <View
                                                            width={38}
                                                            height={38}
                                                            borderRadius={22}
                                                            backgroundColor={value ? 'rgba(255, 85, 26, 0.12)' : '$backgroundSurface'}
                                                            justifyContent="center"
                                                            alignItems="center"
                                                        >
                                                            <Shield size={22} color={value ? '#FF551A' : '#94A3B8'} />
                                                        </View>

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
                                                                elevation={2}
                                                            />
                                                        </View>
                                                    </XStack>
                                                )}
                                            />

                                            {!validateAD && (
                                                <>
                                                    <Controller
                                                        control={control}
                                                        name="PasswordHash"
                                                        rules={{
                                                            validate: (value) => {
                                                                if (Id) return true
                                                                if (watch('ValidateAD')) return true
                                                                if (!value || value.trim() === '') return 'Campo requerido'
                                                                return true
                                                            }
                                                        }}
                                                        render={({ field: { onChange, value } }) => (
                                                            <AppInput
                                                                label="Contraseña"
                                                                value={value}
                                                                onChangeText={onChange}
                                                                onFocus={() => { passwordFocused.current = true }}
                                                                onBlur={() => { passwordFocused.current = false }}
                                                                secureTextEntry={!showPassword}
                                                                autoCapitalize="none"
                                                                autoCorrect={false}
                                                                autoComplete="off"
                                                                textContentType="oneTimeCode"
                                                                rightElement={
                                                                    <View
                                                                        onPress={() => setShowPassword((prev) => !prev)}
                                                                        pressStyle={{ opacity: 0.6 }}
                                                                        padding="$2"
                                                                    >
                                                                        {showPassword
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
                                                            validate: (value) => {
                                                                if (Id) return true
                                                                if (watch('ValidateAD')) return true
                                                                if (!value || value.trim() === '') return 'Campo requerido'
                                                                if (value !== watch('PasswordHash')) return 'Las contraseñas no coinciden'
                                                                return true
                                                            }
                                                        }}
                                                        render={({ field: { onChange, value } }) => (
                                                            <AppInput
                                                                label="Confirmar contraseña"
                                                                value={value}
                                                                onChangeText={onChange}
                                                                onFocus={() => { passwordFocused.current = true }}
                                                                onBlur={() => { passwordFocused.current = false }}
                                                                secureTextEntry={!showConfirmPassword}
                                                                error={errors.ConfirmPassword?.message}
                                                                autoCapitalize="none"
                                                                autoCorrect={false}
                                                                autoComplete="off"
                                                                textContentType="oneTimeCode"
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
                                        </>
                                    )}

                                    {/* Spacer flexible: empuja los botones al fondo
                                        (cerca de la barra del sistema) cuando el form es
                                        corto; deja mínimo 20 de separación del último
                                        campo cuando el form es largo. */}
                                    <View flex={1} minHeight={20} />

                                    <XStack ref={btnRef} gap="$3" marginBottom="$2">
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
                                </YStack>
                            </RNScrollView>
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
                                    {(() => {
                                        // Tarjeta de acceso (reutilizada por categoría)
                                        const renderAccessCard = (i: AccessDTO) => {
                                            const hasAccess = (accessControl ?? []).some(
                                                (ac) => ac.Access_Id === i?.Id && ac.Status_Id === 1
                                            )
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
                                                    <View position="absolute" left={0} top={0} bottom={0} width={4}
                                                        backgroundColor={hasAccess ? '$primary' : 'transparent'} />
                                                    <View width={40} height={40} borderRadius={20}
                                                        backgroundColor={hasAccess ? 'rgba(255, 85, 26, 0.12)' : '$backgroundSurface'}
                                                        justifyContent="center" alignItems="center">
                                                        {isLoadingThis ? (
                                                            <Spinner size="small" color="$primary" />
                                                        ) : (
                                                            <User size={20} color={hasAccess ? '#FF551A' : '#94A3B8'} />
                                                        )}
                                                    </View>
                                                    <YStack flex={1} gap="$0.5">
                                                        <Text fontWeight="700" fontSize={14} color="$text">{i.Name}</Text>
                                                        <Text fontSize={12} color="$textMuted">{i.KeyVar} - {i.Description}</Text>
                                                    </YStack>
                                                    {hasAccess && (
                                                        <View backgroundColor="rgba(255, 85, 26, 0.12)" paddingHorizontal="$2"
                                                            paddingVertical={3} borderRadius="$10">
                                                            <Text fontSize={10} color="$primary" fontWeight="700">Activo</Text>
                                                        </View>
                                                    )}
                                                </XStack>
                                            )
                                        }

                                        // Agrupar por categoría ('Otros' al final)
                                        const grupos = new Map<string, AccessDTO[]>()
                                        filteredAccess.forEach((a) => {
                                            const cat = a.Category && a.Category.trim() ? a.Category : 'Otros'
                                            if (!grupos.has(cat)) grupos.set(cat, [])
                                            grupos.get(cat)!.push(a)
                                        })
                                        const cats = [...grupos.keys()].sort((a, b) =>
                                            a === 'Otros' ? 1 : b === 'Otros' ? -1 : a.localeCompare(b))

                                        const rows: React.ReactNode[] = []
                                        cats.forEach((cat) => {
                                            const items = grupos.get(cat)!
                                            const isExp = expandedCats[cat] ?? false
                                            rows.push(
                                                <XStack key={`cat-${cat}`} alignItems="center" gap="$2"
                                                    paddingVertical="$2" paddingHorizontal="$1" marginTop="$1"
                                                    onPress={() => setExpandedCats((p) => ({ ...p, [cat]: !isExp }))}
                                                    pressStyle={{ opacity: 0.7 }}>
                                                    {isExp ? <ChevronDown size={18} color="#94A3B8" /> : <ChevronRight size={18} color="#94A3B8" />}
                                                    <Text fontWeight="800" fontSize={13} color="$textMuted"
                                                        textTransform="uppercase" letterSpacing={0.5}>{cat}</Text>
                                                    <Text fontSize={12} color="$textMuted">· {items.length}</Text>
                                                </XStack>
                                            )
                                            if (isExp) items.forEach((i) => rows.push(renderAccessCard(i)))
                                        })
                                        return rows
                                    })()}
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
        </KeyboardAvoidingView>
    )
}