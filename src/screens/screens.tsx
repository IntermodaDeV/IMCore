
import HomeScreen from './AdmSys/HomeScreen'
import NotFoundScreen from './AdmSys/NotFoundScreen'
import { rootSecurity } from './Security/rootSecurity'
import ProfileScreen from './Security/Users/ProfileScreen'

export const SCREENS = {
  inicio: HomeScreen,
  Perfil: ProfileScreen,
  
  ...rootSecurity,

  not_found: NotFoundScreen,
}
