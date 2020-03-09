const fetch = require("node-fetch");

const graphqlURL = process.env.HASURA_ENDPOINT;

const query = `
query lesAteliers {
  __typename
  ateliers(order_by: {dateDebut: asc}) {
    id
    titre
    dateFin
    dateDebut
    description
    espace
    nbParticipants
    surInscription
    tarifs
    urlImage
    inscrits
  }
}
`;

async function fetchData() {
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
  let result = await fetchData();
  //console.log("retour",result.errors[0].extensions)
  return result.data.ateliers;
};
