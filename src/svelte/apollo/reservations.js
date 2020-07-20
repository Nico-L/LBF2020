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