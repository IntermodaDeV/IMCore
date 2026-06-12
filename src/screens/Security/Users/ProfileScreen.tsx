import React, { useEffect, useState } from 'react'
import { ScrollView } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
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
export default function ProfileScreen() {
    const loader = useLoader();
    const { user } = useAuth()
    const { setHeader } = useHeader();
    const navigation = useNavigation();

    const [data, setData] = useState<any[]>([])
    const initials = `${user?.Name?.charAt(0) ?? ''}${user?.LastName?.charAt(0) ?? ''}`.toUpperCase()
    const { menu } = useMenu()
    const [favorites, setFavorites] = useState<number[]>([])
    const [quickActions, setQuickActions] = useState<IQuickActions[]>([])
    const { showToast } = useShowToast()
    const { setTheme } = useAuth()
    const themeName = useThemeName()
    const [loading, setLoading] = useState(false)
    const isDark = themeName === 'dark'

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
        <Icons.ArrowLeft onPress={() => navigation.goBack()} />   
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

    useEffect(() => {
        getInfo();

        
    }, [])

    return (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
            <YStack padding="$4" backgroundColor="$background" gap="$4">

                
                {/* Card perfil */}
                <YStack
                    backgroundColor="$card2"
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
                <YStack backgroundColor="$card2" borderRadius="$6" padding="$4" gap="$3" {...shadows.sm}>
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
                <YStack backgroundColor="$card2" borderRadius="$6" padding="$4" gap="$3" {...shadows.sm}>

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
                                    backgroundColor={isFav ? 'rgba(255, 85, 26, 0.04)' : '$card2'}
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
                <YStack backgroundColor="$card2" borderRadius="$6" padding="$4" gap="$3" marginBottom="$3" {...shadows.sm}>
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
                                backgroundColor="$card"
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

            </YStack>
        </ScrollView>
    )
}