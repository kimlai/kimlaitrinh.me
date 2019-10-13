const purgecss = require("@fullhuman/postcss-purgecss")({
  content: ["./**/*.html"],
  defaultExtractor: content => content.match(/[\w-/:]+(?<!:)/g) || []
});
const cssnano = require("cssnano")({ preset: "default" });

module.exports = {
  plugins: [
    require("tailwindcss"),
    require("autoprefixer"),
    ...(process.env.NODE_ENV === "production" ? [purgecss] : []),
    ...(process.env.NODE_ENV === "production" ? [cssnano] : [])
  ]
};
