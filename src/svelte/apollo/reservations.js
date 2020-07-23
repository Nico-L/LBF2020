import { requeteGraphQL } from './gql.js'

export async function listePlagesHoraires(variables) {
    const query = `
            query listeCreneaux {
                listeCreneauxDispo {
                    creneaux
                }
            }
            `
    return requeteGraphQL(query, variables)
        .then((resultats)=> {
            return JSON.parse(resultats.listeCreneauxDispo.creneaux)})
}

export async function listeReservationsByDate(date) {
    const variables = {
        date: date
    }
    const query = `
        query reservation($date: String!) {
            listeReservationsByDate(date: $date) {
                reservationsByDate
            }
            }
        `
    return requeteGraphQL(query, variables)
        .then((resultats)=> {
            return JSON.parse(resultats.listeReservationsByDate.reservationsByDate)
        })
}