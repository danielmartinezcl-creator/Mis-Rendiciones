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

    // ── Lo que .gitignore excluye, repetido acá ──────────────────────────────
    // eslint 9 con flat config NO lee .gitignore: `npm run lint` es `eslint` a
    // secas, así que sin esta lista lintea la basura local de cada máquina y el
    // resultado cambia según lo que uno tenga en disco.
    //
    // Medido el 2026-10-01: `npx eslint .` daba 82.317 problemas (4.712 errores),
    // y 2.347 de los archivos salían de .claude/worktrees/ — 1.336 de ellos del
    // .next/ ya compilado de cada worktree. El estado real del proyecto eran
    // 0 errores y 22 avisos: el ruido lo tapaba por completo.
    //
    // `.next/**` arriba solo cubre el de la raíz, no el de cada worktree; por eso
    // .claude/worktrees/ va entero. Se crean y se retiran todo el tiempo, así que
    // sin esta línea el problema vuelve con la próxima.
    ".claude/worktrees/**",
    "Mi rendición — Design System/**", // .tsx de referencia, ya excluidos en tsconfig
    "Manual de usuario*/**",           // página web guardada para revisar el manual
    "Rendiciones ejemplos/**",
    "docs/manual/**",
    "test-results/**",
    "playwright-report/**",
    "e2e/reporte/**",
    "coverage/**",
    ".vercel/**",
  ]),
]);

export default eslintConfig;
