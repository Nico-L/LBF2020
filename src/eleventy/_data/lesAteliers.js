const fetch = require("node-fetch");
const maintenant = (new Date()).toISOString()

adresseFetch = "https://cms.labonnefabrique.fr/ateliers?date_gte=" + maintenant + "_sort=date:ASC"

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
  let result = await fetchAteliersData();
  return result;
};
