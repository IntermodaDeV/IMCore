import AccessScreen from "./Access/AccessScreen";
import MenuScreen from "./Menu/MenuScreen";
import RolesScreen from "./Roles/RolesScreen";
import UsersScreen from "./Users/UsersScreen";
import ProfileScreen from "./Users/ProfileScreen";
import MenuForm from "./Menu/MenuForm";
import UsersForm from "./Users/UsersForm,";
import AccessForm from "./Access/AccessForm";
import RolesForm from "./Roles/RolesForm";

export const rootSecurity = {
    usuarios: UsersScreen,
    usuario_form: UsersForm,
    access: AccessScreen,
    access_form: AccessForm,
    menu: MenuScreen,
    menu_form: MenuForm,
    roles: RolesScreen,
    roles_form: RolesForm,
    perfil: ProfileScreen,
}