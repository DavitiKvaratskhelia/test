const c = (name) => `rgb(var(--${name}) / <alpha-value>)`;
module.exports = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        app: c("app"), surface: c("surface"), surface2: c("surface2"), line: c("line"), ink: c("ink"), muted: c("muted"),
        brand: { DEFAULT: c("brand"), hover: c("brand-hover"), text: c("brand-text"), light: c("brand-light") },
        // Dark brand colour (replaces black). PLACEHOLDER navy until the real SOLO Bank colour is confirmed:
        // change --solo / --solo-hover in app/globals.css and everything using it follows.
        chart: c("chart"),
        solo: { DEFAULT: c("solo"), hover: c("solo-hover") },
      },
      borderColor: { DEFAULT: c("line") },
      divideColor: { DEFAULT: c("line") },
    },
  },
};
