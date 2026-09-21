export default [
  {
    ignores: [
      "node_modules/**",
      ".local-backup/**",
      "tests/legacy-regressions.test.cjs",
    ],
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module" },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-unreachable": "error",
      "no-constant-condition": "error",
      "no-duplicate-case": "error",
      "no-dupe-keys": "error",
      eqeqeq: "error",
      "no-eval": "error",
      "no-implied-eval": "error",
    },
  },
];
