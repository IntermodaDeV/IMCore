import { TScreens } from '../../navigation/screens.types'
import DiariosListScreen from './DiariosListScreen'
import NewDiarioScreen from './NewDiarioScreen'
import DiarioDetailScreen from './DiarioDetailScreen'
import RepuestosDashboardScreen from './RepuestosDashboardScreen'
import SuministrosScreen from './SuministrosScreen'

// La key del nivel superior debe coincidir con el `Route` del ítem de menú en la
// BD de seguridad. Las pantallas hijas (Childs) las aplana App.tsx como Stack.Screen.
export const ScreensRepuestos: TScreens = {
  repuestos: {
    Screen: DiariosListScreen,
    Childs: {
      repuestosNuevo: NewDiarioScreen,
      repuestosDetalle: DiarioDetailScreen,
      repuestosSuministros: SuministrosScreen,
    },
  },
  // Dashboard de consumo: va como nivel superior y NO como hija del despacho,
  // porque es otra tarea (analizar cuanto se consume) y otro permiso. Su clave
  // tiene que coincidir con el Route del menu en la BD.
  repuestosConsumo: {
    Screen: RepuestosDashboardScreen,
  },
}
