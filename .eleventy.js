const { DateTime } = require("luxon");
//const util = require("util");
const slugify = require("slugify");
const mois = [
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre"
];

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

const jours = [
    "dimanche",
    "lundi",
    "mardi",
    "mercredi",
    "jeudi",
    "vendredi",
    "samedi"
]

module.exports = function(eleventyConfig) {
  // Layout aliases for convenience
  //eleventyConfig.addLayoutAlias("default", "layouts/base.njk");
  //eleventyConfig.addLayoutAlias("conf", "layouts/conf.njk");
  eleventyConfig.addLayoutAlias("baseLBF", "layouts/baseLBF.njk");
  eleventyConfig.addLayoutAlias("indexLBF", "layouts/indexLBF.njk");
  eleventyConfig.addLayoutAlias("baseLBFResaMachines", "layouts/baseLBFResaMachines.njk");

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
eleventyConfig.addFilter("getHoraire_old", function(value) {
    var d = DateTime.fromISO(value).setZone("Europe/Paris");
    var minute = d.minute == 0 ? '00': d.minute;
    return d.hour + "h" + minute;
});

eleventyConfig.addFilter("getHoraire", function(value) {
    var d = value.split(':');
    return d[0] + "h" + d[1];
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

eleventyConfig.addFilter("dateInscription", function(debut, fin) {
    var leDebut = DateTime.fromISO(debut).setZone("Europe/Paris"); 
    var laFin = DateTime.fromISO(fin).setZone("Europe/Paris");
    var leJour = (new Date(debut)).getDate();
    var leJourSemaine = jours[(new Date(debut)).getDay()];
    var leMois = mois[(new Date(debut)).getMonth()]
    var minuteDebut = leDebut.minute == 0 ? '00': leDebut.minute;
    var minuteFin = laFin.minute == 0 ? '00': laFin.minute;
    return 'le ' + leJourSemaine + ' ' + leJour + ' ' + leMois + ' de ' + leDebut.hour + 'h' + minuteDebut + ' à ' + laFin.hour + 'h' + minuteFin;
});

// titre de la réservation, "de le" -> "du"
eleventyConfig.addFilter("titreReservation", function(machine) {
    let titre = "Réservation de " + machine
    return titre.replace("de le", "du")
})

  // a debug utility
  eleventyConfig.addFilter("dump", obj => {
    return util.inspect(obj);
  });

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
