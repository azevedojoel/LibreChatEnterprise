// Mock for @toon-format/toon (ESM-only) - used by Jest
module.exports = {
  encode: (value) =>
    typeof value === 'object' && value !== null
      ? JSON.stringify(value)
      : String(value),
};
