const fetch = require("node-fetch");
const tokenSite = process.env.TOKEN_SITE

const adresseFetch = "https://cms.labonnefabrique.fr/abonnements-machines?token=" + tokenSite

async function fetchAbonnements() {
  const leFetch = await fetch(adresseFetch, {
    method: "GET",
    headers: {
      "Content-Type": "application/json"
    },
    cache: "no-store",
  });

  return leFetch.json();
}

module.exports = async function() {
  return fetchAbonnements();
};