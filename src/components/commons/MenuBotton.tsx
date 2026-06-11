import { Menu } from 'lucide-react-native'
import { TouchableOpacity } from 'react-native'
import { DrawerActions, useNavigation } from '@react-navigation/native'

export  function MenuButton() {
  const navigation = useNavigation()

  return (
    <TouchableOpacity
      onPress={() =>
        navigation.dispatch(DrawerActions.openDrawer())
      }
    >
      <Menu size={24} />
    </TouchableOpacity>
  )
}