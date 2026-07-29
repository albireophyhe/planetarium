import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      ".build",
      "apps/web/.wrangler",
      "apps/web/coverage",
      "apps/web/dist",
      "node_modules"
    ]
  },
  {
    files: ["script/**/*.mjs"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2024,
      globals: globals.node
    }
  }
];
