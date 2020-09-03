<svelte:options tag="inscription-atelier"/>

<script>
    import { onMount, tick  } from "svelte";
    import Modal from "../components/ModalPerso.svelte";
    import { dateFormatFr } from '../utils/dateFr.js'

    export let id_atelier = 'nope';
    export let url_illustration = 'logoLBFSeul_a1t4af.png';
    export let date_atelier = '';
    export let heure_debut = '';
    export let heure_fin = '';
    export let titre_atelier = 'Un titre Atelier';

    // récupération adresse pour vérifier si arrivée d'un lien de désinscription
    var urlModifInscription = window.location.search;
    var urlMail = window.location.origin +  window.location.pathname

    /* variables */
    var testModal = false
	var placesRestantes = "Calculs en cours..."
	let showModalInscription = false
    var listeInscrits = []
    var nbPlaces = -1
    var nouveauxInscrits = [{nom: "", prenom: ""}]
    var desinscrit = [{nom: "", prenom: ""}]
    var actionEncours = false
	var flagEmailVerifie = false
    var flagVerifEffacer = false
    var flagVerifDesinscription = false
    var flagComplet = false
    var flagSaveValide = false
    var flagEmailVide = false
    var flagEmailInvalide = false
    var busyEffacerInscription = false
    var confirmeDesinscription = false
    var busyEffacerInscrit = false
    var confirmeDesinscrit = false
    var confirmeInscription = false
    let saveInfo = true;
    let idInscrit = ""
    let modal;
    let uuidInscription;
    let insertInscriptions;
    var listeInscriptionsEmail = [];
    var emailInscription = "";
    var userInfo = { nom: "", prenom: "", email: "" };

    /* if (localStorage["emailInscription"]) {
        var emailInscription = JSON.parse(localStorage.getItem("emailInscription"));
        saveInfo = true;
    } else {
        var emailInscription = "";
    } */

	/*import functions*/
    import * as graphqlInscriptions from '../apollo/inscriptionsAteliers.js'
    import { envoyerMail } from '../apollo/email.js'

    //récupération nb inscrits au montage
    onMount(async () => {
        if (localStorage["userInfo"]) {
            userInfo = JSON.parse(localStorage.getItem("userInfo"));
            emailInscription = userInfo.email
            saveInfo = true;
            console.log('id atelier', id_atelier)
        } else {
            saveInfo = false
        }
        var extracted = /\?uuidInscription=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})&email=([a-zA-Z0-9+._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/i.exec(urlModifInscription)
        await tick()
        if (extracted!==null) {
        var uuidAtelierModif = extracted[1]
        var emailModif = extracted[2]
        graphqlInscriptions.findOneInscrit(id_atelier, emailModif).then((inscrit) => {     
            if (JSON.parse(inscrit)[0] && JSON.parse(inscrit)[0].uuid === uuidAtelierModif) {
                emailInscription = emailModif
                if (localStorage["emailInscription"]) {
                    saveInfo = true;
                }
                const verifInscrit = JSON.parse(inscrit)[0]
                if (verifInscrit) {idInscrit = verifInscrit.id} else {idInscrit = "pasInscrit"}
                if (verifInscrit && verifInscrit.lesInscrits) {
                    listeInscrits = verifInscrit.lesInscrits
                }
                if (listeInscrits.length > 0) {nouveauxInscrits = []} else { nouveauxInscrits = [{prenom: ""}]}
                actionEncours = false
                flagEmailVerifie = true
                afficheModal()
                //verifInscrits()
            }
        })
        }
        nbInscrits()
    });

    $: {
        if (saveInfo && emailInscription !== "") {
            userInfo.email = emailInscription
            localStorage.setItem("userInfo", JSON.stringify(userInfo));
        }
        if (!saveInfo && localStorage["userInfo"]) {
            localStorage.removeItem("userInfo");
            userInfo = { nom: "", prenom: "", email: "" };
        }
    }

    // appels graphql
    function nbInscrits() {
        graphqlInscriptions.nbInscrits(id_atelier).then((retourNbPlaces) => {
            nbPlaces = retourNbPlaces
            flagComplet = false
            if (nbPlaces <= 0) {
                placesRestantes = "Complet"
                flagComplet = true
                nouveauxInscrits = []
            } else if (nbPlaces === 1) {
                placesRestantes = "Dernière place"
            } else {
                placesRestantes = nbPlaces + " places restantes"
            }
        })
    }

	function verifInscrits() {
        if(emailInscription==="") {flagEmailVide = true; return;}
        if(/([a-zA-Z0-9+._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/i.exec(emailInscription) === null) {flagEmailInvalide = true; return;}
        // saveInfoEmail()
        console.log('info user & atelier', id_atelier, emailInscription)
        actionEncours = true
        graphqlInscriptions.findOneInscrit(id_atelier, emailInscription)
            .then((retour)=>{
                const verifInscrits = JSON.parse(retour)[0]
                if (verifInscrits) {idInscrit = verifInscrits.id} else {idInscrit = "pasInscrit"}
                if (verifInscrits && verifInscrits.lesInscrits) {
                    listeInscrits = verifInscrits.lesInscrits
                }
                if (listeInscrits.length > 0) {nouveauxInscrits = []} else { nouveauxInscrits = [{prenom: ""}]}
                actionEncours = false
                flagEmailVerifie = true
            })
	}

function insertInscrits() {
    // saveInfoEmail()
    var insertInscriptions = {"email": emailInscription, "idAtelier": id_atelier, "lesInscrits": []}
    var listeInscriptionsEmail = []
    listeInscrits.forEach((inscription) => {
        if (!(inscription.prenom === "" && inscription.nom === "")) {
            insertInscriptions.lesInscrits.push({"prenom": inscription.prenom})
            listeInscriptionsEmail.push({"prenom": inscription.prenom})
        }
    })
    nouveauxInscrits.forEach((inscription) => {
        if (!(inscription.prenom === "" && inscription.nom === "")) {
            insertInscriptions.lesInscrits.push({"prenom": inscription.prenom})
            listeInscriptionsEmail.push({"prenom": inscription.prenom})
        }
    })
    if (idInscrit==="pasInscrit") {
        graphqlInscriptions.ajoutInscrits(insertInscriptions).then((retour) => {
            nbInscrits()
            close()
            confirmeInscription = true
            envoiMail(retour)
        })
    } else {
        graphqlInscriptions.modifInscription(idInscrit.toString(),insertInscriptions).then((retour) => {
            nbInscrits()
            close()
            confirmeInscription = true
            envoiMail(retour)
        })
    }
}

    function envoiMail(uuid) {
        let heureDebutSplit = heure_debut.split(':')
        let heureFinSplit = heure_fin.split(':')
        let infoHoraires = dateFormatFr(date_atelier) + ' de ' + heureDebutSplit[0] + "h" + heureDebutSplit[1] + " à " + heureFinSplit[0] + "h" + heureFinSplit[1]

        var arrayMails = []
        arrayMails.push(emailInscription)
        var infoMail = {
            subject: "Confirmation de votre inscription",
            titreAtelier: titre_atelier,
            date: infoHoraires,
            participants: listeInscriptionsEmail,
            urlDesinscription: urlMail + "?uuidInscription=" + uuid +
                "&email=" + emailInscription,
            altMachine: "Illustration Atelier",
            urlImageMail: url_illustration
        };
        let variables = {
            email: arrayMails,
            template: JSON.stringify(infoMail),
            templateId: "d-3db7863e710b491e89681ccdf840a9f4"
        }
        envoyerMail(variables)
    }

	function effacerInscription() {
        if (idInscrit!=="pasInscrit") {
            // saveInfoEmail()
            busyEffacerInscription = true
            graphqlInscriptions.effacerInscription(idInscrit.toString())
                .then((retour) => {
                    nbInscrits()
                    busyEffacerInscription = false
                    close()
                    close()
                    confirmeDesinscription = true
                }).catch((error) => console.log('erreur effacer inscription\n', error))
        }
    }
    
    function effacerInscrit() {
        // saveInfoEmail()
        busyEffacerInscrit = true
        //var effacerInscritById = await gestionInscriptions.effacerInscritById(desinscrit.id)
        nbInscrits()
        busyEffacerInscrit = false
        close()
        close()
        confirmeDesinscrit = true
    }

// gestion table nouveaux inscrits
	function confirmerEffaceInscrit(id, inscrit) {
        flagVerifEffacer = true
        desinscrit = inscrit
        desinscrit.id = id
    }

    function retirerInscrit(index) {
        listeInscrits.splice(index, 1)
        listeInscrits = listeInscrits
        validationSave()
    }

	function dernierInscrit(index) {
		return (index + 1) === nouveauxInscrits.length
	}

	function ajoutInscrit() {
		if ((nbPlaces - nouveauxInscrits.length)>0) nouveauxInscrits.push({prenom: ""})
		nouveauxInscrits = nouveauxInscrits
	}

	function soustraitInscrit(index) {
		nouveauxInscrits.splice(index, 1)
		nouveauxInscrits = nouveauxInscrits
    }
    
    function validationSave() {
        var estValide = true
        //if (nouveauxInscrits.length === 0) {estValide = false}
        listeInscrits.forEach((inscrit) => {
            if (inscrit.prenom === "") {estValide = false}
        })
        nouveauxInscrits.forEach((inscrit) => {
            if (inscrit.prenom === "") {estValide = false}
        })
        flagSaveValide = estValide
    }
// sauvegarde mail en local
function saveInfoEmail() {
    //verification si on doit poser une cookie ou l'enlever
    if (saveInfo) {
        localStorage.setItem("emailInscription", JSON.stringify(emailInscription));
    }
    if (!saveInfo && localStorage["emailInscription"]) {
        localStorage.removeItem("emailInscription");
    }
}
//modal
	function afficheModal() {
        verifInscrits()
        showModalInscription = true
	}

    function retourAccueil() {
        window.location.replace(window.location.origin)
    }

	function close() {
        if (confirmeInscription) {
            confirmeInscription = false
            return
        }
        if (confirmeDesinscription) {
            confirmeDesinscription = false
            return
        }
        if (confirmeDesinscrit) {
            confirmeDesinscrit = false
            return
        }
		if (flagVerifEffacer || flagVerifDesinscription) {
            flagVerifEffacer = false
            flagVerifDesinscription = false
        } else {
        showModalInscription = false; flagEmailVerifie = false; flagVerifDesinscription = false;
        }
	}

	const handle_keydown = e => {
        if (!showModalInscription) {return}
	  if (e.key === "Escape") {
	    close();
	    return;
      }
      if (e.key === "Enter") {
          ajoutInscrit();
          e.preventDefault();
      }
	  /*if (e.key === "Tab") {
        // trap focus
        console.log('modal', modal)
        const nodes = modal.querySelectorAll("*");
        console.log('nodes', nodes)
        const tabbable = Array.from(nodes).filter(n => n.tabIndex >= 0);
        console.log('tabbable', tabbable)
        let index = tabbable.indexOf(DocumentOrShadowRoot.activeElement);
        console.log('index', index)
	    if (index === -1 && e.shiftKey) index = 0;
	    index += tabbable.length + (e.shiftKey ? -1 : 1);
	    index %= tabbable.length;
	    tabbable[index].focus();
	    e.preventDefault();
	  }*/
	};
</script>

<svelte:window on:keydown={handle_keydown}/>
<div class="flex flex-row content-center">
	<div class="bg-orangeLBF flex flex-row mr-1 text-black text-sm px-1">
		<div class="my-auto">{placesRestantes}</div>
	</div>
	<div class="bg-orangeLBF flex flex-row content-center rounded-r px-1 cursor-pointer" on:click={afficheModal}>
		<svg class="fill-current text-black my-auto" width="16" height="16" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512">
			<path fill="currentColor" d="M402.6 83.2l90.2 90.2c3.8 3.8 3.8 10 0 13.8L274.4 405.6l-92.8 10.3c-12.4 1.4-22.9-9.1-21.5-21.5l10.3-92.8L388.8 83.2c3.8-3.8 10-3.8 13.8 0zm162-22.9l-48.8-48.8c-15.2-15.2-39.9-15.2-55.2 0l-35.4 35.4c-3.8 3.8-3.8 10 0 13.8l90.2 90.2c3.8 3.8 10 3.8 13.8 0l35.4-35.4c15.2-15.3 15.2-40 0-55.2zM384 346.2V448H64V128h229.8c3.2 0 6.2-1.3 8.5-3.5l40-40c7.6-7.6 2.2-20.5-8.5-20.5H48C21.5 64 0 85.5 0 112v352c0 26.5 21.5 48 48 48h352c26.5 0 48-21.5 48-48V306.2c0-10.7-12.9-16-20.5-8.5l-40 40c-2.2 2.3-3.5 5.3-3.5 8.5z"/>
		</svg>
		<div class="text-black text-sm my-auto">inscriptions</div>
	</div>
</div>
<!-- modal inscription -->
{#if showModalInscription}
<div class="z-100 fixed w-full h-full top-0 left-0 flex items-center justify-center">
	<div class="absolute w-full h-full  bg-black opacity-75 top-0 left-0 cursor-pointer" on:click={close}>
	</div>
	<div class="relative overflow-auto max-h-5/6 w-5/6 sm:max-w-620px bg-white flex flex-col p-4 items-start rounded" role="dialog" aria-modal="true" >
		<h2 class="text-xl w-full pb-1 mb-1 border-b-2 border-vertLBF font-bold">
			Votre inscription
		</h2>
		<hr class="mb-1" />
		<div class="mb-1 text-base font-medium text-justify">
			Merci de renseigner votre adresse mail et de cliquer sur vérifier.
		</div>
        <div class="flex flex-col">
            <div class="flex flex-row flex-wrap md:flex-no-wrap justify-start content-end">
                <div class="flex flex-col mt-1">
                    <div class="ml-1 text-xs m-0 p-0 font-medium text-vertLBF">
                        email
                    </div>
                    <input on:input={() => {flagEmailVerifie = false; flagEmailVide = false; flagEmailInvalide = false;}} class="h-10 bg-white focus:outline-none focus:bg-white focus:border-lbfvert-600 border-2 border-lbfvert-400 rounded-lg px-4 block appearance-none leading-normal"
                        type="email" placeholder="adresse email" bind:value={emailInscription} />
                </div>
                <div class="m-0 p-0 mt-1 self-end">
                    {#if actionEncours}
                        <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current text-lbfvert-500 h-10 w-18 ml-4 " viewBox="0 0 50 50">
                            <g fill="none" fill-rule="evenodd" stroke-width="2">
                                <circle cx="22" cy="22" r="1">
                                    <animate attributeName="r" begin="0s" dur="1.8s" values="1; 20" calcMode="spline" keyTimes="0; 1" keySplines="0.165, 0.84, 0.44, 1" repeatCount="indefinite"/>
                                    <animate attributeName="stroke-opacity" begin="0s" dur="1.8s" values="1; 0" calcMode="spline" keyTimes="0; 1" keySplines="0.3, 0.61, 0.355, 1" repeatCount="indefinite"/>
                                </circle>
                                <circle cx="22" cy="22" r="1">
                                    <animate attributeName="r" begin="-0.9s" dur="1.8s" values="1; 20" calcMode="spline" keyTimes="0; 1" keySplines="0.165, 0.84, 0.44, 1" repeatCount="indefinite"/>
                                    <animate attributeName="stroke-opacity" begin="-0.9s" dur="1.8s" values="1; 0" calcMode="spline" keyTimes="0; 1" keySplines="0.3, 0.61, 0.355, 1" repeatCount="indefinite"/>
                                </circle>
                            </g>
                        </svg>
                    {:else if !flagEmailVerifie}
                        <button on:click={verifInscrits} class="w-full sm:w-20 mx-1 px-2 h-10 border-2 border-vertLBF rounded text-vertLBF font-semibold" type="button">
                            Vérifier
                        </button>
                    {/if}
                </div>
                {#if flagEmailVide}
                    <div class="m-0 p-0 mt-1 self-end text-rougeLBF">
                        Veuillez entrer une adresse email pour démarrer l'inscription.
                    </div>
                {/if}
                {#if flagEmailInvalide}
                    <div class="m-0 p-0 mt-1 self-end text-rougeLBF">
                        Veuillez entrer une adresse email valide.
                    </div>
                {/if}
            </div>
            <label class="mx-8 pr-8 my-1 text-sm">
                <input type="checkbox" class="form-checkbox text-lbfvert-600" bind:checked={saveInfo} />
                Enregistrer mon adresse email pour la prochaine fois (ces informations sont stockées sur votre machine)
            </label>
        </div>
        {#if !flagEmailVerifie}
            <div class="text-base text-justify">
            Une fois votre mail validé, vous pourrez&nbsp;:
                <ul class="list-disc ml-6">
                    <li> Si l'atelier n'est pas complet, entrer les nom et prénom (seul le prénom est requis) de la ou des personnes participant à l'atelier</li>
                    <li> Si vous avez déjà effectué une inscription à cet atelier, vous pourrez modifier celle-ci ou vous désinscrire.</li>
                </ul>
            </div>
		{:else if nbPlaces === 0 && listeInscrits.length === 0}
            <h2 class="text-base text-bleuLBF w-full mt-2 mx-2 pb-1 mb-1 font-bold">
                Cet atelier est complet. Nos ateliers sont régulièrement proposés, surveillez cet espace pour le prochain.
            </h2>
        {:else}
		    <div class="text-lg font-bold mt-2 text-bleuLBF">Liste des inscriptions</div>
			{#each listeInscrits as inscrit, index}
                <div class="w-full flex flex-row justify-start mb-4">
                    <div class="flex flex-col sm:flex-row flex-wrap ">
                        <div class="flex flex-col sm:mr-2">
                            <div class="ml-1 text-xs m-0 p-0 font-medium text-bleuLBF">Prénom</div>
                            <input on:input={validationSave} class="mr-2 px-1 h-10 bg-white focus:outline-none focus:bg-white focus:border-lbfbleu-600 border-2 border-lbfbleu-400 rounded-lg block appearance-none leading-normal"
                                type="text" placeholder="prenom" bind:value={inscrit.prenom}/>
                        </div>
                    </div>
                    {#if listeInscrits.length > 1}
                        <div class="my-auto sm:w-12 w-20">
                            <svg on:click={() => retirerInscrit(index)} class="mx-auto cursor-pointer mt-3 h-12 w-12 sm:h-8 sm:w-8 stroke-current text-lbfbleu-600" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" data-prefix="far" data-icon="trash-alt" viewBox="0 0 448 512">
                                <path fill="currentColor" d="M268 416h24a12 12 0 0012-12V188a12 12 0 00-12-12h-24a12 12 0 00-12 12v216a12 12 0 0012 12zM432 80h-82.41l-34-56.7A48 48 0 00274.41 0H173.59a48 48 0 00-41.16 23.3L98.41 80H16A16 16 0 000 96v16a16 16 0 0016 16h16v336a48 48 0 0048 48h288a48 48 0 0048-48V128h16a16 16 0 0016-16V96a16 16 0 00-16-16zM171.84 50.91A6 6 0 01177 48h94a6 6 0 015.15 2.91L293.61 80H154.39zM368 464H80V128h288zm-212-48h24a12 12 0 0012-12V188a12 12 0 00-12-12h-24a12 12 0 00-12 12v216a12 12 0 0012 12z"/>
                            </svg>
                        </div>
                    {/if}
                </div>
			{/each}
            <div bind:this={modal}>
			{#each nouveauxInscrits as nouvelInscrit, index ('nI' + index)}
				<div class="w-full flex flex-col justify-start">
                    <div class="flex flex-row justify-end">
                        <div class="flex flex-col sm:flex-row">
                            <div class="flex flex-col">
                                <div class="ml-1 text-xs m-0 p-0 font-medium text-bleuLBF">Prénom</div>
                                <input on:input={validationSave} class="mr-2 px-1 h-10 bg-white focus:outline-none focus:bg-white focus:border-lbfbleu-600 border-2 border-lbfbleu-400 rounded-lg block appearance-none leading-normal"
                                    type="text" placeholder="prenom" bind:value={nouvelInscrit.prenom}/>
                            </div>
                        </div>
                        <div class="my-auto">
                            <svg on:click={soustraitInscrit(index)} class="mx-auto cursor-pointer mt-3 h-12 w-12 md:h-8 md:w-8 stroke-current text-rougeLBF" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" data-prefix="far" data-icon="trash-alt" viewBox="0 0 448 512">
                                <path fill="currentColor" d="M242.72 256l100.07-100.07c12.28-12.28 12.28-32.19 0-44.48l-22.24-22.24c-12.28-12.28-32.19-12.28-44.48 0L176 189.28 75.93 89.21c-12.28-12.28-32.19-12.28-44.48 0L9.21 111.45c-12.28 12.28-12.28 32.19 0 44.48L109.28 256 9.21 356.07c-12.28 12.28-12.28 32.19 0 44.48l22.24 22.24c12.28 12.28 32.2 12.28 44.48 0L176 322.72l100.07 100.07c12.28 12.28 32.2 12.28 44.48 0l22.24-22.24c12.28-12.28 12.28-32.19 0-44.48L242.72 256z"/>
                            </svg>
                        </div>
                    </div>
                    {#if nouvelInscrit.prenom===""}
                        <div class="text-sm font-medium text-rougeLBF ">Le prénom est requis.</div>
                    {:else}
                        <div class="text-sm font-medium text-rougeLBF ">&nbsp;</div>
                    {/if}
				</div>
			{/each}
            </div>
            {#if (nbPlaces-nouveauxInscrits.length) === 0}
                <div class="text-sm sm:text-xs md:text-sm font-medium text-rougeLBF ">Cet atelier ne peut accepter plus de participants.</div>
            {/if}
            <div>
                {#if (nbPlaces-nouveauxInscrits.length) > 0}
                    <button on:click={ajoutInscrit} class="mt-1 mx-1 px-1 border-2 border-vertLBF rounded text-base font-medium text-vertLBF">
                        Ajouter un participant
                    </button>
                {/if}
                {#if listeInscrits.length > 0}
                    <button on:click={() => flagVerifDesinscription = true} class="mt-1 mx-1 px-1 border-2 border-orangeLBF rounded text-base font-medium text-orangeLBF">
                        Se désinscrire
                    </button>
                {/if}
                {#if flagSaveValide}
                <button on:click={insertInscrits}  class="mt-1 mx-1 px-1 border-2 border-bleuLBF rounded text-base font-medium text-bleuLBF">
                    Enregistrer
                </button>
                {/if}
            </div>
		{/if}
	</div>
</div>
{/if}
{#if flagVerifDesinscription}
    <mon-modal has_bouton_bleu="true" bouton_bleu_busy={busyEffacerInscription} on:close={close} on:boutonBleu={effacerInscription}>
        <span slot="titre">Confirmation</span>
            Merci de confirmer votre désinscription.
        <span slot="boutonBleu">Confirmer</span>
        <span slot="boutonDefaut">Annuler</span>
    </mon-modal>
{/if}
{#if flagVerifEffacer}
    <mon-modal has_bouton_bleu="true" bouton_bleu_busy={busyEffacerInscrit} on:close={close} on:boutonBleu={effacerInscrit}>
        <span slot="titre">Confirmation</span>
            Merci de confirmer la désinscription de {desinscrit.prenom}
        <span slot="boutonBleu">Confirmer</span>
        <span slot="boutonDefaut">Annuler</span>
    </mon-modal>
{/if}
{#if confirmeDesinscription}
    <mon-modal on:close={retourAccueil} on:boutonBleu={retourAccueil}>
        <span slot="titre">Votre desinscription</span>
            Votre désinscription a bien été enregistrée. 
        <span slot="boutonBleu">OK</span>
    </mon-modal>
{/if}
{#if confirmeDesinscrit}
    <mon-modal on:close={close} on:boutonBleu={effacerInscrit}>
        <span slot="titre">Desinscription</span>
           {desinscrit.prenom} est bien désinscrit.
        <span slot="boutonBleu">Confirmer</span>
    </mon-modal>
{/if}
{#if confirmeInscription}
    <mon-modal on:close={close} on:boutonBleu={effacerInscrit}>
        <span slot="titre">Votre inscription</span>
        <span class="text-justify">
            Votre inscription a bien été enregistrée. Vous allez recevoir un mail de confirmation qui contient un lien vous permettant éventuellement de vous désinscrire.<br />
            Si vous ne l'avez pas reçu dans les prochaines minutes, il y a pu avoir un problème de notre serveur ou une erreur dans l'adresse enregistrée. Cela ne compromet pas votre inscription, mais nous serons dans l'impossibilité de vous contacter si besoin.
        </span>
        <span slot="boutonBleu">Confirmer</span>
    </mon-modal>
{/if}
<slot>
</slot>

<style>
@import "./css/styles.css";
</style>
