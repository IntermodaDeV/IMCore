import { TScreens } from '../../navigation/screens.types'
import PaseCrearScreen from './PaseCrearScreen'
import MisPasesScreen from './MisPasesScreen'
import PaseAprobacionesScreen from './PaseAprobacionesScreen'
import PaseValidarScreen from './PaseValidarScreen'
import PaseCategoriasScreen from './PaseCategoriasScreen'
import PersonalScreen from './Personal/PersonalScreen'

export const ScreensRecursosHumanos: TScreens = {
  paseCrear: {
    Screen: PaseCrearScreen,
    Childs: {},
  },
  paseHistorial: {
    Screen: MisPasesScreen,
    Childs: {},
  },
  paseAprobaciones: {
    Screen: PaseAprobacionesScreen,
    Childs: {},
  },
  paseValidar: {
    Screen: PaseValidarScreen,
    Childs: {},
  },
  paseCategorias: {
    Screen: PaseCategoriasScreen,
    Childs: {},
  },
  personal: {
    Screen: PersonalScreen,
    Childs: {},
  },
}
