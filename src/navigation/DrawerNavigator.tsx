import React, { useState } from 'react'
import { TouchableOpacity } from 'react-native'
import { Moon, Sun, LogOut, ChevronDown, ChevronRight, FileText } from 'lucide-react-native'
import * as LucideIcons from 'lucide-react-native'
import { createDrawerNavigator, DrawerContentScrollView, DrawerContentComponentProps } from '@react-navigation/drawer'
import { Button, Text, View, useTheme, useThemeName } from 'tamagui'
import { useNavigation } from '@react-navigation/native'
import { SCREENS } from '../screens/screens'
import { useMenu } from '../context/MenuContext'
import { MenuDTO } from '../api/modules/security/security.types'
import { useAuth } from '../context/AuthContext'

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

export default function DrawerNavigator({ setTheme }: any) {
  const theme = useTheme()
  const { menu, loading } = useMenu()
  if (loading) return null
  
  const screenTitles = Object.fromEntries((menu ?? []).map(item => [item.Route, item.Name]))

  return (
    <Drawer.Navigator
      drawerContent={createDrawerContent(setTheme, menu)}
      screenOptions={{
        headerShown: true,
        drawerType: 'slide',
        headerStyle: {
          backgroundColor: theme.background?.val,
          height: 50,
        },
        headerTintColor: theme.text?.val,
        drawerStyle: {
          backgroundColor: theme.background?.val,
          width: 290,
        },
        drawerActiveTintColor: theme.primary?.val,
        drawerInactiveTintColor: theme.textMuted?.val,
      }}
    >
      {Object.entries(SCREENS).map(([Name, component]) => (
        <Drawer.Screen
          key={Name}
          name={Name}
          component={component}
          options={{ title: Name === 'not_found' ? 'Página no encontrada' : screenTitles[Name] ?? Name }}
        />
      ))}
    </Drawer.Navigator>
  )
}

function CustomDrawerContent(props: DrawerContentComponentProps & { setTheme: any; menu: MenuDTO[] }) {
  const navigation = useNavigation()
  const { user, logout } = useAuth()
  const initials =`${user?.Name?.charAt(0) ?? ''}${user?.LastName?.charAt(0) ?? ''}`.toUpperCase()

  const MENU = buildMenuTree(props.menu ?? [])

  return (
    <View flex={1} backgroundColor="$background">

      <View
        marginBottom={2}
        borderRadius={14}
        padding={14}
        marginLeft={14}
        marginRight={14}
        marginTop={16}
        backgroundColor="$textUser"
        shadowColor="#000"
        shadowOpacity={0.06}
        shadowRadius={10}
      >
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
              backgroundColor="$gray"
              justifyContent="center"
              alignItems="center"
            >
              <Text color="white" fontSize={16} fontWeight="700">
                {initials}
              </Text>
            </View>
          </View>

          <View>
            <Text color="$text" fontSize={14} fontWeight="600">
              {user?.Name} {user?.LastName}
            </Text>

            <Text color="$textMuted" fontSize={12} marginTop={2}>
              Informática
            </Text>
          </View>
        </View>
      </View>

      <DrawerContentScrollView
        {...props}
        contentContainerStyle={{ paddingTop: 12 }}
      >

        <View>
          {MENU.map((item, index) => (
            <TreeItem
              key={item.Id ?? index}
              item={item}
              navigation={props.navigation}
            />
          ))}
        </View>
      </DrawerContentScrollView>

      <View paddingHorizontal={16} paddingTop={10} paddingBottom={6}>
        <Button
          backgroundColor="$primary"
          height={40}
          borderRadius="$3"
          flexDirection="row"
          alignItems="center"
          justifyContent="center"
          pressStyle={{ opacity: 0.8 }}
          onPress={async () => {
            navigation.reset({
              index: 0,
              routes: [{ name: 'Login' as never }],
            })
            await logout()
          }}
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
            IMCore v1.0
          </Text>

          <ThemeToggle/>
        </View>
      </View>
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

function TreeItem({
  item,
  level = 0,
  navigation,
}: {
  item: any
  level?: number
  navigation: any
}) {
  const [open, setOpen] = useState(false)
  const Icon = LucideIcons[item.Icon as keyof typeof LucideIcons]
  const hasChildren = item.children?.length > 0

  const theme = useTheme()

  const handlePress = () => {
    if (hasChildren) {
      setOpen(!open)
      return
    }
    const route = item.Route
    if (navigation.getState().routeNames.includes(route)) {
      navigation.navigate(route)
    } else {
      navigation.navigate('not_found', { name: route })
    }
  }


  return (
    <>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={handlePress}
      >
        <View
          flexDirection="row"
          alignItems="center"
          justifyContent="space-between"
          paddingVertical={10}
          paddingLeft={5 + level * 18}
          paddingRight={4}
        >
          <View flexDirection="row" alignItems="center" gap={12}>
            {Icon ? <Icon size={18} color={theme.primary?.val} /> : null}

            {!Icon && level > 0 && (
              <FileText size={14} color={theme.primary?.val} />
            )}

            <Text color="$text" fontSize={14}>
              {item.Name}
            </Text>
          </View>

          {hasChildren &&
            (open ? (
              <ChevronDown size={16} color={theme.primary?.val} />
            ) : (
              <ChevronRight size={16} color={theme.primary?.val} />
            ))}
        </View>
      </TouchableOpacity>

      {open &&
        item.children?.map((child: any, index: number) => (
          <TreeItem
            key={`${child.title}-${index}`}
            item={child}
            level={level + 1}
            navigation={navigation}
          />
        ))}
    </>
  )
}

function ThemeToggle() {
  const themeName = useThemeName()
  const isDark = themeName === 'dark'

  const { setTheme } = useAuth()

  return (
    <TouchableOpacity
      onPress={() => setTheme(isDark ? 'light' : 'dark')}
      activeOpacity={0.85}
    >
      <View
        width={56}
        height={30}
        borderRadius={999}
        padding={3}
        backgroundColor="$card"
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