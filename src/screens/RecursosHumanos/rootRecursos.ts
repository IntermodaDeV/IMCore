import { TScreens } from "../../navigation/screens.types";
import PersonalScreen from "./Personal/PersonalScreen";

export const ScreensRecursosHumanos: TScreens = {
  personal: {
    Screen: PersonalScreen,
    Childs: {},
  },
};
