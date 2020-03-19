export async function getInscrits(email, idAtelier) {
    const lesInscrits = await fetch("https://graphql.labonnefabrique.fr/v1/graphql", {
        method: "POST",
        cache: "no-cache",
        body: JSON.stringify({
          query: `query lesInscrits($email: String, $idAtelier: uuid) {
            __typename
            inscritsAteliers(where: {email: {_eq: $email}, atelierInscrit: {id: {_eq: $idAtelier}}}) {
              nom
              prenom
              id
            }
          }`,
          variables: {
            email: email,
            idAtelier: idAtelier
          }
        })
      }).then(async retour => {
            let resultat = await retour.json();
            return resultat.data.inscritsAteliers
      })
    return lesInscrits
}

export async function ajoutInscrits(listeNouveauxInscrits) {
  const lesInscrits = await fetch("https://graphql.labonnefabrique.fr/v1/graphql", {
    method: "POST",
    cache: "no-cache",
    body: JSON.stringify({
      query: `mutation ajoutInscrits($object: [inscritsAteliers_insert_input!]!) {
        __typename
        insert_inscritsAteliers(objects: $object) {
          affected_rows
          returning {
            id
          }
        }
      }`,
      variables: {
        object: listeNouveauxInscrits
      }
    })
  }).then(async retour => {
        let resultat = await retour.json();
  })
  return lesInscrits
}

export async function effacerInscription(email, idAtelier) {
  const mutation = await fetch("https://graphql.labonnefabrique.fr/v1/graphql", {
    method: "POST",
    cache: "no-cache",
    body: JSON.stringify({
      query: `mutation effacerInscription($email: String, $idAtelier: uuid) {
        __typename
        delete_inscritsAteliers(where: {email: {_eq: $email}, _and: {atelier: {_eq: $idAtelier}}}){
          affected_rows
        }
      }`,
      variables: {
        email: email,
        idAtelier: idAtelier
      }
    })
  }).then(async retour => {
        let resultat = await retour.json();
  })
  return mutation
}

export async function nbInscrits(idAtelier) {
  const query = await fetch("https://graphql.labonnefabrique.fr/v1/graphql", {
    method: "POST",
    cache: "no-cache",
    body: JSON.stringify({
      query: `query nbInscrits($idAtelier: uuid) {
        __typename
        inscritsAteliers_aggregate(where: {atelier: {_eq: $idAtelier}}) {
          aggregate {
            count(columns: id)
          }
        }
        ateliers(where: {id: {_eq: $idAtelier}}) {
          nbParticipants
        }
      }`,
      variables: {
        idAtelier: idAtelier
      }
    })
  }).then(async retour => {
        let resultat = await retour.json();
        var inscrits = resultat.data.inscritsAteliers_aggregate.aggregate.count
        var nbPlaces = resultat.data.ateliers[0].nbParticipants
        return nbPlaces-inscrits
  })
  return query
}