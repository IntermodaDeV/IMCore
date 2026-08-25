import AccessScreen from "./Access/AccessScreen";
import MenuScreen from "./Menu/MenuScreen";
import RolesScreen from "./Roles/RolesScreen";
import UsersScreen from "./Users/UsersScreen";
import ProfileScreen from "./Users/ProfileScreen";
import MenuForm from "./Menu/MenuForm";
import UsersForm from "./Users/UsersForm";
import UsuarioCooperativaForm from "./Users/UsuarioCooperativaForm";
import AccessForm from "./Access/AccessForm";
import RolesForm from "./Roles/RolesForm";
import ConfiguracionesGlobalesScreen from "./Configuraciones/ConfiguracionesGlobalesScreen";
import RequestUserScreen from "./RequestUser/RequestUserScreen";
import { TScreens } from "../../navigation/screens.types";

export const rootSecurity: TScreens = {
  usuarios: {
    Screen: UsersScreen,
    Childs: {
      usuario_form: UsersForm,
      // Alta de usuarios de cooperativa desde un empleado de planilla. Va como
      // hija y no como menu propio: se llega por el boton del listado, y asi
      // "atras" regresa ahi sin necesidad de una fila en Security.Menu.
      usuario_coop_form: UsuarioCooperativaForm,
    },
  },

  access: {
    Screen: AccessScreen,
    Childs: {
      access_form: AccessForm,
    },
  },

  menu: {
    Screen: MenuScreen,
    Childs: {
      menu_form: MenuForm,
    },
  },

  roles: {
    Screen: RolesScreen,
    Childs: {
      roles_form: RolesForm,
    },
  },

  perfil: {
    Screen: ProfileScreen,
    Childs: {},
  },

  configuracionesGlobales: {
    Screen: ConfiguracionesGlobalesScreen,
    Childs: {},
  },

  Request: {
    Screen: RequestUserScreen,
    Childs: {},
  },
};