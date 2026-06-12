import { createTamagui } from 'tamagui'
import { defaultConfig } from '@tamagui/config/v5'
import { animations } from './animations'

const BrandColors = {
  // =========================
  // BRAND
  // =========================
  primary: '#FF551A',
  primaryOpacity: 'rgba(255, 85, 26, 0.20)',

  // =========================
  // STATUS
  // =========================
  success: '#22C55E',
  successOpacity: 'rgba(34, 197, 94, 0.20)',

  warning: '#EAB308',
  warningOpacity: 'rgba(234, 179, 8, 0.20)',

  error: '#EF4444',
  errorOpacity: 'rgba(239, 68, 68, 0.20)',

  info: '#3B82F6',
  infoOpacity: 'rgba(59, 130, 246, 0.20)',
}

export const config = createTamagui({
  ...defaultConfig,

  animations,

  tokens: {
    ...defaultConfig.tokens,

    color: {
      white: '#FFFFFF',
      black: '#000000',

      ...BrandColors,
    },
  },

  themes: {
    light: {
      // =========================
      // SURFACES
      // =========================
      background: '#FFFFFF',
      backgroundPage: '#F8FAFC',
      backgroundSurface: '#F1F5F9',
      backgroundElevated: '#FFFFFF',

      // =========================
      // TEXT
      // =========================
      text: '#0F172A',
      textSecondary: '#475569',
      textMuted: '#94A3B8',
      textDisabled: '#CBD5E1',

      // =========================
      // BORDERS
      // =========================
      border: '#E2E8F0',
      borderColor: '#E2E8F0',

      // =========================
      // BRAND
      // =========================
      primary: '#FF551A',
      primaryOpacity: 'rgba(255, 85, 26, 0.20)',
      secondary: '#001F3F',

      // =========================
      // BUTTONS
      // =========================
      buttonPrimary: '#FF551A',
      buttonPrimaryText: '#FFFFFF',

      buttonSecondary: '#F1F5F9',
      buttonSecondaryText: '#0F172A',

      // =========================
      // STATUS
      // =========================
      success: '#22C55E',
      warning: '#EAB308',
      error: '#EF4444',
      info: '#3B82F6',

      // =========================
      // OVERLAYS
      // =========================
      backgroundLoader: 'rgba(0,0,0,0.35)',
    },

    dark: {
      // =========================
      // SURFACES
      // =========================
      background: '#061426',
      backgroundPage: '#0B1F38',
      backgroundSurface: '#163B63',
      backgroundElevated: '#20466E',

      // =========================
      // TEXT
      // =========================
      text: '#F8FAFC',
      textSecondary: '#CBD5E1',
      textMuted: '#94A3B8',
      textDisabled: '#64748B',

      // =========================
      // BORDERS
      // =========================
      border: '#2B537D',
      borderColor: '#2B537D',

      // =========================
      // BRAND
      // =========================
      primary: '#FF551A',
      primaryOpacity: 'rgba(255, 85, 26, 0.20)',
      secondary: '#7292B8',

      // =========================
      // BUTTONS
      // =========================
      buttonPrimary: '#FF551A',
      buttonPrimaryText: '#FFFFFF',

      buttonSecondary: '#163B63',
      buttonSecondaryText: '#F8FAFC',

      // =========================
      // STATUS
      // =========================
      success: '#22C55E',
      warning: '#EAB308',
      error: '#EF4444',
      info: '#3B82F6',

      // =========================
      // OVERLAYS
      // =========================
      backgroundLoader: 'rgba(255,255,255,0.08)',
    },
  },
})