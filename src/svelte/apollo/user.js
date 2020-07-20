import { requeteGraphQL } from './gql.js'

export async function userData(email) {
    const query = `
            query userData($email:String!) {userData(email:$email){userData}}
        `
    const variables = {
        email: email
    }
    return requeteGraphQL(query, variables)
        .then((resultats)=> {
            let retour = JSON.parse(resultats.userData.userData)
            let now = new Date()
            let limiteAbonnement = new Date(retour.abonnement)
            retour.estAbonne = now <= limiteAbonnement
            return retour
        })
}