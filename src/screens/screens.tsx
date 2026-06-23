
import { TScreenEntry } from '../navigation/screens.types'
import HomeScreen from './AdmSys/HomeScreen'
import NotFoundScreen from './AdmSys/NotFoundScreen'
import { ScreensCadenaSuministro } from './CadenaSuministro'
import { ScreensMantenimiento } from './Mantenimiento'
import { rootSecurity } from './Security/rootSecurity'
import ProfileScreen from './Security/Users/ProfileScreen'
import { ScreensGastosViaje } from './GastosViaje'



export const SCREENS: Record<string, TScreenEntry> = {
  inicio: HomeScreen,
  Perfil: ProfileScreen,

  ...rootSecurity,
  ...ScreensCadenaSuministro,
  ...ScreensMantenimiento,
  ...ScreensGastosViaje,

  not_found: NotFoundScreen,
};