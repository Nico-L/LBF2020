<svelte:options tag="une-inscription"/>

<script>
    import { onMount, tick  } from "svelte";
    import Modal from "../components/ModalPerso.svelte";

	export let id_atelier = 'nope';
    /* variables */
    var testModal = false
	var placesRestantes = "Calculs en cours..."
	let showModalInscription = false
	var emailInscription = "bob@bobby.fr"
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
	/*functions*/
	import * as gestionInscriptions from './utils/graphqlInscrits.js'

//récupération nb inscrits au montage
onMount(async () => {
    await tick()
    nbInscrits()
});

    // appels graphql
    async function nbInscrits() {
        nbPlaces = await gestionInscriptions.nbInscrits(id_atelier)
        flagComplet = false
        if (nbPlaces === 0) {
            placesRestantes = "Complet"
            flagComplet = true
            nouveauxInscrits = []
        } else if (nbPlaces === 1) {
            placesRestantes = "Dernière place"
        } else {
            placesRestantes = nbPlaces + " places restantes"
        }
    }

	async function verifInscrits() {
		actionEncours = true
        listeInscrits = await gestionInscriptions.getInscrits(emailInscription, id_atelier)
        if (listeInscrits.length > 0) {nouveauxInscrits = []} else { nouveauxInscrits = [{nom: "", prenom: ""}]}
		actionEncours = false
		flagEmailVerifie = true
	}

	async function insertInscrits() {
		var insertInscriptions = []
		nouveauxInscrits.forEach((inscription) => {
			if (!(inscription.prenom === "" && inscription.nom === "")) insertInscriptions.push({"email": emailInscription, "prenom": inscription.prenom, "nom": inscription.nom, "atelier": id_atelier})
		})
        var insertInscrits = await gestionInscriptions.ajoutInscrits(insertInscriptions)
        nbInscrits()
        close()
	}

	async function effacerInscription() {
        var effacerInscription = await gestionInscriptions.effacerInscription(emailInscription, id_atelier)
        nbInscrits()
        close()
        close()
    }
    
    async function effacerInscrit() {
        actionEncours = true
        var effacerInscritById = await gestionInscriptions.effacerInscritById(desinscrit.id)
        nbInscrits()
        actionEncours = false
        close()
        close()
    }

// gestion table nouveaux inscrits
	function confirmerEffaceInscrit(id, inscrit) {
        flagVerifEffacer = true
        desinscrit = inscrit
        desinscrit.id = id
    }

	function dernierInscrit(index) {
		return (index + 1) === nouveauxInscrits.length
	}

	function ajoutInscrit() {
		if ((nbPlaces - nouveauxInscrits.length)>0) nouveauxInscrits.push({nom: "", prenom: ""})
		nouveauxInscrits = nouveauxInscrits
	}

	function soustraitInscrit(index) {
		nouveauxInscrits.splice(index, 1)
		nouveauxInscrits = nouveauxInscrits
    }
    
    function validationSave() {
        var estValide = true
        if (nouveauxInscrits.length === 0) {estValide = false}
        nouveauxInscrits.forEach((inscrit) => {
            if (inscrit.prenom === "") {estValide = false}
        })
        flagSaveValide = estValide
    }

//modal
	function afficheModal() {
        showModalInscription = true
        //testModal = true
	}

	function close() {
		if (flagVerifEffacer || flagVerifDesinscription) {
            flagVerifEffacer = false
            flagVerifDesinscription = false
        } else {
        showModalInscription = false; flagEmailVerifie = false; flagVerifDesinscription = false;
        }
	}

	const handle_keydown = e => {
	  if (e.key === "Escape") {
	    close();
	    return;
	  }
	  if (e.key === "Tab") {
	    // trap focus
	    const nodes = modal.querySelectorAll("*");
	    const tabbable = Array.from(nodes).filter(n => n.tabIndex >= 0);
	    let index = tabbable.indexOf(document.activeElement);
	    if (index === -1 && e.shiftKey) index = 0;
	    index += tabbable.length + (e.shiftKey ? -1 : 1);
	    index %= tabbable.length;
	    tabbable[index].focus();
	    e.preventDefault();
	  }
	};
</script>

<svelte:window on:keydown={handle_keydown}/>
<div class="flex flex-row content-center">
	<div class="bg-orangeLBF flex flex-row mr-1 text-white text-sm px-1">
		<div class="my-auto">{placesRestantes}</div>
	</div>
	<div class="bg-orangeLBF flex flex-row content-center rounded-r px-1 cursor-pointer" on:click={afficheModal}>
		<svg class="fill-current text-white my-auto" width="16" height="16" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512">
			<path fill="currentColor" d="M402.6 83.2l90.2 90.2c3.8 3.8 3.8 10 0 13.8L274.4 405.6l-92.8 10.3c-12.4 1.4-22.9-9.1-21.5-21.5l10.3-92.8L388.8 83.2c3.8-3.8 10-3.8 13.8 0zm162-22.9l-48.8-48.8c-15.2-15.2-39.9-15.2-55.2 0l-35.4 35.4c-3.8 3.8-3.8 10 0 13.8l90.2 90.2c3.8 3.8 10 3.8 13.8 0l35.4-35.4c15.2-15.3 15.2-40 0-55.2zM384 346.2V448H64V128h229.8c3.2 0 6.2-1.3 8.5-3.5l40-40c7.6-7.6 2.2-20.5-8.5-20.5H48C21.5 64 0 85.5 0 112v352c0 26.5 21.5 48 48 48h352c26.5 0 48-21.5 48-48V306.2c0-10.7-12.9-16-20.5-8.5l-40 40c-2.2 2.3-3.5 5.3-3.5 8.5z"/>
		</svg>
		<div class="text-white text-sm my-auto">inscriptions</div>
	</div>
</div>
<!-- modal inscription -->
{#if showModalInscription}
<div class="z-100 fixed w-full h-full top-0 left-0 flex items-center justify-center">
	<div class="absolute w-full h-full  bg-black opacity-75 top-0 left-0 cursor-pointer" on:click={close}>
	</div>
	<div class="relative overflow-auto max-h-5/6 w-5/6 sm:w-3/4 lg:w-1/2 bg-white flex flex-col p-4 items-start rounded" role="dialog" aria-modal="true">
		<h2 class="text-xl w-full pb-1 mb-1 border-b-2 border-vertLBF font-bold">
			Votre inscription
		</h2>
		<hr class="mb-1" />
		<div class="mb-1 text-base font-medium text-justify">
			Merci de renseigner votre adresse mail et de cliquer sur vérifier.
		</div>
		<div class="flex content-center flex-wrap w-full justify-around">
			<input on:input={flagEmailVerifie = false} class="w-full sm:w-4/5 mt-2 h-10 bg-white focus:outline-none focus:bg-white focus:border-lbfvert-600 border-2 border-lbfvert-400 rounded-lg px-4 block appearance-none leading-normal"
	 			type="email" placeholder="adresse email" bind:value={emailInscription} />
			{#if actionEncours}
                <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current text-lbfvert-500 h-12 w-12 mx-auto mt-2" viewBox="0 0 50 50">
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
			<button on:click={verifInscrits} class="w-full sm:w-20 mt-2 mx-1 px-2 h-10 border-2 border-vertLBF rounded text-vertLBF font-semibold" type="button">
				Envoyer
			</button>
			{/if}
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
			{#each listeInscrits as inscrit}
			<div class="w-full flex flex-row justify-start mb-4">
				<div class="flex flex-col sm:flex-row flex-wrap ">
					<div class="flex flex-col sm:mr-2">
						<div class="ml-1 text-xs m-0 p-0 font-medium text-bleuLBF">Prénom</div>
						<input class="mr-2 px-1 h-10 bg-white focus:outline-none focus:bg-white focus:border-lbfbleu-600 border-2 border-lbfbleu-400 rounded-lg block appearance-none leading-normal"
							type="text" placeholder="prenom" bind:value={inscrit.prenom}/>
					</div>
					<div class="flex flex-col sm:mr-2">
						<div class="ml-1 text-xs m-0 p-0 font-medium text-bleuLBF">Nom</div>
						<input class="mr-2 px-1 h-10 bg-white focus:outline-none focus:bg-white focus:border-lbfbleu-600 border-2 border-lbfbleu-400 rounded-lg block appearance-none leading-normal"
							type="text" placeholder="nom" bind:value={inscrit.nom}/>
					</div>
				</div>
                {#if listeInscrits.length > 1}
				<div class="my-auto sm:w-12 w-20">
					<svg on:click={confirmerEffaceInscrit(inscrit.id, inscrit)} class="mx-auto cursor-pointer mt-3 h-12 w-12 sm:h-8 sm:w-8 stroke-current text-lbfbleu-600" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" data-prefix="far" data-icon="trash-alt" viewBox="0 0 448 512">
						<path fill="currentColor" d="M268 416h24a12 12 0 0012-12V188a12 12 0 00-12-12h-24a12 12 0 00-12 12v216a12 12 0 0012 12zM432 80h-82.41l-34-56.7A48 48 0 00274.41 0H173.59a48 48 0 00-41.16 23.3L98.41 80H16A16 16 0 000 96v16a16 16 0 0016 16h16v336a48 48 0 0048 48h288a48 48 0 0048-48V128h16a16 16 0 0016-16V96a16 16 0 00-16-16zM171.84 50.91A6 6 0 01177 48h94a6 6 0 015.15 2.91L293.61 80H154.39zM368 464H80V128h288zm-212-48h24a12 12 0 0012-12V188a12 12 0 00-12-12h-24a12 12 0 00-12 12v216a12 12 0 0012 12z"/>
					</svg>
				</div>
                {/if}
			</div>
			{/each}
			{#each nouveauxInscrits as nouvelInscrit, index ('nI' + index)}
				<div class="w-full flex flex-row justify-start mb-4">
					<div class="flex flex-col sm:flex-row flex-wrap ">
						<div class="flex flex-col sm:mr-2">
							<div class="ml-1 text-xs m-0 p-0 font-medium text-bleuLBF">Prénom</div>
							<input on:input={validationSave} class="mr-2 px-1 h-10 bg-white focus:outline-none focus:bg-white focus:border-lbfbleu-600 border-2 border-lbfbleu-400 rounded-lg block appearance-none leading-normal"
								type="text" placeholder="prenom" bind:value={nouvelInscrit.prenom}/>
                            {#if nouvelInscrit.prenom===""}
                                <div class="text-sm sm:text-xs md:text-sm font-medium text-rougeLBF ">Au moins le prénom est requis.</div>
                            {/if}
                        </div>
						<div class="flex flex-col sm:mr-2">
							<div class="ml-1 text-xs m-0 p-0 font-medium text-bleuLBF">Nom</div>
							<input class="mr-2 px-1 h-10 bg-white focus:outline-none focus:bg-white focus:border-lbfbleu-600 border-2 border-lbfbleu-400 rounded-lg block appearance-none leading-normal"
								type="text" placeholder="nom" bind:value={nouvelInscrit.nom}/>
						</div>
					</div>
                    <div class="my-auto sm:w-12 w-20 ">
                        <svg on:click={soustraitInscrit(index)} class="mx-auto cursor-pointer mt-3 h-12 w-12 sm:h-8 sm:w-8 stroke-current text-rougeLBF" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" data-prefix="far" data-icon="trash-alt" viewBox="0 0 448 512">
                            <path fill="currentColor" d="M242.72 256l100.07-100.07c12.28-12.28 12.28-32.19 0-44.48l-22.24-22.24c-12.28-12.28-32.19-12.28-44.48 0L176 189.28 75.93 89.21c-12.28-12.28-32.19-12.28-44.48 0L9.21 111.45c-12.28 12.28-12.28 32.19 0 44.48L109.28 256 9.21 356.07c-12.28 12.28-12.28 32.19 0 44.48l22.24 22.24c12.28 12.28 32.2 12.28 44.48 0L176 322.72l100.07 100.07c12.28 12.28 32.2 12.28 44.48 0l22.24-22.24c12.28-12.28 12.28-32.19 0-44.48L242.72 256z"/>
                        </svg>
                    </div>
				</div>
			{/each}
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
    <mon-modal has_bouton_bleu="true" on:close={close} on:boutonBleu={effacerInscription}>
        <span slot="titre">Confirmation</span>
            Merci de confirmer votre désinscription.
        <span slot="boutonBleu">Confirmer</span>
    </mon-modal>
{/if}
{#if flagVerifEffacer}
    <mon-modal has_bouton_bleu="true" on:close={close} on:boutonBleu={effacerInscrit}>
        <span slot="titre">Confirmation</span>
            Merci de confirmer la désinscription de {desinscrit.prenom}
        <span slot="boutonBleu">Confirmer</span>
    </mon-modal>
<!-- 
	<div class="z-100 fixed w-full h-full top-0 left-0 flex items-center justify-center">
		<div class="absolute w-full h-full  bg-black opacity-75 top-0 left-0 cursor-pointer" on:click={close}></div>
		<div class="relative overflow-auto bg-white flex flex-col p-2 items-start rounded" role="dialog" aria-modal="true">
			<div class="relative overflow-auto bg-white flex flex-col p-2 items-start rounded" role="dialog" aria-modal="true">
                {#if actionEncours}
                    <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current text-lbfvert-500 h-20 w-20 mx-auto my-auto mt-2" viewBox="0 0 50 50">
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
                {:else}
                    <h2 class="text-xl w-full mx-2 pb-1 mb-1 border-b-2 border-vertLBF font-bold">
                        Confirmation
                    </h2>
                    <hr class="mb-1" />
                    <div class="mx-2">Merci de confirmer la désinscription de {desinscrit.prenom}</div>
                    <div class="flex justify-center mt-3 mx-2">
                        <button on:click={close} class="mx-1 px-1 border-2 border-bleuLBF rounded text-base font-medium text-bleuLBF">
                            Annuler
                        </button>
                        <button on:click={effacerInscrit} class="mx-1 px-1 border-2 border-orangeLBF rounded text-base font-medium text-orangeLBF">
                            Confirmer
                        </button>
                    </div>
                {/if}
            </div>
		</div>
	</div>
    -->
{/if}
<slot>
</slot>

<style>
/* purgecss start ignore */
@import "tailwindcss/base";
/* purgecss end ignore */

/* purgecss start ignore */
@import "tailwindcss/components";
/* purgecss end ignore */

@import "tailwindcss/utilities";
</style>
