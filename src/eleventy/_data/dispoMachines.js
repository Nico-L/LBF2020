const fetch = require("node-fetch");

const graphqlURL = process.env.HASURA_ENDPOINT;

const query = `
query listeHorairesMachine {
  horairesReservationMachines {
    id
    horaires
  }
}
`;

async function getGraphQLQuery() {
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
  let result = await getGraphQLQuery();
  return result.data.horairesReservationMachines[0].horaires.creneaux;
};
