<script>
import {onMount} from 'svelte';
import { Calendar } from '@fullcalendar/core';
import timeGridPlugin from '@fullcalendar/timegrid';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import Dialog from './../components/Dialog.svelte';
import Bouton from './../components/bouton.svelte';
import Fa from 'svelte-fa'
import { faArrowLeft, faTrashAlt } from '@fortawesome/free-solid-svg-icons'
import { faSave } from '@fortawesome/free-regular-svg-icons'
import {listePlagesHoraires} from '../graphQL/machines.js';
import {sauveReservation, listeReservations, reservationById, effacerReservation} from '../graphQL/reservations.js'
import {envoyerMail} from '../graphQL/envoiMail.js'
import {tableCouleursLBF} from '../utils/couleursLBF.js'

let calendarEl
let calendar
let flagBH =true
const urlEffacerResa = window.location;
let businessHours = [];
let nbPlagesJour = 4;
let dataReservation = {dateDebut: new Date(), dateFin: new Date(), idMachine: ""}
let flagReservation = false
let laVue = window.innerWidth < 480 ? "vueMobile" :"timeGridWeek";
let jourDebutCalendrier = (new Date()).getDay()
let horaireDebut = ""
let horaireFin = ""
let minutesDebut = ""
let minutesFin = ""
const options = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
    };
let saveInfo=false;
if (localStorage["userInfo"]) {
    var userInfo = JSON.parse(localStorage.getItem("userInfo"));
    saveInfo = true;
  } else {
    var userInfo = { nom: "", prenom: "", email: "" };
  }

let busySauverReservation = false;
let flagEffacerResa = false;
let busyEffacerResa = false;
let flagConfirmationEffacerResa = false;
let flagEffaceOK = false;
let extracted;

$: {
    if (calendar) {
        calendar.setOption('businessHours', businessHours)
        calendar.setOption('eventConstraint', 'businessHours')
        calendar.setOption('selectConstraint', 'businessHours')
    }
}

$: {
    minutesDebut = dataReservation.dateDebut.getMinutes() === 0 ? "00" : dataReservation.dateDebut.getMinutes()
    horaireDebut = dataReservation.dateDebut.getHours() + "h" + minutesDebut
    minutesFin = dataReservation.dateFin.getMinutes() === 0 ? "00" : dataReservation.dateFin.getMinutes()
    horaireFin = dataReservation.dateFin.getHours() + "h" + minutesFin
}

listePlagesHoraires().then((retour)=>{
        const retourPlage = retour[0].plages
        businessHours = []
        for(let i=0; i<7; i++) {
            for(let j=0; j<nbPlagesJour; j++) {
                if (retourPlage[i][j][0]!== null) {
                    businessHours.push({
                        daysOfWeek: [i],
                        startTime: retourPlage[i][j][0],
                        endTime: retourPlage[i][j][1]                                
                    })
                }
            }
        }
        businessHours = businessHours
    })

$: {
    if (!busySauverReservation) {
        listeReservations({idMachine: idMachine}).then((liste) => {
            calendar.removeAllEvents()
            liste.forEach((resa)=> {
                const resaEvent = {
                    id: resa.id,
                    title: "reservé",
                    start: resa.dateDebut,
                    end: resa.dateFin,
                    backgroundColor: tableCouleursLBF[resa.machine.couleur].numCouleur,
                    borderColor: tableCouleursLBF[resa.machine.couleur].numCouleur,
                    extendedProps: resa
                }
                calendar.addEvent(resaEvent)
            })
        })
    }
}

function effaceReservation () {
    if (saveInfo) {
      localStorage.setItem("userInfo", JSON.stringify(userInfo));
    }
    if (!saveInfo && localStorage["userInfo"]) {
      localStorage.removeItem("userInfo");
    }
    busyEffacerResa = true
    effacerReservation({id: extracted[1]}).then((retour)=>{
        busyEffacerResa = false;
        flagReservation = false;
        flagConfirmationEffacerResa = false;
        flagEffaceOK = true
    })
}

function retourSite() {
            let redirect = urlEffacerResa.origin + urlEffacerResa.pathname;
        window.location.replace(redirect);
}

function sauverReservation() {
    if (saveInfo) {
      localStorage.setItem("userInfo", JSON.stringify(userInfo));
    }
    if (!saveInfo && localStorage["userInfo"]) {
      localStorage.removeItem("userInfo");
    }
    busySauverReservation = true
    let variables = {
        ...userInfo,
        ...dataReservation
    }
    variables.idMachine = idMachine
    sauveReservation(variables).then((retour)=> {
        mailConfirmation(retour.id)
        busySauverReservation = false
        flagReservation = false
    })
}

function mailConfirmation(idResa) {
    let tempDuree = (dataReservation.dateFin - dataReservation.dateFin)/1000/60
    let dureeString = Math.floor(tempDuree/60) + "h"
    dureeString += tempDuree % 60 === 0 ? "00" : tempDuree % 60
    let arrayMails = [];
    arrayMails.push(userInfo.email);
    let envoiMail = {
        machine: titreMachine,
        prenom: dataReservation.prenom,
        duration: dureeString,
        jour: dataReservation.dateDebut
            .toLocaleDateString("fr-fr", options)
            .replace(":", "h"),
        urlDelete:
            urlEffacerResa.origin +
            urlEffacerResa.pathname +
            "?idReservation=" +
            idResa,
        altMachine: titreMachine,
        urlImageMail:
            "https://res.cloudinary.com/la-bonne-fabrique/image/upload/ar_1.5,w_200,c_fill/" +
            urlImageMachine
    };
    let variables = {
        email: arrayMails,
        template: JSON.stringify(envoiMail)
    }
        console.log('variables mail', variables)
    envoyerMail(variables)
}

onMount(()=> {
    calendar = new Calendar(calendarEl, {
        selectable: true,
        editable: false,
        eventStartEditable: false,
        eventResizableFromStart: true,
        plugins: [timeGridPlugin, dayGridPlugin, interactionPlugin],
        initialView: laVue,
        views: {
            vueMobile: {
            type: 'timeGrid',
            duration: { days: 5 }
            }
        },
        locale: 'fr',
        firstDay: jourDebutCalendrier,
        slotDuration: '00:30',
        scrollTime: '09:00:00',
        slotMinTime: '09:00:00',
        slotMaxTime: '22:00:00',
        allDaySlot: false,
        expandRows: true,
        height: "auto",
        buttonText: {
            today:    'aujourd\'hui',
            month:    'mois',
            week:     'semaine',
            day:      'jour',
            list:     'liste',
            month: 'vue mois',
            week: 'vue semaine'
            },
        headerToolbar: {
            right: 'today',
            center: 'title',
            left: 'prev,next'
            },
        weekNumbers: true,
        weekText: "S",
        selectLongPressDelay: 1000,
        selectOverlap: false,
        select: function(info) {
            if (info.start > new Date()) {
                dataReservation = {dateDebut: new Date(), dateFin: new Date(), idMachine: ""}
                dataReservation.dateDebut = info.start;
                dataReservation.dateFin = info.end;
                flagReservation = true
            }
        },
        eventOverlap: function(stillEvent, movingEvent) {
            return stillEvent.extendedProps.machine.id !== movingEvent.extendedProps.machine.id;
        }
    });
    calendar.render();
    /* récup idResa si besoin */
    extracted = /\?idReservation=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(urlEffacerResa.search)
    if (extracted !== null) {
        console.log('extracted', extracted[1])
        reservationById({id: extracted[1]}).then((retour) => {
            console.log('retour', retour)
            if (retour.length > 0) {
                dataReservation = retour[0];
                userInfo.prenom = dataReservation.prenom
                userInfo.nom = dataReservation.nom
                userInfo.email = dataReservation.email
                dataReservation.dateDebut = new Date(dataReservation.dateDebut)
                dataReservation.dateFin = new Date(dataReservation.dateFin)
                flagReservation = true
                flagEffacerResa = true
                }
        })
    }
})

function fini() {
    flagReservation = false;
}
</script>


<main >
    <div bind:this={calendarEl} ></div>
</main>
<!-- Dialog enregistrement -->
<Dialog bind:visible={flagReservation} on:close={fini}>
    <div slot="title" class="text-xl sm:text-2xl font-bold text-center">Réservation de {titreMachine}</div>
    <h3 class="text-lg font-bold text-center text-vertLBF border-b border-vertLBF pb-3 mb-1">
        {dataReservation.dateDebut.toLocaleDateString('fr-fr', options)} de {horaireDebut} à {horaireFin}
    </h3>
        <div class="mt-2 mb-2">
            <div class="w-full flex flex-row flex-wrap md:flex-no-wrap">
            <label for="prenomResa" class="w-full md:w-1/2 mx-1 my-1 flex flex-col">
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
            <label for="nomResa" class="w-full md:w-1/2 mx-1 my-1 flex flex-col">
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
        <div class="text-base max-w-320px mx-auto text-justify">
            Vous recevrez un email de confirmation qui contiendra un lien pour
            effacer votre réservation si besoin. Il est donc important d'entrer une adresse valide.
        </div>
        <div class="mt-2 max-w-320px mx-auto">
            <label for="checkSaveInfo" class="mx-8 pr-8 my-1 text-sm">
                <input type="checkbox" class="form-checkbox text-lbfvert-600 focus:outline-none" bind:checked={saveInfo} id="checkSaveInfo"/>
                Enregistrer mes coordonnées pour la prochaine fois (ces informations sont stockées sur votre ordinateur)
            </label>
        </div>
        
    </div>
    <div slot="actions">
        <Bouton largeur="w-10" on:actionBouton={fini} >
            <Fa icon={faArrowLeft} size="lg"  class="mx-auto" />
        </Bouton>
        {#if !flagEffacerResa}
        <Bouton largeur="w-12" couleur = "text-rougeLBF border-rougeLBF" occupe={busySauverReservation} on:actionBouton={sauverReservation}>
            <Fa icon={faSave} size="lg" class="mx-auto" />
        </Bouton>
        {:else}
            <Bouton largeur="w-12" couleur = "text-rougeLBF border-rougeLBF" on:actionBouton={() => flagConfirmationEffacerResa = true}>
            <Fa icon={faTrashAlt} size="lg" class="mx-auto" />
        </Bouton>
        {/if}
    </div>
</Dialog>
<!-- confirmation effacer -->
<Dialog bind:visible={flagConfirmationEffacerResa} >
    <h4 slot="title">Confirmation</h4>
    <p>Confirmer la suppression de votre réservation</p>
    <div slot="actions" class="flex flex-row justify-end items-center">
        <Bouton on:actionBouton={() => flagConfirmationEffacerResa = false}>Annuler</Bouton>
        <Bouton occupe={busyEffacerResa} on:actionBouton = {effaceReservation} couleur="text-orangeLBF border-orangeLBF">Confirmer</Bouton>
    </div>
</Dialog>
<!-- effacer site succès -->
<Dialog bind:visible={flagEffaceOK} >
    <h4 slot="title">Confirmé</h4>
    <p>Votre réservation a bien été supprimé.</p>
    <div slot="actions" class="flex flex-row justify-end items-center">
        <Bouton on:actionBouton={retourSite}>OK</Bouton>
    </div>
</Dialog>

