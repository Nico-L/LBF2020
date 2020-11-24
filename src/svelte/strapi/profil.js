const cmsUrl = "https://cms.labonnefabrique.fr/"
const maintenant = (new Date()).toISOString()
import {verifJWT} from "./verifJWT.js"

export function cinqDernieresInscriptions (idUser, token) {
    const url = cmsUrl + "inscriptions-ateliers/?user_eq=" + idUser + "&atelier.date_gte=" + maintenant + "&_limit=5"
    return verifJWT(token).then((retour)=> 
        {
            const auth = "Bearer " + token
            var entetes = new Headers({"content-type": "application/json", "Authorization": auth})
            var options = { 
                method: 'GET',
                headers: entetes,
                mode: 'cors',
                cache: 'default',
            }
            return fetch(url, options)
                .then((leJSON)=> {return leJSON.json()})
                .then((retour)=> {return retour})
        }
    )
}

export function resaMachines(idUser, token) {
    const url = cmsUrl + "reservations-machines/?user_eq=" + idUser
    return verifJWT(token).then((retour) => {
        {
            const auth = "Bearer " + token
            var entetes = new Headers({"content-type": "application/json", "Authorization": auth})
            var options = { 
                method: 'GET',
                headers: entetes,
                mode: 'cors',
                cache: 'default',
            }
            return fetch(url, options)
                .then((leJSON)=> {return leJSON.json()})
                .then((retour)=> {return retour})
        }
    })
}

export function deleteUser(idUser, token) {
    const url = cmsUrl + "users/" + idUser
    return verifJWT(token).then((retour) => {
        {
            const auth = "Bearer " + token
            var entetes = new Headers({"content-type": "application/json", "Authorization": auth})
            var options = { 
                method: 'DELETE',
                headers: entetes,
                mode: 'cors',
                cache: 'default',
            }
            return fetch(url, options)
                .then((leJSON)=> {return leJSON.json()})
                .then((retour)=> {return retour})
        }
    })
}

export function aEffacer(idUser, token, body) {
    const url = cmsUrl + "users/" + idUser
    return verifJWT(token).then((retour) => {
        {
            const auth = "Bearer " + token
            var entetes = new Headers({"content-type": "application/json", "Authorization": auth})
            var options = { 
                method: 'PUT',
                headers: entetes,
                mode: 'cors',
                cache: 'default',
                body: JSON.stringify(body)
            }
            return fetch(url, options)
                .then((leJSON)=> {return leJSON.json()})
                .then((retour)=> {return retour})
        }
    })
}

export function anonInscriptions(idUser, token) {
    const url = cmsUrl + "inscriptions-ateliers/?user_eq=" + idUser + "&atelier.date_lte=" + maintenant
    return verifJWT(token).then((retour) => {
        {
            var auth = "Bearer " + token
            var entetes = new Headers({"content-type": "application/json", "Authorization": auth})
            var options = { 
                method: 'GET',
                headers: entetes,
                mode: 'cors',
                cache: 'default'
            }
            return fetch(url, options)
                .then((leJSON)=> {return leJSON.json()})
                .then((retour)=> {
                    var listePromises = []
                    retour.forEach((inscription)=> {
                        const urlPUT = cmsUrl + "inscriptions-ateliers/" + inscription.id
                        var options = { 
                            method: 'PUT',
                            headers: entetes,
                            mode: 'cors',
                            cache: 'default',
                            body:  JSON.stringify({
                                user: 24,
                                email: "johndoe@anonyme.fr",
                                prenom: "John",
                                nom: "Doe"
                            })
                        }
                        listePromises.push(fetch(urlPUT, options).then((leJSON) => {return leJSON.json()}).then((retour) => {return retour}))
                    })
                    return Promise.all(listePromises).then((retourAll) => {})
                })
        }
    })
}

export function anonReservations(idUser, token) {
    const url = cmsUrl + "reservations-machines/?user_eq=" + idUser + "&date_lte=" + maintenant
    return verifJWT(token).then((retour) => {
        {
            var auth = "Bearer " + token
            var entetes = new Headers({"content-type": "application/json", "Authorization": auth})
            var options = { 
                method: 'GET',
                headers: entetes,
                mode: 'cors',
                cache: 'default'
            }
            return fetch(url, options)
                .then((leJSON)=> {return leJSON.json()})
                .then((retour)=> {
                    var listePromises = []
                    retour.forEach((reservation)=> {
                        const urlPUT = cmsUrl + "reservations-machines/" + reservation.id
                        var options = { 
                            method: 'PUT',
                            headers: entetes,
                            mode: 'cors',
                            cache: 'default',
                            body:  JSON.stringify({
                                user: 24,
                                prenom: "John",
                                nom: "Doe"
                            })
                        }
                        listePromises.push(fetch(urlPUT, options).then((leJSON) => {return leJSON.json()}).then((retour) => {return retour}))
                    })
                    return Promise.all(listePromises).then((retourAll) => {})
                })
        }
    })
}

