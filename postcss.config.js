const purgecss = require("@fullhuman/postcss-purgecss")({
  // Specify the paths to all of the template files in your project
    content: ["./src/eleventy/**/*.njk","./src/svelte/**/*.svelte"],
    css: ["./src/eleventy/**/*.css", "./src/svelte/**/*.css"],
// Include any special characters you're using in this regular expression
  defaultExtractor: content => content.match(/[\w-/:]+(?<!:)/g) || []
});

/*module.exports = {
  plugins: [
    require('postcss-import'),
    require('tailwindcss'),
    require('autoprefixer'),
    //spurgecss,
    require("cssnano"),
    ...(process.env.NODE_ENV === "production"
      ? [require("cssnano")]
      : [])
  ]
}; */

module.exports = {
  plugins: [
    require("postcss-import"),
    require("tailwindcss"),
    require("autoprefixer"),
    //purgecss,
    //require("cssnano")
  ]
};