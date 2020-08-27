const fetch = require("node-fetch");

async function fetchMachinesData() {
  const leFetch = await fetch("https://cms.labonnefabrique.fr/machines", {
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
  return fetchMachinesData();
};
