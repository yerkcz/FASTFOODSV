import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Artefactos de build. Estan en .gitignore, no son fuente del proyecto:
    // ESLint en flat config NO respeta .gitignore, asi que hay que listarlos.
    // (.vercel es un residuo local; el deploy es Netlify.)
    ".netlify/**",
    ".vercel/**",
  ]),
  {
    // scripts/*.js corre en Node como CommonJS: package.json no tiene
    // "type": "module", asi que require() es lo correcto y NO se puede
    // convertir a import (romperia el script).
    files: ["scripts/**/*.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]);

export default eslintConfig;
