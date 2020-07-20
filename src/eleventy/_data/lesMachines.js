const fetch = require("node-fetch");

/* const graphqlURL = process.env.HASURA_ENDPOINT;

const query = `
query listeMachines {
  __typename
  machines {
    urlImage
    titre
    tagMachine
    tag
    lesTarifs
    id
    gravure
    longueur
    largeur
    hauteur
    description
    decoupe
    couleur
  }
}
`;
*/
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
  let result = await fetchMachinesData();
  //console.log("retour",result)
  return result;
};
