import App from "./inscription.svelte";

const appInscription = new App({
  target: document.querySelector("#bobby"),
  props: {
    name: "bobby"
  }
});

export default appInscription;