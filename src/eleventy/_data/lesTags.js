const fetch = require("node-fetch");
const tokenSite = process.env.TOKEN_SITE

const adresseFetch = "https://cms.labonnefabrique.fr/tags-articles?token=" + tokenSite

async function fetchGaleriesData() {
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
  /*let result = await fetchGaleriesData();
  console.log('fetchGaleriesData', result)*/
  return fetchGaleriesData();
};
