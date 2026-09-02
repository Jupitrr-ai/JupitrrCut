/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './features/**/*.{js,jsx,ts,tsx}',
    './shared/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Studio Pop tokens — see DESIGN.md (source of truth)
        primary: {
          DEFAULT: '#3C3FEF',
          pressed: '#3235D6',
          tint: '#EEF2FF',
        },
        // "Live" coral — ONLY for recording/live/celebration states (DESIGN.md rule)
        live: {
          DEFAULT: '#EE6061',
          deep: '#C94A4B',
          tint: '#FDEEEE',
        },
        ink: {
          DEFAULT: '#181A22',
          secondary: '#4E5265',
          tertiary: '#8A8FA3',
          disabled: '#98A2B3',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          subtle: '#F4F6FB',
          line: '#E6E9F4',
          disabled: '#EAECF0',
        },
        // Camera/record/review dark surfaces
        studio: {
          DEFAULT: '#0E0D0F',
          raised: '#1C1A1E',
        },
        danger: {
          DEFAULT: '#DC2626',
          tint: '#FEF2F2',
        },
        success: {
          DEFAULT: '#1E9E6A',
          tint: '#EAF8F2',
          line: '#B7E4D1',
        },
      },
      fontFamily: {
        sans: ['CircularStd-Book'],
        'sans-medium': ['CircularStd-Medium'],
        heading: ['CircularStd-Bold'],
        display: ['CircularStd-Black'],
        // Italic serif for emphasised words inside a headline (see landing hero).
        accent: ['LibreBaskerville_400Regular_Italic'],
        mono: ['JetBrainsMono_400Regular'],
        'mono-semibold': ['JetBrainsMono_600SemiBold'],
      },
      borderRadius: {
        card: '16px',
      },
    },
  },
  plugins: [],
};
