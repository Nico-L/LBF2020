<script>
import {onMount} from 'svelte';
import Datepicker from '../../components/calendar/Datepicker.svelte'
import { getJourSemaine, horaireFr, dateFr, dateFormatFr, dateMoisAnnee} from '../../utils/dateFr.js'
import RadioBouton from '../../components/radioButtons.svelte'
import Checkbox from '../../components/Checkbox.svelte'
import Fa from 'svelte-fa'
import { faCheck, faTimes } from '@fortawesome/free-solid-svg-icons'
//import Bouton from '../../components/bouton.svelte'
import Modal from "../../components/ModalComp.svelte";
import {tableCouleursLBF} from '../../utils/couleursLBF.js'
/* import requêtes */
import {verifJWT} from '../../strapi/verifJWT.js'
import {listePlagesHoraires, listeReservationsByDate, reserver, getResaByUuid, effacerResa, modifierResa} from '../../strapi/reservationsMachines.js'
import {envoyerEmail} from '../../strapi/email.js'
import {imgProxyUrl} from '../../strapi/imgProxy.js'
import { v4 as uuidv4 } from 'uuid';

var mailValide = false
var donneesUtilisateur = {}
var estInscrit = false
//var estAbonne = false
var resaEstValide = false
let detailChoixMachine
var choixMachine = ""
var plagesReservations = []
var afficheCalendar = false
const dateFormat = "#{l} #{j} #{F} #{Y}"
const aujourdhui = new Date()
const aujourdhuiIso = (new Date()).toISOString().slice(0,10)
var dateDebutCalendrier = new Date()
var dateFinCalendrier = new Date()
var dateChoisie = new Date()
var dateChoisiePourRequete = dateChoisie
var listeReservations = []
var listeReservationsFiltreMachine = []
var creneauxDuJour = []
var choixHoraire = {debut: "", fin: "", choixOK: false, duree: 0}
var intervalCreneau = 0.5
let regexMail
const tzoffset = (new Date()).getTimezoneOffset() * 60000; //offset in milliseconds
let flagVerifEffacer = false
let busyEffacerResa = false
let flagEffacerConfirme = false
let flagVerifModif = false
let flagModifConfirmee = false
let busyModifResa = false
let saveEnCours = false
let flagSaveEffectue = false
let adresseRedirect = ""
let flagResaNotFound = false
let flagTropTardPourModifResa = false
let calculCout = 0
const optionsAvecHeures =
    {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
    };
const optionsImg = {
        'resizing_type': 'fill',
        'width': 290,
        'height': 190,
        'gravity': 'ce'
    }
//let flagRecupUserData = false;
let flagVerifStorage = false
var tempResaEnCours = {}

dateFinCalendrier.setMonth(dateFinCalendrier.getMonth()+24)

  // 
  // recuperation url
  //
  const urlEditResa = window.location;
  let detailResaModif
  var estModification = false

if (localStorage.getItem("userStrapi")!==null) {
    flagVerifStorage = true
    donneesUtilisateur = JSON.parse(localStorage.getItem("userStrapi"))
    if (donneesUtilisateur.user.doitEtreEfface) {
        window.location.assign(window.location.origin + '/dashboard')
    }
    const aujourdhui = new Date()
    const dateAbonnement = new Date(donneesUtilisateur.user.abonnementMachine)
    donneesUtilisateur.user.abonnementValide = aujourdhui < dateAbonnement
    verifJWT(donneesUtilisateur.jwt, urlEditResa.pathname + urlEditResa.search).then((token) => {
        flagVerifStorage = false
    })
} else {
    window.location.assign(window.location.origin + '/login/?' + urlEditResa.pathname + urlEditResa.search)
}

onMount(() => {
    const extracted = /\?uuidReservation=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(&redirect=(.*))?/i.exec(urlEditResa.search)
    if (extracted!==null) {
        if (extracted[3]) {
            adresseRedirect = "../" + extracted[3]
        }
        estModification = true
        getResaByUuid(donneesUtilisateur.jwt,extracted[1]).then((retour) => {
            if (retour.length > 0) {
                const resa = retour[0]
                Object.assign(tempResaEnCours, resa)
                detailResaModif = resa
                dateChoisie = new Date(resa.date)
                choixMachine = resa.machine.id
                let datePourVerif = dateChoisie
                let tempsDebutResa = resa.heureDebut.split(':')
                datePourVerif.setHours(tempsDebutResa[0])
                datePourVerif.setMinutes(tempsDebutResa[1])
                if (datePourVerif < aujourdhui) {
                    flagTropTardPourModifResa = true
                }
            } else {
                flagResaNotFound = true
            }
            //setChecked()
        })
    }

    listePlagesHoraires(donneesUtilisateur.jwt).then((retour) => {
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

/*
recup liste des resa et construction des creneaux
*/
$: {
    let zeDate = new Date(dateChoisie-tzoffset)
    dateChoisiePourRequete = zeDate.toISOString().slice(0,10)
    listeReservationsByDate(donneesUtilisateur.jwt,dateChoisiePourRequete).then((retour)=> {
        listeReservations = retour
    })
    constructionCreneaux(zeDate.toISOString());
}

/*
recupération des créneaux déjà réservé filtré par machine
*/
$: {
    listeReservationsFiltreMachine = listeReservations.filter((resa) => {
        return Number(resa.machine.id) === Number(choixMachine)
        })
    let zeDate = new Date(dateChoisie)
    constructionCreneaux(zeDate.toISOString());
}

$: {
    if (detailChoixMachine.abonnement) {intervalCreneau = 1} else {intervalCreneau = 0.5}
}

/*
Gestion de la sélection des créneaux horaires
*/
$: {
    let plage = -1
    let listeChecked = []
    let indexMinReserve = 0 // max de l'index du créneau réservé inférieur au premier choix
    let indexMaxReserve = 1000 // min de l'index du créneau réservé supérieur au premier choix
    creneauxDuJour.forEach((lesCreneaux, indexPlage)=> {
        lesCreneaux.forEach((leCreneau, index) => {
            if (leCreneau.checked) {
                listeChecked.push({"debut": leCreneau.debut, "fin": leCreneau.fin, "index": index})
                plage = indexPlage
            }
        })
        lesCreneaux.forEach((leCreneau, index) => {
            if (listeChecked.length > 0 && leCreneau.estReserve) {
                if (index < listeChecked[0].index && index > indexMinReserve) indexMinReserve = index
                if (index > listeChecked[0].index && index < indexMaxReserve) indexMaxReserve = index
            }
            if (indexPlage===plage) {leCreneau.plageOK = true}
        })
        if (listeChecked.length === 0) {
            choixHoraire.debut = ""
            choixHoraire.fin = ""
            choixHoraire.choixOK = false
            plage = -1
        } else {
            choixHoraire.debut = listeChecked[0].debut
            choixHoraire.fin = listeChecked[listeChecked.length-1].fin
            //verifChoix()
            lesCreneaux.forEach((leCreneau, index) => {
                if (index < indexMinReserve || index > indexMaxReserve) {
                    leCreneau.disabled = true
                } else {
                    if (!leCreneau.checked && !leCreneau.estReserve) leCreneau.disabled = false
                }
            })
        }
    })
    if (choixHoraire.debut !== "") {
        creneauxDuJour.forEach((lesCreneaux)=> {
            lesCreneaux.forEach((leCreneau) => {
                if (!leCreneau.plageOK) leCreneau.disabled = true
            })
        })
    } else {
        creneauxDuJour.forEach((lesCreneaux)=> {
            lesCreneaux.forEach((leCreneau) => {
                leCreneau.plageOK = false
                if (!leCreneau.estReserve) {
                    leCreneau.disabled = false
                }
            })
        })
    }
}

$: {
    if (choixMachine!=="" && donneesUtilisateur.user.id!=="" && choixHoraire.choixOK) {
        resaEstValide = true
    } else {
        resaEstValide = false
    }
}

$: {
    let idMachine = choixMachine
    detailChoixMachine = {}
    lesMachines.forEach((machine) => {
       if (Number(machine.id) === Number(idMachine)) {
           detailChoixMachine = machine
       }
    })
}

$: {
    let heureDebut = choixHoraire.debut.split(':')
    let heureFin = choixHoraire.fin.split(':')
    choixHoraire.duree = 60 * (Number(heureFin[0]) - Number(heureDebut[0])) + Number(heureFin[1]) - Number(heureDebut[1])
    calculCout = Number(detailChoixMachine.tarifHoraire) * Number(choixHoraire.duree) / 60
    if (choixHoraire.duree >= (intervalCreneau * 60)) {choixHoraire.choixOK = true} else {choixHoraire.choixOK = false}
}

function resetChoixHoraire()
 {
    choixHoraire = {debut: "", fin: "", choixOK: false, duree: 0}
     if (detailResaModif) {
        detailResaModif.heureDebut = ""
        detailResaModif.heureFin = ""
        if (choixMachine === tempResaEnCours.machine.id) {
            detailResaModif.heureDebut = tempResaEnCours.heureDebut
            detailResaModif.heureFin = tempResaEnCours.heureFin
            choixHoraire = {debut: tempResaEnCours.heureDebut, fin: tempResaEnCours.heureFin, choixOK: false, duree: 0}
        }
        let zeDate = new Date(dateChoisie)
        constructionCreneaux(zeDate.toISOString());
     }
 }

function constructionCreneaux(date) {
    let zeDate = new Date(date)
    const minutesActuelles = (new Date()).getHours() * 60 + (new Date()).getMinutes()
    creneauxDuJour=[]
    let estTropTard = false
    if (plagesReservations[zeDate.getDay()]) {
        plagesReservations[zeDate.getDay()].forEach((plage, index)=> {
            let horaireDebutSplit = plage.debut.split(':')
            let horaireFinSplit = plage.fin.split(':')
            let minutesFin = horaireFinSplit[0] * 60 + horaireFinSplit[1] * 1

            if (dateChoisiePourRequete === aujourdhuiIso && minutesActuelles >= minutesFin) {
                estTropTard = true
            }
            let lesCreneaux = horaireFinSplit[0] - horaireDebutSplit[0] - 0.5 + (Number(horaireFinSplit[1]) - Number(horaireDebutSplit[1]))/60
            creneauxDuJour[index]=[]
            let estReserve = false
            let resaEnCours = false
            let resaChecked = false
            let nbMinutesDebutCreneau = 0
            for (let j = 0; j <= lesCreneaux; j += 0.5) {
                let h = []
                let label = ""
                if (j===0) {
                    estReserve = verifReserve(plage.debut)
                    resaEnCours = verifResaEnCours(plage.debut)
                    if (resaEnCours) {estReserve = false}
                    h = plage.debut.split(':')
                    nbMinutesDebutCreneau = h[0] * 60 + h[1] * 1
                    if (h[1]==="30") {
                        h[0] = Number(h[0]) + 1
                        h[1] = "00"
                    } else {h[1]="30"}
                    label = horaireFr(plage.debut) + "-" + horaireFr(h.join(':'))
                    creneauxDuJour[index].push({
                        "debut": plage.debut,
                        "fin": h.join(':'),
                        "label": label,
                        "checked": resaEnCours,
                        "disabled": estReserve,
                        "estReserve": estReserve,
                        "plageOK": false
                    })
                } else {
                    estReserve = verifReserve(creneauxDuJour[index][2*j-1].fin)
                    resaEnCours = verifResaEnCours(creneauxDuJour[index][2*j-1].fin)
                    if (resaEnCours) {estReserve = false}
                    h = creneauxDuJour[index][2*j-1].fin.split(':')
                    nbMinutesDebutCreneau = h[0] * 60 + h[1] * 1
                    if (h[1]==="30") {
                        h[0] = Number(h[0]) + 1
                        h[1] = "00"
                    } else {h[1]="30"}
                    label = horaireFr(creneauxDuJour[index][2*j-1].fin) + "-" + horaireFr(h.join(':'))
                    creneauxDuJour[index].push({
                        "debut": creneauxDuJour[index][2*j-1].fin,
                        "fin": h.join(':'),
                        "label": label,
                        "checked": resaEnCours,
                        "disabled": estReserve,
                        "estReserve": estReserve,
                        "plageOK": false
                    })
                }
            }
        })
    }
    if (estTropTard) {
        let demain = new Date()
        demain.setDate(demain.getDate() + 1);
        dateChoisie = demain
        dateDebutCalendrier = demain
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
    let maintenant = (Number(heureSplit[0])-(new Date()).getHours()) * 60 + Number(heureSplit[1]) - Number((new Date()).getMinutes())
    if (dateChoisiePourRequete === aujourdhuiIso && maintenant < 0) {retour = true}
    return retour
}

function enregistrerReservation() {
    saveEnCours = true
    const variables = {
        heureDebut: choixHoraire.debut,
        heureFin: choixHoraire.fin,
        date: dateChoisiePourRequete,
        user: donneesUtilisateur.user.id.toString(),
        machine: choixMachine.toString(),
        dureeReservation: choixHoraire.duree/60,
        uuid: uuidv4()
    }
    reserver(donneesUtilisateur.jwt,variables).then((retourIdResa) => 
        {
            saveEnCours = false
            flagSaveEffectue = true
            if (adresseRedirect==="") {
                adresseRedirect = "./?uuidReservation=" + retourIdResa.uuid
            }
            mailConfirmation(retourIdResa.uuid)
        }
    )
}

function modifierReservation() {
    busyModifResa = true
    const variables = {
        idReservation: detailResaModif.id.toString(),
        heureDebut: choixHoraire.debut,
        heureFin: choixHoraire.fin,
        date: dateChoisiePourRequete,
        user: donneesUtilisateur.user.id.toString(),
        dureeReservation: choixHoraire.duree/60,
        machine: choixMachine.toString()
    }
    modifierResa(donneesUtilisateur.jwt, detailResaModif.id.toString(), variables).then((retour) => {
        busyModifResa = false
        flagVerifModif = false
        flagModifConfirmee = true
    })
}

function effacerReservation() {
    busyEffacerResa = true
    effacerResa(donneesUtilisateur.jwt, detailResaModif.id.toString()).then((retour) => {
        busyEffacerResa = false
        flagEffacerConfirme = true
    })
}

function getIdMachine(tag) {
    let retour = ""
    lesMachines.forEach((machine) => {
        if (tag === machine.tag) {
            retour = machine.id
        }
    })
    return retour
}

function verifResaEnCours(creneau) {
    if (detailResaModif) {
        let debutResaSplit = detailResaModif.heureDebut.split(':')
        let finResaSplit = detailResaModif.heureFin.split(':')
        let minutesCreneau = creneau.split(':')
        let retour = false
        let dureeDebut = (Number(minutesCreneau[0]) - Number(debutResaSplit[0])) * 60 + Number(minutesCreneau[1]) - Number(debutResaSplit[1])
        let dureeFin = (Number(minutesCreneau[0]) - Number(finResaSplit[0])) * 60 + Number(minutesCreneau[1]) - Number(finResaSplit[1])
        if (dureeDebut >= 0 && dureeFin < 0 && dateChoisiePourRequete === detailResaModif.date) {
            retour = true
        }
    return retour
    }
}

function close() {
    flagVerifEffacer = false
    flagModifConfirmee = false
}

function verifEffacer() {
    flagVerifEffacer = true
}

function retourAccueil() {
    window.location.assign(urlEditResa.origin)
}

function retourResa() {
    let url = urlEditResa.origin + urlEditResa.pathname
    window.location.assign(url)
}

function retourPageModif() {
    if (adresseRedirect==="") {
        window.location.reload(true);
    } else {
        window.location.assign(adresseRedirect)
    }
}

function retourPageResa() {
    window.location.assign(urlEditResa.origin + "/reservations/")
}

function mailConfirmation(uuidResa) {
    let tempDuree = choixHoraire.duree
    console.log('tempsDuree', tempDuree)
    let dureeString = ""
    if (Math.floor(tempDuree / 60) === 0) {
        dureeString = "une demi heure"
    } else {
        dureeString =  Math.floor(tempDuree / 60) + "h"
        dureeString += tempDuree % 60 === 0 ? "00" : tempDuree % 60
    }
    let arrayMails = [];
    arrayMails.push(donneesUtilisateur.user.email);
    let dateDebutResa = new Date(dateChoisie)
    let tempsDebutResa = choixHoraire.debut.split(':')
    dateDebutResa.setHours(tempsDebutResa[0])
    dateDebutResa.setMilliseconds(tempsDebutResa[1])
    imgProxyUrl("https://cms.labonnefabrique.fr" + detailChoixMachine.urlImage, optionsImg).then((urlImage) => {
        let envoiMail = {
            machine: detailChoixMachine.nom,
            duration: dureeString,
            jour: dateDebutResa
                .toLocaleDateString("fr-fr", optionsAvecHeures)
                .replace(":", "h"),
            urlDelete:
                urlEditResa.origin +
                urlEditResa.pathname +
                "?uuidReservation=" +
                uuidResa,
            altMachine: detailChoixMachine.nom,
            urlImageMail: urlImage.imgProxyUrl
        };
        let variables = {
            from: "atelier@labonnefabrique.fr",
            to: arrayMails,
            replyTo: "atelier@labonnefabrique.fr",
            dynamicTemplateData: envoiMail,
            templateId: "d-08bb9e1b96ac4d56a9210660cac6cd07"
        }

        envoyerEmail(variables)
    })
}

</script>

<div class="mt-2 mb-2 mx-4">
    {#if !flagVerifStorage}
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
                    <td class="border px-2 py-1">{#if donneesUtilisateur.user.cnc}<Fa icon={faCheck} size="lg" class="mx-auto text-vertLBF" />{:else}&nbsp;{/if}</td>
                    <td class="border px-2 py-1">{#if donneesUtilisateur.user.laser}<Fa icon={faCheck} size="lg" class="mx-auto text-vertLBF" />{:else}&nbsp;{/if}</td>
                    <td class="border px-2 py-1">{#if donneesUtilisateur.user.scie_toupie}<Fa icon={faCheck} size="lg" class="mx-auto text-vertLBF" />{:else}&nbsp;{/if}</td>
                    <td class="border px-2 py-1">{#if donneesUtilisateur.user.rabo_degau}<Fa icon={faCheck} size="lg" class="mx-auto text-vertLBF" />{:else}&nbsp;{/if}</td>
                    </tr>
                    <tr class="bg-gray-100">
                    <td class="border px-2 py-1">Abonnement valide</td>
                    <td class="border px-2 py-1">&nbsp;</td>
                    <td class="border px-2 py-1">&nbsp;</td>
                    {#if donneesUtilisateur.user.abonnementValide}
                        <td class="border px-2 py-1 text-vertLBF text-center" colspan="2">{dateMoisAnnee(donneesUtilisateur.user.abonnementMachine)}</td>

                    {:else}
                        <td class="border px-2 py-1 text-rougeLBF text-center" colspan="2">abonnement à renouveler</td>
                    {/if}
                    </tr>
                </tbody>
            </table>
        </div>
        
        <div class="text-base mt-2">Vous pouvez réserver les machines suivantes :</div>
        <div class="flex flex-wrap">
            {#if donneesUtilisateur.user.cnc}
                <RadioBouton
                    label="cnc"
                    cbClasses={tableCouleursLBF['jaune'].classText}
                    name="machineReservation" value={getIdMachine('cnc')}
                    bind:selected={choixMachine}
                    on:click={resetChoixHoraire}/>
            {/if}
            {#if donneesUtilisateur.user.laser}
                <RadioBouton
                    label="laser"
                    cbClasses={tableCouleursLBF['orange'].classText}
                    name="machineReservation"
                    value={getIdMachine('laser')}
                    bind:selected={choixMachine}
                    on:click={resetChoixHoraire}/>
            {/if}   
            {#if donneesUtilisateur.user.abonnementValide }
                {#if donneesUtilisateur.user.scie_toupie}
                    <RadioBouton
                        label="Scie-Toupie"
                        cbClasses={tableCouleursLBF['bleu'].classText}
                        name="machineReservation"
                        value={getIdMachine('scie')}
                        bind:selected={choixMachine}
                        on:click={resetChoixHoraire}/>
                {/if}       
                {#if donneesUtilisateur.user.rabo_degau}
                    <RadioBouton
                        label="Rabo-Degau"
                        cbClasses={tableCouleursLBF['vert'].classText}
                        name="machineReservation"
                        value={getIdMachine('rabo')}
                        bind:selected={choixMachine}
                        on:click={resetChoixHoraire}/>
                {/if}  
            {/if}
            <RadioBouton
                label="Imprimante 3D"
                cbClasses={tableCouleursLBF['rouge'].classText}
                name="machineReservation"
                value={getIdMachine('imprimante3D')}
                bind:selected={choixMachine}
                on:click={resetChoixHoraire}/>
        </div>
    </div>
    {#if choixMachine!=""}
        <div>
            <div class="h5 mt-4 mb-1">Date :</div>
            {#if afficheCalendar}
                <div class="flex flex-wrap items-center">
                    <div class="flex-auto mb-4">
                        <div class="mx-auto text-center">
                            <Datepicker 
                                start={dateDebutCalendrier}
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
                        {#if creneauxDuJour.length > 0}
                            <div class="text-justify">
                                Cliquez sur le nombre de créneaux correspondant à votre réservation. 
                            </div>
                        {/if}
                        <div class="flex flex-col">
                            {#each creneauxDuJour as plage}
                                <div class="flex flex-row flex-wrap justify-center">
                                    {#each plage as creneau}
                                        <div class="px-2 py-1 mr-2 mb-2 border border-gray-400">
                                            <Checkbox label={creneau.label} bind:checked={creneau.checked} cbClasses={creneau.checked?"text-bleuLBF":"text-gray-800"} bind:disabled={creneau.disabled} />
                                        </div>
                                    {/each}
                                </div>
                            {:else}
                                <div>Aucun créneau n'est proposé à cette date et cet horaire, merci de modifier votre choix.</div>
                            {/each}       
                        </div>
                        <div class="text-rougeLBF font-medium">
                            {#if !choixHoraire.choixOK && choixHoraire.debut!==""}
                                Une heure minimum pour les machines à bois.
                            {:else}
                                &nbsp;
                            {/if}
                        </div>
                    </div>
                </div>
            {/if}
        </div>
    {/if}

    {#if resaEstValide}
        <div>
            <div class="text-justify mb-1">Le détail de votre réservation : </div>
            <div class="flex flex-wrap">
                <div class="flex-auto mx-1 mb-1 px-2 py-1 border"><span class="font-medium">Machine :</span> {detailChoixMachine.nom}</div>
                <div class="flex-shrink-0 flex-auto mx-1 mb-1 px-2 py-1 border"><span class="font-medium">Réservée </span> {dateFormatFr(dateChoisie)}</div>
                <div class="flex-auto mx-1 mb-1 px-2 py-1 border"><span class="font-medium">de </span> {horaireFr(choixHoraire.debut)}<span class="font-medium">&nbsp; à </span>{horaireFr(choixHoraire.fin)}</div>
                <div class="flex-auto mx-1 mb-1 px-2 py-1 border"><span class="font-medium">Coût :</span>
                    {#if detailChoixMachine.abonnement}
                        Compris dans l'abonnement
                    {:else}
                        {calculCout}&nbsp;€
                    {/if}
                </div>
            </div>
        </div>
        {#if estModification}
            <div class="flex mt-4">
                <button on:click={() => {flagVerifModif = true}} class="mt-1 mx-1 px-1 border-2 border-bleuLBF rounded text-base font-medium text-bleuLBF">
                    Modifer
                </button>
                <button on:click={verifEffacer} class="mt-1 mx-1 px-1 border-2 border-orangeLBF rounded text-base font-medium text-orangeLBF">
                    Effacer
                </button>
            </div>
        {:else}
            <div class="mt-4">
            {#if saveEnCours}
                <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current text-lbfbleu-500 h-10 w-18 ml-4 " viewBox="0 0 50 50">
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
                    <button on:click={enregistrerReservation} class="mt-1 mx-1 px-1 border-2 border-bleuLBF rounded text-base font-medium text-bleuLBF">
                        Sauver
                    </button>
                {/if}
            </div>
        {/if}
    {/if}
    {/if}
    <!--{:else if flagRecupUserData}
        <div class="border border-gray-300 shadow rounded-md p-4 max-w-sm w-full mx-auto">
            <div class="animate-pulse flex space-x-4">
                <div class="rounded-full bg-gray-400 h-12 w-12"></div>
                <div class="flex-1 space-y-4 py-1">
                <div class="h-4 bg-gray-400 rounded w-3/4"></div>
                <div class="space-y-2">
                    <div class="h-4 bg-gray-400 rounded"></div>
                    <div class="h-4 bg-gray-400 rounded w-5/6"></div>
                </div>
                </div>
            </div>
        </div>
    {:else if mailValide}
        <div class="text-justify my-4 mx-4 p-2 border border-bleuLBF rounded">
            Vous n'êtes pas enregistré dans notre base. Pour être enregistré, il faut avoir participé à nos initiations machines. 
        </div>
    {:else}
        <div class="text-justify my-4 mx-4 p-2 border border-bleuLBF rounded">
            Merci d'entrer l'adresse mail avec laquelle vous avez été enregistré dans notre base (normalement lors d'une de nos initiations).
        </div>
    {/if}-->
</div>
{#if flagVerifEffacer}
    <Modal has_bouton_bleu="true" bouton_bleu_busy={busyEffacerResa} on:close={close} on:boutonBleu={effacerReservation}>
        <span slot="titre">Confirmation</span>
            Supprimer votre réservation ?
        <span slot="boutonBleu">Confirmer</span>
        <span slot="boutonDefaut">Annuler</span>
    </Modal>
{/if}
{#if flagEffacerConfirme}
    <Modal on:close={retourPageResa}>
        <span slot="titre">Opération confirmée</span>
            Votre réservation a bien été supprimée.
        <span slot="boutonDefaut">Fermer</span>
    </Modal>
{/if}
{#if flagVerifModif}
    <Modal has_bouton_bleu="true" bouton_bleu_busy={busyModifResa} on:close={close} on:boutonBleu={modifierReservation}>
        <span slot="titre">Confirmation</span>
            Modifier votre réservation ?
        <span slot="boutonBleu">Confirmer</span>
        <span slot="boutonDefaut">Annuler</span>
    </Modal>
{/if}
{#if flagModifConfirmee}
    <Modal on:close={retourPageModif}>
        <span slot="titre">Opération confirmée</span>
            Votre réservation a bien été modifiée.
        <span slot="boutonDefaut">Fermer</span>
    </Modal>
{/if}
{#if flagSaveEffectue}
    <Modal on:close={retourPageModif}>
        <span slot="titre">Opération confirmée</span>
            Votre réservation a bien été enregistrée.
        <span slot="boutonDefaut">Fermer</span>
    </Modal>
{/if}
{#if flagResaNotFound}
    <Modal on:close={retourAccueil}>
        <span slot="titre">Réservation inconnue</span>
            Votre numéro de réservation n'a pas été trouvée dans notre base. Vous allez être redirigé vers l'accueil.
        <span slot="boutonDefaut">Fermer</span>
    </Modal>
{/if}
{#if flagTropTardPourModifResa}
    <Modal on:close={retourResa}>
        <span slot="titre">Modification impossible</span>
            Vous ne pouvez plus modifier cette réservation.
        <span slot="boutonDefaut">Fermer</span>
    </Modal>
{/if}