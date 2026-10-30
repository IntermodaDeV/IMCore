import { TScreens } from '../../navigation/screens.types'
import MonitorCargasScreen from './MonitorCargasScreen'
import UsoClaudeScreen from './UsoClaudeScreen'

// La key tiene que coincidir con Security.Menu.Route (Platform 'Both').
// Es LA MISMA ruta del web: una sola opción de menú, un solo permiso; el web muestra la
// herramienta completa y la app el resumen.
//  · itUsoClaude: el web tiene cuentas, importar CSV y conexión; la app, el resumen del mes.
//  · itMonitorCargas: el web ejecuta, reintenta y tiene corridas, gráficas y conexiones; la
//    app, el semáforo, las fuentes, las capas, las advertencias vigentes y los procesos.
export const ScreensIT: TScreens = {
  itUsoClaude: {
    Screen: UsoClaudeScreen,
  },
  itMonitorCargas: {
    Screen: MonitorCargasScreen,
  },
}
