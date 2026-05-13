import nextPlugin from "eslint-config-next";

export default [
  ...nextPlugin,
  {
    settings: {
      next: {
        rootDir: ["apps/web/"],
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
    },
  },
  {
    files: ["e2e/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
];
