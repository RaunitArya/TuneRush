export default {
  '*.{ts,tsx,js,mjs,cjs}': ['oxlint --fix', 'oxfmt'],
  '*.{json,md,yml,yaml,css,html}': ['oxfmt'],
};
