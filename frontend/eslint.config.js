import tsParser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * Deliberately narrow: this config enforces the React hook rules the codebase
 * previously referenced in `eslint-disable` comments without any config actually
 * running them. Style concerns are left to TypeScript and Prettier-style tooling.
 */
export default [
  {
    ignores: ["dist/**", "node_modules/**", "public/**", "coverage/**"],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
];
