const cmsUrl = "https://cms.labonnefabrique.fr/"

export function envoyerEmail(variables) {
    const url = cmsUrl + "email"
    var entetes = {"content-type": "application/json"}
    var options = { 
        method: 'POST',
        headers: entetes,
        mode: 'cors',
        cache: 'default',
        body: JSON.stringify(variables)
    }
    return fetch(url, options)
        .then((leJSON)=> {return leJSON.json()})
        .then((retour)=> {return retour})
}