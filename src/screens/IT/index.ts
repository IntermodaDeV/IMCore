import { TScreens } from '../../navigation/screens.types'
import UsoClaudeScreen from './UsoClaudeScreen'

// La key tiene que coincidir con Security.Menu.Route ('itUsoClaude', Platform 'Both').
// Es LA MISMA ruta del web: una sola opción de menú, un solo permiso; el web muestra la
// herramienta completa (cuentas, importar CSV, conexión) y la app el resumen del mes.
export const ScreensIT: TScreens = {
  itUsoClaude: {
    Screen: UsoClaudeScreen,
  },
}
