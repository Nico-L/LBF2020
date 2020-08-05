import App from "./reservationsMachines.svelte";

const app = new App({
  target: document.querySelector("#bobby"),
  props: {
    name: "bobby"
  }
});

export default app;
