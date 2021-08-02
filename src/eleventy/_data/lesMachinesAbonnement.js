const fetch = require("node-fetch");
const tokenSite = process.env.TOKEN_SITE

const adresseFetch = "https://cms.labonnefabrique.fr/machines?surAbonnement=true&token="+tokenSite

async function fetchMachinesData() {
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
  return fetchMachinesData();
};
