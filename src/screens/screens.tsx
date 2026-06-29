
import { TScreenEntry } from '../navigation/screens.types'
import HomeScreen from './AdmSys/HomeScreen'
import NotFoundScreen from './AdmSys/NotFoundScreen'
import { ScreensCadenaSuministro } from './CadenaSuministro'
import { ScreensMantenimiento } from './Mantenimiento'
import { ScreensVisitas } from './Visitas'
import { ScreensRecursosHumanos } from './RecursosHumanos'
import { rootSecurity } from './Security/rootSecurity'
import ProfileScreen from './Security/Users/ProfileScreen'
import { ScreensGastosViaje } from './GastosViaje'
import { ScreensRecursosHumanos } from './RecursosHumanos/rootRecursos'

export const SCREENS: Record<string, TScreenEntry> = {
  inicio: HomeScreen,
  Perfil: ProfileScreen,

  ...rootSecurity,
  ...ScreensCadenaSuministro,
  ...ScreensMantenimiento,
  ...ScreensGastosViaje,
  ...ScreensVisitas,
  ...ScreensRecursosHumanos,

  not_found: NotFoundScreen,
};