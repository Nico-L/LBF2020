const fetch = require("node-fetch");
const axios = require("axios")

const graphqlURL = process.env.HASURA_ENDPOINT;

const query = `
query listeMachines {
  __typename
  machines {
    urlImage
    titre
    taille
    tagMachine
    tag
    lesTarifs
    id
    gravure
    epaisseur
    description
    decoupe
    couleur
  }
}
`;

async function fetchMachinesData() {
  const leFetch = await fetch(graphqlURL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    cache: "no-store",
    body: JSON.stringify({ query })
  });

  return leFetch.json();
}

module.exports = async function() {
  let result = await fetchMachinesData();
  //console.log("retour",result.errors[0].extensions)
  return result.data.machines;
};
