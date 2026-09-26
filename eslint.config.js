// Lint config: typescript-eslint's strictest type-aware presets over all TypeScript.
// Pre-overhaul files are ignored rather than fixed, because the rewrite deletes them.
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "node_modules/",
      "dist/",
      ".cache/",
      "test-results/",
      "playwright-report/",
      // Pre-overhaul front-end assets, kept only until the rewrite replaces them.
      "assets/",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.ts"],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // Numbers in template literals are common and safe here.
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    },
  },
  {
    files: ["**/*.js"],
    languageOptions: { globals: { ...globals.node } },
  },
);
