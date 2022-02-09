<script>
    import Bouton from '../../components/bouton.svelte';
    import Fa from 'svelte-fa'
    import { faSave } from '@fortawesome/free-solid-svg-icons' 

    var nouveauPasswordVerif = ""
    var nouveauPassword = ""
    var message = "Entrer un nouveau mot de passe."
    var erreur = "text-gray-900"
    var codeUsed = false

    var url = window.location.search;
    var extracted = /\?code=(.*)/i.exec(url)
    var code = ""
    if (extracted!==null) {
        code = extracted[1]
    } else {
        window.location.assign(window.location.origin)
    }

    function renvoiOubliMDP() {
        var urlLogin = window.location.origin + "/oubliMDP"
        window.location.assign(urlLogin)
    }

    function resetMDP() {
        if (nouveauPassword==="" || nouveauPasswordVerif==="" || code==="") {
            return
        }
        var entetes = new Headers({'Content-Type': 'application/json'});

        var options = { 
            method: 'POST',
            headers: entetes,
            mode: 'cors',
            body: JSON.stringify({
                code: code,
                password: nouveauPassword,
                passwordConfirmation: nouveauPasswordVerif,
            })
        };
        fetch('https://cms.labonnefabrique.fr/auth/reset-password', options)
            .then((retour)=>
                retour.json().then((retour2)=> {
                    if (retour2.jwt && retour2.user) {
                        localStorage.setItem('userStrapi', JSON.stringify(retour2))
                        if (retour2.user.role.type==="acl") {
                            window.location.assign("https://acl-sappey.netlify.app/admin/")
                        } else {
                            window.location.assign(window.location.origin)
                        }
                    } else {
                        if (retour2.data[0].messages[0].id==="Auth.form.error.password.matching") {
                            message="Les mots de passe ne coincident pas. Merci d'essayer à nouveau."
                            erreur="text-orangeLBF"
                            return
                        }
                        if (retour2.data[0].messages[0].id==="Auth.form.error.password.matching") {
                            message="Les mots de passe ne coincident pas. Merci d'essayer à nouveau."
                            erreur="text-orangeLBF"
                            return
                        }
                        if (retour2.data[0].messages[0].id==="Auth.form.error.code.provide") {
                            message="Ce code a déjà été utilisé. Cliquer si dessous pour envoyer un nouveau code de réinitialisation."
                            codeUsed = true
                            erreur="text-orangeLBF"
                            return
                        }
                    }
                })
            )
    }
</script>

<main>
    <div class="w-200px border border-orangeLBF rounded-md mx-auto mt-12 p-2">
        <img src="/images/logos/logoHexagoneSeul.svg" class="mx-auto my-2 h-32 w-32" alt="logo Bonne Fabrique">
        <div class={"mb-2 text-justify text-sm " + erreur}>{message}</div>
        {#if codeUsed}
            <div class="text-right mt-4">
                    <Bouton border="border-1" largeur="w-full" couleur="text-orangeLBF border-orangeLBF" on:actionBouton={() => {renvoiOubliMDP()}}>
                        <div class="mx-auto flex flex-row justify-center">
                            <div class="px-1 self-center text-sm">Oubli mot de passe</div>
                            <div class="px-1 self-center"><Fa icon={faSave} size="lg" class="mx-auto" /></div>
                        </div>
                    </Bouton>
                </div>
        {:else}
            <input 
                class="mb-2 bg-gray-200 text-gray-900 focus:outline-none border border-orangeLBFT rounded py-1 px-2 block w-full appearance-none leading-normal"
                type="password"
                id="nouveauPassword"
                placeholder="Nouveau mot de passe"
                bind:value={nouveauPassword}
                />
            <input 
                class="mb-1 bg-gray-200 text-gray-900 focus:outline-none border border-orangeLBFT rounded py-1 px-2 block w-full appearance-none leading-normal"
                type="password"
                id="nouveauPasswordVerif"
                placeholder="Confirmer le mdp"
                bind:value={nouveauPasswordVerif}
                />
                <div class="text-right mt-4">
                    <Bouton border="border-1" largeur="w-full" couleur="text-orangeLBF border-orangeLBF" on:actionBouton={() => {resetMDP()}}>
                        <div class="mx-auto flex flex-row justify-center">
                            <div class="px-1 self-center">Mettre à jour</div>
                            <div class="px-1 self-center"><Fa icon={faSave} size="lg" class="mx-auto" /></div>
                        </div>
                    </Bouton>
                </div>
        {/if}
    </div>
</main>