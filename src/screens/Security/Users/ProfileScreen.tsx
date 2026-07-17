import React, { useEffect, useState } from 'react'
import { ScrollView } from 'react-native'
import { YStack, XStack, Text, useTheme, Button, AlertDialog, Spinner, View } from 'tamagui'
import AppInput from '../../../components/commons/AppInput'
import { useAuth } from '../../../context/AuthContext'
import * as Icons from 'lucide-react-native'
import { useMenu } from '../../../context/MenuContext'
import { Pressable } from 'react-native'
import { ExecutionResponse } from '../../../api/modules/response.type'
import { IQuickActions } from '../../../api/modules/security/security.types'
import { securityService } from '../../../api/modules/security/security.service'
import { useShowToast } from '../../../utils/useShowToast'
import { useThemeName } from 'tamagui'
import { TouchableOpacity } from 'react-native'
import { UsersSettingsDTO } from '../../../api/modules/security/security.types'
import { shadows } from '../../../theme/shadows'
import { useHeader } from '../../../context/HeaderContext'
import { useNavigation } from '@react-navigation/native'
import { usePageHeader } from '../../../hooks/usePageHeader'
import { useLoader } from '../../../providers/LoaderProvider'
import {
  getBiometryType,
  isBiometricEnabled,
  disableBiometric,
  biometryLabel,
  isFaceBiometry,
  type BiometryKind,
} from '../../../services/biometricAuth'
export default function ProfileScreen() {
    const loader = useLoader();
    const { user, logout } = useAuth()
    const { setHeader } = useHeader();
    const navigation = useNavigation();

    // Eliminar cuenta
    const [deleteOpen, setDeleteOpen] = useState(false)
    const [deletePassword, setDeletePassword] = useState('')
    const [showDeletePassword, setShowDeletePassword] = useState(false)
    const [deletePasswordError, setDeletePasswordError] = useState('')
    const [deleting, setDeleting] = useState(false)

    const [data, setData] = useState<any[]>([])
    const initials = `${user?.Name?.charAt(0) ?? ''}${user?.LastName?.charAt(0) ?? ''}`.toUpperCase()
    const { menu } = useMenu()
    const [favorites, setFavorites] = useState<number[]>([])
    const [quickActions, setQuickActions] = useState<IQuickActions[]>([])
    const { showToast } = useShowToast()
    const { setTheme } = useAuth()
    const themeName = useThemeName()
    const [loading, setLoading] = useState(false)
    // Biometría: tipo soportado por el equipo y si el ingreso biométrico está activo.
    const [biometryType, setBiometryType] = useState<BiometryKind>(null)
    const [bioEnabled, setBioEnabled] = useState(false)
    const isDark = themeName === 'dark'
    const theme = useTheme()
    
    const getInfo = async () => {
        loader.show();
        setData(menu?.filter((i) => i?.ParentMenu_Id !== null))
        const response: ExecutionResponse<IQuickActions[]> = await securityService.getQuickActions(user?.User_Code)
        if (response.Success) {
            setQuickActions(response.Data)
            let newData = response.Data.filter((i: IQuickActions) => i?.Status_Id === 1)
            setFavorites(newData.map((i: IQuickActions) => i.Menu_Id))
        }
        loader.hide();
    }

    const toggleFavorite = async (id: number) => {
        const isRemoving = favorites.includes(id)
        const existing = quickActions.find(q => q.Menu_Id === id)

        const info = {
            Id: existing ? existing.Id : -1, 
            User_Code: user?.Code,
            Menu_Id: id,
            Status_Id: isRemoving ? 2 : 1
        }
        const response: ExecutionResponse<IQuickActions[]> = await securityService.saveQuickActions([info])
        if(response.Success){
            setFavorites(prev =>
                prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
            )
            getInfo()
        }
        
    }

    usePageHeader({
        left:(
        <Icons.ArrowLeft color={theme.text?.val} onPress={() => navigation.goBack()} />   
        ),
            center: (
            <Text fontSize={16} fontWeight="700" color="$text">
                Mi Perfil
            </Text>
            ),

            right: <></>,
        })
    
    const changeTheme = async () => {
        setTheme(isDark ? 'light' : 'dark')
        const themeData: UsersSettingsDTO = {
            Id: user?.Id ?? 0,
            Code: user?.Code ?? '',
            Theme: isDark ? 'light' : 'dark',
            Modified_By: user?.Code ?? '',
            Status_Id: 1,
            Options: 1,
        }
        const response = await securityService.saveUsersSettings([themeData])
        if (!response.Success) {
            showToast('error', 'Error', 'Error al guardar la configuración del tema', 5000, 'top')
        }
    }

    const openDeleteDialog = () => {
        setDeletePassword('')
        setDeletePasswordError('')
        setShowDeletePassword(false)
        setDeleteOpen(true)
    }

    const handleDeleteAccount = async () => {
        if (!deletePassword) {
            setDeletePasswordError('Ingresa tu contraseña para continuar')
            return
        }
        setDeletePasswordError('')
        setDeleting(true)
        try {
            const info = {
                Id: user?.Id,
                Code: user?.Code,
                Password: deletePassword,
                Modified_By: user?.Code,
            }
            const response: ExecutionResponse<any> = await securityService.deleteAccount(info)
            if (response.Success) {
                setDeleteOpen(false)
                showToast('success', 'Cuenta eliminada', response.SuccessMessage || 'Tu cuenta fue eliminada correctamente', 4000, 'top')
                // Cerrar sesión y volver al login
                setTimeout(async () => { await logout() }, 600)
            } else {
                setDeletePasswordError(response.ErrorMessage || 'No se pudo eliminar la cuenta')
            }
        } catch (error) {
            setDeletePasswordError('Ocurrió un error inesperado. Intenta de nuevo.')
        }
        setDeleting(false)
    }

    // Cargar estado de biometría (tipo soportado + si está activada).
    useEffect(() => {
        let alive = true
        ;(async () => {
            const [type, enabled] = await Promise.all([getBiometryType(), isBiometricEnabled()])
            if (!alive) return
            setBiometryType(type)
            setBioEnabled(enabled && !!type)
        })()
        return () => { alive = false }
    }, [])

    // Desactivar/desvincular el ingreso biométrico: borra las credenciales del
    // Keychain y la bandera. Para reactivarlo, se hace desde el login con la contraseña.
    const handleDisableBiometric = async () => {
        const label = biometryLabel(biometryType)
        await disableBiometric()
        setBioEnabled(false)
        showToast('success', 'Listo', `Se desactivó el ingreso con ${label}`, 4000, 'top')
    }

    useEffect(() => {
        getInfo();
    }, [])

    return (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
            <YStack padding="$4" backgroundColor="$backgroundPage" gap="$4">

                
                {/* Card perfil */}
                <YStack
                    backgroundColor="$backgroundElevated"
                    borderRadius="$6"
                    padding="$5"
                    alignItems="center"
                    {...shadows.sm}
                >
                    <YStack
                        width={72}
                        height={72}
                        borderRadius={36}
                        backgroundColor="$primary"
                        justifyContent="center"
                        alignItems="center"
                        marginBottom="$3"
                    >
                        <Text color="white" fontSize={26} fontWeight="700">
                            {initials}
                        </Text>
                    </YStack>

                    <Text fontSize={18} fontWeight="700" color="$text">
                        {user?.Name} {user?.LastName}
                    </Text>

                    <XStack
                        marginTop="$2"
                        backgroundColor="rgba(34, 197, 94, 0.37)"
                        paddingHorizontal="$3"
                        paddingVertical="$1"
                        borderRadius={5}
                    >
                        <Text fontSize={12} fontWeight="600" color="#073e1b">
                            Activo
                        </Text>
                    </XStack>

                    <Text fontSize={13} color="$textMuted" marginTop="$2">
                        {user?.Roles?.map((r: any) => r.RoleName).join('  ●  ')}
                    </Text>
                </YStack>

                {/* Info Personal */}
                <YStack backgroundColor="$backgroundElevated" borderRadius="$6" padding="$4" gap="$3" {...shadows.sm}>
                    <XStack alignItems="center" gap="$2">
                        <Icons.User size={16} color={'#FF551A'} />
                        <Text fontSize={15} fontWeight="700" color="$text">Información Personal</Text>
                    </XStack>

                    <YStack height={1} backgroundColor="$border" />

                    <YStack gap="$1">
                        <Text fontSize={11} color="$textMuted" textTransform="uppercase" letterSpacing={1}>Código</Text>
                        <Text fontSize={15} fontWeight="600" color="$text">{user?.Code}</Text>
                    </YStack>

                    <YStack gap="$1">
                        <Text fontSize={11} color="$textMuted" textTransform="uppercase" letterSpacing={1}>Nombre</Text>
                        <Text fontSize={15} fontWeight="600" color="$text">{user?.Name} {user?.LastName}</Text>
                    </YStack>
                </YStack>

                {/* Accesos rápidos */}
                <YStack backgroundColor="$backgroundElevated" borderRadius="$6" padding="$4" gap="$3" {...shadows.sm}>

                    {/* Header */}
                    <XStack alignItems="center" justifyContent="space-between">
                        <XStack alignItems="center" gap="$2">
                            <Icons.Zap size={16} color={'#FF551A'} />
                            <Text fontSize={15} fontWeight="700" color="$text">Accesos Rápidos</Text>
                        </XStack>

                        <XStack
                            backgroundColor={favorites.length >= 4 ? 'rgba(255,85,26,0.12)' : 'rgba(100,116,139,0.1)'}
                            paddingHorizontal="$2"
                            paddingVertical={4}
                            borderRadius={6}
                            alignItems="center"
                            gap="$1"
                        >
                            <Icons.Star size={12} color={favorites.length >= 4 ? '#FF551A' : '#94A3B8'} fill={favorites.length >= 4 ? '#FF551A' : 'transparent'} />
                            <Text
                                fontSize={12}
                                fontWeight="700"
                                color={favorites.length >= 4 ? '$primary' : '$textMuted'}
                            >
                                {favorites.length}/4
                            </Text>
                        </XStack>
                    </XStack>

                    <YStack height={1} backgroundColor="$border" />

                    {data.map((item) => {
                        const IconComponent = (Icons as any)[item.Icon] || Icons.FileText
                        const isFav = favorites.includes(item.Id)

                        return (
                            <Pressable key={item.Id}
                                onPress={() => {
                                    if (!isFav && favorites.length >= 4) {
                                        showToast('error', 'Error','Solo se permiten 4 acciones rápidas', 5000, 'top')
                                        return
                                    }
                                    toggleFavorite(item.Id)
                                }}>
                                <XStack
                                    alignItems="center"
                                    gap="$3"
                                    padding="$3"
                                    borderRadius="$4"
                                    backgroundColor={isFav ? 'rgba(255, 85, 26, 0.04)' : '$backgroundElevated'}
                                    borderWidth={1}
                                    borderColor={isFav ? 'rgba(255, 85, 26, 0.2)' : 'transparent'}
                                >
                                    <YStack
                                        width={38}
                                        height={38}
                                        borderRadius={10}
                                        backgroundColor={isFav ? 'rgba(255, 85, 26, 0.12)' : 'rgba(100,116,139,0.08)'}
                                        justifyContent="center"
                                        alignItems="center"
                                    >
                                        <IconComponent size={18} color={isFav ? '#FF551A' : '#94A3B8'} />
                                    </YStack>

                                    <Text fontSize={14} fontWeight="500" color="$text" flex={1}>
                                        {item.Name}
                                    </Text>

                                    <Pressable onPress={(e) => {
                                        e.stopPropagation()
                                        if (!isFav && favorites.length >= 4) {
                                            showToast('error', 'Error','Solo se permiten 4 acciones rápidas', 5000, 'top')
                                            return
                                        }
                                        toggleFavorite(item.Id)
                                    }}>
                                        <Icons.Star
                                            size={20}
                                            color={isFav ? '#FF551A' : '#94A3B8'}
                                            fill={isFav ? '#FF551A' : 'transparent'}
                                        />
                                    </Pressable>
                                </XStack>
                            </Pressable>
                        )
                    })}
                </YStack>

                {/* Tema */}
                <YStack backgroundColor="$backgroundElevated" borderRadius="$6" padding="$4" gap="$3" marginBottom="$3" {...shadows.sm}>
                    <XStack alignItems="center" gap="$2">
                        <Icons.Palette size={16} color={'#FF551A'} />
                        <Text fontSize={15} fontWeight="700" color="$text">Apariencia</Text>
                    </XStack>

                    <YStack height={1} backgroundColor="$border" />

                    <XStack alignItems="center" justifyContent="space-between">
                        <XStack alignItems="center" gap="$3">
                            <YStack
                                width={38}
                                height={38}
                                borderRadius={10}
                                backgroundColor={isDark ? 'rgba(255,85,26,0.12)' : 'rgba(100,116,139,0.08)'}
                                justifyContent="center"
                                alignItems="center"
                            >
                                {isDark
                                    ? <Icons.Moon size={18} color="#FF551A" />
                                    : <Icons.Sun size={18} color="#94A3B8" />
                                }
                            </YStack>
                            <YStack>
                                <Text fontSize={14} fontWeight="600" color="$text">
                                    {isDark ? 'Modo Oscuro' : 'Modo Claro'}
                                </Text>
                                <Text fontSize={12} color="$textMuted">
                                    {isDark ? 'Cambia a tema claro' : 'Cambia a tema oscuro'}
                                </Text>
                            </YStack>
                        </XStack>

                        <TouchableOpacity onPress={changeTheme} activeOpacity={0.85}>
                            <YStack
                                width={56}
                                height={30}
                                borderRadius={999}
                                padding={3}
                                backgroundColor="$backgroundSurface"
                                justifyContent="center"
                                alignItems={isDark ? 'flex-end' : 'flex-start'}
                            >
                                <YStack
                                    width={24}
                                    height={24}
                                    borderRadius={999}
                                    backgroundColor="$primary"
                                    alignItems="center"
                                    justifyContent="center"
                                >
                                    {isDark
                                        ? <Icons.Moon color="white" size={13} />
                                        : <Icons.Sun color="white" size={13} />
                                    }
                                </YStack>
                            </YStack>
                        </TouchableOpacity>
                    </XStack>
                </YStack>

                {/* Seguridad: ingreso biométrico (solo si el equipo lo soporta) */}
                {biometryType && (
                    <YStack backgroundColor="$backgroundElevated" borderRadius="$6" padding="$4" gap="$3" marginBottom="$3" {...shadows.sm}>
                        <XStack alignItems="center" gap="$2">
                            <Icons.ShieldCheck size={16} color={'#FF551A'} />
                            <Text fontSize={15} fontWeight="700" color="$text">Seguridad</Text>
                        </XStack>

                        <YStack height={1} backgroundColor="$border" />

                        <XStack alignItems="center" justifyContent="space-between">
                            <XStack alignItems="center" gap="$3" flex={1} paddingRight="$3">
                                <YStack
                                    width={38}
                                    height={38}
                                    borderRadius={10}
                                    backgroundColor={bioEnabled ? 'rgba(255,85,26,0.12)' : 'rgba(100,116,139,0.08)'}
                                    justifyContent="center"
                                    alignItems="center"
                                >
                                    {isFaceBiometry(biometryType)
                                        ? <Icons.ScanFace size={18} color={bioEnabled ? '#FF551A' : '#94A3B8'} />
                                        : <Icons.Fingerprint size={18} color={bioEnabled ? '#FF551A' : '#94A3B8'} />}
                                </YStack>
                                <YStack flex={1}>
                                    <Text fontSize={14} fontWeight="600" color="$text">
                                        Ingreso con {biometryLabel(biometryType)}
                                    </Text>
                                    <Text fontSize={12} color="$textMuted" lineHeight={17}>
                                        {bioEnabled
                                            ? 'Activado. Desactívalo para dejar de usarlo en este dispositivo.'
                                            : 'Actívalo al iniciar sesión con tu contraseña.'}
                                    </Text>
                                </YStack>
                            </XStack>

                            <TouchableOpacity
                                activeOpacity={0.85}
                                onPress={() => {
                                    if (bioEnabled) {
                                        handleDisableBiometric()
                                    } else {
                                        showToast('info', 'Información', `Para activarlo, marca la opción al iniciar sesión con tu contraseña.`, 5000, 'top')
                                    }
                                }}
                            >
                                <YStack
                                    width={56}
                                    height={30}
                                    borderRadius={999}
                                    padding={3}
                                    backgroundColor={bioEnabled ? '$primary' : '$backgroundSurface'}
                                    justifyContent="center"
                                    alignItems={bioEnabled ? 'flex-end' : 'flex-start'}
                                >
                                    <YStack width={24} height={24} borderRadius={999} backgroundColor="white" />
                                </YStack>
                            </TouchableOpacity>
                        </XStack>
                    </YStack>
                )}

                {/* Zona de peligro */}
                <YStack
                    backgroundColor="$backgroundElevated"
                    borderRadius="$6"
                    padding="$4"
                    gap="$3"
                    marginBottom="$5"
                    borderWidth={1}
                    borderColor="rgba(239, 68, 68, 0.25)"
                    {...shadows.sm}
                >
                    <XStack alignItems="center" gap="$2">
                        <Icons.TriangleAlert size={16} color={'#ef4444'} />
                        <Text fontSize={15} fontWeight="700" color="#ef4444">Zona de peligro</Text>
                    </XStack>

                    <YStack height={1} backgroundColor="$border" />

                    <Text fontSize={13} color="$textMuted" lineHeight={19}>
                        Al eliminar tu cuenta se desactivará tu acceso a la aplicación. Esta acción cierra tu sesión.
                    </Text>

                    <Button
                        height={44}
                        borderRadius="$4"
                        backgroundColor="rgba(239, 68, 68, 0.10)"
                        borderWidth={1}
                        borderColor="rgba(239, 68, 68, 0.35)"
                        pressStyle={{ opacity: 0.7 }}
                        onPress={openDeleteDialog}
                    >
                        <XStack gap="$2" alignItems="center">
                            <Icons.Trash2 size={18} color="#ef4444" />
                            <Text fontSize={14} fontWeight="600" color="#ef4444">Eliminar mi cuenta</Text>
                        </XStack>
                    </Button>
                </YStack>

            </YStack>

            {/* Diálogo: confirmar eliminación con contraseña */}
            <AlertDialog
                open={deleteOpen}
                onOpenChange={(value) => { if (!deleting) setDeleteOpen(value) }}
            >
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
                        marginHorizontal="$5"
                        x={0} y={0} scale={1} opacity={1}
                        {...shadows.lg}
                    >
                        <YStack gap="$3">
                            <YStack gap="$2" alignItems="center">
                                <YStack
                                    width={56}
                                    height={56}
                                    borderRadius={28}
                                    backgroundColor="rgba(239, 68, 68, 0.10)"
                                    justifyContent="center"
                                    alignItems="center"
                                >
                                    <Icons.TriangleAlert size={26} color="#ef4444" />
                                </YStack>

                                <AlertDialog.Title>
                                    <Text fontSize={16} fontWeight="700" color="$text" textAlign="center">
                                        Eliminar mi cuenta
                                    </Text>
                                </AlertDialog.Title>

                                <AlertDialog.Description>
                                    <Text fontSize={13} color="$textMuted" lineHeight={20} textAlign="center">
                                        Confirma tu contraseña para desactivar tu cuenta. Se cerrará tu sesión.
                                    </Text>
                                </AlertDialog.Description>
                            </YStack>

                            <AppInput
                                label="Contraseña"
                                value={deletePassword}
                                onChangeText={(text) => { setDeletePassword(text); if (deletePasswordError) setDeletePasswordError('') }}
                                secureTextEntry={!showDeletePassword}
                                autoCapitalize="none"
                                error={deletePasswordError}
                                disabled={deleting}
                                rightElement={
                                    <View onPress={() => setShowDeletePassword(p => !p)} padding="$2">
                                        {showDeletePassword
                                            ? <Icons.EyeOff size={18} color="#94A3B8" />
                                            : <Icons.Eye size={18} color="#94A3B8" />}
                                    </View>
                                }
                            />

                            <XStack gap="$3" width="100%" marginTop="$1">
                                <AlertDialog.Cancel asChild>
                                    <Button
                                        flex={1}
                                        height={42}
                                        borderRadius="$4"
                                        backgroundColor="$buttonSecondary"
                                        borderWidth={0}
                                        disabled={deleting}
                                        opacity={deleting ? 0.6 : 1}
                                        pressStyle={{ opacity: 0.7 }}
                                        onPress={() => { if (!deleting) setDeleteOpen(false) }}
                                    >
                                        <Text fontSize={14} fontWeight="600" color="$text">Cancelar</Text>
                                    </Button>
                                </AlertDialog.Cancel>

                                <Button
                                    flex={1}
                                    height={42}
                                    borderRadius="$4"
                                    backgroundColor="#ef4444"
                                    borderWidth={0}
                                    disabled={deleting}
                                    opacity={deleting ? 0.8 : 1}
                                    pressStyle={{ opacity: 0.7 }}
                                    onPress={handleDeleteAccount}
                                >
                                    <XStack gap="$2" alignItems="center">
                                        {deleting && <Spinner size="small" color="white" />}
                                        <Text fontSize={14} fontWeight="600" color="white">
                                            {deleting ? 'Eliminando...' : 'Eliminar'}
                                        </Text>
                                    </XStack>
                                </Button>
                            </XStack>
                        </YStack>
                    </AlertDialog.Content>
                </AlertDialog.Portal>
            </AlertDialog>
        </ScrollView>
    )
}