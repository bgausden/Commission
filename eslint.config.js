import globals from "globals";
import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import prettierPlugin from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier";

import {FlatCompat} from "@eslint/eslintrc";
import path from "path";
import {fileURLToPath} from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: tsPlugin.configs.recommended
});

const typeCompat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: tsPlugin.configs["recommended-requiring-type-checking"]
});

export default [
    ...compat.extends(),
    ...typeCompat.extends(),
    js.configs.recommended,

    {
        files: ["**/*.ts", "**/*.tsx"],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: "module",
            globals: {
                ...globals.node,
                Atomics: "readonly",
                SharedArrayBuffer: "readonly",
            },
            parser: tsParser,
        },
        plugins: {
            "@typescript-eslint": tsPlugin,
            prettier: prettierPlugin,
        },
        rules: {
            "prettier/prettier": [
                "error",
                {
                    "endOfLine": "auto"
                }
            ],
            "@typescript-eslint/no-unused-vars": ["error", {argsIgnorePattern: "^_"}],
            "@typescript-eslint/explicit-function-return-type": "off",
            "@typescript-eslint/no-explicit-any": "warn",
            "@typescript-eslint/no-var-requires": "off",
        },
    },
    prettierConfig,

];