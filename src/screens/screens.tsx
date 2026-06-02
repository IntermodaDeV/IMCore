import UsersScreen from './Security/UsersScreen'
import HomeScreen from './AdmSys/HomeScreen'
import NotFoundScreen from './AdmSys/NotFoundScreen'
import AccessScreen from './Security/AccessScreen'
import MenuScreen from './Security/MenuScreen'
import RolesScreen from './Security/RolesScreen'

export const SCREENS = {
  inicio: HomeScreen,
  usuarios: UsersScreen,
  access: AccessScreen,
  menu: MenuScreen,

  roles: RolesScreen,

  not_found: NotFoundScreen,
}
