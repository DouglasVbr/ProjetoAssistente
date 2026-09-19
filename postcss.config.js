export default {
  plugins: {
    // Tailwind v4 moved its PostCSS integration to a separate package —
    // using `tailwindcss` directly here throws at build/dev time:
    // "It looks like you're trying to use `tailwindcss` directly as a
    // PostCSS plugin. The PostCSS plugin has moved to a separate package."
    '@tailwindcss/postcss': {},
    autoprefixer: {},
  },
}