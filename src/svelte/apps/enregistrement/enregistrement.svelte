<script>
    import Bouton from '../../components/bouton.svelte';
    import Fa from 'svelte-fa'
    import { faSave, faSignInAlt } from '@fortawesome/free-solid-svg-icons'

    var userName = ""
    var email = ""
    var password=""
    var passwordVerif = ""
    var occupe = false
    var succes = false
    var connu = false
    var erreur = "text-gray-900"
    var message = "Merci de renseigner les informations suivantes."

    function demandeLien() {
        if (email==="") {
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
                email: email
            })
        };
        fetch('https://cms.labonnefabrique.fr/auth/forgot-password', options)
            .then((retour)=>
                retour.json().then((retour2)=> {
                    occupe=false
                    if (retour2.ok) {
                        succes = true
                    }
                })
            ).catch((erreur)=>{
                console.log('une erreur a eu lieu', erreur)
            })
    }

    function enregistrement() {
        const regexMail = /([a-zA-Z0-9+._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/i.exec(email)
        const mailValide = regexMail!==null
        if (email==="" || !mailValide) {
            message = "Merci de renseigner une adresse email valide"
            erreur = "text-rougeLBF"
            return
        }
        if (password === "") {
            message = "Veuillez entrer un mot de passe."
            erreur = "text-rougeLBF"
            return 
        }
        if (password !== passwordVerif) {
            message = "Vos mots de passe ne correspondent pas."
            erreur = "text-rougeLBF"
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
                username: userName,
                confirmed: true,
                email: email,
                password: password
            })
        };
        fetch('https://cms.labonnefabrique.fr/users', options)
            .then((retour)=>
                retour.json().then((retour2)=> {
                    occupe=false
                    if (retour2.statusCode && retour2.statusCode === 400) {
                        if (retour2.message === "missing.password") {
                            message = "Merci de renseigner votre mot de passe"
                            erreur = "text-rougeLBF"
                        } else if (retour2.message[0] && retour2.message[0].messages[0].id === "Auth.form.error.email.taken") {
                            message = "Un compte avec cet email a déjà été créé. Vous pouvez réinitialiser le mot de passe en cliquant sur le bouton ci-dessous"
                            connu = true
                        } else if (retour2.message[0] && retour2.message[0].messages[0].id === "Auth.form.error.username.taken") {
                            message = "Ce nom d'utilisateur est déjà pris, merci de le modifier"
                            erreur = "text-rougeLBF"
                        }
                    } else {
                        options = { 
                            method: 'POST',
                            headers: entetes,
                            mode: 'cors',
                            cache: 'default',
                            body: JSON.stringify({
                                identifier: email,
                                password: password
                            })
                        }
                        fetch('https://cms.labonnefabrique.fr/auth/local', options)
                            .then((leJSON) => leJSON.json())
                            .then((user)=> {
                                localStorage.setItem("userStrapi", JSON.stringify(user))
                                window.location.replace(window.location.origin)
                            })
                    }
                })
            ).catch((erreur)=>{
                console.log('une erreur a eu lieu', erreur)
            })
    }
</script>

<main>
    <div class="w-200px border border-vertLBF rounded-md mx-auto mt-12 p-2">
        <img src="/images/logos/logoHexagoneSeul.svg" class="mx-auto my-2 h-32 w-32" alt="logo Bonne Fabrique">
        {#if succes}
            <div class="mb-2 text-justify text-sm bg-gray-200 text-gray-900">Un mail vous a été envoyé. Il peut mettre quelques minutes à vous parvenir.</div>
        {:else}
            <div class={"mb-2 text-justify text-sm " + erreur}>{message}</div>
            <input 
                class="mb-2 text-sm bg-gray-200 text-gray-900 focus:outline-none border border-vertLBFT rounded py-1 px-2 block w-full appearance-none leading-normal"
                type="text"
                id="userName"
                placeholder="Nom d'utilisateur"
                bind:value={userName}
                />
            <input 
                class="mb-2 text-sm bg-gray-200 text-gray-900 focus:outline-none border border-vertLBFT rounded py-1 px-2 block w-full appearance-none leading-normal"
                type="text"
                id="identifiant"
                placeholder="email"
                bind:value={email}
                />
            <input 
                class="mb-2 text-sm bg-gray-200 text-gray-900 focus:outline-none border border-vertLBFT rounded py-1 px-2 block w-full appearance-none leading-normal"
                type="password"
                id="password"
                placeholder="Entrez un MDP"
                bind:value={password}
                />
            <input 
                class="mb-2 text-sm bg-gray-200 text-gray-900 focus:outline-none border border-vertLBFT rounded py-1 px-2 block w-full appearance-none leading-normal"
                type="password"
                id="passwordVerif"
                placeholder="Vérification MDP"
                bind:value={passwordVerif}
                />
            <div class="mt-2">
            {#if connu}
                <Bouton occupe={occupe} succes={succes} border="border-1" largeur="w-full" couleur="text-vertLBF border-vertLBF" on:actionBouton={() => {demandeLien()}}>
                    <div class="mx-auto flex flex-row justify-center">
                        <div class="px-1 self-center">Envoyer un lien</div>
                        <div class="px-1 self-center"><Fa icon={faSignInAlt} size="lg" class="mx-auto" /></div>
                    </div>
                </Bouton>
            {:else}
                <Bouton occupe={occupe} succes={succes} border="border-1" largeur="w-full" couleur="text-vertLBF border-vertLBF" on:actionBouton={() => {enregistrement()}}>
                    <div class="mx-auto flex flex-row justify-center">
                        <div class="px-1 self-center">Enregistrer</div>
                        <div class="px-1 self-center"><Fa icon={faSave} size="lg" class="mx-auto" /></div>
                    </div>
                </Bouton>
            {/if}
            </div>
        {/if}
    </div>
</main>