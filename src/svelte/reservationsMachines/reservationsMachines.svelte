<script>
import {onMount} from 'svelte';
import Datepicker from '../components/calendar/Datepicker.svelte'
import { getJourSemaine, horaireFr, dateFr, dateFormatFr} from '../utils/dateFr.js'
import RadioBouton from '../components/radioButtons.svelte'
import Checkbox from '../components/Checkbox.svelte'
import Fa from 'svelte-fa'
import { faCheck, faTimes } from '@fortawesome/free-solid-svg-icons'
import Bouton from '../components/bouton.svelte'
import {tableCouleursLBF} from '../utils/couleursLBF.js'
/* import requêtes */
import {userData} from '../apollo/user.js'
import {listePlagesHoraires, listeReservationsByDate, reserver} from '../apollo/reservations.js'

var mailValide = false
var donneesUtilisateur = {}
var estInscrit = false
var estAbonne = false
var nouvelleReservation = {machine:"", debut: "", fin: "", userId:"", estValide: false}
var choixMachine = ""
var plagesReservations = []
var afficheCalendar = false
const dateFormat = "#{l} #{j} #{F} #{Y}"
const aujourdhui = new Date()
const aujourdhuiIso = (new Date()).toISOString().slice(0,10)
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

dateFinCalendrier.setMonth(dateFinCalendrier.getMonth()+24)

let saveInfo=false;
if (localStorage["userInfo"]) {
    var userInfo = JSON.parse(localStorage.getItem("userInfo"));
    saveInfo = true;
  } else {
    var userInfo = { nom: "", prenom: "", email: "" };
  }

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
    regexMail = /([a-zA-Z0-9+._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/i.exec(userInfo.email)
    mailValide = regexMail!==null
    if (mailValide) {
        userData(userInfo.email).then((retour) => {
            donneesUtilisateur = retour
            if (retour && retour.id) {estInscrit = true} else {estInscrit=false}
        })
    }
}

/*
recup liste des resa et construction des creneaux
*/
$: {
    let zeDate = new Date(dateChoisie-tzoffset)
    dateChoisiePourRequete = zeDate.toISOString().slice(0,10)
    listeReservationsByDate(dateChoisiePourRequete).then((retour)=> {
        listeReservations = retour
    })
    constructionCreneaux(zeDate.toISOString());
}

/*
recupération des créneaux déjà réservé filtré par machine
*/
$: {
    listeReservationsFiltreMachine = listeReservations.filter((resa) => {
        return Number(resa.machine.id) === Number(choixMachine.id)
        })
    let zeDate = new Date(dateChoisie)
    constructionCreneaux(zeDate.toISOString());
}

$: {
    if (choixMachine.abonnement) {intervalCreneau = 1} else {intervalCreneau = 0.5}
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
            verifChoix()
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
    if (choixMachine.id!=="" && donneesUtilisateur.id!=="" && choixHoraire.choixOK) {
        nouvelleReservation.estValide = true
    } else {
        nouvelleReservation.estValide = false
    }
}

$: {
    if (saveInfo && userInfo.email !== "") {
      localStorage.setItem("userInfo", JSON.stringify(userInfo));
    }
    if (!saveInfo && localStorage["userInfo"]) {
      localStorage.removeItem("userInfo");
      userInfo = { nom: "", prenom: "", email: "" };
      mailValide = false
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
            let nbMinutesDebutCreneau = 0
            for (let j = 0; j <= lesCreneaux; j += 0.5) {
                let h = []
                let label = ""
                if (j===0) {
                    estReserve = verifReserve(plage.debut)
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
                            "checked": false,
                            "disabled": estReserve,
                            "estReserve": estReserve,
                            "plageOK": false,
                            "estTropTard": dateChoisiePourRequete === aujourdhuiIso && minutesActuelles >= nbMinutesDebutCreneau
                        })
                } else {
                    estReserve = verifReserve(creneauxDuJour[index][2*j-1].fin)
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
                        "checked": false,
                        "disabled": estReserve,
                        "estReserve": estReserve,
                        "plageOK": false,
                        "estTropTard": dateChoisiePourRequete === aujourdhuiIso && minutesActuelles >= nbMinutesDebutCreneau
                    })
                }
            }
        })
    }
    if (estTropTard) creneauxDuJour = []
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
        let heureDebutSplit = resa.heuredebut.split(":")
        let heureFinSplit = resa.heurefin.split(":")
        let dureeReservation = 60 * (Number(heureFinSplit[0]) - Number(heureDebutSplit[0])) + Number(heureFinSplit[1]) - Number(heureDebutSplit[1])
        let dureeToCheck = 60 * (Number(heureSplit[0]) - Number(heureDebutSplit[0])) + Number(heureSplit[1]) - Number(heureDebutSplit[1])      
        if (dureeToCheck >= 0 && dureeToCheck < dureeReservation) {retour = true}
    })
    return retour
}

function enregistrerReservation() {
    const variables = {
        nom: userInfo.nom,
        prenom: userInfo.prenom,
        heureDebut: choixHoraire.debut,
        heureFin: choixHoraire.fin,
        date: dateChoisiePourRequete,
        user: donneesUtilisateur.id.toString(),
        machine: choixMachine.id.toString()
    }
    reserver(variables).then((retour) => console.log('retour resa', retour))
}
</script>

<div class="mt-2 mb-2 mx-4">
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
    <div class="mt-1 mx-4">
        <label for="checkSaveInfo" class="mx-8 pr-8 my-1 text-sm">
            <input type="checkbox" class="form-checkbox text-lbfvert-600 focus:outline-none" bind:checked={saveInfo} id="checkSaveInfo"/>
            Enregistrer mes coordonnées pour la prochaine fois (ces informations sont stockées sur votre ordinateur)
        </label>
    </div>
    {#if estInscrit}
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
                <RadioBouton label="cnc" cbClasses={tableCouleursLBF['jaune'].classText} name="machineReservation" value={lesMachines['cnc']} bind:selected={choixMachine}/>
            {/if}
            {#if donneesUtilisateur.laser}
                <RadioBouton label="laser" cbClasses={tableCouleursLBF['orange'].classText} name="machineReservation" value={lesMachines['laser']} bind:selected={choixMachine}/>
            {/if}   
            {#if donneesUtilisateur.estAbonne }
                {#if donneesUtilisateur.scie_toupie}
                    <RadioBouton label="Scie-Toupie"  cbClasses={tableCouleursLBF['bleu'].classText} name="machineReservation" value={lesMachines['scie']} bind:selected={choixMachine}/>
                {/if}       
                {#if donneesUtilisateur.rabo_degau}
                    <RadioBouton label="Rabo-Degau" cbClasses={tableCouleursLBF['vert'].classText} name="machineReservation" value={lesMachines['rabo']} bind:selected={choixMachine}/>
                {/if}  
            {/if}
            <RadioBouton label="Imprimante 3D" cbClasses={tableCouleursLBF['rouge'].classText} name="machineReservation" value={lesMachines['imprimante3D']} bind:selected={choixMachine}/>
        </div>
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
    {#if nouvelleReservation.estValide}
        <div>
            <div class="text-justify mb-1">Le détail de votre réservation : </div>
            <div class="flex flex-wrap">
                <div class="flex-auto mx-1 mb-1 px-2 py-1 border"><span class="font-medium">Machine :</span> {choixMachine.nom}</div>
                <div class="flex-shrink-0 flex-auto mx-1 mb-1 px-2 py-1 border"><span class="font-medium">Réservée </span> {dateFormatFr(dateChoisie)}</div>
                <div class="flex-auto mx-1 mb-1 px-2 py-1 border"><span class="font-medium">de </span> {horaireFr(choixHoraire.debut)}<span class="font-medium">&nbsp; à </span>{horaireFr(choixHoraire.fin)}</div>
            </div>
        </div>
        <div class="mt-4">
            <Bouton on:actionBouton={enregistrerReservation}>
                Valider
            </Bouton>
        </div>
    {/if}
    {:else if mailValide}
    <div class="text-justify my-4 mx-4 p-2 border border-bleuLBF rounded">
        Vous n'êtes pas enregistré dans notre base. Pour être enregistré, il faut avoir participé à nos initiations machines. 
    </div>
    {:else}
        <div class="text-justify my-4 mx-4 p-2 border border-bleuLBF rounded">
            Merci d'entrer l'adresse mail avec laquelle vous avez été enregistré (normalement lors d'une de nos initiations).
        </div>
    {/if}
</div>