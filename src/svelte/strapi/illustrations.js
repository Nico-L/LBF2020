const cmsUrl = "https://cms.labonnefabrique.fr/"
import {verifJWT} from "./verifJWT.js"

export function getIllustrationById(idImg, token) {
    const url = cmsUrl + "illustrations/" + idImg
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