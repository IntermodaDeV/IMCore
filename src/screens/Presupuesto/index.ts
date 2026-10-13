import { TScreens } from '../../navigation/screens.types'
import MisCentrosScreen from './MisCentrosScreen'
import CentroScreen from './CentroScreen'

// La key coincide con el Route del menú (presupuestoMisCentros, Platform Both). El padre 'presupuesto' solo agrupa;
// la administración (presupuestoAdministracion) es solo del web.
export const ScreensPresupuesto: TScreens = {
  presupuestoMisCentros: {
    Screen: MisCentrosScreen,
    Childs: {
      presupuestoCentro: CentroScreen,
    },
  },
}
