import UsersScreen from './Security/UsersScreen'
import HomeScreen from './AdmSys/HomeScreen'
import BillsScreen from './Gira/Bills/BillsScreen'
import NotFoundScreen from './AdmSys/NotFoundScreen'
import { ScreensCadenaSuministro } from './CadenaSuministro'

export const SCREENS = {
  inicio: HomeScreen,
  usuarios: UsersScreen,

  gastos: BillsScreen,

  ...ScreensCadenaSuministro,
  not_found: NotFoundScreen,
}
