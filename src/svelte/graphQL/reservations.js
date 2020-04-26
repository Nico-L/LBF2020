import { requeteGraphQL } from './gql.js'

export async function sauveReservation(variables) {
    const query = `
            mutation ajoutReservation(
                $dateDebut: timestamptz
                $dateFin: timestamptz
                $email: String
                $idMachine: uuid
                $nom: String
                $prenom: String
            ) {
                insert_reservationMachines(
                objects: {
                    dateDebut: $dateDebut
                    dateFin: $dateFin
                    email: $email
                    idMachine: $idMachine
                    nom: $nom
                    prenom: $prenom
                }
                ) {
                returning {
                    id
                }
                }
            }
            `
    return requeteGraphQL(query, variables)
        .then((resultats)=> {
            return resultats.insert_reservationMachines.returning[0]
        })
}

export async function listeReservations(variables) {
    const query = `
            query listeResaMachine($idMachine: uuid) {
                reservationMachines(where: {idMachine: {_eq: $idMachine}}) {
                    dateDebut
                    dateFin
                    id
                    machine {
                        couleur
                        urlImage
                    }
                }
            }
        `
    return requeteGraphQL(query, variables)
        .then((resultats)=> {
            return resultats.reservationMachines
        })
}

export async function reservationById(variables) {
    const query = `
            query listeResaMachine($id: uuid) {
                reservationMachines(where: {id: {_eq: $id}}) {
                    nom
                    prenom
                    email
                    dateDebut
                    dateFin
                    machine {
                        couleur
                        urlImage
                    }
                }
            }
        `
    return requeteGraphQL(query, variables)
        .then((resultats)=> {
            return resultats.reservationMachines
        })
}


export async function effacerReservation(variables) {
    const query = `mutation effaceReservation($id: uuid) {
            __typename
                delete_reservationMachines(where: {id: {_eq: $id}}) {
                    returning {
                    id
                    }
                }
            }`
    return requeteGraphQL(query, variables)
        .then((resultats)=> {
            return resultats.delete_reservationMachines
        })
}