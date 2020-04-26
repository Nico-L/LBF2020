import { requeteGraphQL } from './gql.js'

export async function listePlagesHoraires(variables) {
    const query = `
            query horairesReservationMachines {
                horairesReservationMachines {
                id
                plages
                }
            }
            `
    return requeteGraphQL(query, variables)
        .then((resultats)=> {return resultats.horairesReservationMachines})
}