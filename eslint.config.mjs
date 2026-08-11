import { FlatCompat } from "@eslint/eslintrc";
import { globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals.js";
import nextTs from "eslint-config-next/typescript.js";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });
const config = [
  ...compat.extends(...nextVitals.extends, ...nextTs.extends),
  globalIgnores([".next/**", "node_modules/**", "storage/**", "coverage/**", ".build-shims/**", "next-env.d.ts"])
];
export default config;
