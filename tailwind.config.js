module.exports = {
  theme: {
    colors: {
      transparent: "transparent",

      black: "#000",
      white: "#fff",
      fondLBF: "#FCFCFC",
      orangeLBF: "#EE732E",
      bleuLBF: "#4bbcc4",
      vertLBF: "#93C021",
      rougeLBF: "#e02933",
      jauneLBF: "#FCC62D",
      lbforange: {
        50: "#fff4e3",
        100: "#ffe1b9",
        200: "#ffce8d",
        300: "#ffba62",
        400: "#ffab45",
        500: "#ff9e36",
        600: "#fc9234",
        700: "#f58331",
        800: "#EE732E",
        900: "#e25d2b"
      },

      lbfbleu: {
        50: "#e1f6f6",
        100: "#b4e7e9",
        200: "#87d8db",
        300: "#60c7ce",
        400: "#4BBCC4",
        500: "#42b1bc",
        600: "#3ea1aa",
        700: "#398c92",
        800: "#34787b",
        900: "#285554"
      },

      lbfvert: {
        50: "#f3f7e6",
        100: "#e0ecc0",
        200: "#cbdf98",
        300: "#b5d36d",
        400: "#a4c94a",
        500: "#93C021",
        600: "#6d9d0b",
        700: "#6d9d0b",
        800: "#588900",
        900: "#316800"
      },

      lbfrouge: {
        50: "#fce6e7",
        100: "#f7c0c4",
        200: "#f1979c",
        300: "#eb6d74",
        400: "#e74d57",
        500: "#e32e39",
        600: "#e02933",
        700: "#dc232c",
        800: "#d81d24",
        900: "#d01217"
      },

      lbfjaune: {
        50: "#fffee7",
        100: "#fefac4",
        200: "#fdf69d",
        300: "#fcf275",
        400: "#f9ed55",
        500: "#f6e833",
        600: "#fddd36",
        700: "#FCC62D",
        800: "#fbad24",
        900: "#f78413"
      },

      gray: {
        100: "#f7fafc",
        200: "#edf2f7",
        300: "#e2e8f0",
        400: "#cbd5e0",
        500: "#a0aec0",
        600: "#718096",
        700: "#4a5568",
        800: "#2d3748",
        900: "#1a202c"
      }
    },
    spacing: {
      px: "1px",
      "10px": "10px",
      "200px": "200px",
      "40px": "40px",
      "320px": "320px",
      "480px": "480px",
      "0": "0",
      "1": "0.25rem",
      "2": "0.5rem",
      "3": "0.75rem",
      "4": "1rem",
      "5": "1.25rem",
      "6": "1.5rem",
      "8": "2rem",
      "10": "2.5rem",
      "12": "3rem",
      "16": "4rem",
      "20": "5rem",
      "24": "6rem",
      "32": "8rem",
      "40": "10rem",
      "48": "12rem",
      "56": "14rem",
      "64": "16rem"
    },
    zIndex: {
      "0": 0,
      "10": 10,
      "20": 20,
      "30": 30,
      "40": 40,
      "50": 50,
      "25": 25,
      "75": 75,
      "100": 100,
      "997": 997,
      "998": 998,
      "999": 999,
      "10000": 10000,
      auto: "auto"
    },
    extend: {
      spacing: {
        "72": "18rem",
        "84": "21rem",
        "96": "24rem"
      }
    }
  },
  variants: {
    cursor: ["hover", "focus", "disabled"],
    backgroundColor: ["hover", "focus", "disabled"],
    display: ["responsive", "disabled"]
  },
  plugins: [require("@tailwindcss/custom-forms")]
};
