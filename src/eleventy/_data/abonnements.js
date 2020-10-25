const fetch = require("node-fetch");
const tokenSite = process.env.TOKEN_SITE

async function fetchAbonnements() {
  const leFetch = await fetch("https://cms.labonnefabrique.fr/abonnements-machines", {
    method: "get",
    headers: {
      "Content-Type": "application/json"
    },
    cache: "no-store",
  });

  return leFetch.json();
}

module.exports = async function() {
  //let result = await fetchMachinesData();
  //console.log("retour",result)
  return fetchAbonnements();
};