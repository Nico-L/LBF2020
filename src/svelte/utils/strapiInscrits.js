/*async function getToken() {
    return fetch("https://graphql.labonnefabrique.fr/apollo", {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
        query: `query login {
                siteLogin {
                    loginToken
                }
                }`
        })
    }).then(retour => retour.json())
    .then(resultat => {
        console.log('retour token', resultat)
        return resultat.data.siteLogin.loginToken
    }).catch((error)=>console.log('erreur getToken', error))
} */

export function nbInscrits(idAtelier) {
    return fetch("https://graphql.labonnefabrique.fr/apollo", {
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: `query places($idAtelier: String!) {
                atelierNbPlacesRestantes(
                    id: $idAtelier
                ) {
                    places
                }
                }`,
            variables: {
                idAtelier: idAtelier,
            }
            })
        }).then((retour) => retour.json())
    .then((resultat) => {
        return resultat.data.atelierNbPlacesRestantes.places
    }).catch((error) => console.log('erreur', error))
}

export function findOneInscrit(idAtelier, email) {
    return fetch("https://graphql.labonnefabrique.fr/apollo", {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            query: `query unInscrit($idAtelier: String!, $email: String!) {
                findOneInscrit(
                    id: $idAtelier
                    email: $email
                ) {
                    inscrit
                }
                }`,
        variables: {
            idAtelier: idAtelier,
            email: email
        }
        })
    }).then((retour) => retour.json())
        .then( resultat => {
            return resultat.data.findOneInscrit.inscrit
        })
        .catch((error) => console.log('erreur', error))
}

export function ajoutInscrits(inscription) {
    const dataInscription = JSON.stringify(inscription)
    return fetch("https://graphql.labonnefabrique.fr/apollo",{
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            query: `query ajoutInscrit($inscription: String!) {
                ajoutInscription(
                    inscription: $inscription
                ) {
                    idInscription
                }
                }`,
        variables: {
            inscription: dataInscription,
        }
        })
    }).then(retour => retour.json())
    .then((resultat) => {return resultat.data.ajoutInscription.idInscription})
    .catch((error) => console.log('erreur', error))
}

export function effacerInscription(idInscription) {
    return fetch("https://graphql.labonnefabrique.fr/apollo", {
        method: "POST",
        headers:  { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            query: `
                query effaceInscrit($idInscription: String!) {
                    effaceInscription(idInscription: $idInscription) {
                        inscription
                    }
                }
            `,
            variables: {
                idInscription: idInscription
            }
        })
    }).then(retour => retour.json())
    .then((resultat)=> {console.log('retour effaceInscription',resultat); return resultat.data.effaceInscription.inscription})
    .catch((error) => console.log('erreur', error))
}

export function modifInscription(idInscrit, inscription) {
    const dataInscription = JSON.stringify(inscription)
    return fetch("https://graphql.labonnefabrique.fr/apollo",{
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            query: `query modifInscrit($idInscription: String!, $inscription: String!) {
                modifInscription(
                    idInscription: $idInscription
                    inscription: $inscription
                ) {
                    idInscription
                }
                }`,
        variables: {
            idInscription: idInscrit,
            inscription: dataInscription
        }
        })
    }).then(retour => retour.json())
    .then((resultat) => {console.log('retour modifInscription',resultat); return resultat.data.ajoutInscription.inscription})
    .catch((error) => console.log('erreur', error))
}