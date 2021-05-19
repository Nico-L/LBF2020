const fetch = require("node-fetch");
const tokenSite = process.env.TOKEN_SITE

const adresseFetch = "https://cms.labonnefabrique.fr/categories-tags?token=" + tokenSite

async function fetchCategoriesData() {
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
  /*let result = await fetchCategoriesData();
  console.log('fetchCategoriesData', result)*/
  return fetchCategoriesData();
};
