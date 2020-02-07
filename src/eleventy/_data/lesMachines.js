const fetch = require("node-fetch");

const graphqlURL = process.env.HASURA_ENDPOINT;

const query = `
query listeMachines {
  __typename
  machines {
    id
    titre
    description
    urlImage
    lesTarifs
    taille
    epaisseur
    tagMachine
    decoupe
    gravure
  }
}
`;

async function fetchMachinesData() {
  const leFetch = await fetch(graphqlURL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query })
  });

  return leFetch.json();
}

module.exports = async function() {
  let result = await fetchMachinesData();
  return result.data.machines;
};
