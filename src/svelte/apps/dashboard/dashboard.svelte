<script>
import {onMount} from "svelte"
import {verifJWT} from "./../../strapi/verifJWT.js"
import {cinqDernieresInscriptions, resaMachines, anonInscriptions, anonReservations, aEffacer} from "./../../strapi/profil.js"
import {imgProxyUrl} from './../../strapi/imgProxy.js'
import {Chart, DoughnutController, ArcElement, Legend, Tooltip} from 'chart.js'
import {tableCouleursLBF} from "./../../utils/couleursLBF.js"
import {dateDebutFin} from "./../../utils/dateFr.js"
import Bouton from "./../../components/bouton.svelte"
import Modal from "../../components/ModalComp.svelte";

Chart.register(DoughnutController, ArcElement, Legend, Tooltip)

var flagIsLoggedIn = false
var donneesUtilisateur = {}
const urlDashboard = window.location;
var dernieresInscriptions = []
var prochainesResaMachines = []
var flagRecupAtelier = false
var flagResaMachineOK = false
var dureeTotalUtilisationMachines = 0
var dureeTotalUtilisationMachinesString = ""
var busyAnonInscriptions = false
var OKAnonInscriptions = false
var busyAnonReservations = false
var OKAnonReservations = false
var busyCompteAEffacer = false
var doitEtreEfface = false
let tempsRestantAvantEffacement
var dateEffacement = new Date()
var now = new Date()
var texteBoutonEffacer = ""

let canvasElement;
let chart;
let ctx;
var dataChart = {}
var chartDefini = false
var flagVerifAnomInscription = false
var flagVerifAnomReservations = false

const optionsImg = {
        'resizing_type': 'fill',
        'width': 30,
        'height': 30,
        'gravity': 'ce'
    }

$: {
    if (canvasElement!==undefined && !chartDefini) {
        ctx = canvasElement.getContext('2d');
        chart = new Chart(ctx, dataChart)
        chartDefini = true
    }
}

$: {
    const heures = Math.floor(dureeTotalUtilisationMachines)
    const minutes = (dureeTotalUtilisationMachines - heures) * 60
    const minutesString = minutes===0?"00":"30"
    dureeTotalUtilisationMachinesString = heures.toString() + "h" + minutesString
}

$: {
    if (doitEtreEfface) {
        texteBoutonEffacer = "J'ai changé d'avis"
    } else {
        texteBoutonEffacer = "Effacer mon compte"
    }
}

$: {
    var lesSecondes = Math.floor((dateEffacement.getTime()-now.getTime())/1000)
    var lesJours = Math.floor(lesSecondes/3600/24)
    var lesHeures = Math.floor((lesSecondes - lesJours*24*3600)/3600)
    var lesMinutes = Math.floor((lesSecondes - lesJours * 24 * 3600 - lesHeures * 3600)/60)
    var lesSecondesRestantes = lesSecondes - lesJours * 24 * 3600 - lesHeures * 3600 - lesMinutes * 60 
    tempsRestantAvantEffacement = lesJours.toString() + " jours, " + lesHeures.toString() + " heures, " + lesMinutes + " minutes et " + lesSecondesRestantes + " secondes"
}

onMount(() => {
    const interval = setInterval(() => {
			now = new Date();
		}, 1000);
    if (localStorage.getItem("userStrapi")===null) {
        flagIsLoggedIn = false
        window.location.replace(window.location.origin + '/login/?' + urlDashboard.pathname + urlDashboard.search)
    } else {
        donneesUtilisateur = JSON.parse(localStorage.getItem("userStrapi"))
        doitEtreEfface = donneesUtilisateur.user.doitEtreEfface
        dateEffacement = new Date(donneesUtilisateur.user.dateEffacement)
        const aujourdhui = new Date()
        const dateAbonnement = new Date(donneesUtilisateur.user.abonnementMachine)
        donneesUtilisateur.user.abonnementValide = aujourdhui < dateAbonnement
        verifJWT(donneesUtilisateur.jwt, urlDashboard.pathname + urlDashboard.search).then((token) => {
            flagIsLoggedIn = true
            recupDernieresInscriptions(donneesUtilisateur.user.id, token)
            recupResaMachine(donneesUtilisateur.user.id, token)
        })
    }
    return () => {
			clearInterval(interval);
		};
})

function redirectIndex(uuid, atelier, email) {
    window.location.replace(
        window.location.origin + "/?uuidInscription=" + uuid + "&email=" + email + "&idAtelier=" + atelier + "&redirect=dashboard"
        )
}

function redirectResaMachine(uuid) {
    window.location.replace(
        window.location.origin + "/reservations?uuidReservation=" + uuid + "&redirect=dashboard"
        )
}

function recupDernieresInscriptions(id, token) {
    cinqDernieresInscriptions(id, token).then((retour) => {
        dernieresInscriptions = []
        retour.forEach((inscription) => {
            if (dernieresInscriptions.length === 0) {
                dernieresInscriptions = [
                    {
                    uuid: inscription.uuid,
                    titreAtelier: inscription.atelier.titre,
                    idAtelier: inscription.atelier.id,
                    urlImage: inscription.atelier.urlImage,
                    inscrits: [{nom: inscription.nom, prenom: inscription.prenom}],
                    user: inscription.user.id,
                    email: inscription.email
                    }
                ]
            } else {
                dernieresInscriptions.forEach((inscriptionVerif) => {
                    if (inscription.uuid === inscriptionVerif.uuid) {
                        inscriptionVerif.inscrits.push({nom: inscription.nom, prenom: inscription.prenom})
                    } else {
                        dernieresInscriptions.push(
                            {
                            uuid: inscription.uuid,
                            titreAtelier: inscription.atelier.titre,
                            idAtelier: inscription.atelier.id,
                            urlImage: inscription.atelier.urlImage,
                            inscrits: [{nom: inscription.nom, prenom: inscription.prenom}],
                            user: inscription.user.id,
                            email: inscription.email
                            }
                        )
                    } 
                })
            }
        })
        dernieresInscriptions = dernieresInscriptions
        flagRecupAtelier = false
    })
}

function recupResaMachine(id, token) {
    resaMachines(id, token).then((retour) => {
        console.log('retour resaMachine', retour)
        const maintenant = new Date()
        flagResaMachineOK = true
        lesMachines.forEach((machine) => {
            machine.duree = 0
        })
        retour.forEach((resa) => {
            var dateResa = new Date(resa.date)
            const horaireDebut = resa.heuredebut.split(':')
            dateResa.setHours(horaireDebut[0])
            dateResa.setMinutes(horaireDebut[1])
            if (maintenant < dateResa) {
                prochainesResaMachines.push(resa)
            }
            lesMachines[resa.machine.id].duree += resa.dureeReservation
        })
        dataChart= {
            type: 'doughnut',
            data: {
                labels: [
                ],
                datasets: [{
                    label: 'Durée d\'utilisation machine',
                    data: [],
                    backgroundColor: [
                    ],
                    hoverOffset: 4
                }]
            },
            options: {
                legend: {
                    display: true,
                    position: "top"
                }
            }
        }
        if (chartDefini) {
            chart.data.datasets = []
            chart.data.labels = []
            chart.update();
                }
        dureeTotalUtilisationMachines = 0
        lesMachines.forEach((machine) => {
            if (machine.duree > 0) {
                dureeTotalUtilisationMachines += machine.duree
                dataChart.data.labels.push(machine.nom)
                dataChart.data.datasets[0].data.push(machine.duree)
                dataChart.data.datasets[0].backgroundColor.push(tableCouleursLBF[machine.couleur].numCouleur)
            }
        })
        if (chartDefini) {
            chart.data.datasets = dataChart.data.datasets
            chart.update()
        }
    })
}

function anonymiserInscriptions() {
    busyAnonInscriptions = true
    OKAnonInscriptions = false
    anonInscriptions(donneesUtilisateur.user.id, donneesUtilisateur.jwt).then((retour) => {
        flagVerifAnomInscription = false
        busyAnonInscriptions = false
        OKAnonInscriptions = true
    })
}

function anonymiserReservations() {
    busyAnonReservations = true
    OKAnonReservations = false
    anonReservations(donneesUtilisateur.user.id, donneesUtilisateur.jwt).then((retour) => {
        busyAnonReservations = false
        OKAnonReservations = true
        flagVerifAnomReservations = false
        recupResaMachine(donneesUtilisateur.user.id, donneesUtilisateur.jwt)
    })
}

function compteAEffacer() {
    busyCompteAEffacer = true
    doitEtreEfface = !doitEtreEfface
    var body = {}
    if (doitEtreEfface) {
        var dateLimite = new Date()
        dateLimite.setDate(dateLimite.getDate() + 7);
        body= {doitEtreEfface: doitEtreEfface, dateEffacement: dateLimite}
        dateEffacement = dateLimite
    } else {
        body= {doitEtreEfface: doitEtreEfface}
    }
    aEffacer(donneesUtilisateur.user.id, donneesUtilisateur.jwt, body).then((retour) => {
        busyCompteAEffacer = false
        donneesUtilisateur.user.doitEtreEfface = doitEtreEfface
        donneesUtilisateur.user.dateEffacement = dateEffacement
        localStorage.setItem('userStrapi', JSON.stringify(donneesUtilisateur))
    })
}
</script>

{#if flagIsLoggedIn}
    <main class="max-w-3xl p-2">
        <h1 class="text-3xl mb-2 text-center">{title}</h1>
        {#if !doitEtreEfface}
            <div class="lg:grid lg:grid-cols-2 gap-2 lg:grid-flow-col-dense">
                {#if !flagRecupAtelier}
                    <div class="mx-auto w-5/6 md:w-full lg:col-span-auto border-2 border-lbforange-400 p-2 rounded flex flex-col my-1">
                        <div class="text-lg text-lbforange-800 font-bold ">Vos ateliers à venir</div>
                        {#if dernieresInscriptions.length > 0}
                            {#each dernieresInscriptions as inscription}
                                <div class="flex justify-start items-start mb-1 hover:bg-lbforange-100 p-1 rounded hover:cursor-pointer" on:click={() => {redirectIndex(inscription.uuid, inscription.idAtelier, inscription.email)}}>
                                    <div class="w-12">
                                        {#await imgProxyUrl(inscription.urlImage, optionsImg)}
                                            <img src = "../images/logos/logoHexagoneSeul.svg" height=40 width=40 class="rounded" alt="illustration atelier" />
                                        {:then value}
                                            <img src = "{value.imgProxyUrl}" height=40 width=40 class="rounded" alt="illustration atelier" />
                                        {/await}
                                    </div>
                                    <div class="ml-1 text-left text-sm">
                                        {inscription.titreAtelier}
                                    </div>
                                    <!-- <div class="ml-2 w-6 text-lbforange-800">
                                        <svg aria-hidden="true" data-prefix="fas" data-icon="edit" class="fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512">
                                            <path fill="currentColor" d="M402.6 83.2l90.2 90.2c3.8 3.8 3.8 10 0 13.8L274.4 405.6l-92.8 10.3c-12.4 1.4-22.9-9.1-21.5-21.5l10.3-92.8L388.8 83.2c3.8-3.8 10-3.8 13.8 0zm162-22.9l-48.8-48.8c-15.2-15.2-39.9-15.2-55.2 0l-35.4 35.4c-3.8 3.8-3.8 10 0 13.8l90.2 90.2c3.8 3.8 10 3.8 13.8 0l35.4-35.4c15.2-15.3 15.2-40 0-55.2zM384 346.2V448H64V128h229.8c3.2 0 6.2-1.3 8.5-3.5l40-40c7.6-7.6 2.2-20.5-8.5-20.5H48C21.5 64 0 85.5 0 112v352c0 26.5 21.5 48 48 48h352c26.5 0 48-21.5 48-48V306.2c0-10.7-12.9-16-20.5-8.5l-40 40c-2.2 2.3-3.5 5.3-3.5 8.5z"/>
                                        </svg>
                                    </div> -->
                                </div>
                            {/each}
                        {:else}
                            <div class="ml-1 text-left text-sm">
                                Aucun atelier à venir
                            </div>
                        {/if}
                    </div>
                {:else}
                    <div  class="mb-1 text-sm">Récupération des données en cours...</div>
                {/if}
                <div class="mx-auto  w-5/6 md:w-full lg:col-span-auto border-2 border-lbfvert-400 p-2 rounded flex flex-col my-1">
                    <div class="text-lg text-lbfvert-600 font-bold ">Prochaines réservations machine</div>
                    {#if flagResaMachineOK}
                        {#if prochainesResaMachines.length > 0}
                            {#each prochainesResaMachines as resa}
                                <div class="flex flex-row hover:bg-lbfvert-100 p-1 rounded hover:cursor-pointer" on:click={() => {redirectResaMachine(resa.uuid)}}>
                                    <div class={"ml-2 w-6 " + tableCouleursLBF[resa.machine.couleur].classText}>
                                        <svg aria-hidden="true" data-prefix="fas" data-icon="edit" class="fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512">
                                            <path fill="currentColor" d="M402.6 83.2l90.2 90.2c3.8 3.8 3.8 10 0 13.8L274.4 405.6l-92.8 10.3c-12.4 1.4-22.9-9.1-21.5-21.5l10.3-92.8L388.8 83.2c3.8-3.8 10-3.8 13.8 0zm162-22.9l-48.8-48.8c-15.2-15.2-39.9-15.2-55.2 0l-35.4 35.4c-3.8 3.8-3.8 10 0 13.8l90.2 90.2c3.8 3.8 10 3.8 13.8 0l35.4-35.4c15.2-15.3 15.2-40 0-55.2zM384 346.2V448H64V128h229.8c3.2 0 6.2-1.3 8.5-3.5l40-40c7.6-7.6 2.2-20.5-8.5-20.5H48C21.5 64 0 85.5 0 112v352c0 26.5 21.5 48 48 48h352c26.5 0 48-21.5 48-48V306.2c0-10.7-12.9-16-20.5-8.5l-40 40c-2.2 2.3-3.5 5.3-3.5 8.5z"/>
                                        </svg>
                                    </div>
                                    <div class="ml-1">
                                        <div class="text-sm">{dateDebutFin(resa.date, resa.heuredebut, resa.heurefin)}</div>
                                        <div class={"mb-1 ml-2 text-sm font-semibold " + tableCouleursLBF[resa.machine.couleur].classText}> {resa.machine.nom}</div>
                                    </div>
                                </div>
                            {/each}
                        {:else}
                            <div class="mb-1 text-sm">Pas de réservation en cours...</div>
                        {/if}
                    {:else}
                        <div  class="mb-1 text-sm">Récupération des données en cours...</div>
                    {/if}
                </div>
                {#if dureeTotalUtilisationMachines > 0}
                    <div class="w-4/6 mx-auto lg:w-full lg:row-span-2 border-2 border-lbfbleu-400 p-2 rounded flex flex-col my-1">
                        <div class="text-lg text-lbfbleu-600 font-bold ">Utilisation des machines</div>
                        {#if flagResaMachineOK}
                            <div class="mb-1 text-sm">Durée totale d'utilisation des machines : {dureeTotalUtilisationMachinesString}</div>
                            <canvas bind:this={canvasElement}></canvas>
                        {:else}
                            <div  class="mb-1 text-sm">Récupération des données en cours...</div>
                        {/if}
                    </div>
                {/if}
            </div>
        {/if}
        <div class="mx-auto w-5/6 md:w-full border-2 border-lbfrouge-400 p-2 rounded flex flex-col my-1">
            <div class="text-lg text-lbfrouge-600 font-bold ">RGPD</div>
            <div  class="mb-1 text-sm text-justify">
                Pour le fonctionnement des inscriptions à nos différentes activités, nous enregistrons quelques informations vous concernant :
                <ul class="list-disc list-inside">
                    <li class="ml-4">En vous inscrivant sur notre site, nous vous demandons un nom d'utilisateur et une adresse email qui sont stockés dans notre base d'utilisateurs.</li>
                    <li class="ml-4">Seuls les prénoms sont demandés lors de vos inscriptions à nos ateliers ou réservation de nos machines. Un lien est fait entre votre inscription et votre compte sur ce site.</li>
                </ul>
                Vous avez la possibilité ci-dessous n'anonymiser vos données dans notre base. Cela consiste à remplacer le lien vers votre compte par un lien vers un compte générique. Vous pouvez également effacer votre compte de notre base.
                {#if doitEtreEfface}
                    <div class="text-sm font-medium text-lbfrouge-800 my-1">Vous avez demandé à effacer votre compte. Nous avons bloqué la possibilité de vous inscrire à un atelier ou de réserver une machine.
                    Vous pouvez modifier votre choix, il vous reste {tempsRestantAvantEffacement} pour changer d'avis.</div>
                {/if}      
            </div>
            <div class="text-right md:grid md:grid-cols-3 md:gap-1">
                {#if !doitEtreEfface}
                    <Bouton occupe={busyAnonInscriptions} succes={OKAnonInscriptions} border="border-1" largeur="w-full mt-1 md:h-16 lg:h-10" couleur="text-orangeLBF border-orangeLBF" on:actionBouton={() => {flagVerifAnomInscription = true}}>
                        <div class="mx-auto flex flex-row justify-center">
                            <div class="px-1 self-center">Anonymiser vos inscriptions</div>
                        </div>
                    </Bouton>
                    <Bouton occupe={busyAnonReservations} succes={OKAnonReservations} border="border-1" largeur="w-full mt-1 md:h-16 lg:h-10" couleur="text-vertLBF border-vertLBF" on:actionBouton={() => {flagVerifAnomReservations = true}}>
                        <div class="mx-auto flex flex-row justify-center">
                            <div class="px-1 self-center">Anonymiser vos réservations</div>
                        </div>
                    </Bouton>
                {/if}
                <Bouton occupe={busyCompteAEffacer} border="border-1" largeur="w-full mt-1 md:h-16 lg:h-10" couleur="text-rougeLBF border-rougeLBF" on:actionBouton={() => {compteAEffacer()}}>
                    <div class="mx-auto flex flex-row justify-center">
                        <div class="px-1 self-center">{texteBoutonEffacer}</div>
                    </div>
                </Bouton>
            </div>
        </div>
    </main>
    {#if flagVerifAnomInscription}
        <Modal has_bouton_bleu="true" bouton_bleu_busy={busyAnonInscriptions} on:close={() => flagVerifAnomInscription = false} on:boutonBleu={() => anonymiserInscriptions()}>
            <span slot="titre">Confirmation</span>
                Vous êtes sur le point d'effacer toutes vos inscriptions passées. <span class="text-lbfrouge-800 font-medium">Cette action est irréversible !</span> Merci de confimer ci-dessous.
            <span slot="boutonBleu">Confirmer</span>
            <span slot="boutonDefaut">Annuler</span>
        </Modal>
    {/if}
    {#if flagVerifAnomReservations}
        <Modal has_bouton_bleu="true" bouton_bleu_busy={busyAnonReservations} on:close={() => flagVerifAnomReservations = false} on:boutonBleu={() => anonymiserReservations()}>
            <span slot="titre">Confirmation</span>
                Vous êtes sur le point d'effacer toutes vos réservations de machines passées. <span class="text-lbfrouge-800 font-medium">Cette action est irréversible !</span> Merci de confimer ci-dessous.
            <span slot="boutonBleu">Confirmer</span>
            <span slot="boutonDefaut">Annuler</span>
        </Modal>
    {/if}
{/if}