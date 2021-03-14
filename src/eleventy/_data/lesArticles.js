const fetch = require("node-fetch");
const maintenant = (new Date()).toISOString()
const tokenSite = process.env.TOKEN_SITE

const adresseFetch = "https://cms.labonnefabrique.fr/articles?_publicationState=preview&token=" + tokenSite

async function fetchArticlesData() {
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
  /*let result = await fetchArticlesData();
  console.log('fetchArticlesData', result)*/
  return fetchArticlesData();
};
