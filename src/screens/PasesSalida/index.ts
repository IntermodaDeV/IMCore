import { TScreens } from '../../navigation/screens.types'
import TiposSalidaScreen from './Catalogos/TiposSalidaScreen'
import MaterialesScreen from './Catalogos/MaterialesScreen'
import ConfiguracionScreen from './Configuracion/ConfiguracionScreen'
import GrupoDetalleScreen from './Configuracion/GrupoDetalleScreen'
import SolicitantesScreen from './Configuracion/SolicitantesScreen'
import MisPasesScreen from './Pases/MisPasesScreen'
import TodosLosPasesScreen from './Pases/TodosLosPasesScreen'
import PaseDetalleScreen from './Pases/PaseDetalleScreen'
import PaseCrearScreen from './Pases/PaseCrearScreen'
import AprobacionesScreen from './Aprobaciones/AprobacionesScreen'
import ControlSalidaScreen from './Seguridad/ControlSalidaScreen'
import VerificarSalidaScreen from './Seguridad/VerificarSalidaScreen'
import SalidaManualScreen from './Seguridad/SalidaManualScreen'
import EscanearPaseScreen from './Seguridad/EscanearPaseScreen'

// La key debe coincidir con el `Route` del item de menú en la BD de seguridad
// (ver Persistance/Scripts/PasesSalida_02_Menu.sql y _08_MenuConfiguracion.sql).
export const ScreensPasesSalida: TScreens = {
  // Catálogos (gateados por permiso de menú).
  pasesSalidaTipos: { Screen: TiposSalidaScreen, Childs: {} },
  pasesSalidaMateriales: { Screen: MaterialesScreen, Childs: {} },

  pasesSalidaConfiguracion: {
    Screen: ConfiguracionScreen,
    Childs: {
      // Pantalla interna: se navega desde la lista de grupos.
      pasesSalidaGrupoDetalle: GrupoDetalleScreen,
    },
  },

  // Alcance del solicitante: qué materiales puede pedir cada usuario.
  pasesSalidaSolicitantes: { Screen: SolicitantesScreen, Childs: {} },

  pasesSalidaMisPases: {
    Screen: MisPasesScreen,
    Childs: {
      // Pantallas internas: se navegan desde la lista.
      pasesSalidaPaseDetalle: PaseDetalleScreen,
      pasesSalidaPaseCrear: PaseCrearScreen,
      /* El mismo escáner del portón, con otro destino. Va acá y no como opción
         de menú porque el que recibe es el solicitante, y su área es Mis pases:
         el menú de escanear está gateado por el permiso de seguridad. */
      pasesSalidaEscanearRecibir: EscanearPaseScreen,
    },
  },

  /* Consulta de los pases de todos, por rango de fechas. Solo informativa: el
     detalle al que navega ya está registrado como hijo de Mis pases, y las
     rutas hijas son globales (App.tsx aplana los Childs de todos los módulos),
     así que no hace falta volver a declararlo acá. */
  pasesSalidaTodos: { Screen: TodosLosPasesScreen, Childs: {} },

  // Bandeja de firmas: los pases que esperan una de mis firmas.
  pasesSalidaAprobaciones: { Screen: AprobacionesScreen, Childs: {} },

  // Portería: lo que está autorizado a salir en una fecha.
  pasesSalidaControlSalida: {
    Screen: ControlSalidaScreen,
    Childs: {
      // Pantallas internas: a la de verificación se llega escaneando el QR o
      // desde la búsqueda manual; a la manual solo con el acceso PSSalidaManual.
      pasesSalidaVerificarSalida: VerificarSalidaScreen,
      pasesSalidaSalidaManual: SalidaManualScreen,
    },
  },

  /* Atajo de portería: entra y la cámara ya está abierta. Va como opción de
     menú propia y no como hija de Control de salida porque su razón de ser es
     justamente evitar ese rodeo. Después de leer el QR navega a la MISMA
     pantalla de verificación. */
  pasesSalidaEscanear: { Screen: EscanearPaseScreen, Childs: {} },
}
