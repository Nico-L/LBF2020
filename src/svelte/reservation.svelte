<script>
  import { getContext } from "svelte";
  import { onMount } from "svelte";
  import Modal from "./components/Modal.svelte";

  // modal réservation
  let showModalReservation = false;
  let showModalMauvaisCreneau = false;
  let workingFlag = true; //flag to switch when async query
  let workingMessage = ""; //message du processus
  let recupReservations = false;

  const options = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "numeric"
  };

  // donnée réserveur
  let nom = "bob ";
  let prenom = "bibi";
  let email = "luchier@gmail.com";
  let debutReservation = new Date();
  let duree = 0.5;

  //fullcalendar
  import FullCalendar from "svelte-fullcalendar";
  import dayGridPlugin from "@fullcalendar/daygrid";
  import timeGridPlugin from "@fullcalendar/timegrid";
  import interactionPlugin from "@fullcalendar/interaction"; // needed for dayClick
  import frLocale from "@fullcalendar/core/locales/fr";

  import "./fullcalendar.scss";

  let calendarComponentRef;
  let selectable = true;
  let calendarWeekends = true;

  var eventDispoMachines = [];
  var leJourSelection = null;

  var urlEffacerResa = window.location;
  // récupération id de la réservation s'il y a lieu et récupération des données
  var showModalEffacerReservation = false;
  var email_reservation = "";
  var dataReservation = {}; //issue de l'interrogation de la bdd
  var flagEmailVerifie = false;
  if (
    !!urlEffacerResa.search &&
    urlEffacerResa.search.split("idReservation=")[1].length > 0
  ) {
    var idReservation = urlEffacerResa.search.split("idReservation=")[1];
    recupReservations = true;
    const laReservation = fetch("https://graphql.labonnefabrique.fr/v1/graphql", {
      method: "POST",
      cache: "no-cache",
      body: JSON.stringify({
        query: `query listeReservations($idReservation: uuid) {
                  __typename
                  reservationMachines(where: {id: {_eq: $idReservation}}) {
                  dateDebut
                  dateFin
                  email
                  machine {
                    titre
                  }
                  }
                  }`,
        variables: {
          idReservation: idReservation
        }
      })
    })
      .then(async retour => {
        let resultat = await retour.json();
        if (resultat.data.reservationMachines.length > 0) {
          dataReservation = resultat.data.reservationMachines[0];
          dataReservation.dateDebut = new Date(dataReservation.dateDebut);
          showModalEffacerReservation = true;
        }
        recupReservations = false;
      })
      .catch(error => {
        console.log("erreur :", error);
      });
  }

  function verifEmail() {
    console.log("input et email", this.value == dataReservation.email);
    if (this.value === dataReservation.email) {
      flagEmailVerifie = true;
    }
  }

  function abandonReservation() {
    workingFlag = true;
    workingMessage = "Nous effaçons votre réservation.";
    const effacerReservation = fetch(
      "https://graphql.labonnefabrique.fr/v1/graphql",
      {
        method: "POST",
        cache: "no-cache",
        body: JSON.stringify({
          query: `mutation effaceReservation($idReservation: uuid) {
                __typename
                delete_reservationMachines(where: {id: {_eq: $idReservation}}) {
                  returning {
                    id
                  }
                }
              }`,
          variables: {
            idReservation: idReservation
          }
        })
      }
    )
      .then(async retour => {
        workingFlag = false;
        workingMessage = "";
        let resultat = await retour.json();
        fetchReservations();
        showModalEffacerReservation = false;
        let redirect = urlEffacerResa.origin + urlEffacerResa.pathname;
        window.location.replace(redirect);
      })
      .catch(error => {
        console.log("erreur :", error);
      });
  }

  // recupération des réservations par machine, filtrées par date supérieur à aujourd'hui
  var calendarEvents = [];

  async function fetchReservations() {
    recupReservations = true;
    calendarEvents = [];
    const res = await fetch("https://graphql.labonnefabrique.fr/v1/graphql", {
      method: "POST",
      cache: "no-cache",
      body: JSON.stringify({
        query: `query listeReservations($idMachine: uuid) {
                __typename
                reservationMachines(where: {dateDebut: {_gte: "now()"}, _and: {idMachine: {_eq: $idMachine}}}) {
                  dateDebut
                  dateFin
                }
              }`,
        variables: {
          idMachine: idMachine
        }
      })
    });
    let resultats = await res.json();
    resultats.data.reservationMachines.forEach(reservation => {
      let start = new Date(reservation.dateDebut);
      let end = new Date(reservation.dateFin);
      calendarEvents = [
        ...calendarEvents,
        {
          title: "",
          start: start.toISOString(),
          end: end.toISOString(),
          allDay: false
        }
      ];
    });
    recupReservations = false;
  }

  onMount(() => {
    fetchReservations();
  });

  //fonctions FullCalendar
  function calculNbColonnes() {
    let nbColonnes = window.innerWidth < 400 ? 3 : 7;
    return nbColonnes;
  }

  function setHeureMinutes(time) {
    let heures = Math.floor(time);
    let minutes = time - heures > 0 ? 30 : 0;
    return { heures: heures, minutes: minutes };
  }

  function handleDateClick(arg) {
    let numJour = arg.date.getDay();
    leJourSelection = arg.date;
    let leJour = eventDispoMachines.filter(event => {
      return numJour === event.numJour;
    })[0];
    let creneauDispo =
      typeof leJour !== "undefined" &&
      arg.date >= leJour.start &&
      arg.date < leJour.end;
    if (creneauDispo) {
      debutReservation = arg.date;
      showModalReservation = true;
    } else {
      showModalMauvaisCreneau = true;
    }
  }

  function lesCreneaux(dateRange, callback, failureCallback) {
    eventDispoMachines = [];
    var curr = dateRange.start;
    const end = dateRange.end;
    while (curr <= end) {
      let numJour = curr.getDay();
      var temp = new Date(curr);
      if (dispoMachines[numJour].length > 0) {
        dispoMachines[numJour].forEach(dispo => {
          let start = setHeureMinutes(dispo.start);
          let end = setHeureMinutes(dispo.end);
          const startDate = temp.setHours(start.heures, start.minutes);
          const endDate = temp.setHours(end.heures, end.minutes);
          eventDispoMachines.push({
            title: "dispo Machines",
            start: startDate,
            end: endDate,
            numJour: numJour,
            rendering: "background"
          });
        });
      } else {
        eventDispoMachines.push({});
      }
      temp.setDate(temp.getDate() + 1);
      curr = temp;
    }
    callback(eventDispoMachines);
  }

  // gestion ajout réservation
  function enregistrementReservation() {
    workingFlag = true;
    workingMessage = "Enregistrement de votre réservation en cours";
    var finReservation = new Date(debutReservation);
    const ajoutHeures = Math.floor(duree);
    const ajoutMinutes = duree - ajoutHeures;
    finReservation.setHours(debutReservation.getHours() + ajoutHeures);
    finReservation.setMinutes(debutReservation.getMinutes() + ajoutMinutes * 60);
    const horaireDebut =
      debutReservation.getHours().toString() +
      ":" +
      debutReservation.getMinutes().toString();
    const horaireFin =
      finReservation.getHours().toString() +
      ":" +
      finReservation.getMinutes().toString();
    fetch("https://graphql.labonnefabrique.fr/v1/graphql", {
      method: "POST",
      body: JSON.stringify({
        query: `
                                                        mutation ajoutReservation($dateDebut: timestamptz,$dateFin: timestamptz, $email: String, $idMachine: uuid, $nom: String, $prenom: String) {
                                                          insert_reservationMachines(objects: {dateDebut: $dateDebut, dateFin: $dateFin, email: $email, idMachine: $idMachine, nom: $nom, prenom: $prenom}) {
                                                            returning {
                                                              id
                                                            }
                                                          }
                                                        }`,
        variables: {
          dateDebut: debutReservation,
          dateFin: finReservation,
          email: email,
          idMachine: idMachine,
          nom: nom,
          prenom: prenom
        }
      })
    })
      .then(async response => {
        let resultat = await response.json();
        let idNewResa = resultat.data.insert_reservationMachines.returning[0].id;
        let dureeString =
          duree === 0.5
            ? "demi-heure"
            : duree > 1
            ? duree.toString() + " heures"
            : duree.toString() + " heure";
        let arrayMails = [];
        arrayMails.push(email);
        let envoiMail = {
          machine: titreMachine,
          prenom: prenom,
          duration: dureeString,
          jour: leJourSelection
            .toLocaleDateString("fr-fr", options)
            .replace(":", "h"),
          urlDelete:
            urlEffacerResa.origin +
            urlEffacerResa.pathname +
            "?idReservation=" +
            idNewResa,
          urlImageMail:
            "https://res.cloudinary.com/la-bonne-fabrique/image/upload/ar_1.5,w_auto,c_fill/" +
            urlImageMachine
        };
        fetch("https://graphql.labonnefabrique.fr/v1/graphql", {
          method: "POST",
          body: JSON.stringify({
            query: `
                                                  mutation envoiMail($email: [String!]!, $template: String) {
                                                    sendEmail(
                                                      from: "atelierdusappey@gmail.com"
                                                      to: $email
                                                      templateId: "d-08bb9e1b96ac4d56a9210660cac6cd07"
                                                      dynamic_template_data: $template
                                                    ) {
                                                      success
                                                    }
                                                  }
                                                `,
            variables: {
              email: arrayMails,
              template: JSON.stringify(envoiMail)
            }
          })
        }).then(async response => {
          let resultat = await response.json();
        });
      })
      .catch(error => {
        console.log("error", error);
      });
    calendarEvents = [
      ...calendarEvents,
      {
        title: "Reservé",
        start: debutReservation,
        end: finReservation
      }
    ];
    workingFlag = false;
    workingMessage = "";
    showModalReservation = false;
  }
  let disabled = true;
</script>

{#if showModalReservation}
<Modal on:close="{() => showModalReservation = false}">
<h2 class="text-xl sm:text-2xl font-bold text-center" slot="titre">
	Réservation de {titreMachine}
</h2>
<h3 class="text-lg font-bold text-center text-vertLBF border-b border-vertLBF pb-3 mb-1" slot="sousTitre">{leJourSelection.toLocaleDateString('fr-fr',
	options).replace(":", "h")}</h3>
  <hr />
<div class="text-justify">
	Merci de préciser vos coordonnées ci-dessous. Vous recevrez un email de confirmation qui contiendra un lien pour
	effacer votre réservation si besoin. Il est donc important d'entrer une adresse valide.
	<hr />
	<div class="flex flex-row mt-2">
		<input class="w-1/2 bg-white border-2 border-lbforange-400 rounded-lg py-2 px-4 block appearance-none leading-normal mr-1 focus:outline-none focus:bg-white focus:border-lbfvert-600"
		 type="text" placeholder="nom" bind:value={nom}>
		<input class="w-1/2 bg-white focus:outline-none focus:bg-white focus:border-lbfvert-600 border-2 border-lbforange-400 rounded-lg py-2 px-4 block appearance-none leading-normal ml-1"
		 type="text" placeholder="prénom" bind:value={prenom}>
	</div>
	<input class="mt-2 w-full bg-white focus:outline-none focus:bg-white focus:border-lbfvert-600 border-2 border-lbforange-400 rounded-lg py-2 px-4 block appearance-none leading-normal"
	 type="email" placeholder="adresse email" bind:value={email}/>
	<div class="w-full mt-1 text-lg font-bold">Durée de votre réservation</div>
	<div class="ml-1 sm:ml-4">
		<label class="inline-flex items-center">
			<input type="radio" class="form-radio border-2 border-lbforange-400 text-lbfvert-600 focus:outline-none h-6 w-6 sm:h-4 sm:w-4"
			 bind:group={duree} value={0.5}>
			<span class="ml-2">1/2 heure</span>
		</label>
		<label class="inline-flex items-center ml-6">
			<input type="radio" class="form-radio border-2 border-lbforange-400 text-lbfvert-600 focus:outline-none h-6 w-6 sm:h-4 sm:w-4"
			 bind:group={duree} value={1}>
			<span class="ml-2">1 heure</span>
		</label>
    <label class="inline-flex items-center ml-6">
			<input type="radio" class="form-radio border-2 border-lbforange-400 text-lbfvert-600 focus:outline-none h-6 w-6 sm:h-4 sm:w-4"
			 bind:group={duree} value={2}>
			<span class="ml-2">2 heure</span>
		</label>
	</div>
</div>

<button on:click={enregistrementReservation} slot="boutonFonction" class="bg-vertLBF mx-1 px-2 rounded">Réserver</button>
</Modal>
{/if}

{#if showModalMauvaisCreneau}
	<Modal busy={false} on:close="{() => showModalMauvaisCreneau = false}">
		<h2 class="text-lg font-bold" slot="titre">
			Horaire indisponible
		</h2>

		Veuillez sélectionner un horaire dans les cases colorées.
	</Modal>
{/if}

{#if showModalEffacerReservation}
<Modal on:close="{() => showModalEffacerReservation = false}">
<h2 class="text-xl sm:text-2xl font-bold text-center" slot="titre">
	Abandon de réservation
</h2>
<h3 class="text-lg font-bold text-center text-vertLBF border-b border-vertLBF pb-3 mb-1 mt-2" slot="sousTitre">{dataReservation.dateDebut.toLocaleDateString('fr-fr',
	options).replace(":", "h")}</h3>
  <hr />
<div class="text-justify mb-1 pb-3 border-b">
	Merci d'entrer ci-dessous l'adresse email avec laquelle vous avez effectué votre réservation <b>de {dataReservation.machine.titre}</b> pour confirmer l'abandon de votre réservation.
	</div>
	<input on:input={verifEmail}  class="mt-3 w-full bg-white focus:outline-none focus:bg-white focus:border-lbfvert-600 border-2 border-lbforange-400 rounded-lg py-2 px-4 block appearance-none leading-normal"
	 type="email" placeholder="adresse email" bind:value={email_reservation}/>

<div slot="message" class="text-sm">
{#if !flagEmailVerifie}
L'adresse email n'est renseignée ou elle ne correspond pas à l'adresse utilisée pour la réservation.
{/if}
</div>
<button on:click={abandonReservation} type="button" slot="boutonFonction" class="bg-vertLBF mx-1 px-2 rounded disabled:hidden" disabled={!flagEmailVerifie}>Abandonner</button>
</Modal>
{/if}

<div class="z-1 flex flex-col max-w-4xl h-3xl">
{#if !recupReservations}
<h1 class="text-center text-xl sm:text-3xl">Réservation de {titreMachine}</h1>
		<FullCalendar
			bind:this={calendarComponentRef}
      plugins={[timeGridPlugin, interactionPlugin]}
			defaultView="timeGrid"
      allDaySlot={false}
      locale={frLocale}
      minTime="09:00:00"
      maxTime="22:00:00"
      dayCount={calculNbColonnes()}
      height="parent"
			header={{ left: 'prev,today,next', center: 'title', right: '' }}
			weekends={true}
      eventSources= {[lesCreneaux,calendarEvents]}
      on:dateClick={(event) => handleDateClick(event.detail)}
       />
{/if}
{#if recupReservations}
	<div class="mx-auto my-auto">
		<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current text-lbfvert-500 h-20 w-20 mx-auto" viewBox="0 0 50 50">
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
	<div class="w-3/4 text-center mx-auto">
	Récupération de la liste des réservations...
	</div>
	</div>
{/if}
	</div>
<style>
</style>