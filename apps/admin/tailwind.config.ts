import type { Config } from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';

/**
 * Tokens extraídos de design/TAV_design_system.html.
 * No se inventan colores ni medidas: todo sale del sistema de diseño.
 *  navy #0B1B33 · azul #1F6FEB · verde #4CAF50 · ámbar #D9A441 · rojo #E5484D
 *  fondo #F4F5F7 · superficie #FFFFFF · borde #E5E8EC · tinta #101828
 */
const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Capa semántica que mapea a los tokens del design system.
        // shadcn usa `border`, `background`, `foreground`, etc.; aquí se
        // vinculan a los tokens reales de TAV en vez de a la paleta neutral.
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Tokens crudos del design system, para usar directamente cuando
        // la capa semántica de shadcn no alcanza (sidebar navy, semáforo).
        tav: {
          navy: '#0B1B33',
          'navy-2': '#1B3557',
          blue: '#1F6FEB',
          'blue-600': '#1558C7',
          'blue-50': '#EAF2FE',
          green: '#4CAF50',
          'green-600': '#2E7D32',
          'green-50': '#EAF7EB',
          gold: '#D9A441',
          'gold-700': '#8A6010',
          'gold-50': '#FBF3E3',
          red: '#E5484D',
          'red-700': '#B42318',
          'red-50': '#FDECEC',
          bg: '#F4F5F7',
          surface: '#FFFFFF',
          line: '#E5E8EC',
          'line-2': '#EFF1F4',
          ink: '#101828',
          'ink-2': '#475467',
          'ink-3': '#667085',
          'ink-4': '#98A2B3',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: {
        // Radios del design system: chip 10, campo 12, tarjeta 14, hoja 20.
        lg: 'var(--radius)', // 14 — tarjeta
        md: '12px', // campo
        sm: '10px', // chip
        xl: '20px', // hoja
      },
      boxShadow: {
        tav: '0 1px 2px rgba(16,24,40,.05), 0 8px 24px rgba(16,24,40,.06)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
