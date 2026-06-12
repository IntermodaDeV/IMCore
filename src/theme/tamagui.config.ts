import { createTamagui } from 'tamagui'
import { defaultConfig } from '@tamagui/config/v5'
import { createAnimations } from '@tamagui/animations-react-native'

const animations = createAnimations({
  fast: {
    type: 'timing',
    duration: 150,
  },
  medium: {
    type: 'timing',
    duration: 250,
  },
  slow: {
    type: 'timing',
    duration: 400,
  },
})

const BrandColors = {
    //Agreagdos semanticos
    black: '#0F172A',  //1E293B

    backgroundElevated: '#FFFFFF',
    backgroundSurface: '#F1F5F9',
    backgroundHover: '#E2E8F0',
    backgroundPress: '#F8FAFC',


    foregroundBase: '#0F172A',
    foregroundSecondary: '#475569',
    foregroundMuted: '#94A3B8',

    success: '#22C55E',
    successOpacity: 'rgba(34, 197, 94, 0.2)',

    warning: '#EAB300',
    warningOpacity: 'rgba(234, 179, 0, 0.2)',

    error: '#EF4444',
    errorOpacity: 'rgba(239, 68, 68, 0.2)',
}

export const config = createTamagui({
  ...defaultConfig,

  animations,

  tokens: {
    ...defaultConfig.tokens,
    color: {
      white: '#ffffff',
      primary: '#FF551A',
      primaryOpacity: 'rgba(214, 106, 27, 0.2)',
      secondary: '#001F3F',
      secondary1: '#001F3F',
      gray: '#5F6368',
      gray2: '#b5b9bd',
      backgroundBase: '#F8FAFC',

      //Agreagdos semanticos
      ...BrandColors,
      gray2: '#dfe0e0',
      gray3: '#d5d7d9',
      red: '#f10000',
    },
  },

  themes: {
    light: {
      background: '#FFFFFF',
      backgroundHeader: '#FFFFFF',
      backgroundPage: '#F1F5F9',
      backgroundPage2: '#bcbcbc',
      card: '#e2dddd',
      card2: '#FFFFFF',
      textMuted: '#64748B',
      border: '#E2E8F0',
      primary: '#FF551A',
      primaryOpacity: 'rgba(214, 106, 27, 0.2)',
      button: '#000000',
      text: '#0F172A', 
      borderColor: '#0F172A',
      buttonPrimary: '#FF551A',
      buttonCancel: '#E2E8F0',
      buttonCancelText: '#0F172A', 
      textUser: '#e2dddd',

      
      
      colorGradient1:'#f5dad1',
      colorGradient2:'#c9def4',
      textWelcome:'#7a2b11',
      backgroundLoader: 'rgba(0,0,0,0.34)',

    },

    dark: {
      background: '#0B1220',
      backgroundHeader: '#000000',
      backgroundPage: '#070f18',
      card: '#111827',
      card2: '#1e3a5f',
      textMuted: '#94A3B8',
      border: '#1F2937',
      primary: '#FF551A',
      primaryOpacity: 'rgba(214, 106, 27, 0.2)',
      button: '#ffffff',
      text: '#FFFFFF', 
      borderColor: '#c9d8fa', 
      buttonPrimary: '#FF551A',
      buttonCancel: '#bcbcbc',
      buttonCancelText: '#FFFFFF',
      textUser: '#1e3a5f',
      colorGradient1:'#FF551A',
      colorGradient2:'#1561ad',
      textWelcome:'#f8a88e',
      backgroundLoader: 'rgba(255, 255, 255, 0.08)'

    },
  },
})