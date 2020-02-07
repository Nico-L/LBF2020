<script>
  const fetch = require("node-fetch");

  const graphqlURL = "https://graphql.labonnefabrique.fr/v1/graphql";

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

  const lesMachines = fetch(graphqlURL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query })
  });
</script>

{#await lesMachines}
  Loading...
{:then result}
  {result}
{:catch error}
  Error: {error}
{/await}