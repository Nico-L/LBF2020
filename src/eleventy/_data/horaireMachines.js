const fetch = require("node-fetch");
/*
const graphqlURL = process.env.HASURA_ENDPOINT;

const query = `
query listeMachinesAbonnements {
  machines(where: {lesTarifs: {_has_key: "horaire"}}) {
    id
    titre
    lesTarifs
  }
}
`;

async function fetchMachinesAbonnementsData() {
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
  let result = await fetchMachinesAbonnementsData();
  return result.data.machines;
};
*/