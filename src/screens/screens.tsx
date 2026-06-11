
import HomeScreen from './AdmSys/HomeScreen'
import NotFoundScreen from './AdmSys/NotFoundScreen'
import { ScreensCadenaSuministro } from './CadenaSuministro'
import { rootSecurity } from './Security/rootSecurity'
import ProfileScreen from './Security/Users/ProfileScreen'

export const SCREENS = {
  inicio: HomeScreen,
  Perfil: ProfileScreen,
  
  ...rootSecurity,

  ...ScreensCadenaSuministro,
  not_found: NotFoundScreen,
}
