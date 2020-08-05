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

export async function reserver(variables) {
    const query = `
        mutation reserver($nom: String, $prenom: String, $heureDebut: String!, $heureFin: String!, $date: String!, $user: String!, $machine: String!) {
            reservation(
                nom:$nom,
                prenom:$prenom,
                heureDebut: $heureDebut,
                heureFin: $heureFin,
                date: $date,
                user: $user,
                machine: $machine
            ) {
                reservationUuid
            }
            }
    `
    return requeteGraphQL(query, variables)
    .then((resultats)=> {
        return resultats.reservation.reservationUuid
    })
}

export async function getResaByUuid (uuid) {
    const query =
        `query resa($uuid: String!) {
        reservationByUuid(uuid: $uuid) {
                reservationByUuid
            }
        }`
    const variables = {
        uuid: uuid
    }
    return requeteGraphQL(query, variables)
        .then((resultats)=> {
            return JSON.parse(resultats.reservationByUuid.reservationByUuid)
        })
}

export async function effacerResa (idResa) {
    const query = `
        mutation effaceResa($idReservation: String!) {
            effaceReservation(idReservation: $idReservation) {
                reservation
            }
            }
        `
        const variables = {
        idReservation: idResa
    }
    return requeteGraphQL(query, variables)
        .then((resultats)=> {
            return JSON.parse(resultats.effaceReservation.reservation)
        })
}

export async function modifierResa(variables) {
    const query = `
        mutation modifResa(
                $idReservation: String!,
                $heureDebut: String,
                $heureFin: String,
                $nom: String,
                $prenom: String,
                $machine: String,
                $user: String,
                $date: String,
                $uuid: String) {
            ModifReservation(
                idReservation: $idReservation,
                heureDebut: $heureDebut,
                heureFin: $heureFin,
                nom: $nom,
                prenom: $prenom,
                machine: $machine,
                user: $user,
                date: $date,
                uuid: $uuid) {
                estReserve
            }
            }
        `
    return requeteGraphQL(query, variables)
        .then((resultats)=> {
            return JSON.parse(resultats.ModifReservation.estReserve)
        })
}