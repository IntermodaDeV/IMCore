import { TScreens } from '../../navigation/screens.types'
import CorridasListScreen from './CorridasListScreen'
import CorridaDetailScreen from './CorridaDetailScreen'
import SaludFinancieraScreen from './SaludFinancieraScreen'

// La key del nivel superior tiene que coincidir con el Route del ítem de menú en
// la BD (Security.Menu.Route = 'creditosAdministracionPaquetes', Platform 'Both').
// Es LA MISMA ruta que usa el web: una sola opción de menú, un solo permiso que
// administrar, y cada plataforma renderiza lo suyo — el web la herramienta
// completa, la app la consulta.
export const ScreensCreditos: TScreens = {
  creditosAdministracionPaquetes: {
    Screen: CorridasListScreen,
    Childs: {
      creditosCorridaDetalle: CorridaDetailScreen,
    },
  },
  creditosSaludFinanciera: {
    Screen: SaludFinancieraScreen,
  },
}
