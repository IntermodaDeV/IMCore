import { TScreens } from '../../navigation/screens.types'
import SolicitudesHorasExtraScreen from './SolicitudesHorasExtraScreen'
import RevisionHorasExtraScreen from './RevisionHorasExtraScreen'
import HistorialHorasExtraScreen from './HistorialHorasExtraScreen'

export const ScreensOvertime: TScreens = {
  // Primer flujo: aprobar las horas que se solicitaron
  RequestHours: {
    Screen: SolicitudesHorasExtraScreen,
    Childs: {},
  },
  // Segundo flujo: autorizar la diferencia entre lo solicitado y el marcaje
  ReviewHours: {
    Screen: RevisionHorasExtraScreen,
    Childs: {},
  },
  // Bitácora local de IMCore con lo autorizado en los dos flujos
  HistoryHours: {
    Screen: HistorialHorasExtraScreen,
    Childs: {},
  },
}
