<script>
import {onMount} from 'svelte';
import Datepicker from '../components/calendar/Datepicker.svelte'
import { getJourSemaine, horaireFr, dateFr} from '../utils/dateFr.js'
import RadioBouton from '../components/radioButtons.svelte'
import Checkbox from '../components/Checkbox.svelte'
import Fa from 'svelte-fa'
import { faCheck, faTimes } from '@fortawesome/free-solid-svg-icons'

import {tableCouleursLBF} from '../utils/couleursLBF.js'
/* import requêtes */
import {userData} from '../apollo/user.js'
import {listePlagesHoraires, listeReservationsByDate,} from '../apollo/reservations.js'


var userInfo = { nom: "", prenom: "", email: "" };
var mailValide = false
var donneesUtilisateur = {}
var estAbonne = false
var nouvelleReservation = {machine:"", creneaux:[]}
var plagesReservations = []
var afficheCalendar = false
const  dateFormat = "#{l} #{j} #{F} #{Y}"
const aujourdhui = new Date()
var dateFinCalendrier = new Date()
var dateChoisie = new Date()
var dateChoisiePourRequete = dateChoisie
var listeReservations = []
var listeReservationsFiltreMachine = []
var creneauxDuJour = []
var choixHoraire = {debut: "", fin: "", choixOK: false, duree: 0}
var intervalCreneau = 1

const tzoffset = (new Date()).getTimezoneOffset() * 60000; //offset in milliseconds
dateFinCalendrier.setMonth(dateFinCalendrier.getMonth()+24)

onMount(() => {
    /* if (localStorage["userInfo"]) {
        userInfo = JSON.parse(localStorage.getItem("userInfo"));
        saveInfo = true;
    } */
    listePlagesHoraires().then((retour) => {
        plagesReservations[0] = retour.dimanche
        plagesReservations[1] = retour.lundi
        plagesReservations[2] = retour.mardi
        plagesReservations[3] = retour.mercredi
        plagesReservations[4] = retour.jeudi
        plagesReservations[5] = retour.vendredi
        plagesReservations[6] = retour.samedi
        afficheCalendar = true
    })
})

$: {
    var extracted = /([a-zA-Z0-9+._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/i.exec(userInfo.email)
    mailValide = extracted!==null
    if (extracted!==null) {
        userData(userInfo.email).then((retour) => {donneesUtilisateur=retour})
    }
}

$: {
    let zeDate = new Date(dateChoisie - tzoffset)
    dateChoisiePourRequete = zeDate.toISOString().slice(0,10)
    listeReservationsByDate(dateChoisiePourRequete).then((retour)=> {
        listeReservations = retour
    })
    constructionCreneaux(zeDate);
}

/*
recupération des créneaux déjà réservé
*/
$: {
    listeReservationsFiltreMachine = listeReservations.filter((resa) => {
        return resa.machine.tag === nouvelleReservation.machine
        })
    let zeDate = new Date(dateChoisie - tzoffset)
    constructionCreneaux(zeDate);
}

/*
Gestion de la sélection des créneaux horaires
*/
$: {
    creneauxDuJour.forEach((lesCreneaux)=> {
        let listeChecked = []
        let indexMinReserve = 0 // max de l'index du créneau réservé inférieur au premier choix
        let indexMaxReserve = 1000 // min de l'index du créneau réservé supérieur au premier choix
        let flagDisabled = false
        lesCreneaux.creneaux.forEach((leCreneau, index) => {
            if (leCreneau.checked) {
                listeChecked.push({"debut": leCreneau.debut, "fin": leCreneau.fin, "index": index})
            }
            if (listeChecked.length > 0 && leCreneau.estReserve) {
                if (index < listeChecked[0].index && index > indexMinReserve) indexMinReserve = index
                if (index > listeChecked[0].index && index < indexMaxReserve) indexMaxReserve = index
            }
        })
        if (listeChecked.length > 0) {
            lesCreneaux.creneaux.forEach((leCreneau, index) => {
                if (leCreneau.estReserve) {
                    if (index < listeChecked[0].index && index > indexMinReserve) indexMinReserve = index
                    if (index > listeChecked[0].index && index < indexMaxReserve) indexMaxReserve = index
                }
            })
        }
        if (listeChecked.length === 0) {
            flagDisabled = false
            choixHoraire.debut = ""
            choixHoraire.fin = ""
            choixHoraire.choixOK = false
        } else {
            choixHoraire.debut = listeChecked[0].debut
            choixHoraire.fin = listeChecked[listeChecked.length-1].fin
            verifChoix()
            lesCreneaux.creneaux.forEach((leCreneau, index) => {
                if (index < indexMinReserve || index > indexMaxReserve) {
                    flagDisabled = true
                    leCreneau.disabled = true
                } else {
                    if (!leCreneau.checked && !leCreneau.estReserve) leCreneau.disabled = false
                }
            })
        }
        let premier = true
        lesCreneaux.creneaux.forEach((leCreneau, index) => {
            if (leCreneau.checked) {
                leCreneau.class="text-bleuLBF"
            } else {
                if (!leCreneau.estReserve && !flagDisabled) {leCreneau.disabled = false}
                leCreneau.class="text-gray-800"
            }
        })
    })
}

function constructionCreneaux(date) {
    let zeDate = new Date(date)
    if (plagesReservations[zeDate.getDay()]) {
        plagesReservations[zeDate.getDay()].forEach((plage, index)=> {
            let horaireDebutSplit = plage.debut.split(':')
            let horaireFinSplit = plage.fin.split(':')
            let lesCreneaux = horaireFinSplit[0] - horaireDebutSplit[0] + (Number(horaireFinSplit[1]) -Number(horaireDebutSplit[1]))/60
            creneauxDuJour[index]={"creneaux": []}
            let estReserve = false
            for (let j = 0; j <= lesCreneaux; j += 0.5) {
                let h = []
                let label = ""
                if (j===0) {
                    estReserve = verifReserve(plage.debut)
                    h = plage.debut.split(':')
                    if (h[1]==="30") {
                        h[0] = Number(h[0]) + 1
                        h[1] = "00"
                    } else {h[1]="30"}
                    label = horaireFr(plage.debut) + "-" + horaireFr(h.join(':'))
                    creneauxDuJour[index].creneaux.push({
                        "debut": plage.debut,
                        "fin": h.join(':'),
                        "label": label,
                        "checked": false,
                        "disabled": estReserve,
                        "estReserve": estReserve,
                        "class":"text-gray-800"
                    })
                } else {
                    h = creneauxDuJour[index].creneaux[2*j-1].fin.split(':')
                    if (h[1]==="30") {
                        h[0] = Number(h[0]) + 1
                        h[1] = "00"
                    } else {h[1]="30"}
                    label = horaireFr(creneauxDuJour[index].creneaux[2*j-1].fin) + "-" + horaireFr(h.join(':'))
                    estReserve = verifReserve(h.join(':'))
                    creneauxDuJour[index].creneaux.push({
                        "debut": creneauxDuJour[index].creneaux[2*j-1].fin,
                        "fin": h.join(':'),
                        "label": label,
                        "checked": false,
                        "disabled": estReserve,
                        "estReserve": estReserve,
                        "class": "text-gray-800"
                    })
                }
            }
        })
    }
}

function creneauDispo(date) {
    return plagesReservations[getJourSemaine(date)].length>0
}

function verifChoix() {
    let heureDebut = choixHoraire.debut.split(':')
    let heureFin = choixHoraire.fin.split(':')
    choixHoraire.duree = 60 * (Number(heureFin[0]) - Number(heureDebut[0])) + Number(heureFin[1]) - Number(heureDebut[1])
    if (choixHoraire.duree > (intervalCreneau * 30)) {choixHoraire.choixOK = true} else {choixHoraire.choixOK = false}
}

function verifReserve(heure) {
    let heureSplit = heure.split(':')
    let retour = false
    listeReservationsFiltreMachine.forEach((resa) => {
        let heureDebutSplit = resa.heureDebut.split(":")
        let heureFinSplit = resa.heureFin.split(":")
        let dureeReservation = 60 * (Number(heureFinSplit[0]) - Number(heureDebutSplit[0])) + Number(heureFinSplit[1]) - Number(heureDebutSplit[1])
        let dureeToCheck = 60 * (Number(heureSplit[0]) - Number(heureDebutSplit[0])) + Number(heureSplit[1]) - Number(heureDebutSplit[1])      
        if (dureeToCheck >= 0 && dureeToCheck < dureeReservation) {retour = true}
    })
    return retour
}
</script>

<div class="mt-2 mb-2">
    <div class="w-full flex flex-row flex-wrap justify-between">
        <label for="prenomResa" class="w-1/2 px-1 py-1 flex flex-col">
            <div>Prénom :</div>
            <div class="border border-vertLBF rounded p-1">
                <input 
                    bind:value={userInfo.prenom}
                    class="w-full p-1 text-sm bg-gray-300 text-gray-900 rounded focus:outline-none appearance-none leading-normal"
                    type="text"
                    id="prenomResa"
                    />
            </div>
        </label>
        <label for="nomResa" class="w-1/2 px-1 py-1 flex flex-col">
            <div>Nom :</div>
            <div class="border border-vertLBF rounded p-1">
                <input 
                    bind:value={userInfo.nom}
                    class="w-full p-1 text-sm bg-gray-300 text-gray-900 rounded focus:outline-none appearance-none leading-normal"
                    type="text"
                    id="nomResa"
                    />
            </div>
        </label>
    </div>
    <div>
        <label for="emailResa" class="mx-1 my-1 flex flex-col">
            <div>Email (requis) :</div>
            <div class="border border-vertLBF rounded p-1">
                <input 
                    bind:value={userInfo.email}
                    class="w-full p-1 text-sm bg-gray-300 text-gray-900 rounded focus:outline-none appearance-none leading-normal"
                    type="text"
                    id="emailResa"
                    />
            </div>
        </label>
    </div>
    <div>
    <div class="h5 mt-4 mb-1">Machine :</div>
        <div>Votre statut :</div>
        <div class="overflow-x-auto">
            <table class="table-auto border-collapse border-2 border-gray-500 mx-auto">
                <thead>
                    <tr>
                    <th class="px-2 py-1 border border-gray-400 text-gray-800">&nbsp;</th>
                    <th class="px-2 py-1 border border-gray-400 text-gray-800">CNC</th>
                    <th class="px-2 py-1 border border-gray-400 text-gray-800">Laser</th>
                    <th class="px-2 py-1 border border-gray-400 text-gray-800">Scie/Toupie</th>
                    <th class="px-2 py-1 border border-gray-400 text-gray-800">Rabot/dégau</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                    <td class="border px-2 py-1">Initiation</td>
                    <td class="border px-2 py-1">{#if donneesUtilisateur.cnc}<Fa icon={faCheck} size="lg" class="mx-auto text-vertLBF" />{:else}&nbsp;{/if}</td>
                    <td class="border px-2 py-1">{#if donneesUtilisateur.laser}<Fa icon={faCheck} size="lg" class="mx-auto text-vertLBF" />{:else}&nbsp;{/if}</td>
                    <td class="border px-2 py-1">{#if donneesUtilisateur.scie_toupie}<Fa icon={faCheck} size="lg" class="mx-auto text-vertLBF" />{:else}&nbsp;{/if}</td>
                    <td class="border px-2 py-1">{#if donneesUtilisateur.rabo_degau}<Fa icon={faCheck} size="lg" class="mx-auto text-vertLBF" />{:else}&nbsp;{/if}</td>
                    </tr>
                    <tr class="bg-gray-100">
                    <td class="border px-2 py-1">Abonnement valide</td>
                    <td class="border px-2 py-1">&nbsp;</td>
                    <td class="border px-2 py-1">&nbsp;</td>
                    {#if donneesUtilisateur.estAbonne}
                        <td class="border px-2 py-1 text-vertLBF text-center" colspan="2">{donneesUtilisateur.abonnement}</td>

                    {:else}
                        <td class="border px-2 py-1 text-rougeLBF text-center" colspan="2">{donneesUtilisateur.abonnement}</td>
                    {/if}
                    </tr>
                </tbody>
            </table>
        </div>
        
        <div class="text-base mt-2">Vous pouvez réserver les machines suivantes :</div>
        <div class="flex">
            {#if donneesUtilisateur.cnc}
                <RadioBouton label="cnc" cbClasses={tableCouleursLBF['jaune'].classText} name="machineReservation" value="cnc" bind:selected={nouvelleReservation.machine}/>
            {/if}
            {#if donneesUtilisateur.laser}
                <RadioBouton label="laser" cbClasses={tableCouleursLBF['orange'].classText} name="machineReservation" value="laser" bind:selected={nouvelleReservation.machine}/>
            {/if}   
            {#if donneesUtilisateur.estAbonne }
                {#if donneesUtilisateur.scie_toupie}
                    <RadioBouton label="Scie-Toupie"  cbClasses={tableCouleursLBF['bleu'].classText} name="machineReservation" value="scie" bind:selected={nouvelleReservation.machine}/>
                {/if}       
                {#if donneesUtilisateur.rabo_degau}
                    <RadioBouton label="Rabo-Degau" cbClasses={tableCouleursLBF['vert'].classText} name="machineReservation" value="rabo" bind:selected={nouvelleReservation.machine}/>
                {/if}  
            {/if}
            <RadioBouton label="Imprimante 3D" cbClasses={tableCouleursLBF['rouge'].classText} name="machineReservation" value="3D" bind:selected={nouvelleReservation.machine}/>
        </div>
        <div>machine : {nouvelleReservation.machine}</div>
    </div>
    <div>
        <div class="h5 mt-4 mb-1">Date :</div>
        {#if afficheCalendar}
            <div class="flex flex-wrap items-center">
                <div class="flex-auto mb-4">
                    <div class="mx-auto text-center">
                        <Datepicker 
                            start={aujourdhui}
                            end={dateFinCalendrier}
                            bind:selected={dateChoisie}
                            daysOfWeek={dateFr.jours}
                            monthsOfYear={dateFr.mois}
                            format={dateFormat}
                            selectableCallback={creneauDispo}
                        />
                    </div>
                </div>
                <div class="flex-auto mb-4">
                    <div class="h6 text-center lg:text-left mb-1">Prochaines disponibilités</div>
                    <div class="flex flex-row flex-wrap">
                        {#each creneauxDuJour as plage, i}
                            {#each plage.creneaux as creneau, j}
                                <div class="px-2 py-1 mr-2 mb-2 border border-gray-400">
                                    <Checkbox label={creneau.label} bind:checked={creneau.checked} cbClasses={creneau.class} bind:disabled={creneau.disabled} />
                                </div>
                            {/each}
                        {:else}
                            <div>Aucun créneau à cette date</div>
                        {/each}       
                    </div>
                    <div class="text-justify">
                        Cliquez sur l'heure de <span class="text-vertLBF font-medium">début</span> et de <span class="text-bleuLBF font-medium">fin</span> de la réservation que vous souhaitez effectuer. 
                    </div>
                    <div class="text-rougeLBF font-medium">
                        {#if !choixHoraire.choixOK}
                            Une heure minimum requis pour les machines à bois.
                        {:else}
                            &nbsp;
                        {/if}
                    </div>
                    <div class="text-justify">{choixHoraire.debut} & {choixHoraire.fin}</div>
                </div>
            </div>
        {/if}
    </div>
</div>