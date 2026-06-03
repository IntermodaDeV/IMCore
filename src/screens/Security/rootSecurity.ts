import AccessScreen from "./Access/AccessScreen";
import MenuScreen from "./Menu/MenuScreen";
import RolesScreen from "./Roles/RolesScreen";
import UsersScreen from "./Users/UsersScreen";

export const rootSecurity = {
    usuarios: UsersScreen,
    access: AccessScreen,
    menu: MenuScreen,
    roles: RolesScreen,
}