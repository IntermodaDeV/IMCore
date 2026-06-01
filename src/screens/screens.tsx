import UsersScreen from './Security/UsersScreen'
import HomeScreen from './AdmSys/HomeScreen'
import BillsScreen from './Gira/Bills/BillsScreen'
import NotFoundScreen from './AdmSys/NotFoundScreen'

export const SCREENS = {
  inicio: HomeScreen,
  usuarios: UsersScreen,

  gastos: BillsScreen,

  not_found: NotFoundScreen,
}
