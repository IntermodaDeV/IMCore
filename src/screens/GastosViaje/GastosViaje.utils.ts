
import {
  Utensils, Fuel, BedDouble, Receipt, Image as ImageIcon,
  Map, Car, Plane, ShoppingCart, Wrench, Banknote, Building2, Briefcase, Coffee, Package,
} from 'lucide-react-native'

export function getIconFromFa(faClass: string | null | undefined): React.ComponentType<any> {
  if (!faClass) return Receipt
  const key = faClass.split(' ').find(p =>
    p.startsWith('fa-') &&
    !['fa-solid', 'fa-regular', 'fa-brands', 'fa-light', 'fa-thin'].includes(p) &&
    !/^fa-\dx$/.test(p)
  ) ?? ''
  switch (key) {
    case 'fa-map':
    case 'fa-location-dot':
    case 'fa-route':              return Map
    case 'fa-gas-pump':           return Fuel
    case 'fa-utensils':
    case 'fa-fork-knife':
    case 'fa-hamburger':          return Utensils
    case 'fa-bed':
    case 'fa-hotel':              return BedDouble
    case 'fa-car':
    case 'fa-car-side':           return Car
    case 'fa-plane':
    case 'fa-plane-departure':    return Plane
    case 'fa-shopping-cart':
    case 'fa-cart-shopping':      return ShoppingCart
    case 'fa-tools':
    case 'fa-screwdriver-wrench': return Wrench
    case 'fa-money-bill':
    case 'fa-money-bill-wave':    return Banknote
    case 'fa-building':           return Building2
    case 'fa-briefcase':          return Briefcase
    case 'fa-coffee':             return Coffee
    case 'fa-box':
    case 'fa-box-open':           return Package
    default:                      return Receipt
  }
}


export  const formatCurrency = (amount: number) => {
  return `${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

