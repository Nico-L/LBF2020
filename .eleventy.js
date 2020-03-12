const { DateTime } = require("luxon");
//const util = require("util");
const slugify = require("slugify");
const moisShort = [
    "jan.",
    "fév.",
    "mars",
    "avr.",
    "mai",
    "juin",
    "juill.",
    "août",
    "sept.",
    "oct.",
    "nov.",
    "déc."
];

module.exports = function(eleventyConfig) {
  // Layout aliases for convenience
  //eleventyConfig.addLayoutAlias("default", "layouts/base.njk");
  //eleventyConfig.addLayoutAlias("conf", "layouts/conf.njk");
  eleventyConfig.addLayoutAlias("baseLBF", "layouts/baseLBF.njk");

  //new slug for apostrophe
  eleventyConfig.addFilter("slug", input => {
    const options = {
      replacement: "-",
      remove: /[&,+/()$~%.'":*?<>{}]/g,
      lower: true
    };
    return slugify(input, options);
  });

  //récupération de l'horaire dans la fiche de l'atelier
eleventyConfig.addFilter("getHoraire", function(value) {
    var d = DateTime.fromISO(value).setZone("Europe/Paris");
    var minute = d.minute == 0 ? '00': d.minute;
    return d.hour + "h" + minute;
});

  //récupération du jour dans la fiche de l'atelier
eleventyConfig.addFilter("getJour", function(value) {
    var d = DateTime.fromISO(value).setZone("Europe/Paris");
    return d.day;
});

  //récupération du mois (short) dans la fiche de l'atelier
eleventyConfig.addFilter("getMoisShort", function(value) {
    var d = (new Date(value)).getMonth();
    return moisShort[d];
});

// récupération nb de places restantes
eleventyConfig.addFilter("getPlacesRestantes", function(inscrits, nbPlaces) {
    var reste = inscrits ? nbPlaces - inscrits.length:nbPlaces;
    const retour = reste == 0 ? "Complet" : reste === 1 ? "Dernière place" : reste + " places restantes";
    return retour;
});

  // a debug utility
  eleventyConfig.addFilter("dump", obj => {
    return util.inspect(obj);
  });

  // Date helpers
  /*eleventyConfig.addFilter("readableDate", dateObj => {
    return DateTime.fromJSDate(dateObj, {
      zone: "utc"
    }).toFormat("LLLL d, y");
  });
  eleventyConfig.addFilter("htmlDate", dateObj => {
    return DateTime.fromJSDate(dateObj, {
      zone: "utc"
    }).toFormat("y-MM-dd");
  });
*/
  // Grab excerpts and sections from a file
  //eleventyConfig.addFilter("section", require("./src/utils/section.js"));

  // compress and combine js files
  eleventyConfig.addFilter("jsmin", require("./src/utils/minify-js.js"));

  // minify the html output when running in prod
  if (process.env.NODE_ENV == "production") {
    eleventyConfig.addTransform(
      "htmlmin",
      require("./src/utils/minify-html.js")
    );
  }

  // Static assets to pass through
  // eleventyConfig.addPassthroughCopy("./src/eleventy/fonts");
  eleventyConfig.addPassthroughCopy({
    "src/eleventy/images": "images"
  });
  eleventyConfig.addPassthroughCopy({
    "src/eleventy/css": "css"
  });
  eleventyConfig.addPassthroughCopy({
    "src/eleventy/_includes/js/*": "js"
  });

  return {
    dir: {
      input: "src/eleventy",
      includes: "_includes",
      output: "dist"
    },
    templateFormats: ["njk", "md"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk"
  };
};
