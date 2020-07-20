export async function requeteGraphQL(query, variables) {
    var retourResultat;
    var body = {query: query}
    if (variables!== undefined) {
        body.variables = variables
    }
    const entetes = {'Content-Type': 'application/json'}
    var options = {
        method: "POST",
        headers: entetes,
        cache: "no-cache",
        body: JSON.stringify(body)
    }
    return fetch("https://graphql.labonnefabrique.fr/apollo", options)
        .then((retourFetch)=>{
            return retourFetch.json()
        })
        .then((retourJSON)=>{
            console.log('retourJSON', retourJSON)
            return retourJSON.data
        }).catch((error)=>{console.log('erreur', error)})
    }