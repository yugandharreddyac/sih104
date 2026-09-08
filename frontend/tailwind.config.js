/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      colors: {
        // Enterprise Core Palette Tokens via CSS Variables
        background: 'var(--bg-main)',
        sidebar: 'var(--bg-sidebar)',
        surface: {
          DEFAULT: 'var(--bg-surface)',
          elevated: 'var(--bg-surface-elevated)',
          hover: 'var(--bg-surface-hover)',
        },
        border: {
          DEFAULT: 'var(--border-default)',
          hover: 'var(--border-hover)',
        },
        // Support both text-primaryText and text-text-primary
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
        },
        primaryText: 'var(--text-primary)',
        secondaryText: 'var(--text-secondary)',
        mutedText: 'var(--text-muted)',

        // Semantic Colors with opacity channel support
        primary: {
          DEFAULT: 'rgb(var(--color-primary) / <alpha-value>)',
          hover: 'rgb(var(--color-primary-hover) / <alpha-value>)',
          subtle: 'rgb(var(--color-primary) / 0.12)',
          50: '#eff6ff',
          500: 'rgb(var(--color-primary) / <alpha-value>)',
          600: 'rgb(var(--color-primary-hover) / <alpha-value>)',
          700: '#1d4ed8',
        },
        success: {
          DEFAULT: 'rgb(var(--color-success) / <alpha-value>)',
          hover: 'rgb(var(--color-success-hover) / <alpha-value>)',
          subtle: 'rgb(var(--color-success) / 0.12)',
        },
        warning: {
          DEFAULT: 'rgb(var(--color-warning) / <alpha-value>)',
          hover: 'rgb(var(--color-warning-hover) / <alpha-value>)',
          subtle: 'rgb(var(--color-warning) / 0.12)',
        },
        danger: {
          DEFAULT: 'rgb(var(--color-danger) / <alpha-value>)',
          hover: 'rgb(var(--color-danger-hover) / <alpha-value>)',
          subtle: 'rgb(var(--color-danger) / 0.12)',
        },
        info: {
          DEFAULT: 'rgb(var(--color-info) / <alpha-value>)',
          hover: 'rgb(var(--color-info-hover) / <alpha-value>)',
          subtle: 'rgb(var(--color-info) / 0.12)',
        },

        // Backward compatibility mappings
        card: 'var(--bg-surface)',
        'card-border': 'var(--border-default)',
        shield: {
          cyan: 'rgb(var(--color-info) / <alpha-value>)',
          emerald: 'rgb(var(--color-success) / <alpha-value>)',
          amber: 'rgb(var(--color-warning) / <alpha-value>)',
          rose: 'rgb(var(--color-danger) / <alpha-value>)',
          purple: '#7C6EE6',
        },
      },
      borderRadius: {
        none: '0px',
        sm: '4px',
        DEFAULT: '6px',
        md: '6px',
        lg: '8px',
        xl: '8px',
        '2xl': '8px',
        '3xl': '8px',
        full: '9999px',
      },
      boxShadow: {
        none: 'none',
        subtle: '0 1px 2px 0 rgba(0, 0, 0, 0.35)',
        card: '0 1px 3px 0 rgba(0, 0, 0, 0.4), 0 1px 2px -1px rgba(0, 0, 0, 0.4)',
        elevated: '0 4px 6px -1px rgba(0, 0, 0, 0.45), 0 2px 4px -2px rgba(0, 0, 0, 0.45)',
      },
      fontSize: {
        'page-title': ['1.375rem', { lineHeight: '1.75rem', fontWeight: '600' }], // 22px
        'section-title': ['1rem', { lineHeight: '1.375rem', fontWeight: '600' }], // 16px
        'body': ['0.875rem', { lineHeight: '1.25rem', fontWeight: '400' }], // 14px
        'secondary': ['0.8125rem', { lineHeight: '1.125rem', fontWeight: '400' }], // 13px
        'metadata': ['0.75rem', { lineHeight: '1rem', fontWeight: '500' }], // 12px
      },
    },
  },
  plugins: [],
};
