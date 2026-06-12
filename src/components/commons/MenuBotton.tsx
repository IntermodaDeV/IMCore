import { Menu } from 'lucide-react-native'
import { TouchableOpacity } from 'react-native'
import { DrawerActions, useNavigation } from '@react-navigation/native'
import { styled } from 'tamagui'
export  function MenuButton() {
  const navigation = useNavigation()
  const MenuStyled = styled(Menu, { color: '$text' });
  return (
    <TouchableOpacity
      onPress={() =>
        navigation.dispatch(DrawerActions.openDrawer())
      }
    >
      <MenuStyled size={24} />
    </TouchableOpacity>
  )
}