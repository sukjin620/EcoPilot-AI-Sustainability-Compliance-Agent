/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#16a34a', // Eco green
        secondary: '#3b82f6', // ESG blue
        accent: '#8b5cf6', // Purple for highlights
        muted: '#f3f4f6', // Light gray backgrounds
        danger: '#dc2626', // Red for violations
        warning: '#facc15', // Yellow for alerts
        success: '#10b981', // Green for compliance
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
      },
      boxShadow: {
        card: '0 4px 12px rgba(0, 0, 0, 0.05)',
        hover: '0 6px 16px rgba(0, 0, 0, 0.08)',
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.25rem',
      },
      spacing: {
        'card': '1.5rem',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
    require('@tailwindcss/aspect-ratio'),
  ],
}
