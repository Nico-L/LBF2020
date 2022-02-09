<script>
    import {onMount} from 'svelte';
    import Bouton from '../../components/bouton.svelte';
    import Fa from 'svelte-fa'
    import { faSignInAlt } from '@fortawesome/free-solid-svg-icons'

    var email = ""
    var mdp = ""
    var occupe = false
    var succes = false
    var erreur = "text-gray-900"
    var message = "Entrez votre adresse email et votre mot de passe pour vous identifier"
    var urlModifInscription = window.location.search
    var urlRetour = window.location.origin

    if (window.location.search.indexOf('?') >= 0 || window.location.search.slice(window.location.search.length -1) === "/") {
        urlRetour += window.location.search.replace("?","")
    } else {
        urlRetour += "/" + window.location.search
    }
    
    console.log('urlRetour', urlRetour)

    function login() {
        if (email==="" || mdp==="") {
            return
        }
        occupe = true
        succes = false
        var entetes = new Headers({"content-type": "application/json"});
        var options = { 
            method: 'POST',
            headers: entetes,
            mode: 'cors',
            cache: 'default',
            body: JSON.stringify({
                identifier: email,
                password: mdp
            })
        };
        fetch('https://cms.labonnefabrique.fr/auth/local', options)
            .then((retour)=>
                retour.json().then((retour2)=> {
                    occupe = false
                    if (retour2.jwt && retour2.user) {
                        succes = true
                        localStorage.setItem('userStrapi', JSON.stringify(retour2))
                        window.location.assign(urlRetour)
                    } else {
                        if (retour2.data[0].messages[0].id==="Auth.form.error.invalid") {
                            message = "Email ou mot de passe invalide. Veuillez vérifier."
                            erreur = "text-orangeLBF"
                        }
                    }
                })
            )
    }

    function handleKeydown(event) {
		if (event.keyCode === 13) {
            login()
        }
    }
    
    onMount (()=> {
        var userInfo = JSON.parse(localStorage.getItem("userStrapi"));
        //on va vérifier que le token est OK
        if (userInfo && userInfo.jwt) {
            const url = "https://cms.labonnefabrique.fr/token/decrypt"
            var entetes = new Headers({"content-type": "application/json"})
            var options = { 
                method: 'POST',
                headers: entetes,
                mode: 'cors',
                cache: 'default',
                body: JSON.stringify({
                    token: userInfo.jwt
                })
            }
            return fetch(url, options)
                .then((leJSON) => {return leJSON.json()})
                .then((retourJWT)=> {
                    if (retourJWT.message !== "Error: Invalid token.") {
                        window.location.assign(urlRetour)
                    } else {
                        localStorage.removeItem('userStrapi')
                    }
                })
                .catch((erreur) => console.log('erreur', erreur))
        }
    })
</script>

<svelte:window on:keydown={handleKeydown}/>

<main>
    <div class="w-320px border border-bleuLBF rounded-md mx-auto mt-12 p-2">
        <img src="/images/logos/logoHexagoneSeul.svg" class="mx-auto my-2 h-32 w-32" alt="logo Bonne Fabrique">
        <!-- <div class="mb-2 text-justify text-sm text-gray-900">
            Pour vous inscrire à un atelier, ou réserver une machine, vous devez être enregistré et identifié. Cela nous permet de sécuriser l'accès à nos données. 
        </div>
        <div class="text-rougeLBF text-sm">
            <span class="font-medium">ATTENTION :</span> nous avons perdu toutes nos données suite à l'incendie du data center de notre ancien serveur, y compris tous les comptes utilisateurs. Si vous voyez ce message pour la première fois, vous devez sans doute vous inscrire à nouveau. Toutes nos excuses pour le désagrément.
        </div> -->
        <div class={"mb-2 text-justify text-sm " + erreur}>{message}</div>
        <input 
            class="text-sm mb-2 bg-gray-200 text-gray-900 focus:outline-none border border-bleuLBFT rounded py-1 px-2 block w-full appearance-none leading-normal"
            type="text"
            id="identifiant"
            placeholder="email"
            bind:value={email}
            />
        <input 
            class="text-sm mb-1 bg-gray-200 text-gray-900 focus:outline-none border border-bleuLBFT rounded py-1 px-2 block w-full appearance-none leading-normal"
            type="password"
            id="motDePasse"
            placeholder="mot de passe"
            bind:value={mdp}
            />
        <div class="text-right mt-2">
            <Bouton
                occupe={occupe}
                succes = {succes}
                border="border-1"
                largeur="w-full"
                couleur="text-bleuLBF border-bleuLBF"
                on:actionBouton={() => {login()}}>
                <div class="mx-auto flex flex-row justify-center">
                    <div class="px-1 self-center">S'identifier</div>
                    <div class="px-1 self-center"><Fa icon={faSignInAlt} size="lg" class="mx-auto" /></div>
                </div>
            </Bouton>
            <div class="text-sm text-gray-900 mt-2 flex flex-col">
                <a href="./oubliMDP" class="px-1 hover:bg-bleuLBFT rounded-sm">Mot de passe oublié ?</a>
                <a href="./enregistrement" class="px-1 hover:bg-bleuLBFT rounded-sm">Pas inscrit ?</a>
            </div>
        </div>
    </div>
</main>