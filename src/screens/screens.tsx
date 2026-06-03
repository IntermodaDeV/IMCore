
import HomeScreen from './AdmSys/HomeScreen'
import NotFoundScreen from './AdmSys/NotFoundScreen'
import { rootSecurity } from './Security/rootSecurity'

export const SCREENS = {
  inicio: HomeScreen,
  
  ...rootSecurity,

  not_found: NotFoundScreen,
}
