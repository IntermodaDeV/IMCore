import { TScreens } from "../../navigation/screens.types";
import AprobacionSolicitudCompra from "./AprobacionSolicitudCompra";
import SolicitudesHistorico from "./SolicitudesHistorico";

export const ScreensCadenaSuministro: TScreens =   {
    aprobacionSC: {
        Screen: AprobacionSolicitudCompra,
        Childs: {},
    },
    historic: {
        Screen: SolicitudesHistorico,
        Childs: {},
    },
}