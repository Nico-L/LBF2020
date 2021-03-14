const fetch = require("node-fetch");
const maintenant = (new Date()).toISOString()
const tokenSite = process.env.TOKEN_SITE

const adresseFetch = "https://cms.labonnefabrique.fr/ateliers?date_gte=" + maintenant + "&_sort=date:ASC&token=" + tokenSite

async function fetchAteliersData() {
  const leFetch = await fetch(adresseFetch, {
    method: "get",
    headers: {
      "Content-Type": "application/json"
    },
    cache: "no-store",
  });
  return leFetch.json();
}

module.exports = async function() {
  return fetchAteliersData();
};
