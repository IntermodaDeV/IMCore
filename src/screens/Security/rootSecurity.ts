import AccessScreen from "./Access/AccessScreen";
import MenuScreen from "./Menu/MenuScreen";
import RolesScreen from "./Roles/RolesScreen";
import UsersScreen from "./Users/UsersScreen";
import ProfileScreen from "./Users/ProfileScreen";
import MenuForm from "./Menu/MenuForm";
import UsersForm from "./Users/UsersForm";
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