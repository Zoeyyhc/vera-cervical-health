import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: "#f7f4ed",
        charcoal: "#1c1c1c",
        "off-white": "#fcfbf8",
        "muted-gray": "#5f5f5d",
        border: "#eceae4",
      },
      backgroundColor: {
        DEFAULT: "#f7f4ed",
      },
      fontFamily: {
        sans: ["var(--font-camera)", "ui-sans-serif", "system-ui"],
      },
      fontWeight: {
        // Override to ensure 700 is never reachable via Tailwind utilities
        thin: "100",
        extralight: "200",
        light: "300",
        normal: "400",
        medium: "500",
        semibold: "600",
        // bold intentionally omitted — max weight is 600
      },
      borderRadius: {
        micro: "4px",
        standard: "6px",
        comfortable: "8px",
        card: "12px",
        container: "16px",
        pill: "9999px",
      },
      spacing: {
        "10": "10px",
        "12": "12px",
        "24": "24px",
        "32": "32px",
        "40": "40px",
        "56": "56px",
        "80": "80px",
        "96": "96px",
        "128": "128px",
        "176": "176px",
        "192": "192px",
        "208": "208px",
      },
    },
  },
  plugins: [],
};

export default config;
