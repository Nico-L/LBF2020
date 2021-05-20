const { DateTime } = require("luxon");
const fetch = require("node-fetch");
const Image = require("@11ty/eleventy-img");
const fetchFavicon = require('fetch-favicon').fetchFavicon
const syntaxHighlight = require("@11ty/eleventy-plugin-syntaxhighlight");

const util = require("util");
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

const tokenSite = process.env.TOKEN_SITE

const cacheOptions = {
      duration: "12w",
      directory: ".cacheImg",
      removeUrlQueryParams: true,
}

async function recupFavicon(url) {
    const icon = await fetchFavicon(url)
    return icon;
}

async function imageBackground(src, largeur, hauteur, classes="", type) {
  let taille = type == "mobile" ? 3*largeur : largeur
  const srcComplete = "https://cms.labonnefabrique.fr"+src
  let imageData = await Image(srcComplete, {
      widths: [taille],
      formats: ['jpeg'],
      outputDir: "./dist/images/img/",
      urlPath: "/images/img/",
      cacheOptions: cacheOptions
      
  });
  let dataImg = imageData.jpeg[imageData.jpeg.length - 1];
  classes = classes == "" ? "" : "class=" + classes
  retour = `
  <div 
      ${classes}
      style="
          height: ${hauteur}px;
          width: ${largeur}px;
          background-image: url(${dataImg.url});
          background-size: cover;
          background-repeat: no-repeat;
      ">
  </div>
  `

  return retour;
}

async function urlFullImage(src) {  
  const srcComplete = "https://cms.labonnefabrique.fr"+src   
  let imageData = await Image(srcComplete, {
    widths: [null],
    formats: ['jpeg'],
    outputDir: "./dist/images/img/",
    urlPath: "/images/img/",
    cacheOptions: cacheOptions
  });

let dataImg = imageData.jpeg[imageData.jpeg.length - 1];
return dataImg.url;
}

async function imageGalerie(src, alt, sizes, classe, w = "", h) {
  var widthsTemp = []
  if (w) {
    widthsTemp = [w]
  } else {
    widthsTemp = [320, 720, 1024]
  }
  const srcComplete = "https://cms.labonnefabrique.fr"+src   
    let metadata = await Image(srcComplete, {
        widths: widthsTemp,
        formats: ["webp", "jpeg"],
        outputDir: "./dist/images/img/",
        urlPath: "/images/img/",
        cacheOptions: cacheOptions
    });

    let imageAttributes = {
        alt,
        sizes,
        loading: "lazy",
        decoding: "async",
        class: classe
    };

  // You bet we throw an error on missing alt in `imageAttributes` (alt="" works okay)
    return Image.generateHTML(metadata, imageAttributes);
}

module.exports = function(eleventyConfig) {
    //plugin
    eleventyConfig.addPlugin(syntaxHighlight, {lineSeparator: "\n",});
    //getFavicon 
    eleventyConfig.addNunjucksAsyncShortcode("recupFavicon", recupFavicon)
    // gestion images
    eleventyConfig.addNunjucksAsyncShortcode("imageBackground", imageBackground)
    eleventyConfig.addNunjucksAsyncShortcode("imageGalerie", imageGalerie);
    eleventyConfig.addNunjucksAsyncShortcode("urlFullImage", urlFullImage);

  // Layout aliases for convenience
  eleventyConfig.addLayoutAlias("baseLBF", "layouts/baseLBF.njk");
  eleventyConfig.addLayoutAlias("auth", "layouts/auth.njk");
  eleventyConfig.addLayoutAlias("indexLBF", "layouts/indexLBF.njk");
  eleventyConfig.addLayoutAlias("galerieLBF", "layouts/galerieLBF.njk");
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

eleventyConfig.addFilter("dateJourMoisHeure", function(value) {
    const laDate = new Date(value)
    const leJour = laDate.getDate();
    const leMois = mois[laDate.getMonth()]
    const lesMinutes = laDate.getMinutes() == 0 ? '00': laDate.getMinutes();
    return 'le ' + leJour + ' ' + leMois + ' à ' + laDate.getHours() + ' h ' + lesMinutes
})

eleventyConfig.addFilter("shortDate", function(value) {
    const laDate = new Date(value)
    const leJour = laDate.getDate();
    const annee = laDate.getFullYear();
    const leMois = laDate.getMonth() + 1
    //const lesMinutes = laDate.getMinutes() == 0 ? '00': laDate.getMinutes();
    return leJour + '/' + leMois + '/' + annee
})

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

  eleventyConfig.addNunjucksAsyncFilter("imgProxy", function(url, options, callback) {
    const variables = {
        url: url,
        ...options
    }
    const urlQuery = "https://cms.labonnefabrique.fr/imgproxy?token=" + tokenSite
    const entetes = {"content-type": "application/json"}
    var options = { 
        method: 'POST',
        headers: entetes,
        mode: 'cors',
        cache: 'default',
        body: JSON.stringify(variables)
    }
    fetch(urlQuery, options)
        .then((leJSON)=> {return leJSON.json()})
        .then((retour)=> {callback(null, retour.imgProxyUrl); })
  })

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
