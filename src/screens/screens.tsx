
import HomeScreen from './AdmSys/HomeScreen'
import NotFoundScreen from './AdmSys/NotFoundScreen'
import AccessScreen from './Security/Access/AccessScreen'
import MenuScreen from './Security/Menu/MenuScreen'
import RolesScreen from './Security/Roles/RolesScreen'
import UsersScreen from './Security/Users/UsersScreen'

export const SCREENS = {
  inicio: HomeScreen,
  usuarios: UsersScreen,
  access: AccessScreen,
  menu: MenuScreen,

  roles: RolesScreen,

  not_found: NotFoundScreen,
}
