import React, { useState, useRef, useEffect } from 'react'
import { TouchableOpacity, Animated, Easing, StyleSheet, View as RNView, Image as RNImage, Platform } from 'react-native'
import { Moon, Sun, LogOut, ChevronDown, ChevronRight, FileText } from 'lucide-react-native'
import * as LucideIcons from 'lucide-react-native'
import { createDrawerNavigator, DrawerContentScrollView, DrawerContentComponentProps } from '@react-navigation/drawer'
import { Button, Text, View, useTheme, useThemeName, YStack, XStack } from 'tamagui'
import { useNavigation } from '@react-navigation/native'
import { SCREENS } from '../screens/screens'
import { useMenu } from '../context/MenuContext'
import { MenuDTO, UsersSettingsDTO } from '../api/modules/security/security.types'
import { useAuth } from '../context/AuthContext'
import { SkeletonBox } from '../components/Skeletons/SkeletonList'
import { useNavigationState } from '@react-navigation/native'
import { useShowToast } from '../utils/useShowToast'
import { securityService } from '../api/modules/security/security.service'
import { shadows } from '../theme/shadows'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Icons from 'lucide-react-native'
import { HeaderProvider } from '../context/HeaderContext'
import { AppHeader } from '../components/commons/AppHeader'
import { puedeCrearTickets } from '../screens/Mantenimiento/mantenimiento.helpers'

const Drawer = createDrawerNavigator()

const createDrawerContent = (setTheme: any, menu: MenuDTO[] = []) => {
  return function DrawerContent(props: any) {
    return (
      <CustomDrawerContent
        {...props}
        setTheme={setTheme}
        menu={menu}
      />
    )
  }
}

function AnimatedDots({ color }: { color?: string }) {
  const anims = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current

  useEffect(() => {
    const animations = anims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 120),
          Animated.timing(anim, { toValue: -6, duration: 300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      )
    )

    animations.forEach(a => a.start())
    return () => animations.forEach(a => a.stop())
  }, [anims])

  return (
    <RNView style={localStyles.dotsContainer}>
      {anims.map((anim, idx) => (
        <Animated.View key={idx} style={[localStyles.dot, { backgroundColor: color ?? '#FF551A', transform: [{ translateY: anim }] }]} />
      ))}
    </RNView>
  )
}

export default function DrawerNavigator({ setTheme }: any) {
  const theme = useTheme()
  const { menu, loading } = useMenu()
  if (loading) return null
  
  const screenTitles = Object.fromEntries((menu ?? []).map(item => [item.Route, item.Name]))
  const insets = useSafeAreaInsets()
  const screens = Object.entries(SCREENS).filter(
    ([key]) => key !== 'Childs'
  );
  return (
  <HeaderProvider>
    <Drawer.Navigator
      initialRouteName="inicio"
      drawerContent={createDrawerContent(setTheme, menu)}
      screenOptions={{
        header: ({route, options}) => <AppHeader  route={route} options={options} />,
        headerShown: true,
        drawerType: 'slide',
        drawerStyle: {
          backgroundColor: theme.background?.val,
          width: 290,
        },
        drawerActiveTintColor: theme.primary?.val,
        drawerInactiveTintColor: theme.textMuted?.val,
      }}
    >
      

      {Object.entries(SCREENS).map(([Name, route]) => {
        const Component =
          typeof route === 'object' &&
          route !== null &&
          'Screen' in route
            ? route.Screen
            : route;

        return (
          <Drawer.Screen
            key={Name}
            name={Name}
            component={Component}
          />
        );
      })}
    </Drawer.Navigator>
  </HeaderProvider>
)
}

function CustomDrawerContent(props: DrawerContentComponentProps & { setTheme: any; menu: MenuDTO[] }) {
  const navigation = useNavigation()
  const { user, logout } = useAuth()
  const { refreshMenu } = useMenu()
  const [refreshing, setRefreshing] = useState(false)
  const [navLoading, setNavLoading] = useState<string | null>(null)
  const initials =`${user?.Name?.charAt(0) ?? ''}${user?.LastName?.charAt(0) ?? ''}`.toUpperCase()
  const theme = useTheme()
  const currentRoute = useNavigationState(state => state?.routes?.[state.index]?.name)
  const [openId, setOpenId] = useState<number | null>(null)
  // El acceso 'CrearTickets' (o rol Sup. Producción/Admin) hace visible el módulo
  // de Tickets aunque el menú del servidor no lo incluya (se inyecta en el árbol).
  const baseMenu = props.menu ?? []
  const inject: MenuDTO[] = []
  if (puedeCrearTickets(user?.Roles, user?.Access) && !baseMenu.some(m => m.Route === 'mantenimientoTickets')) {
    const grupo = baseMenu.find(m => m.Route === 'mantenimiento')
    if (!grupo) inject.push({ Id: -901, Name: 'Mantenimiento', Route: 'mantenimiento', Icon: 'SquareMenu', ParentMenu_Id: null, MenuOrder: 99 })
    inject.push({ Id: -902, Name: 'Tickets', Route: 'mantenimientoTickets', Icon: 'Wrench', ParentMenu_Id: grupo?.Id ?? -901, MenuOrder: 1 })
  }
  const MENU = buildMenuTree([...baseMenu, ...inject])
  const insets = useSafeAreaInsets()

  const logoutUser = async () => {
    await logout()
  }

  return (
    <View flex={1} backgroundColor="$background" marginBottom={Platform.OS === 'ios' ? insets.bottom : 0}  >
      <View
        marginBottom={2}
        borderRadius={14}
        padding={14}
        marginLeft={14}
        marginRight={14}
        marginTop={16 +  insets.top}
        backgroundColor="$backgroundElevated"
        {...shadows.sm}
      >
        {/* Botón refrescar */}
        <TouchableOpacity
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            zIndex: 1,
          }}
          onPress={async () => {
            if (!user?.Code) return

            try {
              setRefreshing(true)
              await refreshMenu(user.Code)
            } finally {
              setRefreshing(false)
            }
          }}
        >
          <LucideIcons.RotateCw size={16} color={theme.primary?.val}  />
        </TouchableOpacity>

        <View flexDirection="row" alignItems="center" gap={12}>
          <View
            width={50}
            height={50}
            borderRadius={25}
            borderWidth={2.5}
            borderColor="$primary"
            justifyContent="center"
            alignItems="center"
            padding={2}
          >
            <View
              width={42}
              height={42}
              borderRadius={21}
              backgroundColor="$text"
              justifyContent="center"
              alignItems="center"
            >
              <Text color="$background" fontSize={16} fontWeight="700">
                {initials}
              </Text>
            </View>
          </View>

          <View>
            <Text color="$text" fontSize={14} fontWeight="600">
              {user?.Name} {user?.LastName}
            </Text>

            <Text color="$textMuted" fontSize={12} marginTop={2}>
              {user?.Code}
            </Text>
          </View>
        </View>
      </View>

      <View flex={1}>
        {refreshing ? (
          <YStack padding={26} gap="$6" marginTop={20}>
            {Array.from({ length: 8 }).map((_, i) => (
              <XStack key={i} alignItems="center" gap="$3">
                <SkeletonBox width={25} height={25} radius={6} />
                <SkeletonBox width={190} height={25} />
              </XStack>
            ))}
          </YStack>
        ) : (
          <DrawerContentScrollView
            {...props}
            contentContainerStyle={{
              paddingTop: 12,
              paddingBottom: 20,
            }}
          >
            <View>
            {MENU.map((item, index) => (
              <TreeItem
                key={item.Id ?? index}
                item={item}
                navigation={props.navigation}
                currentRoute={currentRoute}
                openId={openId}
                setOpenId={setOpenId}
                setNavLoading={setNavLoading}
              />
            ))}
            </View>
          </DrawerContentScrollView>
        )}
      </View>

      <View paddingHorizontal={16} paddingTop={10} paddingBottom={6}>
        <Button
          backgroundColor="$primary"
          height={40}
          borderRadius="$3"
          flexDirection="row"
          alignItems="center"
          justifyContent="center"
          pressStyle={{ opacity: 0.8 }}
          onPress={async () => logoutUser()}
        >
          <LogOut size={18} color="white" />

          <Text
            color="white"
            fontWeight="700"
            fontSize={14}
            marginLeft="$2"
          >
            Cerrar Sesión
          </Text>
        </Button>
      </View>

      <View
        padding={10}
        paddingHorizontal={12}
        borderTopWidth={1}
        borderTopColor="$border"
        alignItems="center"
      >
        <View
          flexDirection="row"
          alignItems="center"
          justifyContent="space-between"
          width="100%"
        >
          <Text color="$textMuted" fontSize={11}>
            1.1.0
          </Text>

          <ThemeToggle/>
        </View>
      </View>
        {navLoading && (
          <RNView style={localStyles.overlay} pointerEvents="auto">
            <RNView style={localStyles.center}>
              <AnimatedDots color={theme.primary?.val ?? '#FF551A'} />
            </RNView>
          </RNView>
        )}
    </View>
  )
}

export function buildMenuTree(menu: MenuDTO[] = []) {
  const map = new Map<number, MenuDTO & { children: MenuDTO[] }>()

  const roots: (MenuDTO & { children: MenuDTO[] })[] = []

  for (const item of menu) {
    map.set(item.Id, { ...item, children: [] })
  }

  for (const item of menu) {
    const node = map.get(item.Id)
    if (!node) continue

    if (!item.ParentMenu_Id || item.ParentMenu_Id === 0) {
      roots.push(node)
    } else {
      const parent = map.get(item.ParentMenu_Id)
      if (parent) {
        parent.children.push(node)
      } else {
        roots.push(node)
      }
    }
  }

  return roots
}

const hasActiveDescendant = (item: any, currentRoute?: string): boolean => {
    if (!item.children?.length) return false
    return item.children.some((child: any) =>
        child.Route === currentRoute || hasActiveDescendant(child, currentRoute)
    )
}

function TreeItem({
  item,
  level = 0,
  navigation,
  currentRoute,
  openId,
  setOpenId,
  setNavLoading,
}: {
  item: any
  level?: number
  navigation: any
  currentRoute?: string
  openId: number | null
  setOpenId: (id: number | null) => void
  setNavLoading?: (route: string | null) => void
}) {
  const theme = useTheme()
  const IconComp = (LucideIcons[item.Icon as keyof typeof LucideIcons] as any)

  const hasChildren = item.children?.length > 0
  const isOpen = openId === item.Id

  const isActive = !hasChildren && item.Route === currentRoute

  const handlePress = () => {
    if (hasChildren) {
      setOpenId(isOpen ? null : item.Id) 
      return
    }

    const route = item.Route

    // show navigation loading overlay
    try {
      setNavLoading && setNavLoading(route)
    } catch (e) {}

    if (navigation.getState().routeNames.includes(route)) {
      navigation.navigate(route)
    } else {
      navigation.navigate('not_found', { name: route })
    }

    // close drawer and clear loading after short delay
    try {
      navigation.closeDrawer && navigation.closeDrawer()
    } catch (e) {}

    setTimeout(() => setNavLoading && setNavLoading(null), 500)
  }

  return (
    <>
      <TouchableOpacity activeOpacity={0.8} onPress={handlePress}>
        <View
          flexDirection="row"
          alignItems="center"
          justifyContent="space-between"
          paddingVertical={10}
          paddingLeft={12 + level * 18}
          paddingRight={12}
          marginHorizontal={8}
          marginVertical={1}
          borderRadius={10}
          backgroundColor={
            isActive
              ? 'rgba(255, 85, 26, 0.06)'
              : 'transparent'
          }
        >
          {isActive && (
            <View
              position="absolute"
              left={0}
              top={6}
              bottom={6}
              width={3}
              borderRadius={2}
              backgroundColor="$primary"
            />
          )}

          <View flexDirection="row" alignItems="center" gap={12}>
            {IconComp ? (
              <IconComp size={18} color={theme.primary?.val} />
            ) : (
              level > 0 && <FileText size={14} color={theme.primary?.val} />
            )}

            <Text
              color={isActive ? '$primary' : '$text'}
              fontSize={14}
              fontWeight={isActive ? '700' : '400'}
            >
              {item.Name}
            </Text>
          </View>

          {hasChildren &&
            (isOpen ? (
              <ChevronDown size={16} color={theme.primary?.val} />
            ) : (
              <ChevronRight size={16} color={theme.primary?.val} />
            ))}
        </View>
      </TouchableOpacity>

      {isOpen &&
        item.children?.map((child: any, index: number) => (
          <TreeItem
            key={`${child.Id}-${index}`}
            item={child}
            level={level + 1}
            navigation={navigation}
            currentRoute={currentRoute}
            openId={openId}
            setOpenId={setOpenId}
            setNavLoading={setNavLoading}
          />
        ))}
    </>
  )
}

function ThemeToggle() {
  const themeName = useThemeName()
  const isDark = themeName === 'dark'
  const { user } = useAuth()
  const { showToast } = useShowToast()

  const { setTheme } = useAuth()

  const changeTheme = async () => {
    setTheme(isDark ? 'light' : 'dark')
    let Data: UsersSettingsDTO = {
      Id: user?.Id ?? 0,
      Code: user?.Code ?? '',
      Theme: isDark ? 'light' : 'dark',
      Modified_By: user?.Code ?? '',
      Status_Id: 1,
      Options: 1,
    }

    const response = await securityService.saveUsersSettings([Data])
    if(response.Success){
      setTheme(isDark ? 'light' : 'dark')
    }else{
      showToast('error', 'Error', 'Error al guardar la configuración del tema de la aplicación', 5000, 'top')
    }
  }

  return (
    <TouchableOpacity
      onPress={changeTheme}
      activeOpacity={0.85}
    >
      <View
        width={56}
        height={30}
        borderRadius={999}
        padding={3}
        backgroundColor="$borderColor"
        justifyContent="center"
        alignItems={isDark ? 'flex-end' : 'flex-start'}
      >
        <View
          width={24}
          height={24}
          borderRadius={999}
          backgroundColor="$primary"
          alignItems="center"
          justifyContent="center"
        >
          {isDark ? (
            <Moon color="white" size={13} />
          ) : (
            <Sun color="white" size={13} />
          )}
        </View>
      </View>
    </TouchableOpacity>
  )
}

const localStyles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.18)',
    zIndex: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  center: {
    width: 120,
    height: 120,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 12,
    marginHorizontal: 6,
  },
})
