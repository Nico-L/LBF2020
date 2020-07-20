<script>
import {onMount} from 'svelte';
import Datepicker from '../components/calendar/Datepicker.svelte'
import { dateFr, dateInscription, getJourSemaine} from '../utils/dateFr.js'
import RadioBouton from '../components/radioButtons.svelte'
import Fa from 'svelte-fa'
import { faCheck, faTimes } from '@fortawesome/free-solid-svg-icons'

import {tableCouleursLBF} from '../utils/couleursLBF.js'
/* import requêtes */
import {userData} from '../apollo/user.js'
import {listePlagesHoraires} from '../apollo/reservations.js'


var userInfo = { nom: "", prenom: "", email: "" };
var mailValide = false
var donneesUtilisateur = {}
var estAbonne = false
var nouvelleReservation = {machine:""}
var creneauxReservation = []
var afficheCalendar = false
const  dateFormat = "#{l} #{j} #{F} #{Y}"
const aujourdhui = new Date()
var dateFinCalendrier = new Date()
dateFinCalendrier.setMonth(dateFinCalendrier.getMonth()+24)

onMount(() => {
    /* if (localStorage["userInfo"]) {
        userInfo = JSON.parse(localStorage.getItem("userInfo"));
        saveInfo = true;
    } */
    listePlagesHoraires().then((retour) => {
        creneauxReservation[0] = retour.dimanche
        creneauxReservation[1] = retour.lundi
        creneauxReservation[2] = retour.mardi
        creneauxReservation[3] = retour.mercredi
        creneauxReservation[4] = retour.jeudi
        creneauxReservation[5] = retour.vendredi
        creneauxReservation[6] = retour.samedi
        afficheCalendar = true
        console.log('plages horaires', retour)})
})

$: {
    var extracted = /([a-zA-Z0-9+._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/i.exec(userInfo.email)
    mailValide = extracted!==null
    if (extracted!==null) {
        userData(userInfo.email).then((retour) => {console.assert('retour', retour); donneesUtilisateur=retour})
    }
}

function creneauDispo(date) {
    return creneauxReservation[getJourSemaine(date)].length>0
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
    </div>
    <div>
        <div class="h5 mt-4 mb-1">Date :</div>
        {#if afficheCalendar}
            <div class="flex flex-wrap">
                <div class="flex-auto">
                    <div class="mx-auto text-center">
                        <Datepicker 
                            start={aujourdhui}
                            end={dateFinCalendrier}
                            daysOfWeek={dateFr.jours}
                            monthsOfYear={dateFr.mois}
                            format={dateFormat}
                            selectableCallback={creneauDispo}
                        />
                    </div>
                </div>
                <div class="flex-auto">
                    <div class="h5 text-center lg:text-left">Prochaines disponibilités</div>
                </div>
            </div>
        {/if}
    </div>
</div>